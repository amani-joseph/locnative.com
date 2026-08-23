import {
	type Cache,
	EtagMismatch,
	type Header,
	PMTiles,
	type RangeResponse,
	type Source,
} from "pmtiles";

/**
 * Two archives, routed by zoom. The detail archive is an Australia-bbox extract
 * (~GB at z15); the world archive is a global low-zoom extract, which is only
 * tens of MB because low zooms hold so few tiles. Serving the world at low zoom
 * is what makes a zoomed-out map look like a map instead of one painted patch.
 */
const DETAIL_PMTILES_KEY = "australia.pmtiles";
const WORLD_PMTILES_KEY = "world-z0-z6.pmtiles";
/** Highest zoom served from the global archive; above this, detail is AU-only. */
const WORLD_MAX_ZOOM = 6;
const TILE_PREFIX = "/tiles/v1";
const TILE_CACHE_CONTROL = "public, max-age=86400, immutable";
/**
 * Metadata (TileJSON/style) is derived from the archive header, so it must not
 * be pinned as long or as hard as tile bodies — a coverage change should be
 * picked up within the hour rather than a day.
 */
const META_CACHE_CONTROL = "public, max-age=3600";

const ATTRIBUTION =
	'<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>';

/**
 * Coverage is a low-zoom global basemap plus Australian detail at street zoom.
 * Stated here (and echoed in TileJSON `description`) so integrators can see the
 * footprint without reverse-engineering it from 204s.
 */
const COVERAGE_DESCRIPTION =
	"Locnative basemap. Global coverage at low zoom; Australian street-level detail at high zoom.";

/**
 * A zero-length body is a valid MVT: a protobuf message with no layer fields
 * decodes as a tile containing no features. Returning this with a 200 (rather
 * than a bare 204) keeps "no features here" distinguishable from "no response",
 * which is what lets MapLibre and intermediate caches behave predictably.
 */
const EMPTY_TILE = new Uint8Array(0);

/**
 * Short TTL for tiles served empty only because an archive is not uploaded yet.
 * The long `immutable` TTL would pin those tiles blank in edge and browser
 * caches for a day after the archive lands.
 */
const MISSING_ARCHIVE_CACHE_CONTROL = "public, max-age=60";

function isArchiveMissing(err: unknown): boolean {
	return err instanceof Error && err.message.includes("not found in R2");
}

const MAX_R2_ATTEMPTS = 3;
const R2_RETRY_BASE_MS = 50;

/**
 * Retry a transient R2 failure. A `remote: true` bucket (MAP_TILES) can throw on
 * the first reads after a `wrangler dev` cold start — the remote binding connects
 * asynchronously, so requests served before it's ready blow up with a generic 500.
 * A short backoff lets local dev self-heal without a manual reload. In production
 * the binding is local and ready immediately, so this is effectively a no-op there.
 */
async function withR2Retry<T>(op: () => Promise<T>): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_R2_ATTEMPTS; attempt++) {
		try {
			return await op();
		} catch (error) {
			lastError = error;
			if (attempt < MAX_R2_ATTEMPTS) {
				await new Promise((resolve) => {
					setTimeout(resolve, R2_RETRY_BASE_MS * attempt);
				});
			}
		}
	}
	throw lastError;
}

/** R2-backed pmtiles source: satisfies range reads via R2 `range` GET. */
class R2Source implements Source {
	private readonly bucket: R2Bucket;
	private readonly key: string;

	constructor(bucket: R2Bucket, key: string) {
		this.bucket = bucket;
		this.key = key;
	}

	getKey() {
		return this.key;
	}

	async getBytes(offset: number, length: number): Promise<RangeResponse> {
		const obj = await withR2Retry(() =>
			this.bucket.get(this.key, {
				range: { offset, length },
			})
		);
		if (!obj) {
			throw new Error(`pmtiles archive not found in R2: ${this.key}`);
		}
		const data = await obj.arrayBuffer();
		const etag = obj.etag;
		return { data, etag, cacheControl: TILE_CACHE_CONTROL };
	}
}

