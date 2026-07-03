import type { Database } from "@locnative/database";
import { addresses } from "@locnative/database/schema";
import { eq } from "drizzle-orm";

export interface LatLng {
	lat: number;
	lng: number;
}

export interface GeoJsonLineString {
	coordinates: [number, number][];
	type: "LineString";
}

export interface DirectionsResult {
	distance_m: number;
	duration_s: number;
	geometry: GeoJsonLineString;
}

export type RoutingErrorKind =
	| "no_route"
	| "no_match"
	| "no_trip"
	| "unavailable";

export class RoutingError extends Error {
	readonly kind: RoutingErrorKind;
	constructor(kind: RoutingErrorKind, message: string) {
		super(message);
		this.name = "RoutingError";
		this.kind = kind;
	}
}

const LAT_MAX = 90;
const LNG_MAX = 180;

/** Parse a `"lat,lng"` string. Returns null when malformed or out of range. */
export function parseLatLng(raw: string): LatLng | null {
	const parts = raw.split(",");
	if (parts.length !== 2) {
		return null;
	}
	const lat = Number(parts[0]);
	const lng = Number(parts[1]);
	if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
		return null;
	}
	if (Math.abs(lat) > LAT_MAX || Math.abs(lng) > LNG_MAX) {
		return null;
	}
	return { lat, lng };
}

/** Resolve a G-NAF address id to coordinates. Returns null if not found. */
export async function resolveAddressCoords(
	db: Database,
	id: number
): Promise<LatLng | null> {
	const rows = await db
		.select({ latitude: addresses.latitude, longitude: addresses.longitude })
		.from(addresses)
		.where(eq(addresses.id, id))
		.limit(1);
	const row = rows[0];
	if (!row) {
		return null;
	}
	return { lat: row.latitude, lng: row.longitude };
}

interface OsrmOptions {
	authToken: string;
	baseUrl: string;
	fetchImpl: typeof fetch;
}

/**
 * Public routing profile. The API speaks `driving|walking|cycling`; OSRM speaks
 * `car|foot|bike`. The Caddy front routes on the OSRM `{profile}` path segment,
 * so this mapping is what selects the car/foot/bike graph backend.
 */
export type RoutingProfile = "driving" | "walking" | "cycling";

const OSRM_PROFILE: Record<RoutingProfile, string> = {
	driving: "car",
	walking: "foot",
	cycling: "bike",
};

interface OsrmResponse {
	code: string;
	routes?: {
		distance: number;
		duration: number;
		geometry: GeoJsonLineString;
	}[];
}

/**
 * Shared OSRM call plumbing. Builds `/{service}/v1/{osrmProfile}/{coords}`
 * against `options.baseUrl`, attaches the bearer token, and returns parsed JSON
 * — throwing `RoutingError("unavailable")` on transport failure or a non-200
 * response. `fetchImpl` must already be bound to its global (Workers' native
 * fetch throws "Illegal invocation" otherwise).
 */
async function osrmRequest(
	service: "route" | "table" | "match" | "trip",
	profile: RoutingProfile,
	coords: string,
	query: Record<string, string>,
	options: OsrmOptions
): Promise<unknown> {
	const url = new URL(
		`/${service}/v1/${OSRM_PROFILE[profile]}/${coords}`,
		options.baseUrl
	);
	for (const [key, value] of Object.entries(query)) {
		url.searchParams.set(key, value);
	}

	let response: Response;
	try {
		response = await options.fetchImpl(url, {
			headers: { authorization: `Bearer ${options.authToken}` },
		});
	} catch (error) {
		throw new RoutingError(
			"unavailable",
			`OSRM request failed: ${(error as Error).message}`
		);
	}

	if (!response.ok) {
		throw new RoutingError(
			"unavailable",
			`OSRM returned status ${response.status}`
		);
	}

	return await response.json();
}

/** Call OSRM's route service for the given profile and map the result to our envelope. */
export async function fetchOsrmRoute(
	from: LatLng,
	to: LatLng,
	options: OsrmOptions,
	profile: RoutingProfile = "driving"
): Promise<DirectionsResult> {
	// OSRM coordinate order is lon,lat (not lat,lng).
	const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
	const body = (await osrmRequest(
		"route",
		profile,
		coords,
		{ overview: "full", geometries: "geojson" },
		options
	)) as OsrmResponse;

	const route = body.code === "Ok" ? body.routes?.[0] : undefined;
	if (!route) {
		throw new RoutingError(
			"no_route",
			"No route between the given points for this profile."
		);
	}

	return {
		distance_m: Math.round(route.distance),
		duration_s: Math.round(route.duration),
		geometry: route.geometry,
	};
}

