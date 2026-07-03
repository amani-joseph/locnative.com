import { type AddressSuggestion, countryName } from "@locnative/sdk";
import type { AddressWithParsed } from "../types";

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