// Matches /tiles/v1/{z}/{x}/{y}.mvt
const TILE_RE = /^\/tiles\/v1\/(\d+)\/(\d+)\/(\d+)\.mvt$/;
// Matches /tiles/v1/fonts/{fontstack}/{range}.pbf
const FONT_RE = /^\/tiles\/v1\/fonts\/(.+)\/(\d+-\d+)\.pbf$/;
// Matches /tiles/v1/sprite/dark.{json,png}
const SPRITE_RE = /^\/tiles\/v1\/sprite\/(dark\.(?:json|png))$/;
const TILEJSON_PATH = "/tiles/v1/tiles.json";
const STYLE_PATH = "/tiles/v1/style.json";

/**
 * One archive instance per isolate. `PMTiles` caches the header and directory
 * entries internally, so constructing it per request forced a fresh R2 range
 * read of the directory on every single tile. Hoisting it keeps those lookups
 * warm for the life of the isolate.
 */
const archiveInstances = new Map<string, PMTiles>();
let archiveBucket: R2Bucket | null = null;

function getArchive(bucket: R2Bucket, key: string): PMTiles {
	if (archiveBucket !== bucket) {
		archiveInstances.clear();
		archiveBucket = bucket;
	}
	let archive = archiveInstances.get(key);
	if (!archive) {
		archive = new PMTiles(
			new R2Source(bucket, key),
			undefined as unknown as Cache
		);
		archiveInstances.set(key, archive);
	}
	return archive;
}

/** Reset memoised archive state. Test-only seam. */
export function resetArchiveCache(): void {
	archiveInstances.clear();
	archiveBucket = null;
}

/**
 * Below the world archive's ceiling we serve global data; above it, only the
 * Australian extract has detail to offer.
 */
function archiveKeyForZoom(z: number): string {
	return z <= WORLD_MAX_ZOOM ? WORLD_PMTILES_KEY : DETAIL_PMTILES_KEY;
}

/**
 * TileJSON 3.0.0 built from the *live* archive header rather than hardcoded
 * constants, so `bounds`/`minzoom`/`maxzoom` can never drift from whichever
 * archive is actually deployed. Advertising bounds is what stops MapLibre from
 * requesting tiles outside coverage at all.
 */
function buildTileJson(world: Header | null, detail: Header, origin: string) {
	// Advertise the union of both archives. With a world archive present the
	// footprint is global, so `bounds` must not be the AU bbox — clamping to
	// Australia would make MapLibre skip the very low-zoom tiles we now serve.
	const bounds = world
		? [-180, -85.051_129, 180, 85.051_129]
		: [detail.minLon, detail.minLat, detail.maxLon, detail.maxLat];
	const minzoom = world ? world.minZoom : detail.minZoom;
	return {
		tilejson: "3.0.0",
		name: "Locnative Basemap",
		description: COVERAGE_DESCRIPTION,
		scheme: "xyz",
		tiles: [`${origin}${TILE_PREFIX}/{z}/{x}/{y}.mvt`],
		minzoom,
		maxzoom: detail.maxZoom,
		bounds,
		center: [detail.centerLon, detail.centerLat, detail.centerZoom],
		attribution: ATTRIBUTION,
		// Non-standard but harmless TileJSON field: points integrators at the
		// coverage footprint from the endpoint itself, which is what would have
		// short-circuited the original investigation.
		documentation: "https://locnative.com/docs/tiles",
	};
}

/**
 * A minimal MapLibre style so third parties get a working basemap without
 * hand-authoring one. The vector source is referenced by TileJSON `url` so it
 * inherits bounds and zoom range automatically.
 */
function buildStyleJson(origin: string) {
	return {
		version: 8,
		name: "Locnative Dark",
		glyphs: `${origin}${TILE_PREFIX}/fonts/{fontstack}/{range}.pbf`,
		sprite: `${origin}${TILE_PREFIX}/sprite/dark`,
		sources: {
			protomaps: {
				type: "vector",
				url: `${origin}${TILEJSON_PATH}`,
				attribution: ATTRIBUTION,
			},
		},
		layers: [
			{
				id: "background",
				type: "background",
				paint: { "background-color": "#1a1a1a" },
			},
		],
	};
}

/**
 * Force https for non-local origins. `url.origin` reflects the inbound request
 * scheme, which is http when TLS is terminated upstream — and http tile URLs
 * inside TileJSON get mixed-content-blocked by browsers on an https page,
 * which would blank the map all over again. Localhost is left alone so
 * `wrangler dev` keeps working.
 */
