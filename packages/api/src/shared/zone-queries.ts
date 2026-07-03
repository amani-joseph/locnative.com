import type { Database } from "@locnative/database";
import { addresses, type Zone, zones } from "@locnative/database/schema";
import { and, eq, sql } from "drizzle-orm";
import type { GeoJsonPolygon } from "../routers/public/zones-schema.ts";

export const ZONE_LIMIT = 500;

export async function countZones(
	db: Database,
	projectId: string
): Promise<number> {
	const rows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(zones)
		.where(eq(zones.projectId, projectId));
	return rows[0]?.count ?? 0;
}

export async function isValidPolygon(
	db: Database,
	geometry: GeoJsonPolygon
): Promise<boolean> {
	const geomJson = JSON.stringify(geometry);
	const result = await db.execute(
		sql`SELECT ST_IsValid(ST_GeomFromGeoJSON(${geomJson})) AS valid`
	);
	return Boolean((result.rows[0] as { valid: boolean } | undefined)?.valid);
}

export type ZoneRow = Omit<Zone, "geom">;

export async function insertZone(
	db: Database,
	projectId: string,
	input: {
		name: string;
		description?: string;
		geometry: GeoJsonPolygon;
		metadata?: Record<string, unknown>;
	}
): Promise<ZoneRow> {
	const geomJson = JSON.stringify(input.geometry);
	const [row] = await db
		.insert(zones)
		.values({
			projectId,
			name: input.name,
			// biome-ignore lint/suspicious/noExplicitAny: SQL expression for geometry column
			geom: sql`ST_GeomFromGeoJSON(${geomJson})` as any,
			...(input.description !== undefined && {
				description: input.description,
			}),
			...(input.metadata !== undefined && { metadata: input.metadata }),
		})
		.returning({
			id: zones.id,
			projectId: zones.projectId,
			name: zones.name,
			description: zones.description,
			metadata: zones.metadata,
			createdAt: zones.createdAt,
			updatedAt: zones.updatedAt,
		});
	return row as ZoneRow;
}

export async function listZoneRows(
	db: Database,
	projectId: string,
	limit: number,
	offset: number
): Promise<ZoneRow[]> {
	return await db
		.select({
			id: zones.id,
			projectId: zones.projectId,
			name: zones.name,
			description: zones.description,
			metadata: zones.metadata,
			createdAt: zones.createdAt,
			updatedAt: zones.updatedAt,
		})
		.from(zones)
		.where(eq(zones.projectId, projectId))
		.limit(limit)
		.offset(offset);
}

export async function zonesContainingPoint(
	db: Database,
	projectId: string,
	lat: number,
	lng: number
): Promise<ZoneRow[]> {
	const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
	return await db
		.select({
			id: zones.id,
			projectId: zones.projectId,
			name: zones.name,
			description: zones.description,
			metadata: zones.metadata,
			createdAt: zones.createdAt,
			updatedAt: zones.updatedAt,
		})
		.from(zones)
		.where(
			and(
				eq(zones.projectId, projectId),
				// ST_Covers (not ST_Contains) so points exactly on a zone's boundary
				// or vertex count as inside — ST_Contains excludes the boundary.
				sql`ST_Covers(${zones.geom}, ${point})`
			)
		);
}

export async function deleteZoneRow(
	db: Database,
	projectId: string,
	zoneId: number
): Promise<boolean> {
	const deleted = await db
		.delete(zones)
		.where(and(eq(zones.id, zoneId), eq(zones.projectId, projectId)))
		.returning({ id: zones.id });
	return deleted.length > 0;
}

export const ADDRESSES_IN_ZONE_HARD_CAP = 10_000;

export interface ZoneWithGeometryRow {
	createdAt: string;
	description: string | null;
	geometry: GeoJsonPolygon;
	id: number;
	metadata: Record<string, unknown> | null;
	name: string;
	projectId: string;
	updatedAt: string;
}

/** All zones for a project, geometry included as GeoJSON (for map rendering). */
export async function listZonesWithGeometry(
	db: Database,
	projectId: string
): Promise<ZoneWithGeometryRow[]> {
	const result = await db.execute(sql`
		SELECT id, project_id AS "projectId", name, description, metadata,
		       ST_AsGeoJSON(geom)::json AS geometry,
		       created_at AS "createdAt", updated_at AS "updatedAt"
		FROM zones
		WHERE project_id = ${projectId}
		ORDER BY created_at DESC
	`);
	return result.rows as unknown as ZoneWithGeometryRow[];
}

/** One zone with geometry, scoped to the project. Null if not found. */
export async function getZoneWithGeometry(
	db: Database,
	projectId: string,
	zoneId: number
): Promise<ZoneWithGeometryRow | null> {
	const result = await db.execute(sql`
		SELECT id, project_id AS "projectId", name, description, metadata,
		       ST_AsGeoJSON(geom)::json AS geometry,
		       created_at AS "createdAt", updated_at AS "updatedAt"
		FROM zones
		WHERE id = ${zoneId} AND project_id = ${projectId}
		LIMIT 1
	`);
	return (result.rows[0] as unknown as ZoneWithGeometryRow) ?? null;
}

