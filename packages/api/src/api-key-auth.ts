import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Database } from "@locnative/database";
import { apiKeys, apiUsageDaily } from "@locnative/database/schema";
import { eq, sql } from "drizzle-orm";
import {
	billingOwnerFromKey,
	getOrCreateBillingAccount,
	incrementBillingUsage,
} from "./billing/account.ts";

export const API_KEY_PREFIX = "wh_" as const;
export const INTERNAL_API_AUTH_HEADER = "x-locnative-internal-auth";
export const INTERNAL_API_KEY_ID_HEADER = "x-locnative-internal-api-key-id";
export const INTERNAL_REQUEST_SOURCE_HEADER = "x-locnative-request-source";
export const REQUEST_SOURCE_PRODUCTION = "production";
export const REQUEST_SOURCE_EXPLORER_TEST = "explorer_test";

/** UUID v4 pattern (case-insensitive) */
const API_KEY_TOKEN_RE =
	/^wh_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+)$/i;

// API-key secret hashing uses WebCrypto PBKDF2-HMAC-SHA256 rather than
// node:crypto `scryptSync`. The Cloudflare Workers runtime (workerd) does not
// produce a `scryptSync` digest that round-trips against itself, so raw-key
// verification silently failed in production. WebCrypto `crypto.subtle` is a
// W3C standard implemented identically on workerd and Node, so hashes computed
// at key-creation time verify correctly at request time on either runtime.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN_BYTES = 32;
const SALT_BYTES = 16;
const LAST_USED_WRITE_INTERVAL_MINUTES = 30;

/**
 * Derive a fixed-length key from an API-key secret using PBKDF2-HMAC-SHA256.
 * Runs on the global WebCrypto implementation so creation and verification
 * agree across the Workers and Node runtimes.
 */
async function deriveApiKeyHash(
	secretPart: string,
	salt: Uint8Array
): Promise<Buffer> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secretPart),
		"PBKDF2",
		false,
		["deriveBits"]
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			// Copy into a fresh ArrayBuffer-backed view: BufferSource rejects
			// Uint8Array<ArrayBufferLike> under TS 5.9 generic typed arrays.
			salt: new Uint8Array(salt),
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		PBKDF2_KEYLEN_BYTES * 8
	);
	return Buffer.from(bits);
}

export interface ValidatedApiKey {
	apiKeyId: string;
	projectId: string | null;
	teamId: string | null;
	userId: string;
}

export function parseApiKeyFromRequest(request: Request): string | null {
	const auth = request.headers.get("Authorization");
	if (auth?.startsWith("Bearer ")) {
		const token = auth.slice("Bearer ".length).trim();
		if (token.length > 0) {
			return token;
		}
	}
	const headerKey = request.headers.get("X-API-Key");
	if (headerKey) {
		const trimmed = headerKey.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	return null;
}

const isApiKeyExpired = (expiresAt: Date | null): boolean => {
	if (!expiresAt) {
		return false;
	}
	return expiresAt.getTime() <= Date.now();
};

async function touchLastUsedAt(db: Database, keyId: string): Promise<void> {
	await db.execute(sql`
		UPDATE api_keys
		SET last_used_at = now()
		WHERE id = ${keyId}
		  AND (
		    last_used_at IS NULL
		    OR last_used_at < now() - make_interval(mins => ${LAST_USED_WRITE_INTERVAL_MINUTES})
		  )
	`);
}

export async function validateApiKey(
	db: Database,
	token: string
): Promise<ValidatedApiKey | null> {
	const match = API_KEY_TOKEN_RE.exec(token);
	if (!match) {
		return null;
	}
	const keyId = match[1];
	const secretPart = match[2];
	if (!(keyId && secretPart)) {
		return null;
	}

	const rows = await db
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.id, keyId))
		.limit(1);

	const row = rows[0];
	if (!row || row.revokedAt || isApiKeyExpired(row.expiresAt)) {
		return null;
	}

	let saltBuf: Buffer;
	let storedHashBuf: Buffer;
	try {
		saltBuf = Buffer.from(row.secretSalt, "base64url");
		storedHashBuf = Buffer.from(row.secretHash, "base64url");
	} catch {
		return null;
	}

	if (saltBuf.length === 0 || storedHashBuf.length === 0) {
		return null;
	}

	let derived: Buffer;
	try {
		derived = await deriveApiKeyHash(secretPart, saltBuf);
	} catch {
		return null;
	}

	if (
		derived.length !== storedHashBuf.length ||
		!timingSafeEqual(derived, storedHashBuf)
	) {
		return null;
	}

	await touchLastUsedAt(db, keyId);

	return {
		apiKeyId: keyId,
		projectId: row.projectId,
		userId: row.userId,
		teamId: row.teamId,
	};
}

