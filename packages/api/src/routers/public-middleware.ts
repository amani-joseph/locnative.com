import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@locnative/env/server";
import { ORPCError } from "@orpc/server";
import {
	INTERNAL_API_AUTH_HEADER,
	INTERNAL_API_KEY_ID_HEADER,
	INTERNAL_REQUEST_SOURCE_HEADER,
	parseApiKeyFromRequest,
	REQUEST_SOURCE_EXPLORER_TEST,
	REQUEST_SOURCE_PRODUCTION,
	recordUsage,
	type ValidatedApiKey,
	validateApiKey,
	validateApiKeyById,
} from "../api-key-auth.ts";
import {
	billingOwnerFromKey,
	getOrCreateBillingAccount,
} from "../billing/account.ts";
import {
	type UsageMeterNamespace,
	usageMeterIncrement,
	usageMeterPeek,
} from "../billing/usage-meter-client.ts";
import { o as baseBuilder } from "../builder.ts";

export type { ValidatedApiKey } from "../api-key-auth.ts";

export const publicApiProcedure = baseBuilder.errors({
	BAD_REQUEST: { message: "Bad Request" },
	FORBIDDEN: { message: "Forbidden" },
	INTERNAL_SERVER_ERROR: { message: "Internal Server Error" },
	NOT_FOUND: { message: "Not Found" },
	PAYMENT_REQUIRED: { message: "Payment Required" },
	SERVICE_UNAVAILABLE: { message: "Service Unavailable" },
	UNAUTHORIZED: { message: "Unauthorized" },
	UNPROCESSABLE_CONTENT: { message: "Unprocessable Content" },
});

// ---------------------------------------------------------------------------
// API-key auth middleware
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison. The internal-auth header gates the
 * validate-by-key-id path (auth without the key secret), so its comparison must
 * not leak the secret via timing. Returns false on null/length mismatch.
 */
const constantTimeEqual = (a: string | null, b: string): boolean => {
	if (a === null) {
		return false;
	}
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) {
		return false;
	}
	return timingSafeEqual(aBuf, bBuf);
};

const resolveTrustedRequestSource = (request: Request): string | null => {
	const authHeader = request.headers.get(INTERNAL_API_AUTH_HEADER);
	if (!constantTimeEqual(authHeader, serverEnv.BETTER_AUTH_SECRET)) {
		return null;
	}
	const source = request.headers.get(INTERNAL_REQUEST_SOURCE_HEADER);
	if (source === REQUEST_SOURCE_EXPLORER_TEST) {
		return source;
	}
	return null;
};

export const apiKeyAuth = baseBuilder.middleware(async ({ context, next }) => {
	const request = context.req.raw;
	const trustedRequestSource = resolveTrustedRequestSource(request);
	const internalApiKeyId =
		trustedRequestSource === REQUEST_SOURCE_EXPLORER_TEST
			? request.headers.get(INTERNAL_API_KEY_ID_HEADER)
			: null;
	const token = parseApiKeyFromRequest(request);

	let authResult: ValidatedApiKey | null = null;

	if (internalApiKeyId) {
		authResult = await validateApiKeyById(context.db, internalApiKeyId);
	} else if (token) {
		authResult = await validateApiKey(context.db, token);
	}

	if (!authResult) {
		const message =
			token || internalApiKeyId
				? "Invalid, revoked, or expired API key."
				: "API key required. Send Authorization: Bearer <key> or X-API-Key.";

		throw new ORPCError("UNAUTHORIZED", { message });
	}

	const requestSource = trustedRequestSource ?? REQUEST_SOURCE_PRODUCTION;
	// Free-tier gate. Enforcement MUST be synchronous — the limit is checked
	// before the handler runs, so abuse cannot slip through on an async path.
	// When the USAGE_METER Durable Object is bound, the gate is an in-memory check
	// on a per-account single-threaded DO (exact under concurrency); otherwise it
	// falls back to the Postgres counter. The resolved account id is handed to
	// usageMiddleware so the usage write does not resolve it again.
	let billingAccountId: string | null = null;
	if (requestSource === REQUEST_SOURCE_PRODUCTION) {
		const owner = billingOwnerFromKey({
			teamId: authResult.teamId,
			userId: authResult.userId,
		});
		const meter = (context as { env?: { USAGE_METER?: UsageMeterNamespace } })
			.env?.USAGE_METER;
		let blocked: boolean;
		if (meter) {
			const result = await usageMeterPeek(meter, owner);
			blocked = result.blocked;
			billingAccountId = result.billingAccountId;
		} else {
			const account = await getOrCreateBillingAccount(context.db, owner);
			blocked = account.blocked;
			billingAccountId = account.id;
		}
		if (blocked) {
			throw new ORPCError("PAYMENT_REQUIRED", {
				message:
					"Free tier exhausted. Add a payment method in your billing settings to continue.",
			});
		}
	}

	return next({
		context: {
			validatedApiKey: authResult,
			requestSource,
			billingAccountId,
		},
	});
});

// ---------------------------------------------------------------------------
// Usage-recording middleware (runs after handler on success)
// ---------------------------------------------------------------------------

export function usageMiddleware(endpointKey: string) {
	return baseBuilder.middleware(async ({ context, next }) => {
		const result = await next({});

		const ctx = context as unknown as {
			db: typeof context.db;
			validatedApiKey: ValidatedApiKey;
			requestSource: string;
			billingAccountId?: string | null;
			env?: { USAGE_METER?: UsageMeterNamespace };
			waitUntil?: (promise: Promise<unknown>) => void;
		};

		if (ctx.validatedApiKey) {
			const key = ctx.validatedApiKey;
			const meter =
				ctx.requestSource === REQUEST_SOURCE_PRODUCTION
					? ctx.env?.USAGE_METER
					: undefined;
			const accounting = (async () => {
				// When the DO meter is bound it owns the billing counter: increment
				// it atomically there, then record api_usage_daily with the counter
				// skipped to avoid double counting. Without it, recordUsage performs
				// the atomic Postgres counter increment itself.
				if (meter) {
					await usageMeterIncrement(
						meter,
						billingOwnerFromKey({ teamId: key.teamId, userId: key.userId })
					);
				}
				await recordUsage(ctx.db, {
					apiKeyId: key.apiKeyId,
					projectId: key.projectId,
					userId: key.userId,
					teamId: key.teamId,
					endpoint: endpointKey,
					requestSource: ctx.requestSource,
					billingAccountId: ctx.billingAccountId,
					skipBillingIncrement: Boolean(meter),
				});
			})().catch((err: unknown) => {
				// Usage accounting must not fail the client response.
				console.error("[usage]", endpointKey, err);
			});
			// On Cloudflare Workers, hand the write to waitUntil so workerd keeps
			// the request alive until it finishes. Without this the I/O is
			// cancelled the moment the response returns and usage goes untracked
			// under load. Off-Worker (local dev / tests) there is no waitUntil and
			// the promise settles on its own because the process stays alive.
			ctx.waitUntil?.(accounting);
		}

		return result;
	});
}
