import { type SQL, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { formatAddress } from "./format-address.ts";
import { fuzzyLocalitySearch } from "./fuzzy-locality.ts";
import { localityQuery, prefixUpperBound } from "./locality-query.ts";
import { parseFreeformAddress } from "./parse-freeform-address.ts";
import {
	type ParsedUnitAddress,
	parseUnitAddress,
} from "./parse-unit-address.ts";
import { barePostcode } from "./postcode-query.ts";
import { anchorToken } from "./query-tokens.ts";
import { structuredAutocomplete } from "./structured-search.ts";

const TRIGRAM_SIMILARITY_THRESHOLD = 0.3;
const LEVENSHTEIN_SHORT_MAX_DISTANCE = 1;
const LEVENSHTEIN_LONG_MAX_DISTANCE = 2;
const PREFIX_SEARCH_MAX_LEN = 4;
const WIDE_FUZZY_MIN_LEN = 8;
const PURE_DIGITS_REGEX = /^\d+$/;
const WHITESPACE_REGEX = /\s+/;

export interface AutocompleteResult {
	country: string;
	formattedAddress: string;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	postcode: string;
	state: string;
	streetAddress: string;
	streetName: string | null;
	streetNumber: string | null;
	streetType: string | null;
}

export interface RawAddressRow {
	building_name: string | null;
	country: string;
	flat_number: string | null;
	flat_type: string | null;
	id: number;
	latitude: number;
	level_number: string | null;
	level_type: string | null;
	locality: string;
	longitude: number;
	number_first: string | null;
	number_last: string | null;
	postcode: string;
	similarity_score: number;
	state: string;
	street_name: string;
	street_suffix: string | null;
	street_type: string | null;
}

function formatStreetAddress(row: {
	flatType: string | null;
	flatNumber: string | null;
	levelType: string | null;
	levelNumber: string | null;
	numberFirst: string | null;
	numberLast: string | null;
	streetName: string;
	streetType: string | null;
	streetSuffix: string | null;
	buildingName: string | null;
}): string {
	const parts: string[] = [];

	if (row.buildingName) {
		parts.push(row.buildingName);
	}

	if (row.flatType && row.flatNumber) {
		parts.push(`${row.flatType} ${row.flatNumber}`);
	} else if (row.flatNumber) {
		parts.push(`Unit ${row.flatNumber}`);
	}

	if (row.levelType && row.levelNumber) {
		parts.push(`${row.levelType} ${row.levelNumber}`);
	}

	const numberRange = row.numberLast
		? `${row.numberFirst}-${row.numberLast}`
		: row.numberFirst;

	const streetParts = [
		numberRange,
		row.streetName,
		row.streetType,
		row.streetSuffix,
	].filter(Boolean);

	parts.push(streetParts.join(" "));

	return parts.join(", ");
}

function buildFilterClauses(
	country?: string,
	state?: string,
	parsed?: ParsedUnitAddress | null
): SQL<unknown>[] {
	const clauses: SQL<unknown>[] = [];
	if (country) {
		clauses.push(sql`country = ${country.toUpperCase()}`);
	}
	if (state) {
		clauses.push(sql`state = ${state.toUpperCase()}`);
	}
	if (parsed) {
		const digitRange =
			parsed.unitNumberLast &&
			PURE_DIGITS_REGEX.test(parsed.unitNumber) &&
			PURE_DIGITS_REGEX.test(parsed.unitNumberLast);
		if (digitRange) {
			clauses.push(
				sql`flat_number ~ '^[0-9]+$' AND flat_number::int BETWEEN ${Number(parsed.unitNumber)} AND ${Number(parsed.unitNumberLast)}`
			);
		} else {
			clauses.push(sql`upper(flat_number) = upper(${parsed.unitNumber}::text)`);
		}
		clauses.push(
			sql`upper(number_first) = upper(${parsed.streetNumber}::text)`
		);
		if (parsed.levelNumber) {
			clauses.push(
				sql`upper(level_number) = upper(${parsed.levelNumber}::text)`
			);
		}
	}
	return clauses;
}

function buildWhereClause(
	searchCondition: SQL<unknown>,
	filterClauses: SQL<unknown>[]
): SQL<unknown> {
	const allConditions = [searchCondition, ...filterClauses];
	return sql.join(allConditions, sql` AND `);
}

/**
 * WHERE clause for a fuzzy predicate — trigram, edit-distance or phonetic —
 * that is always bounded by a selective prefix anchor.
 *
 * This exists because the same defect has now been fixed three times in this
 * file: an unbounded fuzzy predicate over 173M rows. Trigram operators scan the
 * whole GIN index when nothing matches; levenshtein and dmetaphone wrap
 * `search_text` in function calls so no index can serve them at all. In every
 * case the no-match path is the expensive one, and the no-match path is exactly
 * the one users hit — a typo, a partial word, a suburb we do not carry.
 *
 * Taking the anchor as a required parameter rather than an optional filter is
 * the point: a caller cannot express an unanchored fuzzy query through this
 * helper, so a future tier cannot reintroduce the bug by omission. Callers
 * derive the anchor from `anchorToken()` and must return early when it yields
 * null — no anchor means no bounded query is possible, and the correct answer
 * is "no results" rather than a scan.
 *
 * Guarded by scripts/verify-fuzzy-tier.mjs.
 */
function buildAnchoredFuzzyWhere(
	fuzzyCondition: SQL<unknown>,
	anchor: string,
	filterClauses: SQL<unknown>[]
): SQL<unknown> {
	const anchorClause = sql`search_text LIKE ${`${anchor.toUpperCase()}%`}`;
	return buildWhereClause(fuzzyCondition, [...filterClauses, anchorClause]);
}

/**
 * Build the ORDER BY clause, including the `ORDER BY` keyword itself, or an
 * empty fragment when there is nothing to order by.
 *
 * Emitting a placeholder here is a trap. `ORDER BY 1` is not a no-op — Postgres
 * reads it as an ordinal reference to the first select column and performs a
 * real sort, which forces the plan to consume every matching row before LIMIT
 * can apply. On a prefix like '318%' that is thousands of rows: measured 11ms
 * without the clause versus 1511ms with it, and far worse on a cold cache for
 * broader prefixes. Returning an empty fragment lets LIMIT short-circuit the
 * index scan after the first N rows.
 *
 * Guarded by scripts/verify-prefix-index.mjs.
 */
function buildOrderBy(
	latitude?: number,
	longitude?: number,
	similarityColumn?: string,
	useRankingColumns = false
): SQL<unknown> {
	const orderParts: SQL<unknown>[] = [];

	if (useRankingColumns) {
		orderParts.push(sql`population_score DESC`, sql`admin_level ASC`);
	}

	if (latitude !== undefined && longitude !== undefined) {
		orderParts.push(
			sql`ST_Distance(geom, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)) ASC`
		);
	}

	if (similarityColumn === "similarity_score") {
		orderParts.push(sql`similarity_score DESC`);
	}

	if (orderParts.length === 0) {
		return sql``;
	}

	return sql`ORDER BY ${sql.join(orderParts, sql`, `)}`;
}

export const SELECT_COLUMNS = sql`
	id, country, state, locality, postcode,
	street_name, street_type, street_suffix,
	building_name, flat_type, flat_number,
	level_type, level_number,
	number_first, number_last,
	longitude, latitude`;

export function mapRowToResult(row: RawAddressRow): AutocompleteResult {
	const mapped = {
		flatType: row.flat_type,
		flatNumber: row.flat_number,
		levelType: row.level_type,
		levelNumber: row.level_number,
		numberFirst: row.number_first,
		numberLast: row.number_last,
		streetName: row.street_name,
		streetType: row.street_type,
		streetSuffix: row.street_suffix,
		buildingName: row.building_name,
	};
	const streetAddress = formatStreetAddress(mapped);
	return {
		id: row.id,
		formattedAddress: formatAddress(streetAddress, {
			locality: row.locality,
			state: row.state,
			postcode: row.postcode,
			country: row.country,
		}),
		streetAddress,
		streetName: row.street_name,
		streetNumber: row.number_first,
		streetType: row.street_type,
		locality: row.locality,
		state: row.state,
		postcode: row.postcode ?? "",
		country: row.country,
		longitude: row.longitude,
		latitude: row.latitude,
	};
}

/**
 * Guarded entry to postcodeSearch: returns [] unless the query is a bare
 * postcode for a known country. Extracted so autocompleteAddresses stays within
 * its cognitive-complexity budget.
 */
async function tryPostcodeSearch(
	db: Database,
	searchInput: string,
	opts: {
		country?: string;
		limit: number;
		state?: string;
		latitude?: number;
		longitude?: number;
	}
): Promise<AutocompleteResult[]> {
	const { country, limit, state, latitude, longitude } = opts;
	if (!country) {
		return [];
	}
	const postcode = barePostcode(searchInput, country);
	if (!postcode) {
		return [];
	}
	return await postcodeSearch(db, postcode, country, {
		limit,
		state,
		latitude,
		longitude,
	});
}

/**
 * Guarded entry to localitySearch: returns [] unless the query actually looks
 * like a suburb name for a known country. Extracted so autocompleteAddresses
 * stays within its cognitive-complexity budget.
 */
async function tryLocalitySearch(
	db: Database,
	searchInput: string,
	opts: {
		country?: string;
		limit: number;
		state?: string;
		latitude?: number;
		longitude?: number;
	}
): Promise<AutocompleteResult[]> {
	const { country, limit, state, latitude, longitude } = opts;
	if (!country) {
		return [];
	}
	const prefix = localityQuery(searchInput, country);
	if (!prefix) {
		return [];
	}
	return await localitySearch(db, prefix, prefixUpperBound(prefix), country, {
		limit,
		state,
		latitude,
		longitude,
	});
}

/**
 * Guarded entry to fuzzyLocalitySearch. Returns [] unless the query is
 * alphabetic — a query containing digits is a street address or postcode, and
 * "correcting" its spelling would be wrong rather than merely unhelpful.
 *
 * Results are mapped to the locality shape callers already receive from the
 * postcode and locality branches: no street line, since a fuzzy match
 * identifies a suburb rather than an address within it.
 */
async function tryFuzzyLocality(
	db: Database,
	searchInput: string,
	opts: { country: string; limit: number; state?: string }
): Promise<AutocompleteResult[]> {
	const { country, limit, state } = opts;
	if (!localityQuery(searchInput, country)) {
		return [];
	}

	const matches = await fuzzyLocalitySearch(db, searchInput, country, {
		limit,
		state,
	});

	return matches.map((m) => ({
		id: m.id,
		formattedAddress: formatAddress("", {
			locality: m.locality,
			state: m.state,
			postcode: m.postcode,
			country: country.toUpperCase(),
		}),
		streetAddress: "",
		streetName: null,
		streetNumber: null,
		streetType: null,
		locality: m.locality,
		state: m.state,
		postcode: m.postcode,
		country: country.toUpperCase(),
		longitude: m.longitude,
		latitude: m.latitude,
	}));
}

export async function autocompleteAddresses(
	db: Database,
	query: string,
	options: {
		country?: string;
		state?: string;
		limit?: number;
		latitude?: number;
		longitude?: number;
		/**
		 * Run the last-resort levenshtein (edit-distance) + dmetaphone (phonetic)
		 * fallbacks when earlier tiers find nothing. These scan the anchored
		 * btree range's heap and are the dominant COLD-cache cost on no-match
		 * queries. Default true (typeahead typo tolerance); forward geocode sets
		 * false — word_similarity already covers typos and phonetic matches
		 * rarely yield a correct geocode. See A2 cold-cache follow-up.
		 */
		phoneticFallback?: boolean;
	} = {}
): Promise<{
	results: AutocompleteResult[];
	parsedQuery: ParsedUnitAddress | null;
}> {
	const {
		country,
		state,
		limit = 10,
		latitude,
		longitude,
		phoneticFallback = true,
	} = options;
	const trimmed = query.trim();
	if (!trimmed) {
		return { results: [], parsedQuery: null };
	}

	// Freeform full-address path: parse into components and try the structured,
	// index-anchored query first. On a miss we fall through to the existing fuzzy
	// pipeline using the cleaned (comma/country-stripped) string. See design §4.4.
	const freeform = parseFreeformAddress(trimmed);
	const effectiveCountry = country ?? freeform.countryCode ?? undefined;
	if (freeform.confidence === "high") {
		const structured = await structuredAutocomplete(db, freeform, {
			limit,
			country: effectiveCountry,
		});
		if (structured.length > 0) {
			return { results: structured, parsedQuery: null };
		}
	}
	const searchBase =
		freeform.confidence === "high" ? freeform.cleaned : trimmed;

	const parsed = parseUnitAddress(searchBase);
	const searchInput = parsed ? parsed.streetQuery : searchBase;
	const len = searchInput.length;

	// Too short -- only guard when parser did not strip unit/street numbers;
	// when parsed, the strict unit + street_number filters narrow results enough.
	// A 2-char locality prefix is exempt: the endpoint accepts q at 2 characters,
	// and the locality skip-scan below is bounded by the number of suburbs it
	// returns rather than the rows it passes over, so it stays cheap on a short
	// prefix where the free-text tiers would not.
	if (!parsed && len < 3) {
		const shortLocality = await tryLocalitySearch(db, searchInput, {
			country: effectiveCountry,
			limit,
			state,
			latitude,
			longitude,
		});
		return { results: shortLocality, parsedQuery: null };
	}

	const filterClauses = buildFilterClauses(effectiveCountry, state, parsed);

	// Parsed with empty streetQuery -- filters alone identify the rows.
	if (parsed && searchInput === "") {
		const whereClause = sql.join(filterClauses, sql` AND `);
		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
			FROM addresses
			WHERE ${whereClause}
			${buildOrderBy(latitude, longitude)}
			LIMIT ${limit}
		`);
		return {
			results: (result.rows as unknown as RawAddressRow[]).map(mapRowToResult),
			parsedQuery: parsed,
		};
	}

	// Bare-postcode path: must run before prefixSearch, which would otherwise
	// match the digits against number_first (a street number) and return early
	// on those wrong rows. Country-gated — without a country a bare number is
	// still treated as a street number, as before. Falls through on no match so
	// genuine numeric street queries keep working.
	const postcodeResults = await tryPostcodeSearch(db, searchInput, {
		country: effectiveCountry,
		limit,
		state,
		latitude,
		longitude,
	});
	if (postcodeResults.length > 0) {
		return { results: postcodeResults, parsedQuery: parsed };
	}

	// Locality-name path: same defect as the postcode case one field over. The
	// locality sits mid-string in search_text, so prefixSearch can only find a
	// suburb when a street shares its name, and it returns early on those wrong
	// rows. Runs before prefixSearch for that reason, and falls through on no
	// match so street queries are unaffected.
	const localityResults = await tryLocalitySearch(db, searchInput, {
		country: effectiveCountry,
		limit,
		state,
		latitude,
		longitude,
	});
	if (localityResults.length > 0) {
		return { results: localityResults, parsedQuery: parsed };
	}

	// Always try fast prefix search first (uses B-tree index, works without extensions).
	// Pass `parsed` so prefixSearch can reconstruct the number-first prefix that matches
	// how search_text is stored (e.g. "120 Main St%") when the caller typed "5/120 Main St".
	const prefixResults = await prefixSearch(db, searchInput, filterClauses, {
		limit,
		latitude,
		longitude,
		parsed,
	});
	if (prefixResults.length > 0) {
		return { results: prefixResults, parsedQuery: parsed };
	}

	// Slash-unit queries stop here. prefixSearch has already tried the anchored
	// "<streetNumber> <streetQuery>%" form against idx_addresses_search_text_btree,
	// which is the only indexable way to satisfy this shape, so a miss means no
	// match rather than "try harder".
	//
	// The tiers below cannot be reached cheaply from here. Both are unanchored
	// once buildFilterClauses has wrapped the unit columns in upper(), for which
	// no functional index exists:
	//   - tieredSearch's trigram predicate bitmap-scans the GIN index for a
	//     common street word and applies the unit filters as a post-scan Filter
	//     (measured >120s for "Main St").
	//   - parsedPathFallback Parallel Seq Scans all 173M rows (>60s).
	// End to end a miss took ~7.7 minutes and still returned nothing, so falling
	// through bought no results at enormous cost.
	//
	// Guarded by scripts/verify-unit-query.mjs.
	if (parsed) {
		return { results: [], parsedQuery: parsed };
	}

	// Try tiered fuzzy search (requires pg_trgm + fuzzystrmatch extensions)
	// Falls back to optimized ILIKE if extensions aren't available
	let results: AutocompleteResult[];
	try {
		results = await tieredSearch(db, searchInput, len, filterClauses, {
			limit,
			latitude,
			longitude,
			phoneticFallback,
		});
	} catch {
		results = await ilikeFallback(db, searchInput, filterClauses, { limit });
	}

	// Last resort: the query looks like a misspelled suburb name. Everything
	// above has returned nothing, which for an alphabetic query usually means a
	// typo — previously the point at which a user saw an empty dropdown. Bounded
	// to suburb names via a 2-character anchor, so it cannot become the kind of
	// unbounded scan the tiers above were fixed for.
	if (results.length === 0 && effectiveCountry) {
		results = await tryFuzzyLocality(db, searchInput, {
			country: effectiveCountry,
			limit,
			state,
		});
	}

	return { results, parsedQuery: parsed };
}

async function tieredSearch(
	db: Database,
	trimmed: string,
	len: number,
	filterClauses: SQL<unknown>[],
	opts: {
		limit: number;
		latitude?: number;
		longitude?: number;
		phoneticFallback?: boolean;
	}
): Promise<AutocompleteResult[]> {
	const { limit, latitude, longitude, phoneticFallback = true } = opts;
	const orderBy = buildOrderBy(latitude, longitude, "similarity_score");

	// Tier 1 (3-4 chars): Prefix search only.
	// Case-sensitive LIKE on the uppercased pattern. idx_addresses_search_text_btree
	// is text_pattern_ops (case-sensitive): for an ALPHABETIC prefix an ILIKE cannot
	// use it at all and degrades to a full-table scan (measured: `ILIKE 'brow%'`
	// >25s vs `LIKE 'BROW%'` ~11ms cold). For a purely numeric prefix Postgres can
	// still derive a range from ILIKE, so numbers happened to stay fast — which is
	// why this defect went unnoticed. Uppercased LIKE is correct for both.
	// search_text is stored uppercase, so uppercasing keeps the match semantics.
	// Guarded by scripts/verify-prefix-index.mjs.
	if (len <= PREFIX_SEARCH_MAX_LEN) {
		const prefixPattern = `${trimmed}%`.toUpperCase();
		const whereClause = buildWhereClause(
			sql`search_text LIKE ${prefixPattern}`,
			filterClauses
		);

		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
			FROM addresses
			WHERE ${whereClause}
			${buildOrderBy(latitude, longitude)}
			LIMIT ${limit}
		`);

		return (result.rows as unknown as RawAddressRow[]).map(mapRowToResult);
	}

	// Tier 2 (5-7 chars): Trigram similarity + levenshtein fallback.
	//
	// Anchored, for the same reason Tier 3 is. `search_text % 'zzzzz'` on its
	// own has no bound: when nothing matches, it scans the whole GIN trigram
	// index and never completes — measured >45s, with EXPLAIN ANALYZE itself
	// timing out. Because Tier 2 is only reached when prefixSearch already
	// returned empty, the no-match case was the *common* case here, not the
	// edge one, and it caught every 5-7 character typo ("sydeny", "perht").
	//
	// The anchor costs nothing in practice: a 5-7 char query that matches
	// anything is served by prefixSearch and never reaches this tier at all
	// (verified: bondi/perth/hobart/cairns/darwin all return in ~40ms there).
	// What the anchor removes is a path that was spending 20-40s to return
	// zero rows — the trigram threshold of 0.3 against the long concatenated
	// search_text never matched a short typo anyway, so no typo tolerance is
	// lost. Restoring real typo tolerance means matching the locality column,
	// which is a separate piece of work.
	//
	// Guarded by scripts/verify-fuzzy-tier.mjs.
	if (len < WIDE_FUZZY_MIN_LEN) {
		const tier2Anchor = anchorToken(trimmed);
		if (!tier2Anchor) {
			return [];
		}

		await db.execute(sql`SELECT set_limit(${TRIGRAM_SIMILARITY_THRESHOLD})`);

		const whereClause = buildAnchoredFuzzyWhere(
			sql`search_text % ${trimmed}::text`,
			tier2Anchor,
			filterClauses
		);

		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS},
				similarity(search_text, ${trimmed}::text) as similarity_score
			FROM addresses
			WHERE ${whereClause}
			${orderBy}
			LIMIT ${limit}
		`);

		const rows = result.rows as unknown as RawAddressRow[];

		if (rows.length > 0) {
			return rows.map(mapRowToResult);
		}

		// Last-resort edit-distance fallback — skipped when phoneticFallback is
		// off (forward geocode) to avoid the cold-cache heap scan on no-match.
		if (!phoneticFallback) {
			return [];
		}

		// Levenshtein fallback (distance <= 1). Anchored on the same token: the
		// predicate wraps search_text in levenshtein(lower(left(...))), so no
		// index can serve it and without a bound it is a full table scan of
		// 173M rows — reached, by definition, only after the trigram tier above
		// already found nothing.
		const levenshteinWhere = buildAnchoredFuzzyWhere(
			sql`levenshtein(lower(left(search_text, ${len + 2})), lower(${trimmed})) <= ${LEVENSHTEIN_SHORT_MAX_DISTANCE}`,
			tier2Anchor,
			filterClauses
		);

		const fallbackResult = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 0.5 as similarity_score
			FROM addresses
			WHERE ${levenshteinWhere}
			${buildOrderBy(latitude, longitude)}
			LIMIT ${limit}
		`);

		return (fallbackResult.rows as unknown as RawAddressRow[]).map(
			mapRowToResult
		);
	}

	// Tier 3 (8+ chars): Word similarity + levenshtein + phonetic.
	// All three are unindexed over the full table, so AND a selective prefix
	// anchor to bound the candidate set. If no anchor qualifies, skip Tier 3
	// entirely (returns [] -> geocode maps to 404, autocomplete to no results).
	// See docs/superpowers/specs/2026-06-14-api-latency-cost-design.md (A2).
	const anchor = anchorToken(trimmed);
	if (!anchor) {
		return [];
	}
	// buildAnchoredFuzzyWhere applies the prefix anchor. search_text is stored
	// uppercase; a case-sensitive LIKE on the uppercased prefix uses
	// idx_addresses_search_text_btree (text_pattern_ops) as a range scan (~5ms).
	// ILIKE would fall back to the GIN trigram index → 100K-row bitmap + heap
	// recheck (~11s cold). See design doc A2.
	await db.execute(sql`SELECT set_limit(${TRIGRAM_SIMILARITY_THRESHOLD})`);

	const tier3Where = buildAnchoredFuzzyWhere(
		sql`search_text <% ${trimmed}::text`,
		anchor,
		filterClauses
	);

	const result = await db.execute(sql`
		SELECT ${SELECT_COLUMNS},
			word_similarity(search_text, ${trimmed}::text) as similarity_score
		FROM addresses
		WHERE ${tier3Where}
		${orderBy}
		LIMIT ${limit}
	`);

	const rows = result.rows as unknown as RawAddressRow[];

	if (rows.length > 0) {
		return rows.map(mapRowToResult);
	}

	// Last-resort edit-distance + phonetic fallbacks — skipped when
	// phoneticFallback is off (forward geocode). These scan the anchored btree
	// range's heap and are the dominant cold-cache cost on no-match queries;
	// word_similarity above already provides typo tolerance.
	if (!phoneticFallback) {
		return [];
	}

	// Levenshtein fallback (distance <= 2)
	const levenshteinWhere = buildAnchoredFuzzyWhere(
		sql`levenshtein(lower(left(search_text, ${len + 2})), lower(${trimmed})) <= ${LEVENSHTEIN_LONG_MAX_DISTANCE}`,
		anchor,
		filterClauses
	);

	const levenshteinResult = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 0.5 as similarity_score
		FROM addresses
		WHERE ${levenshteinWhere}
		${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	const levenshteinRows = levenshteinResult.rows as unknown as RawAddressRow[];

	if (levenshteinRows.length > 0) {
		return levenshteinRows.map(mapRowToResult);
	}

	// Phonetic fallback (dmetaphone)
	const phoneticWhere = buildAnchoredFuzzyWhere(
		sql`dmetaphone(left(search_text, 20)) = dmetaphone(${trimmed})`,
		anchor,
		filterClauses
	);

	const phoneticResult = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 0.3 as similarity_score
		FROM addresses
		WHERE ${phoneticWhere}
		${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	return (phoneticResult.rows as unknown as RawAddressRow[]).map(
		mapRowToResult
	);
}

/**
 * Locality lookup for a query that is nothing but a postcode.
 *
 * `search_text` is a number-first concatenation with the postcode at the tail,
 * so `prefixSearch` can only match a bare number against `number_first` — it
 * returns street numbers (4118 Murringo Road) instead of the requested
 * postcode, and because it returns early on any hit it also suppresses the
 * fuzzy tiers. This branch matches the `postcode` column directly instead,
 * using idx_addresses_country_state_postcode.
 *
 * `DISTINCT ON (locality, state)` collapses the result to one row per suburb:
 * a postcode holds thousands of addresses, and ten rows of the same street is
 * not a useful suggestion list. Postgres requires DISTINCT ON's leading
 * ORDER BY to match its expressions, so the dedupe runs in a subquery and the
 * caller's ranking is applied outside it.
 */
async function postcodeSearch(
	db: Database,
	postcode: string,
	country: string,
	opts: {
		limit: number;
		state?: string;
		latitude?: number;
		longitude?: number;
	}
): Promise<AutocompleteResult[]> {
	const { limit, state, latitude, longitude } = opts;

	const conditions: SQL<unknown>[] = [
		sql`postcode = ${postcode}`,
		sql`country = ${country.toUpperCase()}`,
	];
	if (state) {
		conditions.push(sql`state = ${state.toUpperCase()}`);
	}
	const whereClause = sql.join(conditions, sql` AND `);

	const result = await db.execute(sql`
		SELECT * FROM (
			SELECT DISTINCT ON (locality, state) ${SELECT_COLUMNS}, 1.0 as similarity_score
			FROM addresses
			WHERE ${whereClause}
			ORDER BY locality, state, id
		) AS localities
		${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	return (result.rows as unknown as RawAddressRow[]).map(mapRowToResult);
}

/**
 * Suburb lookup for a query that looks like a locality name.
 *
 * Same shape of defect as the bare-postcode case: `locality` sits mid-string in
 * the number-first `search_text`, so a prefix match can only find a suburb when
 * a street or building happens to share its name ("MANLY WHARF" matches, plain
 * "sunnybank" does not). This branch matches the locality column directly.
 *
 * The dedupe is the hard part. `DISTINCT ON (locality, state)` has to sort every
 * matching address row first, which is fine for a rare suburb but collapses on a
 * short prefix — measured 3.0s for 'B%' and 7.0s for 'S%', exactly the prefixes a
 * typeahead sends on the first keystrokes.
 *
 * So this walks distinct keys directly with a recursive "loose index scan" (skip
 * scan) over idx_addresses_street, which leads with `locality`. Each step seeks
 * the next key greater than the last rather than reading the duplicates in
 * between, so cost tracks the number of DISTINCT suburbs returned, not the
 * number of address rows scanned. Measured ~30-100ms on the same broad prefixes.
 * A half-open range (>= prefix, < upperBound) is used instead of LIKE because
 * only a range bound can drive that seek.
 *
 * One representative address per suburb is then joined on for the postcode and
 * coordinates.
 */
async function localitySearch(
	db: Database,
	prefix: string,
	upperBound: string,
	country: string,
	opts: {
		limit: number;
		state?: string;
		latitude?: number;
		longitude?: number;
	}
): Promise<AutocompleteResult[]> {
	const { limit, state, latitude, longitude } = opts;
	const countryUpper = country.toUpperCase();
	const stateUpper = state?.toUpperCase();
	const stateFilter = stateUpper ? sql`AND a.state = ${stateUpper}` : sql``;
	const seedStateFilter = stateUpper ? sql`AND state = ${stateUpper}` : sql``;

	const result = await db.execute(sql`
		WITH RECURSIVE keys AS (
			(
				SELECT locality, state
				FROM addresses
				WHERE locality >= ${prefix} AND locality < ${upperBound}
					AND country = ${countryUpper} ${seedStateFilter}
				ORDER BY locality, state
				LIMIT 1
			)
			UNION ALL
			(
				SELECT next_key.locality, next_key.state
				FROM keys k
				CROSS JOIN LATERAL (
					SELECT a.locality, a.state
					FROM addresses a
					WHERE a.country = ${countryUpper}
						AND a.locality < ${upperBound}
						AND (a.locality, a.state) > (k.locality, k.state)
						${stateFilter}
					ORDER BY a.locality, a.state
					LIMIT 1
				) AS next_key
			)
		)
		SELECT rep.*, 1.0 as similarity_score
		FROM keys k
		CROSS JOIN LATERAL (
			SELECT ${SELECT_COLUMNS}
			FROM addresses a
			WHERE a.country = ${countryUpper}
				AND a.locality = k.locality
				AND a.state = k.state
			${buildOrderBy(latitude, longitude)}
			LIMIT 1
		) AS rep
		LIMIT ${limit}
	`);

	return (result.rows as unknown as RawAddressRow[]).map(mapRowToResult);
}

/**
 * Fast prefix search that works without any extensions.
 * Uses case-sensitive `search_text LIKE 'QUERY%'` on the UPPERCASED prefix so
 * it uses idx_addresses_search_text_btree (text_pattern_ops). search_text is
 * stored uppercase. NOTE: case-insensitive ILIKE does NOT use that btree — it
 * falls back to a full trigram/seq scan (>30s on the 173M-row table), which was
 * the forward-geocode/autocomplete hang. See design doc A2.
 *
 * When `parsed` carries a streetNumber (e.g. input was "5/120 Main St"),
 * search_text is stored as "120 Main St ..." so the bare streetQuery prefix
 * "Main St%" never matches. We try the number-prefixed form
 * "${streetNumber} ${trimmed}%" first; if that returns nothing we fall back
 * to the bare `trimmed%` so non-slash flows are unaffected.
 */
async function prefixSearch(
	db: Database,
	trimmed: string,
	filterClauses: SQL<unknown>[],
	opts: {
		limit: number;
		latitude?: number;
		longitude?: number;
		parsed?: ParsedUnitAddress | null;
	}
): Promise<AutocompleteResult[]> {
	const { limit, latitude, longitude, parsed } = opts;

	// When we have a street number, reconstruct the prefix that matches how
	// search_text is stored: "120 Main St%".  This is the primary fix for the
	// slash-unit input path ("5/120 Main St" → streetNumber="120", trimmed="Main St").
	if (parsed?.streetNumber && trimmed) {
		const numberFirstPattern =
			`${parsed.streetNumber} ${trimmed}%`.toUpperCase();
		const whereClause = buildWhereClause(
			sql`search_text LIKE ${numberFirstPattern}`,
			filterClauses
		);
		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
			FROM addresses
			WHERE ${whereClause}
			${buildOrderBy(latitude, longitude)}
			LIMIT ${limit}
		`);
		const rows = (result.rows as unknown as RawAddressRow[]).map(
			mapRowToResult
		);
		if (rows.length > 0) {
			return rows;
		}
		// Fall through to bare prefix below (handles edge cases where
		// street_number is present in parsed but search_text is stored differently).
	}

	// Default: bare prefix search — used for all non-slash inputs and as
	// fallback when the number-first form returned nothing.
	const prefixPattern = `${trimmed}%`.toUpperCase();
	const whereClause = buildWhereClause(
		sql`search_text LIKE ${prefixPattern}`,
		filterClauses
	);

	const result = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
		FROM addresses
		WHERE ${whereClause}
		${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	return (result.rows as unknown as RawAddressRow[]).map(mapRowToResult);
}

/**
 * ILIKE fallback when pg_trgm extensions aren't available.
 * Uses prefix matching on the first token (indexable) and filters
 * remaining tokens with substring matching on the narrowed result set.
 */
async function ilikeFallback(
	db: Database,
	trimmed: string,
	filterClauses: SQL<unknown>[],
	opts: { limit: number }
): Promise<AutocompleteResult[]> {
	const { limit } = opts;
	const tokens = trimmed.split(WHITESPACE_REGEX).filter(Boolean);

	// First token uses prefix match so it can use idx_addresses_search_text_btree.
	// That index is text_pattern_ops (case-sensitive), so this must be LIKE against
	// an uppercased pattern: for an alpha prefix ILIKE cannot use the index and
	// degrades to a full-table scan. search_text is stored uppercase.
	const firstTokenCondition = sql`search_text LIKE ${`${tokens[0]}%`.toUpperCase()}`;

	// Additional tokens use substring match but operate on the
	// already-narrowed result set from the first token's index scan.
	// Substring patterns cannot use a prefix btree regardless; they are uppercased
	// only so they match the uppercase column.
	const additionalConditions = tokens
		.slice(1)
		.map((token) => sql`search_text LIKE ${`%${token}%`.toUpperCase()}`);

	const allConditions = [firstTokenCondition, ...additionalConditions];
	const searchCondition =
		allConditions.length > 1
			? sql.join(allConditions, sql` AND `)
			: firstTokenCondition;

	const whereClause = buildWhereClause(searchCondition, filterClauses);

	const result = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
		FROM addresses
		WHERE ${whereClause}
		LIMIT ${limit}
	`);

	return (result.rows as unknown as RawAddressRow[]).map(mapRowToResult);
}
