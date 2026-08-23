import { beforeEach, describe, expect, it, vi } from "vitest";

const getZxy = vi.fn();
const getHeader = vi.fn();
/** Archive keys the handler actually opened, in order. */
const openedKeys: string[] = [];

vi.mock("pmtiles", () => ({
	PMTiles: class {
		key: string;
		constructor(source: { getKey(): string }) {
			this.key = source.getKey();
			openedKeys.push(this.key);
		}
		getZxy = (z: number, x: number, y: number) => getZxy(this.key, z, x, y);
		getHeader = () => getHeader(this.key);
	},
	EtagMismatch: class extends Error {},
	TileType: { Mvt: 1 },
}));

const { handleTileRequest, resetArchiveCache } = await import("./tiles.ts");

/** Header values matching the deployed Australia extract. */
const AU_HEADER = {
	minZoom: 0,
	maxZoom: 15,
	minLon: 112.9,
	minLat: -43.7,
	maxLon: 153.6,
	maxLat: -9.1,
	centerLon: 133.2,
	centerLat: -25.6,
	centerZoom: 4,
};

const ORIGIN = "https://api.locnative.com";

function fakeBucket(): R2Bucket {
	return { get: vi.fn() } as unknown as R2Bucket;
}

const WORLD_HEADER = {
	...AU_HEADER,
	maxZoom: 6,
	minLon: -180,
	minLat: -85,
	maxLon: 180,
	maxLat: 85,
};

beforeEach(() => {
	vi.clearAllMocks();
	resetArchiveCache();
	openedKeys.length = 0;
	getHeader.mockImplementation((key: string) =>
		Promise.resolve(key === "world-z0-z6.pmtiles" ? WORLD_HEADER : AU_HEADER)
	);
});

describe("tile responses", () => {
	it("serves a tile that exists", async () => {
		getZxy.mockResolvedValue({ data: new Uint8Array([1, 2, 3]).buffer });
		const res = await handleTileRequest(
			"/tiles/v1/10/941/613.mvt",
			fakeBucket(),
			ORIGIN
		);
		expect(res?.status).toBe(200);
		expect(res?.headers.get("content-type")).toBe("application/x-protobuf");
	});

	it("returns 200 with an empty body, not 204, for a tile outside coverage", async () => {
		// The reported bug: a 204 is indistinguishable to MapLibre from an
		// intentionally empty tile, so it paints nothing and never retries.
		getZxy.mockResolvedValue(undefined);
		const res = await handleTileRequest(
			"/tiles/v1/2/0/0.mvt",
			fakeBucket(),
			ORIGIN
		);
		expect(res?.status).toBe(200);
		expect(res?.headers.get("content-type")).toBe("application/x-protobuf");
		expect((await res?.arrayBuffer())?.byteLength).toBe(0);
	});

	it("sets CORS on tiles so third-party maps can load them", async () => {
		getZxy.mockResolvedValue(undefined);
		const res = await handleTileRequest(
			"/tiles/v1/2/0/0.mvt",
			fakeBucket(),
			ORIGIN
		);
		expect(res?.headers.get("access-control-allow-origin")).toBe("*");
	});
});

describe("TileJSON", () => {
	it("derives bounds and zoom range from the live archive header", async () => {
		const res = await handleTileRequest(
			"/tiles/v1/tiles.json",
			fakeBucket(),
			ORIGIN
		);
		expect(res?.status).toBe(200);
		const body = (await res?.json()) as Record<string, unknown>;
		expect(body.tilejson).toBe("3.0.0");
		// Union of both archives: global bounds, detail archive's max zoom.
		expect(body.bounds).toEqual([-180, -85.051_129, 180, 85.051_129]);
		expect(body.minzoom).toBe(0);
		expect(body.maxzoom).toBe(15);
		expect(body.tiles).toEqual([
			"https://api.locnative.com/tiles/v1/{z}/{x}/{y}.mvt",
		]);
		expect(body.attribution).toContain("OpenStreetMap");
	});

	it("tracks the archive rather than hardcoding zoom range", async () => {
		// Guards the drift the plan calls out: if a different archive is
		// deployed, TileJSON must follow it.
		getHeader.mockImplementation((key: string) =>
			Promise.resolve(
				key === "world-z0-z6.pmtiles"
					? WORLD_HEADER
					: { ...AU_HEADER, maxZoom: 12 }
			)
		);
		const res = await handleTileRequest(
			"/tiles/v1/tiles.json",
			fakeBucket(),
			ORIGIN
		);
		const body = (await res?.json()) as Record<string, unknown>;
		expect(body.maxzoom).toBe(12);
	});

	it("advertises AU-only bounds when the world archive is absent", async () => {
		// Until the world extract is uploaded we must not promise global
		// coverage we cannot serve.
		getHeader.mockImplementation((key: string) =>
			key === "world-z0-z6.pmtiles"
				? Promise.reject(new Error("pmtiles archive not found in R2: world"))
				: Promise.resolve(AU_HEADER)
		);
		const res = await handleTileRequest(
			"/tiles/v1/tiles.json",
			fakeBucket(),
			ORIGIN
		);
		const body = (await res?.json()) as Record<string, unknown>;
		expect(body.bounds).toEqual([112.9, -43.7, 153.6, -9.1]);
	});
});