interface OsrmTableResponse {
	code: string;
	distances?: (number | null)[][];
	durations?: (number | null)[][];
}

export interface MatrixResult {
	destinations: LatLng[];
	/** Row-major distances in metres (`sources` × `destinations`); unreachable cells are `null`. */
	distances: (number | null)[][];
	/** Row-major durations in seconds (`sources` × `destinations`); unreachable cells are `null`. */
	durations: (number | null)[][];
	sources: LatLng[];
}

interface TableOptions extends OsrmOptions {
	destinations?: number[];
	profile: RoutingProfile;
	/** Index sub-selections into `coords`; omit ⇒ OSRM `all`. */
	sources?: number[];
}

/**
 * Call OSRM's `/table` service for an N×M duration/distance matrix. `coords` is
 * the combined coordinate list; `sources`/`destinations` are index sub-selections
 * into it (OSRM treats an omitted side as `all`). Unreachable cells come back as
 * `null` — there is no `no_route` for a table, only individual null cells.
 */
export async function fetchOsrmTable(
	coords: LatLng[],
	options: TableOptions
): Promise<MatrixResult> {
	// OSRM coordinate order is lon,lat (not lat,lng).
	const coordString = coords.map((c) => `${c.lng},${c.lat}`).join(";");

	const query: Record<string, string> = { annotations: "duration,distance" };
	if (options.sources) {
		query.sources = options.sources.join(";");
	}
	if (options.destinations) {
		query.destinations = options.destinations.join(";");
	}

	const body = (await osrmRequest(
		"table",
		options.profile,
		coordString,
		query,
		options
	)) as OsrmTableResponse;

	if (body.code !== "Ok" || !(body.durations && body.distances)) {
		throw new RoutingError(
			"unavailable",
			`OSRM table request failed (code ${body.code}).`
		);
	}

	const pick = (idx: number[] | undefined): LatLng[] =>
		idx ? idx.map((i) => coords[i] as LatLng) : coords;

	return {
		durations: body.durations,
		distances: body.distances,
		sources: pick(options.sources),
		destinations: pick(options.destinations),
	};
}

export interface Matching {
	confidence: number;
	distance_m: number;
	duration_s: number;
	geometry: GeoJsonLineString;
}

export interface Tracepoint {
	/** Snapped [lng, lat] location on the road network. */
	location: [number, number];
	/** Index of the matching this point belongs to. */
	matchings_index: number;
	/** Position within the matched leg sequence. */
	waypoint_index: number;
}

export interface MatchResult {
	matchings: Matching[];
	/** One entry per input point; `null` where OSRM dropped the point as an outlier. */
	tracepoints: (Tracepoint | null)[];
}

interface OsrmMatchResponse {
	code: string;
	matchings?: {
		confidence: number;
		distance: number;
		duration: number;
		geometry: GeoJsonLineString;
	}[];
	tracepoints?: (Tracepoint | null)[];
}

interface MatchOptions extends OsrmOptions {
	/** How to treat large gaps between points: `split` (default) or `ignore`. */
	gaps?: "split" | "ignore";
	profile: RoutingProfile;
	/** Per-point GPS accuracy in metres (`;`-joined). */
	radiuses?: number[];
	/** Whether OSRM should clean the trace of too-close points. */
	tidy?: boolean;
	/** UNIX seconds per point (`;`-joined); must be monotonically increasing. */
	timestamps?: number[];
}

/**
 * Snap a noisy GPS `trace` to the road network via OSRM `/match`. Returns the
 * matched leg geometries + per-point tracepoints, **preserving `null`** for
 * points OSRM drops as outliers. `NoMatch` → `RoutingError("no_match")` (→ 422),
 * distinct from service failures (`unavailable` → 500).
 */
