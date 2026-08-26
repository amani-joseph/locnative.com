import {
	type Cache,
	EtagMismatch,
	type Header,
	PMTiles,
	type RangeResponse,
	type Source,
} from "pmtiles";
import { layers, namedTheme } from "protomaps-themes-base";

/**
 * Two archives, routed by zoom. The detail archive is an Australia-bbox extract
 * (~GB at z15); the world archive is a global low-zoom extract, which is only
 * tens of MB because low zooms hold so few tiles. Serving the world at low zoom
 * is what makes a zoomed-out map look like a map instead of one painted patch.
 */
const DETAIL_PMTILES_KEY = "australia.pmtiles";
const MID_ZOOM_PMTILES_KEY = "australia-z7-z9.pmtiles";
const DETAIL_HIGH_PMTILES_KEY = "australia-z10-z15.pmtiles";
const WORLD_PMTILES_KEY = "world-z0-z6.pmtiles";
/** Highest zoom served from the global archive; above this, detail is AU-only. */
const WORLD_MAX_ZOOM = 6;
const MID_ZOOM_MAX = 9;
export const CURRENT_TILE_API_VERSION = "v2";
export const SUPPORTED_TILE_API_VERSIONS = [
	CURRENT_TILE_API_VERSION,
	"v1",
] as const;
const TILE_BASE_PREFIX = "/tiles";
const CURRENT_TILE_PREFIX = `${TILE_BASE_PREFIX}/${CURRENT_TILE_API_VERSION}`;
const TILE_BROWSER_CACHE_CONTROL =
	"public, max-age=86400, stale-while-revalidate=604800, immutable";
const TILE_EDGE_CACHE_CONTROL =
	"public, max-age=31536000, stale-while-revalidate=604800, immutable";
/**
 * Metadata (TileJSON/style) is derived from the archive header, so it must not
 * be pinned as long or as hard as tile bodies — a coverage change should be
 * picked up within the hour rather than a day.
 */
const META_BROWSER_CACHE_CONTROL =
	"public, max-age=3600, stale-while-revalidate=86400";
const META_EDGE_CACHE_CONTROL =
	"public, max-age=86400, stale-while-revalidate=604800";

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
const MISSING_ARCHIVE_BROWSER_CACHE_CONTROL =
	"public, max-age=60, stale-while-revalidate=300";
const MISSING_ARCHIVE_EDGE_CACHE_CONTROL =
	"public, max-age=300, stale-while-revalidate=600";

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
		return { data, etag, cacheControl: TILE_BROWSER_CACHE_CONTROL };
	}
}

// Matches /tiles/{version}/...
const TILE_PATH_RE = /^\/tiles\/(v\d+)\/(.*)$/;
// Matches {z}/{x}/{y}.mvt
const TILE_RE = /^(\d+)\/(\d+)\/(\d+)\.mvt$/;
// Matches fonts/{fontstack}/{range}.pbf
const FONT_RE = /^fonts\/(.+)\/(\d+-\d+)\.pbf$/;
// Matches sprite/dark.{json,png} and retina /dark@2x.{json,png}
const SPRITE_RE = /^sprite\/(dark(?:@2x)?\.(?:json|png))$/;
const TILEJSON_SUFFIX = "tiles.json";
const STYLE_SUFFIX = "style.json";
const JSON_ENCODER = new TextEncoder();
const PROTOMAPS_SOURCE_NAME = "protomaps";

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
function archiveKeysForZoom(z: number): string[] {
	if (z <= WORLD_MAX_ZOOM) {
		return [WORLD_PMTILES_KEY];
	}
	if (z <= MID_ZOOM_MAX) {
		return [MID_ZOOM_PMTILES_KEY, DETAIL_PMTILES_KEY];
	}
	return [DETAIL_HIGH_PMTILES_KEY, DETAIL_PMTILES_KEY];
}

