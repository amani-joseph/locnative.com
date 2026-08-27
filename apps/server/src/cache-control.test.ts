import { describe, expect, it } from "vitest";
import { cacheControlForResponse } from "./index.ts";

/**
 * Guards the F6 cache-header split from the 2026-08-26 performance audit.
 *
 * The risk here is over-caching, not under-caching: serving a stale or, worse,
 * a *wrong user's* response from a shared cache. These assertions pin down
 * exactly which paths are allowed to be cacheable.
 */
describe("cacheControlForResponse", () => {
	it("caches immutable address records for a day", () => {
		expect(cacheControlForResponse("/api/v1/addresses/104233", 200)).toBe(
			"public, max-age=86400, stale-while-revalidate=604800"
		);
	});

	it("caches reverse geocode for an hour", () => {
		expect(cacheControlForResponse("/api/v1/addresses/reverse", 200)).toContain(
			"max-age=3600"
		);
	});

	it("never caches autocomplete — user-specific and high cardinality", () => {
		expect(cacheControlForResponse("/api/v1/addresses/autocomplete", 200)).toBe(
			"no-store"
		);
	});

	it("does not mistake a named endpoint for an id lookup", () => {
		// /addresses/{id} must match digits only. If this regressed to a looser
		// pattern, autocomplete responses would become publicly cacheable.
		for (const p of [
			"/api/v1/addresses/autocomplete",
			"/api/v1/addresses/nearby",
			"/api/v1/addresses/geocode",
			"/api/v1/addresses/geocode/batch",
		]) {
			expect(cacheControlForResponse(p, 200)).toBe("no-store");
		}
	});

	it("never caches a non-2xx response", () => {
		for (const status of [400, 401, 404, 429, 500]) {
			expect(cacheControlForResponse("/api/v1/addresses/104233", status)).toBe(
				"no-store"
			);
		}
	});

	it("defaults unknown paths to no-store", () => {
		expect(cacheControlForResponse("/api/v1/zones/abc", 200)).toBe("no-store");
	});
});
