import { describe, expect, it } from "vitest";
import { parseFreeformAddress } from "./parse-freeform-address.ts";

describe("parseFreeformAddress", () => {
	it("parses a full US address", () => {
		const r = parseFreeformAddress(
			"1 Rocket Road, Hawthorne, CA 90250, United States"
		);
		expect(r.houseNumber).toBe("1");
		expect(r.directional).toBeNull();
		expect(r.streetTokens).toEqual(["ROCKET", "ROAD"]);
		expect(r.locality).toBe("HAWTHORNE");
		expect(r.region).toBe("CA");
		expect(r.postcode).toBe("90250");
		expect(r.countryCode).toBe("US");
		expect(r.confidence).toBe("high");
	});

	it("captures a leading directional", () => {
		const r = parseFreeformAddress("1 N Rocket Rd, Hawthorne, CA 90250, US");
		expect(r.houseNumber).toBe("1");
		expect(r.directional).toBe("N");
		expect(r.streetTokens).toEqual(["ROCKET", "RD"]);
	});

	it("parses a UK postcode", () => {
		const r = parseFreeformAddress("10 Downing St, London, SW1A 2AA, UK");
		expect(r.houseNumber).toBe("10");
		expect(r.postcode).toBe("SW1A 2AA");
		expect(r.countryCode).toBe("GB");
		expect(r.locality).toBe("LONDON");
	});

	it("parses an AU address", () => {
		const r = parseFreeformAddress("120 Main St, Sydney, NSW 2000, Australia");
		expect(r.region).toBe("NSW");
		expect(r.postcode).toBe("2000");
		expect(r.countryCode).toBe("AU");
	});

	it("builds a cleaned string in stored order without commas or country name", () => {
		const r = parseFreeformAddress(
			"1 Rocket Road, Hawthorne, CA 90250, United States"
		);
		expect(r.cleaned).toBe("1 ROCKET ROAD HAWTHORNE CA 90250");
	});

	it("marks bare typeahead as low confidence", () => {
		const r = parseFreeformAddress("120 Mai");
		expect(r.confidence).toBe("low");
		expect(r.countryCode).toBeNull();
		expect(r.postcode).toBeNull();
	});

	it("handles missing house number", () => {
		const r = parseFreeformAddress("Rocket Road, Hawthorne, CA, US");
		expect(r.houseNumber).toBeNull();
		expect(r.countryCode).toBe("US");
	});

	it("handles a house-number range", () => {
		const r = parseFreeformAddress("1-3 Rocket Road, Hawthorne, CA 90250, US");
		expect(r.houseNumber).toBe("1-3");
		expect(r.streetTokens).toEqual(["ROCKET", "ROAD"]);
	});

	it("parses a Canadian address with full postcode and province", () => {
		const r = parseFreeformAddress("150 Elgin St, Ottawa, ON K1A 0B1, Canada");
		expect(r.houseNumber).toBe("150");
		expect(r.region).toBe("ON");
		expect(r.postcode).toBe("K1A 0B1");
		expect(r.countryCode).toBe("CA");
		expect(r.locality).toBe("OTTAWA");
	});

	it("normalizes street-first input to number-first (Iceland convention)", () => {
		const r = parseFreeformAddress("Laugavegur 26");
		expect(r.houseNumber).toBe("26");
		expect(r.streetTokens).toEqual(["LAUGAVEGUR"]);
		expect(r.cleaned).toBe("26 LAUGAVEGUR");
		// high confidence routes it through the number-first structured path
		expect(r.confidence).toBe("high");
	});

	it("normalizes street-first within a full address", () => {
		const r = parseFreeformAddress("Laugavegur 26, Reykjavik, IS");
		expect(r.houseNumber).toBe("26");
		expect(r.streetTokens).toEqual(["LAUGAVEGUR"]);
		expect(r.locality).toBe("REYKJAVIK");
		expect(r.countryCode).toBe("IS");
		expect(r.cleaned).toBe("26 LAUGAVEGUR REYKJAVIK");
	});

	it("does not treat number-first typeahead as street-first", () => {
		const r = parseFreeformAddress("120 Mai");
		expect(r.houseNumber).toBe("120");
		expect(r.streetTokens).toEqual(["MAI"]);
		expect(r.confidence).toBe("low");
	});

	// A leading secondary-unit segment ("L 2, ...", "Unit 5, ...") is not a
	// street segment. Treating it as one made "UNIT"/"SHOP"/"LEVEL" the street
	// name and pushed the real street into locality, so the structured search
	// looked up an address that does not exist and returned confident wrong
	// results. See .planning/debug/freeform-comma-misroute.md
	it("skips a leading level segment and parses the real street", () => {
		const r = parseFreeformAddress("L 2, 5/120 Main St");
		expect(r.streetTokens).not.toContain("L");
		expect(r.locality).toBeNull();
		expect(r.cleaned).not.toBe("2 L 5/120 MAIN ST");
	});

	it("skips a leading unit segment and parses the real street", () => {
		const r = parseFreeformAddress("Unit 5, 120 Main St");
		expect(r.streetTokens).not.toContain("UNIT");
		expect(r.houseNumber).toBe("120");
		expect(r.streetTokens).toEqual(["MAIN", "ST"]);
		expect(r.locality).toBeNull();
	});

	it("skips other secondary-unit designators", () => {
		for (const input of [
			"Shop 1, 12 Smith St",
			"Level 2, 5/120 Main St",
			"Suite 4, 12 Smith St",
			"Apt 7, 12 Smith St",
		]) {
			const r = parseFreeformAddress(input);
			for (const token of ["SHOP", "LEVEL", "SUITE", "APT"]) {
				expect(r.streetTokens).not.toContain(token);
			}
		}
	});

	it("still parses a normal comma address with a locality", () => {
		const r = parseFreeformAddress("10 Bourke St, Melbourne VIC 3000");
		expect(r.houseNumber).toBe("10");
		expect(r.streetTokens).toEqual(["BOURKE", "ST"]);
		expect(r.locality).toBe("MELBOURNE");
		expect(r.region).toBe("VIC");
		expect(r.postcode).toBe("3000");
	});

	it("does not mistake a street named after a designator for a unit segment", () => {
		// "Shop Street" is a real street name; only "<designator> <number>" as a
		// complete leading segment should be skipped.
		const r = parseFreeformAddress("12 Shop Street, Rozelle");
		expect(r.houseNumber).toBe("12");
		expect(r.streetTokens).toEqual(["SHOP", "STREET"]);
		expect(r.locality).toBe("ROZELLE");
	});
});
