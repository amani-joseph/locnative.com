import { describe, expect, it } from "vitest";
import { AutocompleteCache, cacheKey } from "./autocomplete-cache.ts";

describe("cacheKey", () => {
	it("normalises case and surrounding whitespace", () => {
		expect(cacheKey("  Bondi ")).toBe("bondi");
		expect(cacheKey("BONDI")).toBe(cacheKey("bondi"));
	});

	it("preserves interior whitespace", () => {
		expect(cacheKey("bondi junction")).toBe("bondi junction");
	});
});

describe("AutocompleteCache", () => {
	it("returns undefined for a missing key", () => {
		const cache = new AutocompleteCache<string[]>(3);
		expect(cache.get("bondi")).toBeUndefined();
		expect(cache.has("bondi")).toBe(false);
	});

	it("round-trips a stored value", () => {
		const cache = new AutocompleteCache<string[]>(3);
		cache.set("bondi", ["a"]);
		expect(cache.get("bondi")).toEqual(["a"]);
		expect(cache.has("bondi")).toBe(true);
	});

	it("treats differently-cased queries as one entry", () => {
		const cache = new AutocompleteCache<string[]>(3);
		cache.set("Bondi", ["a"]);
		expect(cache.get("  bondi ")).toEqual(["a"]);
		expect(cache.size).toBe(1);
	});

	it("caches an empty result so a known no-match does not re-query", () => {
		const cache = new AutocompleteCache<string[]>(3);
		cache.set("zzzzzz", []);
		// has() must distinguish "cached empty" from "absent"; get() alone cannot.
		expect(cache.has("zzzzzz")).toBe(true);
		expect(cache.get("zzzzzz")).toEqual([]);
	});

	it("evicts the least-recently-used entry past capacity", () => {
		const cache = new AutocompleteCache<string>(2);
		cache.set("a", "1");
		cache.set("b", "2");
		cache.set("c", "3");
		expect(cache.size).toBe(2);
		expect(cache.has("a")).toBe(false);
		expect(cache.get("b")).toBe("2");
		expect(cache.get("c")).toBe("3");
	});

	it("counts a read as a use, sparing the entry from eviction", () => {
		const cache = new AutocompleteCache<string>(2);
		cache.set("a", "1");
		cache.set("b", "2");
		// Touch "a" so "b" becomes least-recently-used.
		expect(cache.get("a")).toBe("1");
		cache.set("c", "3");
		expect(cache.has("a")).toBe(true);
		expect(cache.has("b")).toBe(false);
	});

	it("counts overwriting an existing key as a use", () => {
		const cache = new AutocompleteCache<string>(2);
		cache.set("a", "1");
		cache.set("b", "2");
		cache.set("a", "1-updated");
		cache.set("c", "3");
		expect(cache.get("a")).toBe("1-updated");
		expect(cache.has("b")).toBe(false);
		expect(cache.size).toBe(2);
	});

	it("does not grow past capacity when overwriting", () => {
		const cache = new AutocompleteCache<string>(2);
		cache.set("a", "1");
		cache.set("a", "2");
		expect(cache.size).toBe(1);
	});

	it("rejects a non-positive capacity", () => {
		expect(() => new AutocompleteCache(0)).toThrow();
		expect(() => new AutocompleteCache(-1)).toThrow();
	});
});
