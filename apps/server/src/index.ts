import {
	applyStripeEvent,
	appRouter,
	createContext,
	db,
	getStripeClient,
	publicHttpRouter,
	reportUsageToStripe,
	stripeCryptoProvider,
	type WaitUntil,
} from "@locnative/api";
import { auth } from "@locnative/auth";
import { serverEnv } from "@locnative/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono, type Context as HonoContext } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type Stripe from "stripe";
import {
	type BatchGeocodeMessage,
	processBatchGeocodeMessage,
} from "./queues/batch-geocode.ts";
import {
	processWebhookDeliveryMessage,
	type WebhookDeliveryMessage,
} from "./queues/webhook-delivery.ts";
import { CURRENT_TILE_API_VERSION, handleTileRequest } from "./tiles.ts";

// Durable Object class must be re-exported from the Worker entry so the runtime
// can construct it for the USAGE_METER binding declared in wrangler.jsonc.
export { UsageMeter } from "./usage-meter.ts";

const app = new Hono();

const TRAILING_SLASH_REGEX = /\/$/;
const DEPLOYED_WEB_ORIGIN =
	process.env.DEPLOYED_WEB_ORIGIN ?? "https://locnative.com";
const OPENAPI_WEB_PATH = "/api/openapi.json";

// Built lazily on first request, NOT at module scope: reading `serverEnv` at
// global scope would run during Cloudflare's deploy-time startup validation
// (secrets absent) and fail the deploy.
let allowedOrigins: Set<string> | undefined;

const isAllowedOrigin = (origin: string | undefined): boolean => {
	if (!allowedOrigins) {
		allowedOrigins = new Set([
			serverEnv.WEB_BASE_URL.replace(TRAILING_SLASH_REGEX, ""),
			DEPLOYED_WEB_ORIGIN,
			"http://localhost:3001",
		]);
	}
	return typeof origin === "string" && allowedOrigins.has(origin);
};

const getPublishedWebOrigin = (): string =>
	serverEnv.WEB_BASE_URL.replace(TRAILING_SLASH_REGEX, "");

const redirectToOpenApiSpec = (): Response =>
	Response.redirect(`${getPublishedWebOrigin()}${OPENAPI_WEB_PATH}`, 307);

app.use(logger());

// Public API routes use X-API-Key (not cookies) — allow any origin so
// third-party apps can call the API directly from the browser.
app.use(
	"/api/v1/*",
	cors({
		origin: "*",
		allowHeaders: [
			"Authorization",
			"Content-Type",
			"X-API-Key",
			// The SDK tags every request with x-locnative-sdk and writes with
			// idempotency-key. Without these in the allowlist, browser preflight
			// fails and all SDK calls are blocked by CORS.
			"x-locnative-sdk",
			"idempotency-key",
			"x-locnative-request-source",
		],
		allowMethods: ["GET", "POST", "OPTIONS"],
		credentials: false,
	})
);

// All other routes (auth, RPC, dashboard) stay restricted to known origins.
app.use(
	"/*",
	cors({
		origin: (origin) => {
			if (isAllowedOrigin(origin)) {
				return origin;
			}
			return undefined;
		},
		allowHeaders: [
			"Authorization",
			"Content-Type",
			"X-API-Key",
			"x-locnative-internal-auth",
			"x-locnative-internal-api-key-id",
			"x-locnative-request-source",
		],
		allowMethods: ["GET", "POST", "OPTIONS"],
		credentials: true,
	})
);

app.on(["GET", "POST"], "/api/auth/*", async (context) => {
	try {
		const response = await auth.handler(context.req.raw);
		return response;
	} catch (error: unknown) {
		console.error("[auth] handler error:", error);
		return context.json({ error: "Internal auth error" }, { status: 500 });
	}
});

app.post("/api/stripe/webhook", async (context) => {
	const signature = context.req.header("stripe-signature");
	if (!signature) {
		return context.json({ error: "missing signature" }, 400);
	}
	const webhookSecret = serverEnv.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) {
		console.error("[stripe] STRIPE_WEBHOOK_SECRET is not configured");
		return context.json({ error: "webhook not configured" }, 500);
	}
	const payload = await context.req.text();
	let event: Stripe.Event;
	try {
		event = await getStripeClient().webhooks.constructEventAsync(
			payload,
			signature,
			webhookSecret,
			undefined,
			stripeCryptoProvider
		);
	} catch (err) {
		console.error("[stripe] signature verification failed:", err);
		return context.json({ error: "invalid signature" }, 400);
	}

	try {
		await applyStripeEvent(db, event);
	} catch (err) {
		console.error("[stripe] event handling failed:", err);
		return context.json({ error: "handler error" }, 500);
	}
	return context.json({ received: true });
});

