import type { CallOptions, Requester } from "../shared-types.ts";

export interface AddressSuggestion {
	country: string;
	formattedAddress: string;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	postcode: string;
	state: string;
	streetAddress: string;
}

export interface AddressRecord {
	buildingName: string | null;
	confidence: number | null;
	country: string;
	flatNumber: string | null;
	flatType: string | null;
	gnafPid: string | null;
	id: number;
	latitude: number;
	levelNumber: string | null;
	levelType: string | null;
	locality: string;
	longitude: number;
	numberFirst: string | null;
	numberLast: string | null;
	postcode: string;
	state: string;
	streetName: string;
	streetSuffix: string | null;
	streetType: string | null;
}

export interface NearbyAddress {
	buildingName: string | null;
	country: string;
	distance: number;
	flatNumber: string | null;
	flatType: string | null;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	numberFirst: string | null;
	numberLast: string | null;
	postcode: string;
	state: string;
	streetName: string;
	streetType: string | null;
}

export interface ReverseGeocodeAddress {
	confidence: number | null;
	country: string;
	formattedAddress: string;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	postcode: string;
	state: string;
	streetAddress: string;
}

export interface AutocompleteParams {
	country?: string;
	/** Latitude for proximity boosting (pair with `lng`). */
	lat?: number;
	limit?: number;
	/** Longitude for proximity boosting (pair with `lat`). Sent to the API as `lon`. */
	lng?: number;
	q: string;
	/**
	 * Groups a run of keystrokes for one search into a single billable session.
	 * Generate one stable token per search (e.g. on focus), reuse it across
	 * keystrokes, and discard it after a result is selected. See `newSessionToken()`.
	 */
	sessionToken?: string;
	state?: string;
}

export interface NearbyParams {
	country?: string;
	lat: number;
	limit?: number;
	lng: number;
	radius?: number;
}

export interface ReverseParams {
	lat: number;
	lng: number;
}

export interface AutocompleteResponse {
	count: number;
	results: AddressSuggestion[];
}

export interface NearbyResponse {
	count: number;
	query: {
		lat: number;
		lng: number;
		radius: number;
	};
	results: NearbyAddress[];
}

export interface ReverseResponse {
	address: ReverseGeocodeAddress;
	distance: number;
	query: {
		lat: number;
		lng: number;
	};
}

export interface AddressesResource {
	/**
	 * Search for matching addresses as a user types.
	 *
	 * When `q` is nothing but a postcode and `country` is set, the response is
	 * the localities in that postcode (one entry per suburb) rather than street
	 * addresses. `country` is required for that behaviour, because postcode
	 * formats are country-specific — without it a bare number is treated as a
	 * street number.
	 */
	autocomplete(
		params: AutocompleteParams,
		options?: CallOptions
	): Promise<AutocompleteResponse>;
	getById(id: number, options?: CallOptions): Promise<AddressRecord>;
	nearby(params: NearbyParams, options?: CallOptions): Promise<NearbyResponse>;
	reverse(
		params: ReverseParams,
		options?: CallOptions
	): Promise<ReverseResponse>;
}

export const createAddresses = (request: Requester): AddressesResource => ({
	autocomplete: (params, options) =>
		request<AutocompleteResponse>({
			method: "GET",
			path: "/api/v1/addresses/autocomplete",
			query: {
				q: params.q,
				country: params.country,
				state: params.state,
				limit: params.limit,
				// API uses `lat`/`lon` for autocomplete proximity (nearby uses `lng`).
				lat: params.lat,
				lon: params.lng,
				sessionToken: params.sessionToken,
			},
			...options,
		}),
	getById: (id, options) =>
		request<AddressRecord>({
			method: "GET",
			path: `/api/v1/addresses/${id}`,
			...options,
		}),
	nearby: (params, options) =>
		request<NearbyResponse>({
			method: "GET",
			path: "/api/v1/addresses/nearby",
			query: {
				lat: params.lat,
				lng: params.lng,
				radius: params.radius,
				limit: params.limit,
				country: params.country,
			},
			...options,
		}),
	reverse: (params, options) =>
		request<ReverseResponse>({
			method: "GET",
			path: "/api/v1/addresses/reverse",
			query: { lat: params.lat, lng: params.lng },
			...options,
		}),
});