function toPublicOrigin(origin: string): string {
	if (
		/^https:\/\//.test(origin) ||
		/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin)
	) {
		return origin;
	}
	return origin.replace(/^http:\/\//, "https://");
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": META_CACHE_CONTROL,
			"access-control-allow-origin": "*",
		},
	});
}

async function r2Passthrough(
	bucket: R2Bucket,
	key: string,
	contentType: string
): Promise<Response> {
	const obj = await withR2Retry(() => bucket.get(key));
	if (!obj) {
		return new Response("Not found", { status: 404 });
	}
	const body = await obj.arrayBuffer();
	return new Response(body, {
		headers: {
			"content-type": contentType,
			"cache-control": TILE_CACHE_CONTROL,
			"access-control-allow-origin": "*",
		},
	});
}

/**
 * Handle a /tiles/v1/* request against the MAP_TILES R2 bucket.
 * Returns null if the path is not a tiles path (caller continues routing).
 */
export async function handleTileRequest(
	pathname: string,
	bucket: R2Bucket,
	origin: string
): Promise<Response | null> {
	if (!pathname.startsWith(TILE_PREFIX)) {
		return null;
	}

	const publicOrigin = toPublicOrigin(origin);

	if (pathname === STYLE_PATH) {
		return jsonResponse(buildStyleJson(publicOrigin));
	}

	if (pathname === TILEJSON_PATH) {
		const detail = await getArchive(bucket, DETAIL_PMTILES_KEY).getHeader();
		// The world archive is optional: until it is uploaded the service still
		// works, and TileJSON correctly falls back to advertising AU-only bounds
		// rather than promising global coverage we cannot serve.
		const world = await getArchive(bucket, WORLD_PMTILES_KEY)
			.getHeader()
			.catch(() => null);
		return jsonResponse(buildTileJson(world, detail, publicOrigin));
	}

	const font = pathname.match(FONT_RE);
	if (font) {
		// MapLibre URL-encodes the fontstack (e.g. "Noto%20Sans%20Regular"); the
		// R2 keys use the literal (space-containing) names, so decode to match.
		const fontstack = decodeURIComponent(font[1] as string);
		return r2Passthrough(
			bucket,
			`fonts/${fontstack}/${font[2]}.pbf`,
			"application/x-protobuf"
		);
	}

	const sprite = pathname.match(SPRITE_RE);
	if (sprite) {
		// sprite[1] is guaranteed by the regex capture group
		const filename = sprite[1] as string;
		const isJson = filename.endsWith(".json");
		return r2Passthrough(
			bucket,
			`sprite/${filename}`,
			isJson ? "application/json" : "image/png"
		);
	}

	const tile = pathname.match(TILE_RE);
	if (!tile) {
		return new Response("Not found", { status: 404 });
	}

	const z = Number(tile[1]);
	const x = Number(tile[2]);
	const y = Number(tile[3]);
	const archiveKey = archiveKeyForZoom(z);
	const archive = getArchive(bucket, archiveKey);
	try {
		const result = await archive.getZxy(z, x, y);
		// A miss means "no features here", which is a normal answer for a tile
		// outside the data footprint. Answer it with an empty-but-valid MVT and
		// a 200: a 204 is indistinguishable to MapLibre from an intentionally
		// empty tile, so it silently paints nothing and never falls back.
		const body = result ? result.data : EMPTY_TILE;
		return new Response(body, {
			headers: {
				"content-type": "application/x-protobuf",
				"cache-control": TILE_CACHE_CONTROL,
				"access-control-allow-origin": "*",
			},
		});
	} catch (err) {
		if (err instanceof EtagMismatch) {
			// Archive changed mid-read; client will retry.
			return new Response(null, { status: 503 });
		}
		// The world archive is optional and is uploaded separately from this
		// code. If it is absent, degrade to an empty tile rather than a 500:
		// the map looks exactly as it did before low-zoom coverage landed,
		// instead of the deploy breaking every low-zoom request.
		if (archiveKey === WORLD_PMTILES_KEY && isArchiveMissing(err)) {
			return new Response(EMPTY_TILE, {
				headers: {
					"content-type": "application/x-protobuf",
					"cache-control": MISSING_ARCHIVE_CACHE_CONTROL,
					"access-control-allow-origin": "*",
				},
			});
		}
		throw err;
	}
}