app.get("/api/openapi.json", () => redirectToOpenApiSpec());
app.get("/api/openapi/json", () => redirectToOpenApiSpec());
app.get("/api/v1/openapi.json", () => redirectToOpenApiSpec());

// ---------------------------------------------------------------------------
// Map ORPCError codes to our API error codes (Fix #2: complete mapping)
// ---------------------------------------------------------------------------

const ORPC_TO_API_ERROR: Record<string, { status: number; code: string }> = {
	BAD_REQUEST: { status: 400, code: "bad_request" },
	UNAUTHORIZED: { status: 401, code: "unauthorized" },
	PAYMENT_REQUIRED: { status: 402, code: "payment_required" },
	FORBIDDEN: { status: 403, code: "unauthorized" },
	NOT_FOUND: { status: 404, code: "not_found" },
	METHOD_NOT_SUPPORTED: { status: 405, code: "bad_request" },
	NOT_ACCEPTABLE: { status: 406, code: "bad_request" },
	TIMEOUT: { status: 408, code: "bad_request" },
	CONFLICT: { status: 409, code: "bad_request" },
	PRECONDITION_FAILED: { status: 412, code: "bad_request" },
	PAYLOAD_TOO_LARGE: { status: 413, code: "bad_request" },
	UNSUPPORTED_MEDIA_TYPE: { status: 415, code: "bad_request" },
	UNPROCESSABLE_CONTENT: { status: 422, code: "bad_request" },
	TOO_MANY_REQUESTS: { status: 429, code: "bad_request" },
	CLIENT_CLOSED_REQUEST: { status: 499, code: "bad_request" },
	INTERNAL_SERVER_ERROR: { status: 500, code: "internal_error" },
	NOT_IMPLEMENTED: { status: 501, code: "internal_error" },
	BAD_GATEWAY: { status: 502, code: "internal_error" },
	SERVICE_UNAVAILABLE: { status: 503, code: "internal_error" },
	GATEWAY_TIMEOUT: { status: 504, code: "internal_error" },
};

interface ORPCErrorLike {
	code: string;
	message: string;
	status: number;
}

const isORPCErrorLike = (value: unknown): value is ORPCErrorLike => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Record<string, unknown>;
	return (
		typeof record.code === "string" &&
		typeof record.status === "number" &&
		typeof record.message === "string"
	);
};

const buildCompatErrorResponse = (
	error: Pick<ORPCErrorLike, "code" | "status" | "message">
): Response => {
	const mapped = ORPC_TO_API_ERROR[error.code];
	const errorCode = mapped?.code ?? "internal_error";
	const status = mapped?.status ?? error.status;
	const message =
		error.message.length > 0 ? error.message : "An unexpected error occurred.";

	return Response.json(
		{ error: { code: errorCode, message } },
		{ status, headers: { "cache-control": "no-store" } }
	);
};

/**
 * Reformat an OpenAPIHandler error response into the
 * `{ error: { code, message } }` shape for strict compat.
 * Also ensures cache-control: no-store on error responses.
 */
async function reformatErrorResponse(
	response: Response,
	fallbackError?: ORPCErrorLike
): Promise<Response> {
	if (response.ok) {
		return response;
	}

	try {
		const body: unknown = await response.json();
		const record =
			body && typeof body === "object"
				? (body as Record<string, unknown>)
				: null;

		// oRPC wraps all errors (including Zod validation) as ORPCError with
		// shape: { code: "BAD_REQUEST", status: 400, message: "..." }
		// Zod validation messages appear in the `message` field directly.
		if (record && "code" in record) {
			const errorFromBody = {
				code: String(record.code),
				status:
					typeof record.status === "number" ? record.status : response.status,
				message:
					typeof record.message === "string"
						? record.message
						: "An unexpected error occurred.",
			};

			if (
				fallbackError &&
				errorFromBody.code === "INTERNAL_SERVER_ERROR" &&
				fallbackError.code !== "INTERNAL_SERVER_ERROR"
			) {
				return buildCompatErrorResponse(fallbackError);
			}

			return buildCompatErrorResponse(errorFromBody);
		}

		// Fallback: wrap unknown error body
		const fallbackMessage =
			record && typeof record.message === "string"
				? record.message
				: "An unexpected error occurred.";

		if (fallbackError) {
			return buildCompatErrorResponse(fallbackError);
		}

		return Response.json(
			{ error: { code: "internal_error", message: fallbackMessage } },
			{ status: response.status, headers: { "cache-control": "no-store" } }
		);
	} catch {
		if (fallbackError) {
			return buildCompatErrorResponse(fallbackError);
		}
		return response;
	}
}

