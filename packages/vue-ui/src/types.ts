import type { AddressSuggestion } from "@locnative/sdk";

export interface AddressWithParsed {
	country: string;
	formattedAddress: string;
	id: number;
	latitude: number;
	longitude: number;
	postcode: string;
	state: string;
	streetAddress: string;
	suburb: string;
}

export interface AddressI18nStrings {
	enterManually: string;
	errorRetry: string;
	geolocationError: string;
	noResults: string;
}

export type AddressValidateFn = (
	address: AddressWithParsed
) => Promise<{ message: string } | null>;

export type AddressSuggestionInput = AddressSuggestion;

export interface AddressFieldGroupValue {
	postcode: string;
	state: string;
	street: string;
	suburb: string;
}