/** Update mutable fields of a zone. Returns false if the zone isn't owned. */
export async function updateZoneRow(
	db: Database,
	projectId: string,
	zoneId: number,
	patch: {
		name?: string;
		description?: string;
		geometry?: GeoJsonPolygon;
		metadata?: Record<string, unknown>;
	}
): Promise<boolean> {
	if (
		patch.name === undefined &&
		patch.description === undefined &&
		patch.geometry === undefined &&
		patch.metadata === undefined
	) {
		return false;
	}
	const sets: ReturnType<typeof sql>[] = [];
	if (patch.name !== undefined) {
		sets.push(sql`name = ${patch.name}`);
	}
	if (patch.description !== undefined) {
		sets.push(sql`description = ${patch.description}`);
	}
	if (patch.metadata !== undefined) {
		sets.push(sql`metadata = ${JSON.stringify(patch.metadata)}::jsonb`);
	}
	if (patch.geometry !== undefined) {
		sets.push(
			sql`geom = ST_GeomFromGeoJSON(${JSON.stringify(patch.geometry)})`
		);
	}
	sets.push(sql`updated_at = now()`);

	const result = await db.execute(sql`
		UPDATE zones SET ${sql.join(sets, sql`, `)}
		WHERE id = ${zoneId} AND project_id = ${projectId}
		RETURNING id
	`);
	return result.rows.length > 0;
}

export interface ZoneAddressRow {
	buildingName: string | null;
	country: string;
	flatNumber: string | null;
	flatType: string | null;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	numberFirst: string | null;
	numberLast: string | null;
	postcode: string;
	state: string;
	streetName: string;
	streetType: string | null;
}

export interface ZoneAddressesResult {
	count: number;
	results: ZoneAddressRow[];
	truncated: boolean;
}

/**
 * Addresses within a zone (ST_Within), paginated, capped at
 * ADDRESSES_IN_ZONE_HARD_CAP total. Assumes the caller already verified
 * the zone belongs to the project.
 */
export async function addressesInZone(
	db: Database,
	projectId: string,
	zoneId: number,
	page: number,
	limit: number
): Promise<ZoneAddressesResult> {
	const offset = (page - 1) * limit;
	if (offset >= ADDRESSES_IN_ZONE_HARD_CAP) {
		return { results: [], count: 0, truncated: true };
	}
	const effectiveLimit = Math.min(limit, ADDRESSES_IN_ZONE_HARD_CAP - offset);

	const rows = await db
		.select({
			id: addresses.id,
			country: addresses.country,
			state: addresses.state,
			locality: addresses.locality,
			postcode: addresses.postcode,
			streetName: addresses.streetName,
			streetType: addresses.streetType,
			numberFirst: addresses.numberFirst,
			numberLast: addresses.numberLast,
			buildingName: addresses.buildingName,
			flatType: addresses.flatType,
			flatNumber: addresses.flatNumber,
			longitude: addresses.longitude,
			latitude: addresses.latitude,
		})
		.from(addresses)
		.innerJoin(zones, sql`ST_Within(${addresses.geom}, ${zones.geom})`)
		.where(and(eq(zones.id, zoneId), eq(zones.projectId, projectId)))
		.limit(effectiveLimit)
		.offset(offset);

	const truncated = offset + rows.length >= ADDRESSES_IN_ZONE_HARD_CAP;
	return { results: rows as ZoneAddressRow[], count: rows.length, truncated };
}

import {
	type AddressLabelParts,
	composeAddressLabel,
} from "./address-label.ts";

const ADDRESSES_IN_BBOX_HARD_CAP = 5000;

export interface BboxAddressPoint {
	gnafPid: string | null;
	id: number;
	label: string;
	lat: number;
	lng: number;
}

export interface AddressesInBboxResult {
	count: number;
	results: BboxAddressPoint[];
	truncated: boolean;
}

/**
 * G-NAF address points whose geometry falls inside the [west,south,east,north]
 * bbox. Uses the idx_addresses_geom GIST index via the && operator. Capped at
 * ADDRESSES_IN_BBOX_HARD_CAP; ordered by populationScore desc so the most
 * relevant points survive the cap. `limit` is clamped to the hard cap.
 */
export async function addressesInBbox(
	db: Database,
	bbox: [number, number, number, number],
	limit: number
): Promise<AddressesInBboxResult> {
	const [west, south, east, north] = bbox;
	const effectiveLimit = Math.min(limit, ADDRESSES_IN_BBOX_HARD_CAP);
	const envelope = sql`ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`;

	const rows = await db
		.select({
			id: addresses.id,
			gnafPid: addresses.gnafPid,
			flatType: addresses.flatType,
			flatNumber: addresses.flatNumber,
			numberFirst: addresses.numberFirst,
			numberLast: addresses.numberLast,
			streetName: addresses.streetName,
			streetType: addresses.streetType,
			locality: addresses.locality,
			longitude: addresses.longitude,
			latitude: addresses.latitude,
		})
		.from(addresses)
		.where(sql`${addresses.geom} && ${envelope}`)
		.orderBy(sql`${addresses.populationScore} DESC`)
		.limit(effectiveLimit + 1);

	const truncated = rows.length > effectiveLimit;
	const kept = truncated ? rows.slice(0, effectiveLimit) : rows;

	const results: BboxAddressPoint[] = kept.map((r) => ({
		id: r.id,
		gnafPid: r.gnafPid,
		label: composeAddressLabel(r as AddressLabelParts),
		lng: r.longitude,
		lat: r.latitude,
	}));

	return { results, count: results.length, truncated };
}
