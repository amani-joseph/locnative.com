/**
 * Bounded LRU cache for autocomplete responses.
 *
 * Autocomplete queries are highly repetitive: a user backspacing from "bondi"
 * to "bond" asks for a result that was on screen a moment earlier, and every
 * such re-query costs a full round-trip (~90 ms measured, see
 * docs/benchmarks/2026-09-07-production-api-latency.md). Caching by normalised
 * query string turns those into instant renders.
 *
 * Deliberately in-memory and per-component-tree: entries are cheap, and address
 * reference data is stable enough within a session that staleness is not a
 * concern at this TTL-less granularity. Nothing here is persisted, so a reload
 * starts cold.
 */

/**
 * Cache key for a query. Trimmed and lowercased so that "Bondi", "bondi " and
 * "bondi" share one entry — the API treats them identically.
 */
export function cacheKey(query: string): string {
	return query.trim().toLowerCase();
}

/**
 * Fixed-capacity LRU keyed on the normalised query string.
 *
 * Uses Map insertion order as the recency list: reading a hit re-inserts the
 * entry at the tail, so the least-recently-used entry is always the first key
 * the iterator yields. That keeps get/set O(1) without a linked list.
 */
export class AutocompleteCache<T> {
	private readonly capacity: number;
	private readonly entries = new Map<string, T>();

	constructor(capacity: number) {
		if (!Number.isInteger(capacity) || capacity <= 0) {
			throw new Error("AutocompleteCache capacity must be a positive integer");
		}
		this.capacity = capacity;
	}

	get(query: string): T | undefined {
		const key = cacheKey(query);
		if (!this.entries.has(key)) {
			return;
		}
		// Re-insert to move this key to the most-recently-used end.
		const value = this.entries.get(key) as T;
		this.entries.delete(key);
		this.entries.set(key, value);
		return value;
	}

	has(query: string): boolean {
		return this.entries.has(cacheKey(query));
	}

	set(query: string, value: T): void {
		const key = cacheKey(query);
		// Delete first so a re-set moves the key to the tail rather than
		// updating it in place at its old position.
		this.entries.delete(key);
		this.entries.set(key, value);
		if (this.entries.size > this.capacity) {
			const oldest = this.entries.keys().next();
			if (!oldest.done) {
				this.entries.delete(oldest.value);
			}
		}
	}

	get size(): number {
		return this.entries.size;
	}
}
