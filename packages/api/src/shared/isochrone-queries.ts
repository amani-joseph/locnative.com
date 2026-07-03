import type { Database } from "@locnative/database";
import { regions } from "@locnative/database/schema";
import { and, inArray, sql } from "drizzle-orm";
import {
	groupRegionsByLayer,
	type RegionLayer,
	type RegionRow,
} from "./region-queries.ts";
import type { LatLng } from "./routing-queries.ts";

// Sampling density (D4): ISO_BEARINGS bearings × ISO_RADIUS_STEPS concentric
// radii around the origin. Total samples (+ the origin) must stay under the
// OSRM /table coordinate cap — 12 × 6 = 72 samples + origin = 73 ≤ 100.
const ISO_BEARINGS = 12;
const ISO_RADIUS_STEPS = 6;

/** Number of destination points `generateSamplePoints` produces. */
export const ISO_SAMPLE_COUNT = ISO_BEARINGS * ISO_RADIUS_STEPS;

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;
const FULL_TURN = 2 * Math.PI;

export interface SampleOptions {
	/** Outer sampling radius in metres (scale to the travel budget upstream). */
	maxRadiusMeters: number;
}

/**
 * Deterministic ring/grid of destination points around the origin:
 * `ISO_BEARINGS` bearings × `ISO_RADIUS_STEPS` radii (innermost = one step,
 * outermost = `maxRadiusMeters`). Pure — no I/O. Uses an equirectangular
 * metres→degrees approximation, adequate at AU latitudes.
 */
export function generateSamplePoints(
	origin: LatLng,
	opts: SampleOptions
): LatLng[] {
	const points: LatLng[] = [];
	const latRad = origin.lat * DEG;
	const cosLat = Math.cos(latRad);

	for (let step = 1; step <= ISO_RADIUS_STEPS; step++) {
		const radius = (opts.maxRadiusMeters * step) / ISO_RADIUS_STEPS;
		for (let b = 0; b < ISO_BEARINGS; b++) {
			const bearing = (FULL_TURN * b) / ISO_BEARINGS;
			const dNorth = radius * Math.cos(bearing);
			const dEast = radius * Math.sin(bearing);
			const dLat = dNorth / EARTH_RADIUS_M / DEG;
			const dLng = dEast / (EARTH_RADIUS_M * cosLat) / DEG;
			points.push({ lat: origin.lat + dLat, lng: origin.lng + dLng });
		}
	}
	return points;
}

export interface GeoJsonPolygon {
	coordinates: [number, number][][];
	type: "Polygon";
}

/** Minimum reachable points needed to form a (non-degenerate) hull polygon. */
const MIN_HULL_POINTS = 3;

/** ConcaveHull concaveness target (lower = tighter; GEOS 3.11+ on Neon, D3). */
const HULL_CONCAVENESS = 0.3;

export class IsochroneError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IsochroneError";
	}
}

/**
 * Keep the coordinates reachable within `budget`. `metric[0]` is the OSRM
 * `/table` first row (origin → each coord), where `coords[0]` is the origin and
 * the rest are samples. `metric` is durations (seconds) or distances (metres)
 * depending on the requested budget. The origin is always included; `null`
 * cells (unreachable) are dropped. Pure — the matrix is passed in.
 */
export function reachablePoints(
	metric: (number | null)[][],
	coords: LatLng[],
	budget: number
): LatLng[] {
	const row = metric[0] ?? [];
	const reachable: LatLng[] = [];
	for (let i = 0; i < coords.length; i++) {
		const value = row[i];
		const within = value !== null && value !== undefined && value <= budget;
		if (i === 0 || within) {
			reachable.push(coords[i] as LatLng);
		}
	}
	return reachable;
}

/**
 * Shrink-wrap the reachable points into a GeoJSON reachability polygon via
 * `ST_ConcaveHull` (GEOS 3.11.1 verified on Neon — D3). Throws `IsochroneError`
 * when too few points remain to form a polygon.
 */
export async function hullPolygon(
	db: Database,
	points: LatLng[]
): Promise<GeoJsonPolygon> {
	if (points.length < MIN_HULL_POINTS) {
		throw new IsochroneError(
			"Too few reachable points to form an isochrone polygon."
		);
	}
	const pointSql = points.map(
		(p) => sql`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)`
	);
	const collected = sql`ST_Collect(ARRAY[${sql.join(pointSql, sql`, `)}])`;
	const result = await db.execute(sql`
		SELECT ST_AsGeoJSON(ST_ConcaveHull(${collected}, ${HULL_CONCAVENESS}))::json AS polygon
	`);
	const polygon = (result.rows[0] as { polygon: GeoJsonPolygon | null })
		?.polygon;
	if (!polygon) {
		throw new IsochroneError("Failed to build the isochrone polygon.");
	}
	return polygon;
}

/**
 * The ABS regions whose geometry intersects the isochrone polygon, grouped by
 * layer. Mirrors `regionsContainingPoint` but with `ST_Intersects` against a
 * GeoJSON polygon.
 */
export async function regionsOverlappingIsochrone(
	db: Database,
	polygon: GeoJsonPolygon,
	layers?: RegionLayer[]
): Promise<Record<string, { code: string; name: string }>> {
	const poly = sql`ST_GeomFromGeoJSON(${JSON.stringify(polygon)})`;
	const intersects = sql`ST_Intersects(${regions.geom}, ${poly})`;
	const query = db
		.select({
			layer: regions.layer,
			code: regions.code,
			name: regions.name,
			state: regions.state,
		})
		.from(regions);
	const rows: RegionRow[] =
		layers && layers.length > 0
			? await query.where(and(inArray(regions.layer, layers), intersects))
			: await query.where(intersects);
	return groupRegionsByLayer(rows);
}
