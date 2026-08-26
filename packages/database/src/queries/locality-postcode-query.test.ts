import { describe, expect, it } from "vitest";
import { parseLocalityPostcodeQuery } from "./locality-postcode-query.ts";

describe("parseLocalityPostcodeQuery", () => {
	it("parses an Australian locality followed by postcode", () => {
		expect(parseLocalityPostcodeQuery("Parramatta 2150", "AU")).toEqual({
			locality: "PARRAMATTA",
			postcode: "2150",
		});
	});

	it("accepts punctuation seen in real locality names", () => {
		expect(parseLocalityPostcodeQuery("O'Halloran Hill 5158", "AU")).toEqual({
			locality: "O'HALLORAN HILL",
			postcode: "5158",
		});
	});

	it("returns null for a bare postcode", () => {
		expect(parseLocalityPostcodeQuery("2150", "AU")).toBeNull();
	});

	it("returns null when the suffix is not a valid postcode for the country", () => {
		expect(parseLocalityPostcodeQuery("Parramatta 2150", "US")).toBeNull();
	});

	it("returns null for street-style input", () => {
		expect(parseLocalityPostcodeQuery("Parramatta Road 2150", "AU")).toBeNull();
	});
});