export async function fetchOsrmMatch(
	trace: LatLng[],
	options: MatchOptions
): Promise<MatchResult> {
	// OSRM coordinate order is lon,lat (not lat,lng).
	const coordString = trace.map((c) => `${c.lng},${c.lat}`).join(";");

	const query: Record<string, string> = {
		geometries: "geojson",
		overview: "full",
	};
	if (options.timestamps) {
		query.timestamps = options.timestamps.join(";");
	}
	if (options.radiuses) {
		query.radiuses = options.radiuses.join(";");
	}
	if (options.gaps) {
		query.gaps = options.gaps;
	}
	if (options.tidy !== undefined) {
		query.tidy = String(options.tidy);
	}

	const body = (await osrmRequest(
		"match",
		options.profile,
		coordString,
		query,
		options
	)) as OsrmMatchResponse;

	if (body.code === "NoMatch") {
		throw new RoutingError(
			"no_match",
			"No road match for the given GPS trace."
		);
	}
	if (body.code !== "Ok" || !body.matchings) {
		throw new RoutingError(
			"unavailable",
			`OSRM match request failed (code ${body.code}).`
		);
	}

	return {
		matchings: body.matchings.map((m) => ({
			confidence: m.confidence,
			distance_m: Math.round(m.distance),
			duration_s: Math.round(m.duration),
			geometry: m.geometry,
		})),
		tracepoints: body.tracepoints ?? [],
	};
}

export interface Trip {
	distance_m: number;
	duration_s: number;
	geometry: GeoJsonLineString;
}

export interface TripWaypoint {
	/** Snapped [lng, lat] location on the road network. */
	location: [number, number];
	/** Index of the trip this waypoint belongs to. */
	trips_index: number;
	/** Position of this waypoint in the optimised visiting order. */
	waypoint_index: number;
}

export interface TripResult {
	trips: Trip[];
	/** One entry per input waypoint (input order); `waypoint_index` is its tour position. */
	waypoints: TripWaypoint[];
}

interface OsrmTripResponse {
	code: string;
	trips?: {
		distance: number;
		duration: number;
		geometry: GeoJsonLineString;
	}[];
	waypoints?: TripWaypoint[];
}

interface TripOptions extends OsrmOptions {
	/** Fix the end: `any` (default) or `last`. */
	destination?: "any" | "last";
	profile: RoutingProfile;
	/** Return to the start (TSP cycle). Default `true`. */
	roundtrip?: boolean;
	/** Fix the start: `any` (default) or `first`. */
	source?: "any" | "first";
}

/**
 * Solve a near-optimal visiting order over `waypoints` via OSRM `/trip` (TSP).
 * Returns the trip geometry/distance/duration + each waypoint's tour position
 * (`waypoint_index`). OSRM only supports an open trip (`roundtrip=false`) when an
 * end is fixed; unsupported combos (`NotImplemented`) and `NoTrip` map to
 * `RoutingError("no_trip")` (→ 422), distinct from `unavailable` (→ 500).
 */
export async function fetchOsrmTrip(
	waypoints: LatLng[],
	options: TripOptions
): Promise<TripResult> {
	const roundtrip = options.roundtrip ?? true;
	// OSRM rejects an open trip with both ends free; require at least one fixed.
	if (
		!roundtrip &&
		options.source !== "first" &&
		options.destination !== "last"
	) {
		throw new RoutingError(
			"no_trip",
			"An open trip (roundtrip=false) requires source=first and/or destination=last."
		);
	}

	// OSRM coordinate order is lon,lat (not lat,lng).
	const coordString = waypoints.map((c) => `${c.lng},${c.lat}`).join(";");
	const query: Record<string, string> = {
		geometries: "geojson",
		overview: "full",
		roundtrip: String(roundtrip),
	};
	if (options.source) {
		query.source = options.source;
	}
	if (options.destination) {
		query.destination = options.destination;
	}

	const body = (await osrmRequest(
		"trip",
		options.profile,
		coordString,
		query,
		options
	)) as OsrmTripResponse;

	if (body.code === "NoTrip" || body.code === "NotImplemented") {
		throw new RoutingError(
			"no_trip",
			body.code === "NoTrip"
				? "No trip found for the given waypoints."
				: "The requested roundtrip/source/destination combination is not supported."
		);
	}
	if (body.code !== "Ok" || !(body.trips && body.waypoints)) {
		throw new RoutingError(
			"unavailable",
			`OSRM trip request failed (code ${body.code}).`
		);
	}

	return {
		trips: body.trips.map((t) => ({
			distance_m: Math.round(t.distance),
			duration_s: Math.round(t.duration),
			geometry: t.geometry,
		})),
		waypoints: body.waypoints,
	};
}
