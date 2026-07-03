import { type AddressSuggestion, countryName } from "@locnative/sdk";
import type { AddressWithParsed } from "../types";

/**
 * Light client-side cleanup before sending to the API for snappier typeahead.
 * The server is authoritative (parseFreeformAddress); this only normalizes
 * obvious whitespace/comma noise so keystrokes look clean. Does NOT strip the
 * country or parse components.
 */
export function cleanAddressInput(input: string): string {
	return input
		.replace(/\s*,\s*/g, ", ")
		.replace(/\s+/g, " ")
		.trim();
}

export function toAddressWithParsed(
	suggestion: AddressSuggestion
): AddressWithParsed {
	return {
		id: suggestion.id,
		formattedAddress: suggestion.formattedAddress,
		latitude: suggestion.latitude,
		longitude: suggestion.longitude,
		streetAddress: suggestion.streetAddress,
		suburb: suggestion.locality,
		state: suggestion.state,
		postcode: suggestion.postcode,
		country: countryName(suggestion.country),
	};
}
