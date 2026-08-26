import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Structural guard for autocomplete.ts.
 *
 * Three separate production incidents came from the same mistake: a fuzzy
 * predicate against `search_text` with no selective anchor to bound it.
 *
 *   - Slash-unit queries ("5/120 Main St") fell into an unanchored trigram
 *     match and a full table scan. ~7.7 minutes.
 *   - Tier 1 used ILIKE, which cannot use the text_pattern_ops btree for an
 *     alphabetic prefix, so it degraded to a full-table trigram scan. >25s.
 *   - Tier 2 ran an unanchored trigram match, so any 5-7 character query that
 *     matched nothing scanned the whole GIN index and never returned. >45s.
 *
 * Each was found in production by a customer rather than by us, because a
 * results-based test passes either way — the query returns the right rows, it
 * just takes minutes to do it.
 *
 * The invariant: every fuzzy predicate against search_text must be built by
 * `buildAnchoredFuzzyWhere`, which requires an anchor token and ANDs a
 * selective `search_text LIKE 'ANCHOR%'` clause onto it.
 *
 * This reads the source rather than the database on purpose: it runs in the
 * normal unit suite, needs no connection, and fails at authoring time.
 */

const SOURCE = readFileSync(
	fileURLToPath(new URL("./autocomplete.ts", import.meta.url)),
	"utf8"
);

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^\s*\/\/.*$/gm;
const ANCHORED_CALL = /buildAnchoredFuzzyWhere\(/g;
const HELPER_DECL = /function buildAnchoredFuzzyWhere/;
const ANCHOR_PARAM = /anchor:\s*string/;
const ILIKE_SEARCH_TEXT = /search_text\s+ILIKE/gi;
const ORDER_BY_ORDINAL = /ORDER BY 1\b/;

/** Strip block and line comments so prose about ILIKE isn't mistaken for code. */
function stripComments(source: string): string {
	return source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

const CODE = stripComments(SOURCE);

/**
 * Fuzzy operators that scan rather than seek. Each entry is a matcher for a
 * predicate that must never appear unanchored.
 */
const FUZZY_PREDICATES: { name: string; pattern: RegExp }[] = [
	{ name: "trigram similarity (%)", pattern: /search_text\s*%\s*\$\{/g },
	{ name: "word similarity (<%)", pattern: /search_text\s*<%\s*\$\{/g },
	{ name: "levenshtein", pattern: /levenshtein\(/g },
	{ name: "dmetaphone", pattern: /dmetaphone\(/g },
];

describe("fuzzy predicates are anchored", () => {
	it("routes every fuzzy predicate through buildAnchoredFuzzyWhere", () => {
		// Each fuzzy predicate should sit inside a buildAnchoredFuzzyWhere call.
		// Approximate that by checking the call count covers the predicate count:
		// if someone adds a bare one, the counts diverge.
		const anchoredCalls = (CODE.match(ANCHORED_CALL) ?? []).length;
		const fuzzyUses = FUZZY_PREDICATES.reduce(
			(total, { pattern }) => total + (CODE.match(pattern) ?? []).length,
			0
		);

		expect(
			anchoredCalls,
			`Found ${fuzzyUses} fuzzy predicate(s) but only ${anchoredCalls} buildAnchoredFuzzyWhere call(s). ` +
				"Every fuzzy predicate against search_text must be anchored — see the header of this test."
		).toBeGreaterThanOrEqual(fuzzyUses);
	});

	it("requires an anchor token before running a fuzzy tier", () => {
		// The helper must reject a missing anchor rather than silently omitting
		// the bound, which is what makes the guard load-bearing.
		expect(CODE).toMatch(HELPER_DECL);
		expect(CODE).toMatch(ANCHOR_PARAM);
	});

	it("never uses ILIKE against search_text", () => {
		// idx_addresses_search_text_btree is text_pattern_ops (case-sensitive):
		// ILIKE cannot use it for an alphabetic prefix and falls back to a
		// full-table scan. search_text is stored uppercase, so LIKE against an
		// uppercased pattern is both correct and indexable.
		const ilikeOnSearchText = CODE.match(ILIKE_SEARCH_TEXT) ?? [];
		expect(
			ilikeOnSearchText,
			"search_text must use case-sensitive LIKE on an uppercased pattern, not ILIKE."
		).toEqual([]);
	});

	it("never emits ORDER BY 1 as a no-op placeholder", () => {
		// `ORDER BY 1` is an ordinal reference to the first select column, so
		// Postgres plans a real sort and LIMIT can no longer short-circuit the
		// index scan. That cost 3-digit prefixes 6-20s.
		expect(CODE).not.toMatch(ORDER_BY_ORDINAL);
	});
});
