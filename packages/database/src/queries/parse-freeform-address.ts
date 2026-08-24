import { isDirectional } from "./address-abbreviations.ts";
import { matchCountry } from "./country-codes.ts";

export interface ParsedFreeformAddress {
	cleaned: string;
	confidence: "high" | "low";
	countryCode: string | null;
	directional: string | null;
	houseNumber: string | null;
	locality: string | null;
	postcode: string | null;
	region: string | null;
	segments: string[];
	streetTokens: string[];
}

// Single-token numeric postcodes: US ZIP (+ZIP4) and the 4-digit form used by
// Australia and much of the EU. Two-token forms (UK, Canada) are handled
// separately in extractPostcodeAndRegion. Anchored against a segment's tokens.
const POSTCODE_PATTERNS: RegExp[] = [
	/^\d{5}(?:-\d{4})?$/, // US ZIP / ZIP+4 (also DE, FR, ES, IT — 5-digit)
	/^\d{4}$/, // AU + much of the EU (AT, BE, CH, DK, NO...)
];
// UK "SW1A 2AA" and Canada "K1A 0B1" split into outward + inward halves.
const UK_OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const UK_INWARD = /^\d[A-Z]{2}$/;
const CA_OUTWARD = /^[A-Z]\d[A-Z]$/;
const CA_INWARD = /^\d[A-Z]\d$/;
const HOUSE_NUMBER = /^\d+[A-Z]?(?:-\d+[A-Z]?)?$/;
const WHITESPACE = /\s+/;

// A segment that is entirely a secondary-unit designator plus its identifier —
// "L 2", "Unit 5", "Shop 1A", "Level 2". Such a segment describes a subdivision
// of the address, not the street, so it must not be read as the street segment.
// The vocabulary mirrors parse-unit-address.ts so the two parsers agree on what
// counts as a unit designator. The trailing anchor matters: it keeps a real
// street whose name begins with one of these words ("12 Shop Street") from
// being mistaken for a unit segment.
const SECONDARY_UNIT_SEGMENT =
	/^(?:APARTMENT|TOWNHOUSE|VILLA|SUITE|LEVEL|UNIT|SHOP|FLAT|APT|STE|LVL|L|U)\.?\s*\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?$/;
// 2-3 letter US state / AU state / CA province codes (rerank only; not exhaustive).
const REGION_CODES = new Set([
	"AL",
	"AK",
	"AZ",
	"AR",
	"CA",
	"CO",
	"CT",
	"DE",
	"FL",
	"GA",
	"HI",
	"ID",
	"IL",
	"IN",
	"IA",
	"KS",
	"KY",
	"LA",
	"ME",
	"MD",
	"MA",
	"MI",
	"MN",
	"MS",
	"MO",
	"MT",
	"NE",
	"NV",
	"NH",
	"NJ",
	"NM",
	"NY",
	"NC",
	"ND",
	"OH",
	"OK",
	"OR",
	"PA",
	"RI",
	"SC",
	"SD",
	"TN",
	"TX",
	"UT",
	"VT",
	"VA",
	"WA",
	"WV",
	"WI",
	"WY",
	"NSW",
	"VIC",
	"QLD",
	"SA",
	"TAS",
	"NT",
	"ACT",
	// Canadian provinces & territories (NT shared with AU above).
	"ON",
	"QC",
	"BC",
	"AB",
	"MB",
	"SK",
	"NS",
	"NB",
	"NL",
	"PE",
	"YT",
	"NU",
]);

function extractPostcodeAndRegion(tokens: string[]): {
	postcode: string | null;
	region: string | null;
	rest: string[];
} {
	const rest = [...tokens];
	let postcode: string | null = null;
	let region: string | null = null;

	// Two-token postcodes at the end: UK "SW1A 2AA", Canada "K1A 0B1".
	if (rest.length >= 2) {
		const last = rest.at(-1) as string;
		const prev = rest.at(-2) as string;
		const isUk = UK_INWARD.test(last) && UK_OUTWARD.test(prev);
		const isCa = CA_INWARD.test(last) && CA_OUTWARD.test(prev);
		if (isUk || isCa) {
			postcode = `${prev} ${last}`;
			rest.splice(rest.length - 2, 2);
		}
	}

	if (!postcode) {
		for (let i = rest.length - 1; i >= 0; i--) {
			if (POSTCODE_PATTERNS.some((re) => re.test(rest[i] as string))) {
				postcode = rest[i] as string;
				rest.splice(i, 1);
				break;
			}
		}
	}

	for (let i = rest.length - 1; i >= 0; i--) {
		if (REGION_CODES.has(rest[i] as string)) {
			region = rest[i] as string;
			rest.splice(i, 1);
			break;
		}
	}

	return { postcode, region, rest };
}

