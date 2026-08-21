import { type SQL, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { formatAddress } from "./format-address.ts";
import { parseFreeformAddress } from "./parse-freeform-address.ts";
import {
	type ParsedUnitAddress,
	parseUnitAddress,
} from "./parse-unit-address.ts";
import { anchorToken } from "./query-tokens.ts";
import { structuredAutocomplete } from "./structured-search.ts";

const TRIGRAM_SIMILARITY_THRESHOLD = 0.3;
const LEVENSHTEIN_SHORT_MAX_DISTANCE = 1;
const LEVENSHTEIN_LONG_MAX_DISTANCE = 2;
const PREFIX_SEARCH_MAX_LEN = 4;
const WIDE_FUZZY_MIN_LEN = 8;
const PURE_DIGITS_REGEX = /^\d+$/;
const DIGIT_REGEX = /\d/;
const WHITESPACE_REGEX = /\s+/;
const LOCALITY_QUERY_MAX_TOKENS = 3;
const LOCALITY_STREET_HINTS = new Set([
	"AVE",
	"AVENUE",
	"BLVD",
	"CIR",
	"CIRCLE",
	"COURT",
	"CRES",
	"CRESCENT",
	"CT",
	"DR",
	"DRIVE",
	"HWY",
	"LANE",
	"LN",
	"PDE",
	"PLACE",
	"PL",
	"PKWY",
	"RD",
	"ROAD",
	"ST",
	"STREET",
	"TCE",
	"TERRACE",
	"WAY",
]);

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

interface LocalityAutocompleteRow {
	country: string;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	population_score: number;
	postcode: string;
	state: string;
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

function looksLikeLocalityQuery(query: string): boolean {
	const tokens = query
		.trim()
		.toUpperCase()
		.split(WHITESPACE_REGEX)
		.filter(Boolean);

	if (tokens.length === 0 || tokens.length > LOCALITY_QUERY_MAX_TOKENS) {
		return false;
	}

	if (tokens.some((token) => DIGIT_REGEX.test(token))) {
		return false;
	}

	return !tokens.some((token) => LOCALITY_STREET_HINTS.has(token));
}

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
		orderParts.push(sql`1`);
	}

	return sql.join(orderParts, sql`, `);
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

	if (looksLikeLocalityQuery(trimmed)) {
		const localityResults = await localityAutocomplete(db, trimmed, {
			country: effectiveCountry,
			state,
			limit,
		});
		if (localityResults.length > 0) {
			return { results: localityResults, parsedQuery: null };
		}
	}

	const parsed = parseUnitAddress(searchBase);
	const searchInput = parsed ? parsed.streetQuery : searchBase;
	const len = searchInput.length;

	// Too short -- only guard when parser did not strip unit/street numbers;
	// when parsed, the strict unit + street_number filters narrow results enough.
	if (!parsed && len < 3) {
		return { results: [], parsedQuery: null };
	}

	const filterClauses = buildFilterClauses(effectiveCountry, state, parsed);

	// Parsed with empty streetQuery -- filters alone identify the rows.
	if (parsed && searchInput === "") {
		const whereClause = sql.join(filterClauses, sql` AND `);
		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
			FROM addresses
			WHERE ${whereClause}
			ORDER BY ${buildOrderBy(latitude, longitude)}
			LIMIT ${limit}
		`);
		return {
			results: (result.rows as unknown as RawAddressRow[]).map(mapRowToResult),
			parsedQuery: parsed,
		};
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

	// Parsed-path fallback: trigram similarity of a short streetQuery against a
	// long search_text column is often below threshold, even though unit +
	// street_number already narrow the rows tightly. Retry with a direct
	// street_name ILIKE when tiered/ilikeFallback returned nothing.
	if (results.length === 0 && parsed) {
		results = await parsedPathFallback(db, searchInput, filterClauses, {
			limit,
			latitude,
			longitude,
		});
	}

	return { results, parsedQuery: parsed };
}

async function localityAutocomplete(
	db: Database,
	query: string,
	options: { country?: string; state?: string; limit: number }
): Promise<AutocompleteResult[]> {
	const localityQuery = query.trim().toUpperCase();
	const localityPrefix = `${localityQuery}%`;
	const filters: SQL<unknown>[] = [sql`locality LIKE ${localityPrefix}`];

	if (options.country) {
		filters.push(sql`country = ${options.country.toUpperCase()}`);
	}

	if (options.state) {
		filters.push(sql`state = ${options.state.toUpperCase()}`);
	}

	const whereClause = sql.join(filters, sql` AND `);
	const result = await db.execute(sql`
		WITH locality_matches AS (
			SELECT DISTINCT ON (locality, state, postcode, country)
				id,
				locality,
				state,
				postcode,
				country,
				longitude,
				latitude,
				population_score
			FROM addresses
			WHERE ${whereClause}
			ORDER BY
				locality,
				state,
				postcode,
				country,
				population_score DESC,
				admin_level ASC,
				id ASC
		)
		SELECT
			id,
			locality,
			state,
			postcode,
			country,
			longitude,
			latitude,
			population_score
		FROM locality_matches
		ORDER BY
			(locality = ${localityQuery}) DESC,
			population_score DESC,
			locality ASC
		LIMIT ${options.limit}
	`);

	return (result.rows as unknown as LocalityAutocompleteRow[]).map((row) => {
		const streetAddress = row.locality;

		return {
			id: -row.id,
			formattedAddress: formatAddress(streetAddress, {
				locality: null,
				state: row.state,
				postcode: row.postcode,
				country: row.country,
			}),
			streetAddress,
			streetName: null,
			streetNumber: null,
			streetType: null,
			locality: row.locality,
			state: row.state,
			postcode: row.postcode ?? "",
			country: row.country,
			longitude: row.longitude,
			latitude: row.latitude,
		};
	});
}

async function parsedPathFallback(
	db: Database,
	streetQuery: string,
	filterClauses: SQL<unknown>[],
	opts: { limit: number; latitude?: number; longitude?: number }
): Promise<AutocompleteResult[]> {
	const { limit, latitude, longitude } = opts;
	const conditions: SQL<unknown>[] = [...filterClauses];
	if (streetQuery) {
		conditions.push(sql`street_name ILIKE ${`${streetQuery}%`}`);
	}
	const whereClause = sql.join(conditions, sql` AND `);

	const result = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
		FROM addresses
		WHERE ${whereClause}
		ORDER BY ${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	return (result.rows as unknown as RawAddressRow[]).map(mapRowToResult);
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

	// Tier 1 (3-4 chars): Prefix search only (uses B-tree text_pattern_ops index)
	if (len <= PREFIX_SEARCH_MAX_LEN) {
		const prefixPattern = `${trimmed}%`;
		const whereClause = buildWhereClause(
			sql`search_text ILIKE ${prefixPattern}`,
			filterClauses
		);

		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
			FROM addresses
			WHERE ${whereClause}
			ORDER BY ${buildOrderBy(latitude, longitude)}
			LIMIT ${limit}
		`);

		return (result.rows as unknown as RawAddressRow[]).map(mapRowToResult);
	}

	// Tier 2 (5-7 chars): Trigram similarity + levenshtein fallback
	if (len < WIDE_FUZZY_MIN_LEN) {
		await db.execute(sql`SELECT set_limit(${TRIGRAM_SIMILARITY_THRESHOLD})`);

		const whereClause = buildWhereClause(
			sql`search_text % ${trimmed}::text`,
			filterClauses
		);

		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS},
				similarity(search_text, ${trimmed}::text) as similarity_score
			FROM addresses
			WHERE ${whereClause}
			ORDER BY ${orderBy}
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

		// Levenshtein fallback (distance <= 1)
		const levenshteinWhere = buildWhereClause(
			sql`levenshtein(lower(left(search_text, ${len + 2})), lower(${trimmed})) <= ${LEVENSHTEIN_SHORT_MAX_DISTANCE}`,
			filterClauses
		);

		const fallbackResult = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 0.5 as similarity_score
			FROM addresses
			WHERE ${levenshteinWhere}
			ORDER BY ${buildOrderBy(latitude, longitude)}
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
	// search_text is stored uppercase; a case-sensitive LIKE on the uppercased
	// prefix uses idx_addresses_search_text_btree (text_pattern_ops) as a range
	// scan (~5ms). ILIKE would fall back to the GIN trigram index → 100K-row
	// bitmap + heap recheck (~11s cold). See design doc A2.
	const anchorClause = sql`search_text LIKE ${`${anchor.toUpperCase()}%`}`;
	const tier3Filters = [...filterClauses, anchorClause];

	await db.execute(sql`SELECT set_limit(${TRIGRAM_SIMILARITY_THRESHOLD})`);

	const tier3Where = buildWhereClause(
		sql`search_text <% ${trimmed}::text`,
		tier3Filters
	);

	const result = await db.execute(sql`
		SELECT ${SELECT_COLUMNS},
			word_similarity(search_text, ${trimmed}::text) as similarity_score
		FROM addresses
		WHERE ${tier3Where}
		ORDER BY ${orderBy}
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
	const levenshteinWhere = buildWhereClause(
		sql`levenshtein(lower(left(search_text, ${len + 2})), lower(${trimmed})) <= ${LEVENSHTEIN_LONG_MAX_DISTANCE}`,
		tier3Filters
	);

	const levenshteinResult = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 0.5 as similarity_score
		FROM addresses
		WHERE ${levenshteinWhere}
		ORDER BY ${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	const levenshteinRows = levenshteinResult.rows as unknown as RawAddressRow[];

	if (levenshteinRows.length > 0) {
		return levenshteinRows.map(mapRowToResult);
	}

	// Phonetic fallback (dmetaphone)
	const phoneticWhere = buildWhereClause(
		sql`dmetaphone(left(search_text, 20)) = dmetaphone(${trimmed})`,
		tier3Filters
	);

	const phoneticResult = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 0.3 as similarity_score
		FROM addresses
		WHERE ${phoneticWhere}
		ORDER BY ${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	return (phoneticResult.rows as unknown as RawAddressRow[]).map(
		mapRowToResult
	);
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
			ORDER BY ${buildOrderBy(latitude, longitude)}
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
		ORDER BY ${buildOrderBy(latitude, longitude)}
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

	// First token uses prefix match (can use B-tree index)
	const firstTokenCondition = sql`search_text ILIKE ${`${tokens[0]}%`}`;

	// Additional tokens use substring match but operate on the
	// already-narrowed result set from the first token's index scan
	const additionalConditions = tokens
		.slice(1)
		.map((token) => sql`search_text ILIKE ${`%${token}%`}`);

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