describe("origin scheme", () => {
	it("upgrades http to https so TileJSON urls are not mixed-content blocked", async () => {
		// url.origin reflects the inbound scheme, which is http when TLS is
		// terminated upstream. http tile urls inside TileJSON are blocked by
		// browsers on an https page, which would blank the map again.
		const res = await handleTileRequest(
			"/tiles/v1/tiles.json",
			fakeBucket(),
			"http://api.locnative.com"
		);
		const body = (await res?.json()) as { tiles: string[] };
		expect(body.tiles[0]).toBe(
			"https://api.locnative.com/tiles/v1/{z}/{x}/{y}.mvt"
		);
	});

	it("leaves localhost alone so wrangler dev keeps working", async () => {
		const res = await handleTileRequest(
			"/tiles/v1/tiles.json",
			fakeBucket(),
			"http://localhost:8787"
		);
		const body = (await res?.json()) as { tiles: string[] };
		expect(body.tiles[0]).toBe(
			"http://localhost:8787/tiles/v1/{z}/{x}/{y}.mvt"
		);
	});
});

describe("style.json", () => {
	it("references the source by TileJSON url so it inherits bounds", async () => {
		const res = await handleTileRequest(
			"/tiles/v1/style.json",
			fakeBucket(),
			ORIGIN
		);
		expect(res?.status).toBe(200);
		const body = (await res?.json()) as {
			version: number;
			sources: { protomaps: { url: string } };
			glyphs: string;
		};
		expect(body.version).toBe(8);
		expect(body.sources.protomaps.url).toBe(
			"https://api.locnative.com/tiles/v1/tiles.json"
		);
		expect(body.glyphs).toContain("/tiles/v1/fonts/");
	});
});

describe("zoom-based archive routing", () => {
	it("serves low zoom from the world archive", async () => {
		// The reported failure: at z2, 15 of 16 tiles were blank because only
		// the AU archive existed.
		getZxy.mockResolvedValue({ data: new Uint8Array([9]).buffer });
		await handleTileRequest("/tiles/v1/2/0/0.mvt", fakeBucket(), ORIGIN);
		expect(getZxy).toHaveBeenCalledWith("world-z0-z6.pmtiles", 2, 0, 0);
	});

	it("serves the boundary zoom from the world archive", async () => {
		getZxy.mockResolvedValue({ data: new Uint8Array([9]).buffer });
		await handleTileRequest("/tiles/v1/6/1/1.mvt", fakeBucket(), ORIGIN);
		expect(getZxy).toHaveBeenCalledWith("world-z0-z6.pmtiles", 6, 1, 1);
	});

	it("serves street zoom from the detail archive", async () => {
		getZxy.mockResolvedValue({ data: new Uint8Array([9]).buffer });
		await handleTileRequest("/tiles/v1/7/59/74.mvt", fakeBucket(), ORIGIN);
		expect(getZxy).toHaveBeenCalledWith("australia.pmtiles", 7, 59, 74);
	});

	it("degrades to an empty tile if the world archive is not uploaded yet", async () => {
		// The code deploys before the archive upload; a missing world archive
		// must not 500 every low-zoom request.
		getZxy.mockRejectedValue(
			new Error("pmtiles archive not found in R2: world-z0-z6.pmtiles")
		);
		const res = await handleTileRequest(
			"/tiles/v1/2/0/0.mvt",
			fakeBucket(),
			ORIGIN
		);
		expect(res?.status).toBe(200);
		expect((await res?.arrayBuffer())?.byteLength).toBe(0);
		// Short TTL so the tile is not pinned blank once the archive lands.
		expect(res?.headers.get("cache-control")).toBe("public, max-age=60");
	});

	it("still surfaces unexpected errors from the detail archive", async () => {
		getZxy.mockRejectedValue(new Error("r2 exploded"));
		await expect(
			handleTileRequest("/tiles/v1/10/941/613.mvt", fakeBucket(), ORIGIN)
		).rejects.toThrow("r2 exploded");
	});
});

describe("routing", () => {
	it("returns null for non-tile paths so the caller keeps routing", async () => {
		expect(
			await handleTileRequest("/rpc/foo", fakeBucket(), ORIGIN)
		).toBeNull();
	});

	it("404s an unrecognised tiles path", async () => {
		const res = await handleTileRequest("/tiles/v1/nope", fakeBucket(), ORIGIN);
		expect(res?.status).toBe(404);
	});

	it("reuses one archive instance per archive across requests", async () => {
		// Directory lookups were previously re-fetched from R2 on every tile.
		getZxy.mockResolvedValue(undefined);
		const bucket = fakeBucket();
		await handleTileRequest("/tiles/v1/2/0/0.mvt", bucket, ORIGIN);
		await handleTileRequest("/tiles/v1/2/0/1.mvt", bucket, ORIGIN);
		await handleTileRequest("/tiles/v1/10/941/613.mvt", bucket, ORIGIN);
		expect(openedKeys).toEqual(["world-z0-z6.pmtiles", "australia.pmtiles"]);
	});
});