async function getArchiveHeaderWithFallback(
	bucket: R2Bucket,
	keys: string[]
): Promise<{ header: Header; key: string }> {
	let lastError: unknown;
	for (const key of keys) {
		try {
			const header = await getArchive(bucket, key).getHeader();
			return { header, key };
		} catch (error) {
			lastError = error;
			if (!isArchiveMissing(error)) {
				throw error;
			}
		}
	}
	throw lastError ?? new Error("no archive keys configured");
}

function isSupportedTileVersion(version: string): boolean {
	return (SUPPORTED_TILE_API_VERSIONS as readonly string[]).includes(version);
}

function buildVersionedTilePath(suffix: string): string {
	return `${CURRENT_TILE_PREFIX}/${suffix}`;
}

function parseTilePath(
	pathname: string
): { version: string; suffix: string } | null {
	const match = pathname.match(TILE_PATH_RE);
	if (!match) {
		return null;
	}
	const version = match[1] as string;
	if (!isSupportedTileVersion(version)) {
		return null;
	}
	return { version, suffix: match[2] as string };
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
		tiles: [`${origin}${CURRENT_TILE_PREFIX}/{z}/{x}/{y}.mvt`],
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

function quoteEtag(value: string): string {
	return `"${value.replaceAll('"', "")}"`;
}

function createCoordinateEtag(
	archiveHeader: Header,
	archiveKey: string,
	z: number,
	x: number,
	y: number
): string {
	return quoteEtag(`${archiveHeader.etag ?? archiveKey}:${z}:${x}:${y}`);
}

function createMetadataEtag(parts: string[]): string {
	return quoteEtag(parts.join("|"));
}

function matchesIfNoneMatch(ifNoneMatch: string | null, etag: string): boolean {
	if (!ifNoneMatch) {
		return false;
	}
	if (ifNoneMatch.trim() === "*") {
		return true;
	}
	const normalizedEtag = etag.replace(/^W\//, "");
	for (const candidate of ifNoneMatch.split(",")) {
		const normalizedCandidate = candidate.trim().replace(/^W\//, "");
		if (normalizedCandidate === normalizedEtag) {
			return true;
		}
	}
	return false;
}

function withSharedHeaders(
	headers: HeadersInit,
	contentLength: number,
	etag?: string,
	edgeCacheControl?: string
): Headers {
	const nextHeaders = new Headers(headers);
	nextHeaders.set("content-length", String(contentLength));
	if (etag) {
		nextHeaders.set("etag", etag);
	}
	if (edgeCacheControl) {
		nextHeaders.set("cdn-cache-control", edgeCacheControl);
	}
	return nextHeaders;
}

function notModifiedResponse(
	etag: string,
	cacheControl: string,
	edgeCacheControl: string,
	contentType?: string
): Response {
	const headers = withSharedHeaders(
		{
			"cache-control": cacheControl,
			"access-control-allow-origin": "*",
			...(contentType ? { "content-type": contentType } : {}),
		},
		0,
		etag,
		edgeCacheControl
	);
	return new Response(null, { status: 304, headers });
}

function maybeNotModified(
	ifNoneMatch: string | null,
	etag: string,
	cacheControl: string,
	edgeCacheControl: string,
	contentType?: string
): Response | null {
	if (!matchesIfNoneMatch(ifNoneMatch, etag)) {
		return null;
	}
	return notModifiedResponse(etag, cacheControl, edgeCacheControl, contentType);
}

/**
 * A real MapLibre reference style so integrators can point at one URL and get
 * a working basemap, labels included, without reverse-engineering the schema.
 */
function buildStyleJson(origin: string) {
	return {
		version: 8,
		name: "Locnative Dark",
		glyphs: `${origin}${CURRENT_TILE_PREFIX}/fonts/{fontstack}/{range}.pbf`,
		sprite: `${origin}${CURRENT_TILE_PREFIX}/sprite/dark`,
		sources: {
			[PROTOMAPS_SOURCE_NAME]: {
				type: "vector",
				url: `${origin}${buildVersionedTilePath(TILEJSON_SUFFIX)}`,
				attribution: ATTRIBUTION,
			},
		},
		layers: layers(PROTOMAPS_SOURCE_NAME, namedTheme("dark"), { lang: "en" }),
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

function jsonResponse(body: unknown, etag?: string): Response {
	const json = JSON.stringify(body);
	const bytes = JSON_ENCODER.encode(json);
	return new Response(bytes, {
		headers: withSharedHeaders(
			{
				"content-type": "application/json; charset=utf-8",
				"cache-control": META_BROWSER_CACHE_CONTROL,
				"access-control-allow-origin": "*",
			},
			bytes.byteLength,
			etag,
			META_EDGE_CACHE_CONTROL
		),
	});
}

async function r2Passthrough(
	bucket: R2Bucket,
	key: string,
	contentType: string,
	ifNoneMatch?: string | null,
	fallbackKey?: string
): Promise<Response> {
	let effectiveKey = key;
	let obj = await withR2Retry(() => bucket.get(key));
	if (!obj && fallbackKey) {
		effectiveKey = fallbackKey;
		obj = await withR2Retry(() => bucket.get(fallbackKey));
	}
	if (!obj) {
		return new Response("Not found", { status: 404 });
	}
	const etag = quoteEtag(obj.etag ?? effectiveKey);
	const notModified = maybeNotModified(
		ifNoneMatch ?? null,
		etag,
		TILE_BROWSER_CACHE_CONTROL,
		TILE_EDGE_CACHE_CONTROL,
		contentType
	);
	if (notModified) {
		return notModified;
	}
	const body = await obj.arrayBuffer();
	return new Response(body, {
		headers: withSharedHeaders(
			{
				"content-type": contentType,
				"cache-control": TILE_BROWSER_CACHE_CONTROL,
				"access-control-allow-origin": "*",
			},
			body.byteLength,
			etag,
			TILE_EDGE_CACHE_CONTROL
		),
	});
}

/**
 * Handle a /tiles/{version}/* request against the MAP_TILES R2 bucket.
 * Returns null if the path is not a tiles path (caller continues routing).
 */
export async function handleTileRequest(
	pathname: string,
	bucket: R2Bucket,
	origin: string,
	requestHeaders: Headers = new Headers()
): Promise<Response | null> {
	const parsedPath = parseTilePath(pathname);
	if (!parsedPath) {
		return null;
	}

	const publicOrigin = toPublicOrigin(origin);
	const ifNoneMatch = requestHeaders.get("if-none-match");
	const suffix = parsedPath.suffix;

	if (suffix === STYLE_SUFFIX) {
		const { header: detail } = await getArchiveHeaderWithFallback(bucket, [
			DETAIL_HIGH_PMTILES_KEY,
			DETAIL_PMTILES_KEY,
		]);
		const world = await getArchive(bucket, WORLD_PMTILES_KEY)
			.getHeader()
			.catch(() => null);
		const etag = createMetadataEtag([
			"style",
			detail.etag ?? DETAIL_PMTILES_KEY,
			world?.etag ?? "no-world",
		]);
		const notModified = maybeNotModified(
			ifNoneMatch,
			etag,
			META_BROWSER_CACHE_CONTROL,
			META_EDGE_CACHE_CONTROL
		);
		if (notModified) {
			return notModified;
		}
		return jsonResponse(buildStyleJson(publicOrigin), etag);
	}

	if (suffix === TILEJSON_SUFFIX) {
		const { header: detail } = await getArchiveHeaderWithFallback(bucket, [
			DETAIL_HIGH_PMTILES_KEY,
			DETAIL_PMTILES_KEY,
		]);
		// The world archive is optional: until it is uploaded the service still
		// works, and TileJSON correctly falls back to advertising AU-only bounds
		// rather than promising global coverage we cannot serve.
		const world = await getArchive(bucket, WORLD_PMTILES_KEY)
			.getHeader()
			.catch(() => null);
		const etag = createMetadataEtag([
			"tilejson",
			detail.etag ?? DETAIL_PMTILES_KEY,
			world?.etag ?? "no-world",
		]);
		const notModified = maybeNotModified(
			ifNoneMatch,
			etag,
			META_BROWSER_CACHE_CONTROL,
			META_EDGE_CACHE_CONTROL
		);
		if (notModified) {
			return notModified;
		}
		return jsonResponse(buildTileJson(world, detail, publicOrigin), etag);
	}

	const font = suffix.match(FONT_RE);
	if (font) {
		// MapLibre URL-encodes the fontstack (e.g. "Noto%20Sans%20Regular"); the
		// R2 keys use the literal (space-containing) names, so decode to match.
		const fontstack = decodeURIComponent(font[1] as string);
		return r2Passthrough(
			bucket,
			`fonts/${fontstack}/${font[2]}.pbf`,
			"application/x-protobuf",
			ifNoneMatch
		);
	}

	const sprite = suffix.match(SPRITE_RE);
	if (sprite) {
		// sprite[1] is guaranteed by the regex capture group
		const filename = sprite[1] as string;
		const isJson = filename.endsWith(".json");
		const baseFilename = filename.replace("@2x", "");
		return r2Passthrough(
			bucket,
			`sprite/${filename}`,
			isJson ? "application/json" : "image/png",
			ifNoneMatch,
			`sprite/${baseFilename}`
		);
	}

	const tile = suffix.match(TILE_RE);
	if (!tile) {
		return new Response("Not found", { status: 404 });
	}

	const z = Number(tile[1]);
	const x = Number(tile[2]);
	const y = Number(tile[3]);
	const archiveKeys = archiveKeysForZoom(z);
	let lastError: unknown;
	for (const archiveKey of archiveKeys) {
		const archive = getArchive(bucket, archiveKey);
		try {
			const archiveHeader = await archive.getHeader();
			const etag = createCoordinateEtag(archiveHeader, archiveKey, z, x, y);
			const notModified = maybeNotModified(
				ifNoneMatch,
				etag,
				TILE_BROWSER_CACHE_CONTROL,
				TILE_EDGE_CACHE_CONTROL,
				"application/x-protobuf"
			);
			if (notModified) {
				return notModified;
			}
			const result = await archive.getZxy(z, x, y);
			// A miss means "no features here", which is a normal answer for a tile
			// outside the data footprint. Answer it with an empty-but-valid MVT and
			// a 200: a 204 is indistinguishable to MapLibre from an intentionally
			// empty tile, so it silently paints nothing and never falls back.
			const body = result ? result.data : EMPTY_TILE;
			return new Response(body, {
				headers: withSharedHeaders(
					{
						"content-type": "application/x-protobuf",
						"cache-control": TILE_BROWSER_CACHE_CONTROL,
						"access-control-allow-origin": "*",
					},
					body.byteLength,
					etag,
					TILE_EDGE_CACHE_CONTROL
				),
			});
		} catch (err) {
			lastError = err;
			if (err instanceof EtagMismatch) {
				// Archive changed mid-read; client will retry.
				return new Response(null, { status: 503 });
			}
			if (isArchiveMissing(err)) {
				continue;
			}
			throw err;
		}
	}

	if (archiveKeys.includes(WORLD_PMTILES_KEY) && isArchiveMissing(lastError)) {
		return new Response(EMPTY_TILE, {
			headers: withSharedHeaders(
				{
					"content-type": "application/x-protobuf",
					"cache-control": MISSING_ARCHIVE_BROWSER_CACHE_CONTROL,
					"access-control-allow-origin": "*",
				},
				EMPTY_TILE.byteLength,
				undefined,
				MISSING_ARCHIVE_EDGE_CACHE_CONTROL
			),
		});
	}
	throw lastError;
}