/**
 * Splits the leading (street) segment into house number, directional, and street
 * tokens, with the remaining segments joined as locality. Handles both
 * number-first ("120 Main St") and street-first ("Laugavegur 26") conventions;
 * the latter — common in Iceland and continental Europe — is normalized to
 * number-first so the index-anchored structured path (search_text is stored
 * number-first) can match. See smoke-test-iceland finding #2.
 */
function extractStreet(segments: string[]): {
	houseNumber: string | null;
	directional: string | null;
	streetTokens: string[];
	locality: string | null;
	streetFirst: boolean;
} {
	if (segments.length === 0) {
		return {
			houseNumber: null,
			directional: null,
			streetTokens: [],
			locality: null,
			streetFirst: false,
		};
	}

	// Drop any leading secondary-unit segments ("L 2, 5/120 Main St") so the
	// street is taken from the segment that actually holds it. Without this the
	// designator became the street name and the real street was pushed into
	// locality, producing confident wrong matches rather than an error.
	let streetIndex = 0;
	while (
		streetIndex < segments.length - 1 &&
		SECONDARY_UNIT_SEGMENT.test(segments[streetIndex] as string)
	) {
		streetIndex++;
	}

	const tokens = (segments[streetIndex] as string)
		.split(WHITESPACE)
		.filter(Boolean);
	let houseNumber: string | null = null;
	let streetFirst = false;

	if (tokens.length > 0 && HOUSE_NUMBER.test(tokens[0] as string)) {
		houseNumber = tokens.shift() as string;
	} else if (
		// Street-first: no leading number, but a trailing bare number after at
		// least one street token. Distinct from number-first typeahead ("120 Mai"),
		// which ends in a word, so mid-type prefix behavior is undisturbed.
		tokens.length >= 2 &&
		HOUSE_NUMBER.test(tokens.at(-1) as string)
	) {
		houseNumber = tokens.pop() as string;
		streetFirst = true;
	}

	let directional: string | null = null;
	if (tokens.length > 0 && isDirectional(tokens[0] as string)) {
		directional = tokens.shift() as string;
	}

	const localitySegments = segments.slice(streetIndex + 1);
	const locality =
		localitySegments.length > 0 ? localitySegments.join(" ") : null;

	return {
		houseNumber,
		directional,
		streetTokens: tokens,
		locality,
		streetFirst,
	};
}

export function parseFreeformAddress(input: string): ParsedFreeformAddress {
	const upper = input.trim().toUpperCase();
	const rawSegments = upper
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	if (rawSegments.length === 0) {
		return {
			houseNumber: null,
			directional: null,
			streetTokens: [],
			locality: null,
			region: null,
			postcode: null,
			countryCode: null,
			segments: rawSegments,
			cleaned: upper,
			confidence: "low",
		};
	}

	const segments = [...rawSegments];

	// 1. Country — only from the final segment.
	let countryCode: string | null = null;
	const lastCountry = matchCountry(segments.at(-1) as string);
	if (lastCountry) {
		countryCode = lastCountry;
		segments.pop();
	}

	// 2. Postcode + region — only from the (new) trailing segment's tokens.
	let postcode: string | null = null;
	let region: string | null = null;
	if (segments.length > 0) {
		const tailTokens = (segments.at(-1) as string)
			.split(WHITESPACE)
			.filter(Boolean);
		const extracted = extractPostcodeAndRegion(tailTokens);
		postcode = extracted.postcode;
		region = extracted.region;
		if (extracted.rest.length === 0) {
			segments.pop();
		} else {
			segments[segments.length - 1] = extracted.rest.join(" ");
		}
	}

	// 3. Street segment = first remaining; locality = the rest joined.
	const { houseNumber, directional, streetTokens, locality, streetFirst } =
		extractStreet(segments);

	const cleaned = [
		houseNumber,
		directional,
		...streetTokens,
		locality,
		region,
		postcode,
	]
		.filter(Boolean)
		.join(" ");

	const confidence: "high" | "low" =
		countryCode || postcode || streetFirst || rawSegments.length >= 2
			? "high"
			: "low";

	return {
		houseNumber,
		directional,
		streetTokens,
		locality,
		region,
		postcode,
		countryCode,
		segments: rawSegments,
		cleaned: cleaned || upper,
		confidence,
	};
}
