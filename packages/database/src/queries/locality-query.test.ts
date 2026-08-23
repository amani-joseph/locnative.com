import { describe, expect, it } from "vitest";
import { localityQuery, prefixUpperBound } from "./locality-query.ts";

describe("localityQuery", () => {
	it("accepts a plain suburb name and uppercases it", () => {
		expect(localityQuery("sunnybank", "AU")).toBe("SUNNYBANK");
		expect(localityQuery("Bondi", "AU")).toBe("BONDI");
	});

	it("accepts multi-word and punctuated suburb names", () => {
		expect(localityQuery("Coffs Harbour", "AU")).toBe("COFFS HARBOUR");
		expect(localityQuery("O'Halloran Hill", "AU")).toBe("O'HALLORAN HILL");
		expect(localityQuery("Kurraba Point", "AU")).toBe("KURRABA POINT");
	});

	it("trims surrounding whitespace", () => {
		expect(localityQuery("  carlton  ", "AU")).toBe("CARLTON");
	});

	it("returns null without a country", () => {
		expect(localityQuery("sunnybank")).toBeNull();
		expect(localityQuery("sunnybank", "")).toBeNull();
	});

	it("returns null for anything containing digits — that is an address", () => {
		expect(localityQuery("12 Smith St", "AU")).toBeNull();
		expect(localityQuery("4118", "AU")).toBeNull();
		expect(localityQuery("Level 2 Bondi", "AU")).toBeNull();
	});

	it("returns null for queries shorter than 2 characters", () => {
		expect(localityQuery("b", "AU")).toBeNull();
		expect(localityQuery("", "AU")).toBeNull();
	});
});

describe("prefixUpperBound", () => {
	it("increments the final character to bound the range", () => {
		expect(prefixUpperBound("BONDI")).toBe("BONDJ");
		expect(prefixUpperBound("SUNNYBANK")).toBe("SUNNYBANL");
		expect(prefixUpperBound("B")).toBe("C");
	});

	it("produces a bound that sorts above every string with the prefix", () => {
		const prefix = "CARLTON";
		const bound = prefixUpperBound(prefix);
		expect(`${prefix} NORTH` < bound).toBe(true);
		expect(`${prefix}ZZZ` < bound).toBe(true);
		expect(prefix < bound).toBe(true);
	});
});
