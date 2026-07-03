import type { GeoJsonPolygon } from "@locnative/api/routers/public/zones-schema";
import { describe, expect, it } from "vitest";
import {
	closeRing,
	type DrawFeature,
	featureToPolygon,
	pointInPolygon,
} from "./geometry.ts";

const openRing: [number, number][] = [
	[151.2, -33.8],
	[151.3, -33.8],
	[151.3, -33.9],
	[151.2, -33.9],
];
const closedRing: [number, number][] = [...openRing, [151.2, -33.8]];

describe("closeRing", () => {
	it("appends the first coord when the ring is open", () => {
		expect(closeRing(openRing)).toEqual(closedRing);
	});
	it("leaves an already-closed ring unchanged", () => {
		expect(closeRing(closedRing)).toEqual(closedRing);
	});
});

describe("featureToPolygon", () => {
	it("extracts a closed Polygon from a terra-draw Feature", () => {
		const feature: DrawFeature = {
			type: "Feature",
			properties: {},
			geometry: { type: "Polygon", coordinates: [closedRing] },
		};
		expect(featureToPolygon(feature)).toEqual({
			type: "Polygon",
			coordinates: [closedRing],
		});
	});
	it("closes an open ring coming from the draw tool", () => {
		const feature: DrawFeature = {
			type: "Feature",
			properties: {},
			geometry: { type: "Polygon", coordinates: [openRing] },
		};
		expect(featureToPolygon(feature)).toEqual({
			type: "Polygon",
			coordinates: [closedRing],
		});
	});
	it("returns null for a non-polygon feature", () => {
		const feature = {
			type: "Feature",
			properties: {},
			geometry: { type: "Point", coordinates: [151.2, -33.8] },
		} as unknown as DrawFeature;
		expect(featureToPolygon(feature)).toBeNull();
	});
});

describe("pointInPolygon", () => {
	// Square covering roughly the Sydney CBD area (lng 151.2–151.3, lat -33.9 to -33.8)
	const square: GeoJsonPolygon = {
		type: "Polygon",
		coordinates: [closedRing],
	};

	it("returns true for a point clearly inside the polygon", () => {
		expect(pointInPolygon([151.25, -33.85], square)).toBe(true);
	});

	it("returns false for a point clearly outside the polygon", () => {
		expect(pointInPolygon([151.0, -33.85], square)).toBe(false);
		expect(pointInPolygon([151.25, -34.5], square)).toBe(false);
	});

	it("excludes points inside a hole", () => {
		const withHole: GeoJsonPolygon = {
			type: "Polygon",
			coordinates: [
				closedRing,
				[
					[151.24, -33.84],
					[151.26, -33.84],
					[151.26, -33.86],
					[151.24, -33.86],
					[151.24, -33.84],
				],
			],
		};
		// Inside the outer ring but also inside the hole → not contained.
		expect(pointInPolygon([151.25, -33.85], withHole)).toBe(false);
		// Inside the outer ring, outside the hole → contained.
		expect(pointInPolygon([151.21, -33.81], withHole)).toBe(true);
	});

	it("returns false for an empty polygon", () => {
		expect(
			pointInPolygon([151.25, -33.85], { type: "Polygon", coordinates: [] })
		).toBe(false);
	});
});
