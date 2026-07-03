const MIN_ANCHOR_LEN = 3;
const WHITESPACE_REGEX = /\s+/;
const DIGITS_ONLY_REGEX = /^\d+$/;

/**
 * Pick a selective prefix anchor token from a free-text address query.
 *
 * Tier-3 fuzzy fallbacks (word_similarity / levenshtein / dmetaphone) are
 * unindexed over the full addresses table. ANDing `search_text ILIKE
 * '<anchor>%'` bounds their candidate set. We skip leading unit/house numbers
 * (which are stored mid-string) and require >= 3 chars to stay selective.
 *
 * Returns null when no token qualifies — callers then skip the fuzzy tier.
 */
export function anchorToken(query: string): string | null {
	const tokens = query
		.trim()
		.toLowerCase()
		.split(WHITESPACE_REGEX)
		.filter((t) => t.length > 0 && !DIGITS_ONLY_REGEX.test(t));
	const first = tokens.find((t) => t.length >= MIN_ANCHOR_LEN);
	return first ?? null;
}
