import type { AddressSuggestion } from "@locnative/sdk";

/**
 * Minimal structural view of the Web Storage API (sessionStorage/localStorage).
 * Declared locally so the package type-checks with no DOM lib.
 */
export interface StorageLike {
	getItem(key: string): string | null;
	removeItem(key: string): void;
	setItem(key: string, value: string): void;
}

export interface AutocompleteCacheKeyParts {
	country?: string;
	lat?: number;
	limit?: number;
	lng?: number;
	q: string;
	state?: string;
}

const KEY_PREFIX = "wh:ac:";

/**
 * Build a stable cache key from the query parameters. The query is trimmed and
 * lower-cased so cosmetic differences ("George St" vs "george st") share a
 * cache entry; coordinates and filters are included so proximity-boosted or
 * filtered searches never collide with unfiltered ones.
 */
export function buildCacheKey(parts: AutocompleteCacheKeyParts): string {
	const q = parts.q.trim().toLowerCase();
	return JSON.stringify([
		q,
		parts.country ?? "",
		parts.state ?? "",
		parts.limit ?? "",
		parts.lat ?? "",
		parts.lng ?? "",
	]);
}

interface CacheEntry {
	results: AddressSuggestion[];
	t: number;
}

/**
 * Read cached suggestions for `key`. Returns null on a miss, on corrupt data,
 * or when the entry is older than `ttlMs`; expired/corrupt entries are removed.
 */
export function readCache(
	storage: StorageLike,
	key: string,
	ttlMs: number,
	now: number
): AddressSuggestion[] | null {
	const raw = storage.getItem(KEY_PREFIX + key);
	if (raw === null) {
		return null;
	}
	let entry: CacheEntry;
	try {
		entry = JSON.parse(raw) as CacheEntry;
	} catch {
		storage.removeItem(KEY_PREFIX + key);
		return null;
	}
	if (
		typeof entry?.t !== "number" ||
		!Array.isArray(entry.results) ||
		now - entry.t > ttlMs
	) {
		storage.removeItem(KEY_PREFIX + key);
		return null;
	}
	return entry.results;
}

/** Store suggestions for `key`, stamped with `now` for TTL eviction on read. */
export function writeCache(
	storage: StorageLike,
	key: string,
	results: AddressSuggestion[],
	now: number
): void {
	const entry: CacheEntry = { results, t: now };
	try {
		storage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
	} catch {
		// Storage full or unavailable (private mode/quota) — caching is best-effort.
	}
}