// ---------------------------------------------------------------------------
// OpenAPI handler for public /api/v1/* endpoints
// ---------------------------------------------------------------------------

// Path patterns for endpoint metric names — hoisted so they aren't recompiled
// on every request.
const ZONES_ADDRESSES_PATH = /\/zones\/\d+\/addresses/;
const DEVICES_ZONES_PATH = /\/devices\/[^/]+\/zones/;
const DEVICES_LOCATION_PATH = /\/devices\/[^/]+\/location/;

// Derive endpoint key from path for Server-Timing metric name
// Numeric-id lookups only — must not match /addresses/autocomplete etc.
const ADDRESS_BY_ID_PATH = /\/addresses\/\d+$/;

/**
 * Cache-Control for a successful public API response, by endpoint shape.
 *
 * `no-store` on everything was costing us repeat lookups of data that cannot
 * change between G-NAF imports. The split below is by how stable the answer is:
 *
 *   - `/addresses/{id}` is an immutable reference record. Safe to cache for a
 *     day, with a week of stale-while-revalidate.
 *   - `reverse` maps a fixed coordinate to the nearest address. Stable in
 *     practice but can shift when new addresses are imported nearby, so a
 *     shorter hour-long TTL.
 *   - `autocomplete` stays `no-store`: high-cardinality, user-specific, and a
 *     CDN would get a poor hit rate while holding partially-typed queries.
 *   - anything unrecognised, and every non-2xx, stays `no-store`.
 *
 * Consistency trade-off: after a G-NAF import, cached records may be stale for
 * up to the TTL. Address reference data changes on the order of months, so a
 * day is acceptable; bump a version segment in the path if that ever changes.
 */
export function cacheControlForResponse(pathname: string, status: number): string {
	if (status < 200 || status >= 300) {
		return "no-store";
	}
	if (ADDRESS_BY_ID_PATH.test(pathname)) {
		return "public, max-age=86400, stale-while-revalidate=604800";
	}
	if (pathname.includes("/reverse")) {
		return "public, max-age=3600, stale-while-revalidate=86400";
	}
	return "no-store";
}

function endpointKeyFromPath(pathname: string): string {
	if (pathname.includes("/autocomplete")) {
		return "addresses_autocomplete";
	}
	if (pathname.includes("/geocode/batch")) {
		return "addresses_batch";
	}
	if (pathname.includes("/geocode")) {
		return "addresses_geocode";
	}
	if (pathname.includes("/nearby")) {
		return "addresses_nearby";
	}
	if (pathname.includes("/reverse")) {
		return "addresses_reverse";
	}
	if (pathname.includes("/zones/contains")) {
		return "zones_contains";
	}
	if (ZONES_ADDRESSES_PATH.test(pathname)) {
		return "zones_addresses";
	}
	if (pathname.includes("/zones")) {
		return "zones";
	}
	if (DEVICES_ZONES_PATH.test(pathname)) {
		return "devices_zones";
	}
	if (DEVICES_LOCATION_PATH.test(pathname)) {
		return "devices_location";
	}
	if (pathname.includes("/webhooks")) {
		return "webhooks";
	}
	if (pathname.includes("/routing/directions")) {
		return "routing_directions";
	}
	if (pathname.includes("/addresses")) {
		return "addresses_byId";
	}
	return "unknown";
}

/**
 * Resolve the Worker's `waitUntil` so background usage writes survive past the
 * response. `executionCtx` getter throws when absent (local dev / tests); bind
 * the method so a later bare call does not throw "Illegal invocation".
 */
function getWaitUntil(context: HonoContext): WaitUntil | undefined {
	try {
		const exec = context.executionCtx;
		if (exec && typeof exec.waitUntil === "function") {
			return exec.waitUntil.bind(exec);
		}
	} catch {
		// No execution context — caller falls back to awaiting inline.
	}
	return undefined;
}

