import type { Database } from "@locnative/database";
import { regions } from "@locnative/database/schema";
import { and, inArray, sql } from "drizzle-orm";

export const REGION_LAYERS = [
	"state",
	"sa1",
	"sa2",
	"sa3",
	"sa4",
	"lga",
	"poa",
	"ced",
	"sed",
	"mb",
] as const;

export type RegionLayer = (typeof REGION_LAYERS)[number];

export interface RegionRow {
	code: string;
	layer: string;
	name: string;
	state: string | null;
}

const REGION_LAYER_SET = new Set<string>(REGION_LAYERS);

/**
 * Parse the optional `?layers=sa2,lga` csv into a list of valid layer codes.
 * Unknown codes are dropped. Returns undefined when nothing valid remains so
 * the caller queries all layers.
 */
export function parseLayers(
	raw: string | undefined
): RegionLayer[] | undefined {
	if (!raw) {
		return undefined;
	}
	const parsed = raw
		.split(",")
		.map((part) => part.trim().toLowerCase())
		.filter((part): part is RegionLayer => REGION_LAYER_SET.has(part));
	return parsed.length > 0 ? parsed : undefined;
}

/** Collapse region rows into a { layer: { code, name } } object (first wins). */
export function groupRegionsByLayer(
	rows: RegionRow[]
): Record<string, { code: string; name: string }> {
	const out: Record<string, { code: string; name: string }> = {};
	for (const row of rows) {
		if (!out[row.layer]) {
			out[row.layer] = { code: row.code, name: row.name };
		}
	}
	return out;
}

/** Find every region polygon that covers the given point. */
export async function regionsContainingPoint(
	db: Database,
	lat: number,
	lng: number,
	layers?: RegionLayer[]
): Promise<RegionRow[]> {
	const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
	const covers = sql`ST_Covers(${regions.geom}, ${point})`;
	const query = db
		.select({
			layer: regions.layer,
			code: regions.code,
			name: regions.name,
			state: regions.state,
		})
		.from(regions);
	const rows =
		layers && layers.length > 0
			? await query.where(and(inArray(regions.layer, layers), covers))
			: await query.where(covers);
	return rows;
}
