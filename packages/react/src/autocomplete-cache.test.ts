import type { AddressSuggestion } from "@locnative/sdk";
import { describe, expect, it } from "vitest";
import {
	type AutocompleteCacheKeyParts,
	buildCacheKey,
	readCache,
	type StorageLike,
	writeCache,
} from "./autocomplete-cache.ts";

const SUGGESTION: AddressSuggestion = {
	id: 1,
	formattedAddress: "34 Boxgrove Ave, Sydney NSW 2000",
	streetAddress: "34 Boxgrove Ave",
	locality: "Sydney",
	state: "NSW",
	postcode: "2000",
	country: "AU",
	latitude: -33.865,
	longitude: 151.209,
};

function memoryStorage(): StorageLike & { map: Map<string, string> } {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => {
			map.set(k, v);
		},
		removeItem: (k) => {
			map.delete(k);
		},
	};
}

describe("buildCacheKey", () => {
	it("is stable regardless of property order and normalizes the query", () => {
		const a: AutocompleteCacheKeyParts = {
			q: "  George St  ",
			country: "AU",
			state: "NSW",
			limit: 5,
		};
		const b: AutocompleteCacheKeyParts = {
			limit: 5,
			state: "NSW",
			country: "AU",
			q: "george st",
		};
		expect(buildCacheKey(a)).toBe(buildCacheKey(b));
	});

	it("differs when proximity coordinates differ", () => {
		const base: AutocompleteCacheKeyParts = { q: "main" };
		expect(buildCacheKey({ ...base, lat: 1, lng: 2 })).not.toBe(
			buildCacheKey({ ...base, lat: 3, lng: 4 })
		);
	});
});

describe("readCache / writeCache", () => {
	it("returns null on a miss", () => {
		const storage = memoryStorage();
		expect(readCache(storage, "k", 1000, 0)).toBeNull();
	});

	it("round-trips results within the TTL", () => {
		const storage = memoryStorage();
		writeCache(storage, "k", [SUGGESTION], 1000);
		expect(readCache(storage, "k", 60_000, 1500)).toEqual([SUGGESTION]);
	});

	it("evicts and returns null once the entry is older than the TTL", () => {
		const storage = memoryStorage();
		writeCache(storage, "k", [SUGGESTION], 1000);
		expect(readCache(storage, "k", 5000, 7000)).toBeNull();
		// entry should have been removed on expiry
		expect(storage.map.size).toBe(0);
	});

	it("returns null and self-heals on corrupt JSON", () => {
		const storage = memoryStorage();
		storage.setItem("wh:ac:k", "not json");
		expect(readCache(storage, "k", 1000, 0)).toBeNull();
	});
});
