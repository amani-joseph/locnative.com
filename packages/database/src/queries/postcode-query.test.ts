import { describe, expect, it } from "vitest";
import { barePostcode } from "./postcode-query.ts";

describe("barePostcode", () => {
	it("detects a bare 4-digit AU postcode", () => {
		expect(barePostcode("4118", "AU")).toBe("4118");
	});

	it("accepts a lowercase country code", () => {
		expect(barePostcode("2026", "au")).toBe("2026");
	});

	it("trims surrounding whitespace", () => {
		expect(barePostcode("  3053  ", "AU")).toBe("3053");
	});

	it("returns null without a country — a bare number stays a street number", () => {
		expect(barePostcode("4118")).toBeNull();
		expect(barePostcode("4118", "")).toBeNull();
	});

	it("returns null when the query is not bare", () => {
		expect(barePostcode("4118 Browns Plains", "AU")).toBeNull();
		expect(barePostcode("4118 QLD", "AU")).toBeNull();
	});

	it("returns null when the digit count is wrong for the country", () => {
		expect(barePostcode("41180", "AU")).toBeNull();
		expect(barePostcode("4118", "US")).toBeNull();
	});

	it("applies the correct per-country digit count", () => {
		expect(barePostcode("90210", "US")).toBe("90210");
		expect(barePostcode("75008", "FR")).toBe("75008");
		expect(barePostcode("1010", "NZ")).toBe("1010");
	});

	it("returns null for countries with alphanumeric postcodes", () => {
		expect(barePostcode("1234", "GB")).toBeNull();
		expect(barePostcode("12345", "CA")).toBeNull();
	});

	it("returns null for non-numeric or empty queries", () => {
		expect(barePostcode("", "AU")).toBeNull();
		expect(barePostcode("Bondi", "AU")).toBeNull();
		expect(barePostcode("41a8", "AU")).toBeNull();
	});
});
