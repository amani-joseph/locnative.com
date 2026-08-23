const ALPHA_LOCALITY_REGEX = /^[a-z][a-z\s'\-.]*$/i;
const MIN_LOCALITY_QUERY_LEN = 2;

/**
 * Detect a query that looks like a locality (suburb) name rather than a street
 * address, and normalise it for a prefix match.
 *
 * `search_text` concatenates number-first, so `locality` sits mid-string where a
 * prefix match can never reach it. A suburb is therefore only findable today by
 * coincidence — when a street or building happens to share its name ("MANLY
 * WHARF"). Callers use this helper to divert such queries to a locality-column
 * lookup instead.
 *
 * Deliberately conservative. It matches only alphabetic input (plus the spaces,
 * apostrophes, hyphens and periods that appear in real suburb names, e.g.
 * "O'Halloran Hill", "Coffs Harbour"). Anything containing a digit is a street
 * address or a postcode and is left to the existing pipeline.
 *
 * Returns the uppercased name (search columns are stored uppercase), or null.
 */
export function localityQuery(query: string, country?: string): string | null {
	if (!country) {
		return null;
	}

	const trimmed = query.trim();
	if (trimmed.length < MIN_LOCALITY_QUERY_LEN) {
		return null;
	}
	if (!ALPHA_LOCALITY_REGEX.test(trimmed)) {
		return null;
	}

	return trimmed.toUpperCase();
}

/**
 * Exclusive upper bound for a prefix range scan: the prefix with its final
 * character incremented, so `WHERE locality >= 'BONDI' AND locality < 'BONDJ'`
 * covers exactly the rows starting with 'BONDI'.
 *
 * Using a half-open range rather than `LIKE 'BONDI%'` is what lets the
 * recursive skip-scan walk the btree — see localitySearch().
 */
export function prefixUpperBound(prefix: string): string {
	const lastIndex = prefix.length - 1;
	const lastChar = prefix.charCodeAt(lastIndex);
	return prefix.slice(0, lastIndex) + String.fromCharCode(lastChar + 1);
}
