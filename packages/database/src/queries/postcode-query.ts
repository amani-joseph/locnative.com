const BARE_POSTCODE_REGEX = /^\d{4,5}$/;

/**
 * Digit counts that constitute a complete postcode, by ISO 3166-1 alpha-2 code.
 *
 * Only all-numeric formats are listed. Countries with alphanumeric postcodes
 * (GB "SW1A 1AA", CA "K1A 0B1", NL "1234 AB") are deliberately absent: a bare
 * numeric query cannot be a complete postcode there, so they fall through to
 * the normal address pipeline.
 */
const POSTCODE_DIGITS: Record<string, number> = {
	AT: 4,
	AU: 4,
	BE: 4,
	CH: 4,
	DE: 5,
	DK: 4,
	ES: 5,
	FI: 5,
	FR: 5,
	IT: 5,
	NO: 4,
	NZ: 4,
	PT: 4,
	SE: 5,
	US: 5,
	ZA: 4,
};

/**
 * Detect a query that is *nothing but* a postcode for the given country.
 *
 * `search_text` stores the postcode at the tail of a number-first concatenation
 * ("12 SMITH ST BROWNS PLAINS QLD 4118 AU"), so a prefix search for "4118"
 * can only ever match rows whose *street number* is 4118. Callers use this
 * helper to divert such queries to a postcode-column lookup instead.
 *
 * Country-gated by design. Without a country we cannot tell a postcode from a
 * street number, so an absent or unrecognised `country` returns null and the
 * caller keeps today's behaviour — this is what stops "42" from being read as
 * a postcode on an unscoped query.
 *
 * Returns the trimmed postcode, or null when the query is not a bare postcode.
 */
export function barePostcode(query: string, country?: string): string | null {
	if (!country) {
		return null;
	}

	const trimmed = query.trim();
	if (!BARE_POSTCODE_REGEX.test(trimmed)) {
		return null;
	}

	const expectedDigits = POSTCODE_DIGITS[country.toUpperCase()];
	if (expectedDigits === undefined || trimmed.length !== expectedDigits) {
		return null;
	}

	return trimmed;
}
