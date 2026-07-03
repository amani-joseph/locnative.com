/**
 * Tiny geo helpers for the Coverage background map. Pure functions (no DOM) so
 * the projection + arc math is unit-testable. The map is a plain equirectangular
 * (plate carrée) projection drawn into a fixed SVG viewBox.
 */

/** SVG viewBox the coverage map is drawn into. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

export interface LngLat {
	lat: number;
	lng: number;
}

export interface Point {
	x: number;
	y: number;
}

/**
 * Equirectangular projection: lng [-180,180] -> x [0,W], lat [90,-90] -> y [0,H].
 * North is up, so +lat maps to a smaller y.
 */
export function project({ lat, lng }: LngLat): Point {
	const x = ((lng + 180) / 360) * MAP_WIDTH;
	const y = ((90 - lat) / 180) * MAP_HEIGHT;
	return { x, y };
}

/**
 * Quadratic-bezier SVG path between two coordinates, bowed upward to read like a
 * great-circle / flight arc. `curvature` (0..1) scales the lift relative to the
 * span between the points.
 */
export function arcPath(from: LngLat, to: LngLat, curvature = 0.3): string {
	const a = project(from);
	const b = project(to);
	const mx = (a.x + b.x) / 2;
	const my = (a.y + b.y) / 2;
	const dist = Math.hypot(b.x - a.x, b.y - a.y);
	// Lift the control point straight up (toward the pole) for a clean dome.
	const lift = dist * curvature;
	const cx = mx;
	const cy = my - lift;
	return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export type RegionStatus = "live" | "beta";

export interface Region extends LngLat {
	id: string;
	label: string;
	status: RegionStatus;
}

/**
 * Real Locnative coverage anchors. `live` = full G-NAF/US coverage today;
 * `beta` = international rollout. Keeping these truthful matters for an API
 * company — the arcs below only connect points that actually exist here.
 */
export const COVERAGE_REGIONS: Region[] = [
	{ id: "au", label: "Australia", lat: -25.27, lng: 133.78, status: "live" },
	{ id: "us", label: "United States", lat: 39.5, lng: -98.35, status: "live" },
	{ id: "gb", label: "United Kingdom", lat: 54.0, lng: -2.0, status: "beta" },
	{ id: "eu", label: "European Union", lat: 50.1, lng: 9.5, status: "beta" },
	{ id: "sg", label: "Singapore", lat: 1.35, lng: 103.82, status: "beta" },
];

/** Pairs of region ids to draw signal arcs between (must reference live data). */
export const COVERAGE_ARCS: [string, string][] = [
	["us", "gb"],
	["us", "au"],
	["gb", "eu"],
	["au", "sg"],
	["eu", "sg"],
];