app.use("/api/v1/*", async (context) => {
	const startedAt = performance.now();
	let openApiError: ORPCErrorLike | undefined;
	// Thread CF bindings (queues, R2) into the public context — without this the
	// device-location webhook enqueue and batch submit/results bindings are
	// undefined and silently no-op.
	const cfEnv = context.env as
		| {
				BATCH_GEOCODE_QUEUE?: unknown;
				WEBHOOK_DELIVERY_QUEUE?: unknown;
				GEOCODE_RESULTS?: unknown;
		  }
		| undefined;
	const rpcContext = await createContext({
		env: cfEnv,
		req: context.req,
		// Hold usage-accounting writes open past the response. Without this,
		// workerd cancels the fire-and-forget recordUsage() I/O the moment the
		// fetch handler returns, so requests go untracked under load. The getter
		// throws when no execution context exists (e.g. local dev) — bind it so
		// calling it later as a bare function does not throw "Illegal invocation".
		waitUntil: getWaitUntil(context),
	});
	const openApiHandler = new OpenAPIHandler(publicHttpRouter, {
		interceptors: [
			onError((err: unknown) => {
				if (isORPCErrorLike(err)) {
					openApiError = err;
					return;
				}

				console.error("[openapi]", err);
			}),
		],
	});
	const result = await openApiHandler.handle(context.req.raw, {
		prefix: "/" as `/${string}`,
		context: rpcContext,
	});

	if (!result.matched) {
		return context.json(
			{ error: { code: "not_found", message: "Endpoint not found." } },
			404
		);
	}

	// Reformat error responses for strict compat
	const response = await reformatErrorResponse(result.response, openApiError);

	// Fix #1: Ensure cache-control on ALL responses (success + error)
	if (!response.headers.has("cache-control")) {
		response.headers.set(
			"cache-control",
			cacheControlForResponse(
				new URL(context.req.url).pathname,
				response.status
			)
		);
	}

	// Add Server-Timing header
	const durationMs = performance.now() - startedAt;
	const metric = endpointKeyFromPath(new URL(context.req.url).pathname);
	response.headers.set(
		"Server-Timing",
		`${metric};dur=${durationMs.toFixed(1)}`
	);

	return context.newResponse(response.body, response);
});

// ---------------------------------------------------------------------------
// RPC handler for /rpc/*
// ---------------------------------------------------------------------------

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((err: unknown) => {
			console.error("[rpc]", err);
		}),
	],
});

