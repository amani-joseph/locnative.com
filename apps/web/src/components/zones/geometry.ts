import type { GeoJsonPolygon } from "@locnative/api/routers/public/zones-schema";

export interface DrawFeature {
	geometry: {
		type: string;
		coordinates: unknown;
	};
	properties: Record<string, unknown>;
	type: "Feature";
}

/** Ensure a linear ring is closed (first coord repeated at the end). */
export function closeRing(ring: [number, number][]): [number, number][] {
	if (ring.length === 0) {
		return ring;
	}
	const first = ring[0];
	const last = ring.at(-1);
	if (first[0] === last[0] && first[1] === last[1]) {
		return ring;
	}
	return [...ring, first];
}

/** Convert a terra-draw Polygon Feature into our API's GeoJsonPolygon. */
export function featureToPolygon(feature: DrawFeature): GeoJsonPolygon | null {
	if (feature.geometry.type !== "Polygon") {
		return null;
	}
	const rings = feature.geometry.coordinates as [number, number][][];
	return {
		type: "Polygon",
		coordinates: rings.map(closeRing),
	};
}

/**
 * Ray-casting test for a point inside a single linear ring. `point` and the
 * ring coordinates are GeoJSON positions in [lng, lat] order.
 */
function pointInRing(
	point: [number, number],
	ring: [number, number][]
): boolean {
	const [lng, lat] = point;
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		const intersects =
			yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersects) {
			inside = !inside;
		}
	}
	return inside;
}

/**
 * Point-in-polygon test used to preview containment against an unsaved drawn
 * zone before it is persisted. `point` is a GeoJSON position in [lng, lat]
 * order. The first ring is the outer boundary; any further rings are holes.
 * Boundary behaviour is approximate (ray casting) and is only a client-side
 * preview — the authoritative check is PostGIS `ST_Covers` on the server.
 */
export function pointInPolygon(
	point: [number, number],
	polygon: GeoJsonPolygon
): boolean {
	const rings = polygon.coordinates;
	if (rings.length === 0 || !pointInRing(point, rings[0])) {
		return false;
	}
	for (let h = 1; h < rings.length; h++) {
		if (pointInRing(point, rings[h])) {
			return false; // inside a hole → not contained
		}
	}
	return true;
}

/** Build a terra-draw-compatible Feature from a stored polygon (for editing). */
export function polygonToFeature(
	polygon: GeoJsonPolygon,
	id?: string
): DrawFeature & { id?: string } {
	return {
		...(id ? { id } : {}),
		type: "Feature",
		properties: { mode: "polygon" },
		geometry: { type: "Polygon", coordinates: polygon.coordinates },
	};
}
