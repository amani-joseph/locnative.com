import { type SQL, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { directionalVariants } from "./address-abbreviations.ts";
import {
	type AutocompleteResult,
	mapRowToResult,
	type RawAddressRow,
	SELECT_COLUMNS,
} from "./autocomplete.ts";
import type { ParsedFreeformAddress } from "./parse-freeform-address.ts";

const MAX_ANCHOR_VARIANTS = 4;

/**
 * Build tiered left-anchored `search_text` prefixes (without the trailing %)
 * from a parsed address, most-specific tier first. Reuses
 * idx_addresses_search_text_btree, which orders rows as "<number> <street_name>
 * <street_type> ...". Requires a house number (search_text leads with it) and at
 * least one street token; otherwise returns [] and the caller falls back to fuzzy.
 *
 * - Tier 0: number + full street ("1 ROCKET ROAD") — high relevance.
 * - Tier 1: number + first street token only ("1 ROCKET") — broad fallback when
 *   the type/spelling differs from what was stored (e.g. input "Rd" vs "ROAD").
 *
 * A leading directional expands each tier into abbreviated + expanded forms.
 */
export function buildAnchorPrefixes(parsed: ParsedFreeformAddress): string[][] {
	if (!parsed.houseNumber || parsed.streetTokens.length === 0) {
		return [];
	}
	const heads = parsed.directional
		? directionalVariants(parsed.directional).map(
				(dir) => `${parsed.houseNumber} ${dir}`
			)
		: [`${parsed.houseNumber}`];
	const firstStreet = parsed.streetTokens[0] as string;
	const fullStreet = parsed.streetTokens.join(" ");

	const fullTier = heads
		.map((head) => `${head} ${fullStreet}`)
		.slice(0, MAX_ANCHOR_VARIANTS);
	if (fullStreet === firstStreet) {
		return [fullTier];
	}
	const broadTier = heads
		.map((head) => `${head} ${firstStreet}`)
		.slice(0, MAX_ANCHOR_VARIANTS);
	return [fullTier, broadTier];
}

/**
 * Structured match: OR'd anchored prefix scans (search_text btree), country as a
 * hard filter, postcode/locality/region as ORDER BY boosts. Returns [] when no
 * anchor qualifies so the caller can fall back to fuzzy. See design §4.4.
 */
export async function structuredAutocomplete(
	db: Database,
	parsed: ParsedFreeformAddress,
	opts: { limit: number; country?: string }
): Promise<AutocompleteResult[]> {
	const tiers = buildAnchorPrefixes(parsed);
	if (tiers.length === 0) {
		return [];
	}

	const country = opts.country ?? parsed.countryCode ?? undefined;
	const orderBy = buildRerank(parsed);

	// Try each anchor tier most-specific first; return as soon as a tier matches.
	// Tiers are bounded (<= 2) and each is an indexed btree prefix scan.
	for (const prefixes of tiers) {
		const likeClauses = prefixes.map((p) => sql`search_text LIKE ${`${p}%`}`);
		const anchor = sql.join(likeClauses, sql` OR `);

		const filters: SQL<unknown>[] = [sql`(${anchor})`];
		if (country) {
			filters.push(sql`country = ${country.toUpperCase()}`);
		}
		const whereClause = sql.join(filters, sql` AND `);

		const result = await db.execute(sql`
			SELECT ${SELECT_COLUMNS}, 1.0 as similarity_score
			FROM addresses
			WHERE ${whereClause}
			ORDER BY ${orderBy}
			LIMIT ${opts.limit}
		`);
		const rows = (result.rows as unknown as RawAddressRow[]).map(
			mapRowToResult
		);
		if (rows.length > 0) {
			return rows;
		}
	}
	return [];
}

function buildRerank(parsed: ParsedFreeformAddress): SQL<unknown> {
	const rerank: SQL<unknown>[] = [];
	if (parsed.postcode) {
		rerank.push(sql`(postcode = ${parsed.postcode}) DESC`);
	}
	if (parsed.locality) {
		rerank.push(sql`(locality = ${parsed.locality}) DESC`);
	}
	if (parsed.region) {
		rerank.push(sql`(state = ${parsed.region}) DESC`);
	}
	rerank.push(sql`population_score DESC`);
	return sql.join(rerank, sql`, `);
}