function cachedResponseMatchesEtag(
	request: Request,
	response: Response
): boolean {
	const ifNoneMatch = request.headers.get("if-none-match");
	const etag = response.headers.get("etag");
	if (!(ifNoneMatch && etag)) {
		return false;
	}
	if (ifNoneMatch.trim() === "*") {
		return true;
	}
	const normalizedEtag = etag.replace(/^W\//, "");
	for (const candidate of ifNoneMatch.split(",")) {
		if (candidate.trim().replace(/^W\//, "") === normalizedEtag) {
			return true;
		}
	}
	return false;
}

function withTileCacheOutcome(
	response: Response,
	outcome: "HIT" | "MISS" | "REVALIDATED"
): Response {
	const headers = new Headers(response.headers);
	headers.set("x-locnative-cache", outcome);
	headers.set("x-locnative-tile-version", CURRENT_TILE_API_VERSION);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function appendServerTiming(
	response: Response,
	metrics: Array<{ name: string; durationMs: number; description?: string }>
): Response {
	const headers = new Headers(response.headers);
	const value = metrics
		.map((metric) => {
			const parts = [
				metric.name,
				`dur=${Math.max(0, Number(metric.durationMs.toFixed(2)))}`,
			];
			if (metric.description) {
				parts.push(`desc="${metric.description}"`);
			}
			return parts.join(";");
		})
		.join(", ");
	headers.set("server-timing", value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

app.get("/tiles/*", async (context) => {
	const bucket = (context.env as { MAP_TILES?: R2Bucket }).MAP_TILES;
	if (!bucket) {
		return context.text("Tiles not configured", 503);
	}
	const waitUntil = getWaitUntil(context);
	const startedAt = performance.now();
	const request = context.req.raw;
	const cacheKey = new Request(request.url, {
		method: "GET",
	});
	const cache = caches.default;
	const cacheLookupStartedAt = performance.now();
	const cached = await cache.match(cacheKey);
	const cacheLookupDurationMs = performance.now() - cacheLookupStartedAt;
	if (cached) {
		if (cachedResponseMatchesEtag(request, cached)) {
			return appendServerTiming(
				withTileCacheOutcome(
					new Response(null, {
						status: 304,
						headers: new Headers(cached.headers),
					}),
					"REVALIDATED"
				),
				[
					{
						name: "tile-cache",
						durationMs: cacheLookupDurationMs,
						description: "worker cache lookup",
					},
					{
						name: "tile-total",
						durationMs: performance.now() - startedAt,
						description: "total tile request time",
					},
				]
			);
		}
		return appendServerTiming(withTileCacheOutcome(cached, "HIT"), [
			{
				name: "tile-cache",
				durationMs: cacheLookupDurationMs,
				description: "worker cache lookup",
			},
			{
				name: "tile-total",
				durationMs: performance.now() - startedAt,
				description: "total tile request time",
			},
		]);
	}
	const url = new URL(request.url);
	const handlerStartedAt = performance.now();
	const res = await handleTileRequest(
		url.pathname,
		bucket,
		url.origin,
		request.headers
	);
	const handlerDurationMs = performance.now() - handlerStartedAt;
	if (!res) {
		return context.notFound();
	}
	if (res.ok && res.headers.has("cache-control")) {
		const cacheWrite = cache.put(cacheKey, res.clone());
		if (waitUntil) {
			waitUntil(cacheWrite);
		} else {
			await cacheWrite;
		}
	}
	const versionedResponse = withTileCacheOutcome(res, "MISS");
	return appendServerTiming(versionedResponse, [
		{
			name: "tile-cache",
			durationMs: cacheLookupDurationMs,
			description: "worker cache lookup",
		},
		{
			name: "tile-origin",
			durationMs: handlerDurationMs,
			description: "tile handler origin work",
		},
		{
			name: "tile-total",
			durationMs: performance.now() - startedAt,
			description: "total tile request time",
		},
	]);
});

app.use("/*", async (context, next) => {
	// localFetch routes requests through the Hono app in-process, avoiding
	// Cloudflare's self-subrequest restriction (error 1042).
	const localFetch: (
		url: string | URL,
		init?: RequestInit
	) => Promise<Response> = async (url, init) =>
		app.request(url instanceof URL ? url.toString() : url, init);

	// Thread Cloudflare env bindings (queue, R2) into the RPC context so
	// dashboard handlers can enqueue batch jobs and read results.
	const cfEnv = context.env as
		| {
				BATCH_GEOCODE_QUEUE?: unknown;
				WEBHOOK_DELIVERY_QUEUE?: unknown;
				GEOCODE_RESULTS?: unknown;
		  }
		| undefined;

	const rpcContext = await createContext({
		env: cfEnv,
		localFetch,
		req: context.req,
	});
	const rpcResult = await rpcHandler.handle(context.req.raw, {
		prefix: "/rpc",
		context: rpcContext,
	});

	if (rpcResult.matched) {
		return context.newResponse(rpcResult.response.body, rpcResult.response);
	}

	await next();
});

app.get("/", (context) =>
	context.json({ ok: true, service: "locnative-server" })
);

export default {
	fetch: app.fetch,
	async queue(
		batch: {
			messages: Array<{ body: { type: string }; ack(): void }>;
		},
		env: { GEOCODE_RESULTS: R2Bucket; WEBHOOK_DELIVERY_QUEUE: Queue }
	): Promise<void> {
		for (const msg of batch.messages) {
			if (msg.body.type === "batch-geocode") {
				await processBatchGeocodeMessage(msg.body as BatchGeocodeMessage, env);
				msg.ack();
			} else if (msg.body.type === "webhook-delivery") {
				await processWebhookDeliveryMessage(msg.body as WebhookDeliveryMessage);
				msg.ack();
			} else {
				msg.ack();
			}
		}
	},
	// biome-ignore lint/suspicious/useAwait: Cloudflare scheduled handler — work is handed to ctx.waitUntil() as fire-and-forget so the handler returns immediately; awaiting here would defeat that. Signature must stay async to satisfy the handler type.
	async scheduled(
		_event: { cron: string; scheduledTime: number },
		_env: unknown,
		ctx: { waitUntil(p: Promise<unknown>): void }
	): Promise<void> {
		ctx.waitUntil(
			reportUsageToStripe(db).catch((err: unknown) => {
				console.error("[cron] reportUsageToStripe failed:", err);
			})
		);
	},
};
