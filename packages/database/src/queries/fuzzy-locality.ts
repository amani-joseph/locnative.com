import { sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { prefixUpperBound } from "./locality-query.ts";

/**
 * Minimum characters before fuzzy matching is attempted. Below this a typo is
 * indistinguishable from a partial word someone is still typing, and the
 * prefix search already covers them.
 */
const MIN_FUZZY_LEN = 4;

/**
 * How many leading characters must be correct. Fuzzy matching is only viable
 * because this bounds the candidate set to one narrow index range — without it
 * the scoring functions would run over every locality in the country. The cost
 * is that a typo in the first two characters is not corrected, which is the
 * right trade: leading-character errors are rarer than interior ones, and an
 * unbounded scan is what caused the outage this feature was built alongside.
 */
const ANCHOR_LEN = 2;

/**
 * Score below which a candidate is discarded. Tuned against real misspellings:
 * 0.55 admits "sydeny"->SYDNEY (0.67) and "perht"->PERTH (0.60) while keeping
 * the candidate list short enough to rank cheaply.
 */
const MIN_SCORE = 0.55;

/** Candidates scored before size ranking. */
const CANDIDATE_LIMIT = 40;

/** Cap on the per-candidate size probe — see the sizing note in fuzzyLocalitySearch. */
const SIZE_PROBE_CAP = 20_000;

export interface FuzzyLocalityMatch {
	/**
	 * A real address id within the matched locality. Callers surface this in the
	 * same `id` field as exact matches, and `/addresses/{id}` must resolve it —
	 * so it is a genuine row, never a placeholder.
	 */
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	postcode: string;
	score: number;
	state: string;
}

interface RawFuzzyRow {
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	postcode: string;
	score: number;
	state: string;
}

/**
 * Find localities whose names are close to a misspelled query.
 *
 * This is a last resort: it runs only when every exact path has returned
 * nothing, which is exactly when a user has mistyped their suburb. Before this
 * existed, a misspelling returned an empty list.
 *
 * How it scores, and why two measures rather than one: trigram similarity
 * handles insertions and deletions well but punishes transpositions, which are
 * among the most common typing errors ("perht" for "perth" scores poorly on
 * trigrams alone). Normalised edit distance handles transpositions well but is
 * weak on length differences. Taking the better of the two covers both, and
 * ties are broken by how many addresses a locality contains — a population
 * proxy that pushes SYDNEY above SYDENHAM and PERTH WA above PERON WA.
 * (`population_score` exists on the table but is 0 for every row, so address
 * count is the only signal actually available.)
 *
 * Known limitation: a typo dropping two or more characters from a longer name
 * ("brisbn" for "brisbane") still fails to rank the intended suburb, and a typo
 * in the first two characters is not corrected at all by design — see
 * ANCHOR_LEN. This is a meaningful improvement over returning nothing, not a
 * spell-checker.
 */
export async function fuzzyLocalitySearch(
	db: Database,
	query: string,
	country: string,
	options: { limit?: number; state?: string } = {}
): Promise<FuzzyLocalityMatch[]> {
	const { limit = 5, state } = options;
	const normalized = query.trim().toUpperCase();

	if (normalized.length < MIN_FUZZY_LEN) {
		return [];
	}

	const anchor = normalized.slice(0, ANCHOR_LEN);
	const anchorEnd = prefixUpperBound(anchor);
	const countryUpper = country.toUpperCase();
	const stateUpper = state?.toUpperCase();
	const stateFilter = stateUpper ? sql`AND a.state = ${stateUpper}` : sql``;
	const seedStateFilter = stateUpper ? sql`AND state = ${stateUpper}` : sql``;

	// The keys CTE is the same loose index scan localitySearch uses: it walks
	// distinct (locality, state) pairs via idx_addresses_country_locality rather
	// than reading every address row. Scoring then runs over suburb names only —
	// a few hundred at most for a 2-character anchor — never over addresses.
	const result = await db.execute(sql`
		WITH RECURSIVE keys AS (
			(
				SELECT locality, state
				FROM addresses
				WHERE country = ${countryUpper}
					AND locality >= ${anchor} AND locality < ${anchorEnd}
					${seedStateFilter}
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
						AND a.locality < ${anchorEnd}
						AND (a.locality, a.state) > (k.locality, k.state)
						${stateFilter}
					ORDER BY a.locality, a.state
					LIMIT 1
				) AS next_key
			)
		),
		scored AS (
			SELECT locality, state,
				greatest(
					similarity(locality, ${normalized}::text),
					1.0 - (
						levenshtein(locality, ${normalized}::text)::float
						/ greatest(length(locality), length(${normalized}::text))
					)
				) AS score
			FROM keys
		),
		top AS (
			SELECT locality, state, score
			FROM scored
			WHERE score >= ${MIN_SCORE}
			ORDER BY score DESC
			LIMIT ${CANDIDATE_LIMIT}
		)
		SELECT t.locality, t.state, t.score,
			rep.id, rep.postcode, rep.latitude, rep.longitude
		FROM top t
		CROSS JOIN LATERAL (
			SELECT count(*) AS n
			FROM (
				SELECT 1 FROM addresses a
				WHERE a.country = ${countryUpper}
					AND a.locality = t.locality
					AND a.state = t.state
				LIMIT ${SIZE_PROBE_CAP}
			) capped
		) sz
		CROSS JOIN LATERAL (
			SELECT id, postcode, latitude, longitude
			FROM addresses a
			WHERE a.country = ${countryUpper}
				AND a.locality = t.locality
				AND a.state = t.state
			LIMIT 1
		) rep
		ORDER BY t.score DESC, sz.n DESC, t.locality
		LIMIT ${limit}
	`);

	return (result.rows as unknown as RawFuzzyRow[]).map((row) => ({
		id: row.id,
		locality: row.locality,
		state: row.state,
		postcode: row.postcode ?? "",
		latitude: row.latitude,
		longitude: row.longitude,
		score: Number(row.score),
	}));
}