export async function validateApiKeyById(
	db: Database,
	keyId: string
): Promise<ValidatedApiKey | null> {
	const rows = await db
		.select({
			id: apiKeys.id,
			expiresAt: apiKeys.expiresAt,
			projectId: apiKeys.projectId,
			userId: apiKeys.userId,
			teamId: apiKeys.teamId,
			revokedAt: apiKeys.revokedAt,
		})
		.from(apiKeys)
		.where(eq(apiKeys.id, keyId))
		.limit(1);

	const row = rows[0];
	if (!row || row.revokedAt || isApiKeyExpired(row.expiresAt)) {
		return null;
	}

	await touchLastUsedAt(db, keyId);

	return {
		apiKeyId: row.id,
		projectId: row.projectId,
		userId: row.userId,
		teamId: row.teamId,
	};
}

function todayUtcDateString(): string {
	const d = new Date();
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export async function recordUsage(
	db: Database,
	input: {
		apiKeyId: string;
		projectId?: string | null;
		userId: string;
		teamId?: string | null;
		endpoint: string;
		requestSource?: string;
		/**
		 * Billing account already resolved by `apiKeyAuth` for this request.
		 * Passing it through avoids a second getOrCreate round trip on the hot
		 * path. Falls back to resolving when absent (e.g. explorer_test, which
		 * skips the production auth branch).
		 */
		billingAccountId?: string | null;
		/**
		 * When the Durable Object usage meter owns the billing counter, the
		 * caller has already incremented it there; skip the Postgres counter
		 * write to avoid double counting. The per-endpoint `api_usage_daily`
		 * analytics upsert below still runs.
		 */
		skipBillingIncrement?: boolean;
	}
): Promise<void> {
	const usageDate = todayUtcDateString();
	let billingAccountId = input.billingAccountId ?? null;
	if (!billingAccountId) {
		const owner = billingOwnerFromKey({
			teamId: input.teamId ?? null,
			userId: input.userId,
		});
		const account = await getOrCreateBillingAccount(db, owner);
		billingAccountId = account.id;
	}

	await db
		.insert(apiUsageDaily)
		.values({
			apiKeyId: input.apiKeyId,
			projectId: input.projectId ?? null,
			billingAccountId,
			userId: input.userId,
			usageDate,
			endpoint: input.endpoint,
			requestSource: input.requestSource ?? REQUEST_SOURCE_PRODUCTION,
			requestCount: 1,
		})
		.onConflictDoUpdate({
			target: [
				apiUsageDaily.apiKeyId,
				apiUsageDaily.usageDate,
				apiUsageDaily.endpoint,
				apiUsageDaily.requestSource,
			],
			set: {
				requestCount: sql`${apiUsageDaily.requestCount} + 1`,
			},
		});
	const source = input.requestSource ?? REQUEST_SOURCE_PRODUCTION;
	if (source === REQUEST_SOURCE_PRODUCTION && !input.skipBillingIncrement) {
		await incrementBillingUsage(db, billingAccountId);
	}
}

export async function hashApiKeySecret(secretPart: string): Promise<{
	saltB64: string;
	hashB64: string;
}> {
	const salt = randomBytes(SALT_BYTES);
	const hash = await deriveApiKeyHash(secretPart, salt);
	return {
		saltB64: salt.toString("base64url"),
		hashB64: hash.toString("base64url"),
	};
}

export function generateApiKeySecretPart(): string {
	return randomBytes(24).toString("base64url");
}

export function formatApiKeyDisplaySuffix(secretPart: string): string {
	const tail = secretPart.slice(-4);
	return tail.length === 4 ? tail : secretPart.slice(0, 4).padStart(4, "0");
}

export function formatApiKeyDisplayLabel(
	id: string,
	secretDisplaySuffix: string
): string {
	const short = id.split("-")[0] ?? id.slice(0, 8);
	return `${API_KEY_PREFIX}${short}…${secretDisplaySuffix}`;
}
