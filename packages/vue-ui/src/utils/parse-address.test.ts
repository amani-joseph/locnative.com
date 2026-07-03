import type { AddressSuggestion } from "@locnative/sdk";
import { describe, expect, it } from "vitest";
import { toAddressWithParsed } from "./parse-address";

describe("toAddressWithParsed", () => {
	it("maps an AU address and resolves the country name", () => {
		const suggestion: AddressSuggestion = {
			id: 1,
			formattedAddress: "29/14 Fleet Street, Browns Plains QLD 4118, AU",
			streetAddress: "29/14 Fleet Street",
			locality: "Browns Plains",
			state: "QLD",
			postcode: "4118",
			latitude: -27.7849,
			longitude: 153.0395,
			country: "AU",
		};

		const result = toAddressWithParsed(suggestion);

		expect(result).toEqual({
			id: 1,
			formattedAddress: "29/14 Fleet Street, Browns Plains QLD 4118, AU",
			latitude: -27.7849,
			longitude: 153.0395,
			streetAddress: "29/14 Fleet Street",
			suburb: "Browns Plains",
			state: "QLD",
			postcode: "4118",
			country: "Australia",
		});
	});

	it("resolves any ISO country code to its display name", () => {
		const suggestion: AddressSuggestion = {
			id: 2,
			formattedAddress: "1 Reykjanesvitabraut, Reykjanesbær 233, IS",
			streetAddress: "1 Reykjanesvitabraut",
			locality: "Reykjanesbær",
			state: "",
			postcode: "233",
			latitude: 63.83,
			longitude: -22.7,
			country: "IS",
		};

		expect(toAddressWithParsed(suggestion).country).toBe("Iceland");
	});

	it("falls back to the raw value for malformed country codes", () => {
		const suggestion: AddressSuggestion = {
			id: 3,
			formattedAddress: "123 Main St, Sydney NSW 2000",
			streetAddress: "123 Main St",
			locality: "Sydney",
			state: "NSW",
			postcode: "2000",
			latitude: -33.8688,
			longitude: 151.2093,
			country: "ZZZ",
		};

		expect(toAddressWithParsed(suggestion).country).toBe("ZZZ");
	});
});
