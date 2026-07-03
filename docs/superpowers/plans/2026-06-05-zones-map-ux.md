# Zones Map UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/zones` map fast and detailed — replace the slow OpenFreeMap basemap with a self-hosted Protomaps basemap on Cloudflare R2, and overlay the platform's own G-NAF address points (clustered, zoom-gated).

**Architecture:** Three independent phases. (A) A Cloudflare Worker route in `apps/server` serves MVT tiles from an Australia `pmtiles` file in R2, edge-cached; the web client renders a dark Protomaps style. (B) A new session-auth oRPC procedure returns G-NAF address points for the map viewport bbox; the client renders them as a clustered GeoJSON layer that appears at street zoom. (C) Perceived-load polish: a loading skeleton, chunk prefetch, and fit-to-zones on load.

**Tech Stack:** Cloudflare Workers + Hono, R2, `pmtiles` (server-side decode), MapLibre GL JS, `protomaps-themes-base`, oRPC, Drizzle + PostGIS, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-zones-map-ux-design.md`

---

## File Structure

**Phase A — basemap**
- Modify: `apps/server/wrangler.jsonc` — add `MAP_TILES` R2 binding.
- Create: `apps/server/src/tiles.ts` — `PMTiles` R2 source adapter + tile/glyph/sprite request handler.
- Modify: `apps/server/src/index.ts` — mount `/tiles/v1/*` Hono route.
- Modify: `packages/env/src/web.ts` — add `VITE_TILES_BASE_URL`.
- Modify: `apps/web/src/components/map/map-style.ts` — build Protomaps dark style.
- Modify: `apps/web/src/components/map/map-canvas.tsx` — (Phase C also touches this).

**Phase B — overlay**
- Create: `packages/api/src/shared/address-label.ts` — pure `composeAddressLabel()` helper.
- Create: `packages/api/src/shared/address-label.test.ts` — unit tests.
- Modify: `packages/api/src/shared/zone-queries.ts` — add `addressesInBbox()`.
- Modify: `packages/api/src/routers/domains/zones.ts` — add `inViewport` procedure.
- Create: `apps/web/src/components/zones/use-address-overlay.ts` — debounced bbox-fetch hook + layer management.
- Modify: `apps/web/src/components/zones/zone-map.tsx` — wire the overlay hook.

**Phase C — polish**
- Modify: `apps/web/src/components/map/map-canvas.tsx` — loading skeleton + `onMapReady` already exists.
- Modify: `apps/web/src/routes/_protected/zones.tsx` — prefetch chunks.
- Modify: `apps/web/src/components/zones/zone-map.tsx` — fit to zones on load.

---

## Phase A — Self-Hosted Protomaps Basemap

### Task A0: Provision R2 bucket + tile assets (ops, no tests)

**Files:**
- Modify: `apps/server/wrangler.jsonc:r2_buckets`

- [ ] **Step 1: Create the R2 bucket**

Run:
```bash
cd apps/server
pnpm dlx wrangler r2 bucket create locnative-tiles
```
Expected: `Created bucket locnative-tiles`.

- [ ] **Step 2: Build an Australia pmtiles extract**

Install the pmtiles CLI and extract the AU bbox from the Protomaps public build (bbox = lng/lat west,south,east,north for Australia):
```bash
# install Go pmtiles CLI (https://github.com/protomaps/go-pmtiles), then:
pmtiles extract https://build.protomaps.com/20260601.pmtiles australia.pmtiles \
  --bbox=112.9,-43.7,153.7,-10.6
```
Expected: `australia.pmtiles` written locally (~0.3–1.5 GB). Use the most recent dated build available at build.protomaps.com.

- [ ] **Step 3: Download the basemaps font + sprite assets**

```bash
git clone --depth 1 https://github.com/protomaps/basemaps-assets.git
# basemaps-assets/fonts/<fontstack>/<range>.pbf  and  basemaps-assets/sprites/v4/dark.{json,png}
```

- [ ] **Step 4: Upload tiles, fonts, and sprite to R2**

```bash
pnpm dlx wrangler r2 object put locnative-tiles/australia.pmtiles --file=australia.pmtiles --remote
# fonts (upload the whole basemaps-assets/fonts tree under fonts/)
find basemaps-assets/fonts -name '*.pbf' -exec sh -c \
  'pnpm dlx wrangler r2 object put "locnative-tiles/fonts/${1#basemaps-assets/fonts/}" --file="$1" --remote' _ {} \;
# sprite
pnpm dlx wrangler r2 object put locnative-tiles/sprite/dark.json --file=basemaps-assets/sprites/v4/dark.json --remote
pnpm dlx wrangler r2 object put locnative-tiles/sprite/dark.png  --file=basemaps-assets/sprites/v4/dark.png  --remote
```
Expected: each `put` prints `Upload complete`.

- [ ] **Step 5: Add the R2 binding to wrangler.jsonc**

In `apps/server/wrangler.jsonc`, extend the `r2_buckets` array (keep the existing `GEOCODE_RESULTS` entry):
```jsonc
"r2_buckets": [
    { "binding": "GEOCODE_RESULTS", "bucket_name": "locnative-geocode-results" },
    { "binding": "MAP_TILES", "bucket_name": "locnative-tiles" }
]
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/wrangler.jsonc
git commit -m "feat(server): bind locnative-tiles R2 bucket for map tiles"
```

---

### Task A1: PMTiles R2 source adapter + tile handler

**Files:**
- Create: `apps/server/src/tiles.ts`

The `pmtiles` package exposes a `Source` interface (`getBytes(offset, length)`) and `PMTiles` class with `getZxy(z, x, y)`. We implement an R2-backed source using Range reads, and a request handler that also serves fonts/sprites straight from R2.

- [ ] **Step 1: Install the pmtiles package**

Run:
```bash
cd apps/server
pnpm add pmtiles
```
Expected: `pmtiles` added to `apps/server/package.json` dependencies.

- [ ] **Step 2: Write `apps/server/src/tiles.ts`**

```ts
import {
	type Cache,
	EtagMismatch,
	PMTiles,
	type RangeResponse,
	type Source,
} from "pmtiles";

const PMTILES_KEY = "australia.pmtiles";
const TILE_PREFIX = "/tiles/v1";
const TILE_CACHE_CONTROL = "public, max-age=86400, immutable";

/** R2-backed pmtiles source: satisfies range reads via R2 `range` GET. */
class R2Source implements Source {
	constructor(private readonly bucket: R2Bucket) {}

	getKey() {
		return PMTILES_KEY;
	}

	async getBytes(offset: number, length: number): Promise<RangeResponse> {
		const obj = await this.bucket.get(PMTILES_KEY, {
			range: { offset, length },
		});
		if (!obj) {
			throw new Error("pmtiles archive not found in R2");
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

function r2Passthrough(
	bucket: R2Bucket,
	key: string,
	contentType: string
): Promise<Response> {
	return bucket.get(key).then((obj) => {
		if (!obj) {
			return new Response("Not found", { status: 404 });
		}
		return obj.arrayBuffer().then(
			(body) =>
				new Response(body, {
					headers: {
						"content-type": contentType,
						"cache-control": TILE_CACHE_CONTROL,
					},
				})
		);
	});
}

/**
 * Handle a /tiles/v1/* request against the MAP_TILES R2 bucket.
 * Returns null if the path is not a tiles path (caller continues routing).
 */
export async function handleTileRequest(
	pathname: string,
	bucket: R2Bucket
): Promise<Response | null> {
	if (!pathname.startsWith(TILE_PREFIX)) {
		return null;
	}

	const font = pathname.match(FONT_RE);
	if (font) {
		return r2Passthrough(
			bucket,
			`fonts/${font[1]}/${font[2]}.pbf`,
			"application/x-protobuf"
		);
	}

	const sprite = pathname.match(SPRITE_RE);
	if (sprite) {
		const isJson = sprite[1].endsWith(".json");
		return r2Passthrough(
			bucket,
			`sprite/${sprite[1]}`,
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
	const archive = new PMTiles(new R2Source(bucket), undefined as unknown as Cache);
	try {
		const result = await archive.getZxy(z, x, y);
		if (!result) {
			// Empty tile is valid (no data at this z/x/y).
			return new Response(null, { status: 204 });
		}
		return new Response(result.data, {
			headers: {
				"content-type": "application/x-protobuf",
				"cache-control": TILE_CACHE_CONTROL,
			},
		});
	} catch (err) {
		if (err instanceof EtagMismatch) {
			// Archive changed mid-read; client will retry.
			return new Response(null, { status: 503 });
		}
		throw err;
	}
}
```

- [ ] **Step 3: Typecheck the server package**

Run:
```bash
cd apps/server && pnpm exec tsc --noEmit
```
Expected: no errors in `src/tiles.ts`. (If `R2Bucket`/`R2Source` types are unresolved, ensure `@cloudflare/workers-types` is present — it ships transitively via wrangler; add `"types": ["@cloudflare/workers-types"]` to `apps/server/tsconfig.json` compilerOptions if needed.)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/tiles.ts apps/server/package.json ../../pnpm-lock.yaml
git commit -m "feat(server): pmtiles R2 source + tile/font/sprite handler"
```

---

### Task A2: Mount the tile route in Hono

**Files:**
- Modify: `apps/server/src/index.ts` (add a route before the `/*` localFetch catch-all near line 248)

- [ ] **Step 1: Import the handler**

At the top of `apps/server/src/index.ts`, with the other imports:
```ts
import { handleTileRequest } from "./tiles.ts";
```

- [ ] **Step 2: Add the tiles route BEFORE the `/*` catch-all**

Insert immediately before the existing `app.use("/*", ...)` block (around line 248). Cloudflare R2 bindings are available on the Hono context env as `c.env.MAP_TILES`:
```ts
app.get("/tiles/v1/*", async (context) => {
	const bucket = (context.env as { MAP_TILES?: R2Bucket }).MAP_TILES;
	if (!bucket) {
		return context.text("Tiles not configured", 503);
	}
	const url = new URL(context.req.url);
	const res = await handleTileRequest(url.pathname, bucket);
	return res ?? context.notFound();
});
```

- [ ] **Step 3: Run the Worker locally and fetch a tile**

Run:
```bash
cd apps/server && pnpm dlx wrangler dev --port 3003 &
sleep 6
# z/x/y over Sydney CBD at z14 ≈ 15087/9834
pnpm dlx wrangler r2 object get locnative-tiles/australia.pmtiles --remote >/dev/null && echo "archive present"
```
Then in a browser or via the app, load `http://localhost:3003/tiles/v1/14/15087/9834.mvt`.
Expected: HTTP 200 with `content-type: application/x-protobuf` (binary body), or 204 for an empty tile. NOT 404/503.

> Note: per project rules, do not use `curl`; verify via the running web app in Task A3 or `wrangler dev`'s request log.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "feat(server): mount /tiles/v1/* MVT route"
```

---

### Task A3: Client Protomaps dark style

**Files:**
- Modify: `packages/env/src/web.ts`
- Modify: `apps/web/src/components/map/map-style.ts`
- Install: `protomaps-themes-base` in `apps/web`

- [ ] **Step 1: Add the env var**

In `packages/env/src/web.ts`, add to the `client` object (keep `VITE_SERVER_URL`; remove `VITE_MAPTILER_KEY`):
```ts
client: {
	VITE_SERVER_URL: z.url(),
	/** Base URL of the tile Worker, e.g. https://api.locnative.com . Tiles live under /tiles/v1. */
	VITE_TILES_BASE_URL: z.url().optional(),
},
```

- [ ] **Step 2: Set the env value for local dev**

In `apps/web/.env`, replace the `VITE_MAPTILER_KEY=` line with:
```
VITE_TILES_BASE_URL=http://localhost:3003
```
(Production sets `https://api.locnative.com`.)

- [ ] **Step 3: Install the theme package**

Run:
```bash
cd apps/web
pnpm add protomaps-themes-base@^5
```
Expected: added to `apps/web/package.json`.

- [ ] **Step 4: Write the failing test for the style builder**

Create `apps/web/src/components/map/map-style.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildMapStyle, OPENFREEMAP_DARK } from "./map-style.ts";

describe("buildMapStyle", () => {
	it("falls back to OpenFreeMap dark when no tiles base url", () => {
		expect(buildMapStyle(undefined)).toBe(OPENFREEMAP_DARK);
	});

	it("builds a Protomaps style object pointing at our tile worker", () => {
		const style = buildMapStyle("https://api.locnative.com");
		expect(typeof style).not.toBe("string");
		const s = style as Exclude<ReturnType<typeof buildMapStyle>, string>;
		expect(s.sources.protomaps).toMatchObject({
			type: "vector",
			tiles: ["https://api.locnative.com/tiles/v1/{z}/{x}/{y}.mvt"],
		});
		expect(s.glyphs).toBe(
			"https://api.locnative.com/tiles/v1/fonts/{fontstack}/{range}.pbf"
		);
		expect(Array.isArray(s.layers)).toBe(true);
		expect(s.layers.length).toBeGreaterThan(5);
	});
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run:
```bash
cd apps/web && pnpm exec vitest run src/components/map/map-style.test.ts
```
Expected: FAIL (`buildMapStyle` not exported).

- [ ] **Step 6: Rewrite `apps/web/src/components/map/map-style.ts`**

```ts
import { layers } from "protomaps-themes-base";

/**
 * MapLibre basemap resolution for the (dark) dashboard. In production we serve a
 * self-hosted Protomaps vector basemap from our own tile Worker (R2-backed,
 * edge-cached). Without a tiles base URL configured (local dev fallback) we use
 * the free, no-key OpenFreeMap dark style.
 */

export type MapStyleSpec = {
	version: 8;
	glyphs: string;
	sprite: string;
	sources: Record<string, unknown> & {
		protomaps: { type: "vector"; tiles: string[]; maxzoom: number };
	};
	// biome-ignore lint/suspicious/noExplicitAny: maplibre LayerSpecification array
	layers: any[];
};

export type MapStyle = string | MapStyleSpec;

/** Free, no-key, CORS-open dark vector basemap (dev fallback only). */
export const OPENFREEMAP_DARK = "https://tiles.openfreemap.org/styles/dark";

const SOURCE_NAME = "protomaps";
const MAX_ZOOM = 15;

export function buildMapStyle(tilesBaseUrl?: string): MapStyle {
	if (!tilesBaseUrl) {
		return OPENFREEMAP_DARK;
	}
	const base = tilesBaseUrl.replace(/\/$/, "");
	return {
		version: 8,
		glyphs: `${base}/tiles/v1/fonts/{fontstack}/{range}.pbf`,
		sprite: `${base}/tiles/v1/sprite/dark`,
		sources: {
			[SOURCE_NAME]: {
				type: "vector",
				tiles: [`${base}/tiles/v1/{z}/{x}/{y}.mvt`],
				maxzoom: MAX_ZOOM,
			},
		},
		layers: layers(SOURCE_NAME, "dark"),
	};
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
```bash
cd apps/web && pnpm exec vitest run src/components/map/map-style.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 8: Update `map-canvas.tsx` to use the new builder + env var**

In `apps/web/src/components/map/map-canvas.tsx`:
- Change the import: `import { buildMapStyle } from "./map-style.ts";`
- Change the style line in the `new MapCtor({...})` call from
  `style: buildMapStyleUrl(env.VITE_MAPTILER_KEY) as never,`
  to
  `style: buildMapStyle(env.VITE_TILES_BASE_URL) as never,`

- [ ] **Step 9: Run the app and confirm the basemap renders with detail**

Run:
```bash
# terminal 1: server (tiles) — from Task A2 step 3 if not already running
cd apps/server && pnpm dlx wrangler dev --port 3003
# terminal 2: web
cd apps/web && pnpm dev
```
Open `http://localhost:3001/zones`, sign in, and zoom to street level.
Expected: dark basemap shows buildings, roads, POI + street labels (richer than before); tiles load quickly from `localhost:3003/tiles/v1/...` (check the Network tab — 200/204, not 404).

- [ ] **Step 10: Commit**

```bash
git add packages/env/src/web.ts apps/web/.env apps/web/package.json ../../pnpm-lock.yaml \
        apps/web/src/components/map/map-style.ts apps/web/src/components/map/map-style.test.ts \
        apps/web/src/components/map/map-canvas.tsx
git commit -m "feat(web): render self-hosted Protomaps dark basemap from tile worker"
```

---

## Phase B — G-NAF Address Overlay

### Task B1: Address label helper + bbox query

**Files:**
- Create: `packages/api/src/shared/address-label.ts`
- Create: `packages/api/src/shared/address-label.test.ts`
- Modify: `packages/api/src/shared/zone-queries.ts`

- [ ] **Step 1: Write the failing test for `composeAddressLabel`**

Create `packages/api/src/shared/address-label.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { composeAddressLabel } from "./address-label.ts";

describe("composeAddressLabel", () => {
	it("formats a unit on a street", () => {
		expect(
			composeAddressLabel({
				flatType: "UNIT",
				flatNumber: "16",
				numberFirst: "14",
				numberLast: null,
				streetName: "BOXGROVE",
				streetType: "AVENUE",
				locality: "MOSMAN",
			})
		).toBe("Unit 16/14 Boxgrove Avenue, Mosman");
	});

	it("formats a plain street number with a range", () => {
		expect(
			composeAddressLabel({
				flatType: null,
				flatNumber: null,
				numberFirst: "10",
				numberLast: "12",
				streetName: "PANSY",
				streetType: "STREET",
				locality: "BOTANY",
			})
		).toBe("10-12 Pansy Street, Botany");
	});

	it("omits missing pieces gracefully", () => {
		expect(
			composeAddressLabel({
				flatType: null,
				flatNumber: null,
				numberFirst: null,
				numberLast: null,
				streetName: "WYNNUM",
				streetType: "ROAD",
				locality: "TINGALPA",
			})
		).toBe("Wynnum Road, Tingalpa");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd packages/api && pnpm exec vitest run src/shared/address-label.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `packages/api/src/shared/address-label.ts`**

```ts
export interface AddressLabelParts {
	flatType: string | null;
	flatNumber: string | null;
	numberFirst: string | null;
	numberLast: string | null;
	streetName: string;
	streetType: string | null;
	locality: string;
}

/** Title-case a G-NAF uppercase token, e.g. "BOXGROVE" -> "Boxgrove". */
function titleCase(value: string): string {
	return value
		.toLowerCase()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Compose a human-readable address label from G-NAF parts, e.g.
 * "Unit 16/14 Boxgrove Avenue, Mosman". Missing pieces are dropped.
 */
export function composeAddressLabel(parts: AddressLabelParts): string {
	const streetNumber = parts.numberLast
		? `${parts.numberFirst}-${parts.numberLast}`
		: (parts.numberFirst ?? "");

	let head = "";
	if (parts.flatNumber) {
		const prefix = parts.flatType ? titleCase(parts.flatType) : "Unit";
		head = streetNumber
			? `${prefix} ${parts.flatNumber}/${streetNumber}`
			: `${prefix} ${parts.flatNumber}`;
	} else {
		head = streetNumber;
	}

	const street = [parts.streetName, parts.streetType]
		.filter(Boolean)
		.map((s) => titleCase(s as string))
		.join(" ");

	const line = [head, street].filter(Boolean).join(" ");
	return `${line}, ${titleCase(parts.locality)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd packages/api && pnpm exec vitest run src/shared/address-label.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Add `addressesInBbox` to `packages/api/src/shared/zone-queries.ts`**

At the top of the file, ensure these imports exist (add what's missing): `composeAddressLabel` from `./address-label.ts`, and `addresses` is already imported. Append this exported function and types at the end of the file:
```ts
import {
	type AddressLabelParts,
	composeAddressLabel,
} from "./address-label.ts";

const ADDRESSES_IN_BBOX_HARD_CAP = 5000;

export interface BboxAddressPoint {
	id: number;
	gnafPid: string | null;
	label: string;
	lng: number;
	lat: number;
}

export interface AddressesInBboxResult {
	results: BboxAddressPoint[];
	count: number;
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
```

- [ ] **Step 6: Typecheck the api package**

Run:
```bash
cd packages/api && pnpm exec tsc --noEmit
```
Expected: no errors. (`Database`, `sql`, `addresses`, `and`, `eq` are already imported at the top of `zone-queries.ts`.)

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/shared/address-label.ts packages/api/src/shared/address-label.test.ts \
        packages/api/src/shared/zone-queries.ts
git commit -m "feat(api): addressesInBbox query + composeAddressLabel helper"
```

---

### Task B2: `zones.inViewport` oRPC procedure

**Files:**
- Modify: `packages/api/src/routers/domains/zones.ts`

- [ ] **Step 1: Import the new query**

In `packages/api/src/routers/domains/zones.ts`, add `addressesInBbox` to the existing import block from `../../shared/zone-queries.ts`.

- [ ] **Step 2: Add the `inViewport` procedure to `zonesRouter`**

Add this entry to the `zonesRouter` object (e.g. after `addresses`). It is session-authenticated like its siblings but takes no `projectId` (address data is global G-NAF, not project-scoped) — only the user's session is required:
```ts
	inViewport: protectedProcedure
		.input(
			z.object({
				bbox: z.tuple([
					z.number().min(-180).max(180),
					z.number().min(-90).max(90),
					z.number().min(-180).max(180),
					z.number().min(-90).max(90),
				]),
				limit: z.number().int().min(1).max(5000).default(2000),
			})
		)
		.handler(async ({ context, input }) => {
			const out = await addressesInBbox(context.db, input.bbox, input.limit);
			return out;
		}),
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd packages/api && pnpm exec tsc --noEmit
```
Expected: no errors. `protectedProcedure` and `z` are already imported.

- [ ] **Step 4: Verify the client type is generated**

Run:
```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -5
```
Expected: no new errors; `orpcClient.zones.inViewport` is now typed (it flows through `AppRouter`).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/domains/zones.ts
git commit -m "feat(api): zones.inViewport procedure for map address overlay"
```

---

### Task B3: Client address overlay (clustered, zoom-gated)

**Files:**
- Create: `apps/web/src/components/zones/use-address-overlay.ts`
- Modify: `apps/web/src/components/zones/zone-map.tsx`

- [ ] **Step 1: Write the overlay hook `apps/web/src/components/zones/use-address-overlay.ts`**

```ts
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { orpcClient } from "@/lib/orpc";

const SRC = "gnaf-addresses";
const ZOOM_FLOOR = 14;
const DEBOUNCE_MS = 350;
const FETCH_LIMIT = 2000;

type FeatureCollection = {
	type: "FeatureCollection";
	features: Array<{
		type: "Feature";
		properties: { id: number; label: string };
		geometry: { type: "Point"; coordinates: [number, number] };
	}>;
};

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Adds a clustered G-NAF address overlay that loads on pan/zoom at z>=14. */
export function useAddressOverlay(map: MapLibreMap | null) {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reqIdRef = useRef(0);

	useEffect(() => {
		if (!map) {
			return;
		}

		const ensureLayers = () => {
			if (map.getSource(SRC)) {
				return;
			}
			// biome-ignore lint/suspicious/noExplicitAny: maplibre source typing
			map.addSource(SRC, {
				type: "geojson",
				data: EMPTY,
				cluster: true,
				clusterRadius: 50,
				clusterMaxZoom: 16,
			} as any);
			map.addLayer({
				id: "gnaf-clusters",
				type: "circle",
				source: SRC,
				filter: ["has", "point_count"],
				paint: {
					"circle-color": "#0ea5e9",
					"circle-opacity": 0.65,
					"circle-radius": ["step", ["get", "point_count"], 14, 100, 18, 1000, 24],
				},
			});
			map.addLayer({
				id: "gnaf-cluster-count",
				type: "symbol",
				source: SRC,
				filter: ["has", "point_count"],
				layout: {
					"text-field": ["get", "point_count_abbreviated"],
					"text-size": 12,
				},
				paint: { "text-color": "#ffffff" },
			});
			map.addLayer({
				id: "gnaf-point",
				type: "circle",
				source: SRC,
				filter: ["!", ["has", "point_count"]],
				paint: {
					"circle-color": "#38bdf8",
					"circle-radius": 4,
					"circle-stroke-width": 1,
					"circle-stroke-color": "#0c4a6e",
				},
			});
		};

		const clear = () => {
			const src = map.getSource(SRC);
			if (src) {
				// biome-ignore lint/suspicious/noExplicitAny: GeoJSONSource setData
				(src as any).setData(EMPTY);
			}
		};

		const refresh = async () => {
			if (map.getZoom() < ZOOM_FLOOR) {
				clear();
				return;
			}
			ensureLayers();
			const b = map.getBounds();
			const bbox: [number, number, number, number] = [
				b.getWest(),
				b.getSouth(),
				b.getEast(),
				b.getNorth(),
			];
			const reqId = ++reqIdRef.current;
			try {
				const res = await orpcClient.zones.inViewport({
					bbox,
					limit: FETCH_LIMIT,
				});
				if (reqId !== reqIdRef.current) {
					return; // stale response
				}
				const fc: FeatureCollection = {
					type: "FeatureCollection",
					features: res.results.map((a) => ({
						type: "Feature",
						properties: { id: a.id, label: a.label },
						geometry: { type: "Point", coordinates: [a.lng, a.lat] },
					})),
				};
				const src = map.getSource(SRC);
				if (src) {
					// biome-ignore lint/suspicious/noExplicitAny: GeoJSONSource setData
					(src as any).setData(fc);
				}
			} catch {
				// Non-critical: keep last data on failure (codebase convention).
			}
		};

		const onMove = () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
			timerRef.current = setTimeout(refresh, DEBOUNCE_MS);
		};

		map.on("moveend", onMove);
		refresh();

		return () => {
			map.off("moveend", onMove);
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [map]);
}
```

- [ ] **Step 2: Add a hover popup for individual points (same file, inside the `useEffect` after `ensureLayers` is defined)**

Add this block right after the `map.on("moveend", onMove);` line:
```ts
		const onPointClick = (e: { lngLat: { lng: number; lat: number }; features?: Array<{ properties?: { label?: string } }> }) => {
			const label = e.features?.[0]?.properties?.label;
			if (!label) {
				return;
			}
			import("maplibre-gl").then(({ Popup }) => {
				new Popup({ closeButton: true })
					.setLngLat([e.lngLat.lng, e.lngLat.lat])
					.setText(label)
					.addTo(map);
			});
		};
		// biome-ignore lint/suspicious/noExplicitAny: maplibre layer event typing
		map.on("click", "gnaf-point", onPointClick as any);
```
And in the cleanup `return () => {...}`, add:
```ts
			// biome-ignore lint/suspicious/noExplicitAny: maplibre layer event typing
			map.off("click", "gnaf-point", onPointClick as any);
```

- [ ] **Step 3: Wire the hook into `zone-map.tsx`**

In `apps/web/src/components/zones/zone-map.tsx`:
- Add import: `import { useAddressOverlay } from "./use-address-overlay.ts";`
- Inside `ZoneMap`, after `const draw = useZoneDraw(map);`, add: `useAddressOverlay(map);`

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm dlx ultracite check src/components/zones/use-address-overlay.ts
```
Expected: no type errors; lint clean.

- [ ] **Step 5: Manual QA in the running app**

With server + web running, open `/zones`:
- Zoomed out (z<14): only zone polygons, no address dots.
- Zoom to z14–15: cluster bubbles with counts appear.
- Zoom to z16+: individual sky-blue dots; clicking one shows a popup like "Unit 16/14 Boxgrove Avenue, Mosman".
- Panning re-queries (debounced); zone draw still works.

Expected: all behaviours as above; no console errors; overlay never blocks map interaction.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/zones/use-address-overlay.ts apps/web/src/components/zones/zone-map.tsx
git commit -m "feat(web): clustered zoom-gated G-NAF address overlay on zones map"
```

---

## Phase C — Perceived-Load Polish

### Task C1: Map loading skeleton

**Files:**
- Modify: `apps/web/src/components/map/map-canvas.tsx`

- [ ] **Step 1: Add a loading state and overlay**

In `MapCanvas`, add `const [ready, setReady] = useState(false);` (import `useState`). In the `map.on("load", ...)` callback, after `onMapReady?.(map)`, call `setReady(true)`. Wrap the return so the skeleton shows until ready:
```tsx
	return (
		<div className="relative h-full w-full" style={{ minHeight: 360 }}>
			{!ready && (
				<div className="absolute inset-0 z-10 animate-pulse bg-muted/40" aria-hidden />
			)}
			<div
				className={className}
				ref={containerRef}
				style={{ width: "100%", height: "100%", minHeight: 360 }}
			/>
		</div>
	);
```

- [ ] **Step 2: Typecheck + visually verify**

Run:
```bash
cd apps/web && pnpm exec tsc --noEmit
```
Then reload `/zones`: a pulsing placeholder shows briefly, then the map.
Expected: no blank flash; skeleton disappears on map load.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/map/map-canvas.tsx
git commit -m "feat(web): loading skeleton for map canvas"
```

---

### Task C2: Prefetch map chunks on zones route

**Files:**
- Modify: `apps/web/src/routes/_protected/zones.tsx`

- [ ] **Step 1: Kick the dynamic imports early**

In `apps/web/src/routes/_protected/zones.tsx`, inside `RouteComponent` add an effect that warms the heavy chunks before the map container mounts:
```ts
	useEffect(() => {
		void import("maplibre-gl");
		void import("terra-draw");
		void import("terra-draw-maplibre-gl-adapter");
	}, []);
```
(Ensure `useEffect` is imported from `react`.)

- [ ] **Step 2: Typecheck**

Run:
```bash
cd apps/web && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_protected/zones.tsx
git commit -m "perf(web): prefetch map chunks on zones route entry"
```

---

### Task C3: Fit to existing zones on load

**Files:**
- Modify: `apps/web/src/components/zones/zone-map.tsx`

- [ ] **Step 1: Fit bounds to zones when the map and zones are ready**

In `ZoneMap`, add an effect (after the existing zones-source effect) that fits the viewport to the union of zone geometries the first time both are present; fall back to Sydney at z12 when there are no zones:
```ts
	const fittedRef = useRef(false);
	useEffect(() => {
		if (!map || fittedRef.current) {
			return;
		}
		fittedRef.current = true;
		if (zones.length === 0) {
			map.jumpTo({ center: [151.2093, -33.8688], zoom: 12 });
			return;
		}
		let minLng = 180;
		let minLat = 90;
		let maxLng = -180;
		let maxLat = -90;
		for (const z of zones) {
			for (const ring of z.geometry.coordinates) {
				for (const [lng, lat] of ring) {
					minLng = Math.min(minLng, lng);
					minLat = Math.min(minLat, lat);
					maxLng = Math.max(maxLng, lng);
					maxLat = Math.max(maxLat, lat);
				}
			}
		}
		map.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat],
			],
			{ padding: 48, maxZoom: 16, duration: 0 }
		);
	}, [map, zones]);
```
(`useRef` is already imported in this file.)

- [ ] **Step 2: Typecheck + QA**

Run:
```bash
cd apps/web && pnpm exec tsc --noEmit
```
Open `/zones`: with zones present the map opens framed on them; with none it opens on Sydney at a useful zoom.
Expected: no city-wide empty default view.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/zones/zone-map.tsx
git commit -m "feat(web): fit zones map to existing zones on load"
```

---

## Final Verification

- [ ] **Run all affected unit tests**

```bash
cd packages/api && pnpm exec vitest run src/shared/address-label.test.ts
cd ../../apps/web && pnpm exec vitest run src/components/map/map-style.test.ts
```
Expected: all PASS.

- [ ] **Full typecheck + lint across touched packages**

```bash
cd apps/server && pnpm exec tsc --noEmit
cd ../../packages/api && pnpm exec tsc --noEmit
cd ../../apps/web && pnpm exec tsc --noEmit && pnpm dlx ultracite check
```
Expected: clean.

- [ ] **End-to-end manual pass on `/zones`:** fast basemap load, rich street detail, clustered → individual address points at zoom, popups with unit/street labels, zone draw/edit intact.

---

## Self-Review Notes

- **Spec coverage:** Basemap perf + richness → Phase A (R2/pmtiles + Protomaps style). G-NAF overlay (zoom-gated clusters, unit labels) → Phase B. Perceived-load polish (skeleton, prefetch, fitBounds) → Phase C. Dev fallback to OpenFreeMap → Task A3 step 6. Silent overlay-failure handling → Task B3 step 1. All spec sections mapped.
- **Deferred (per spec Open Questions, intentionally out of scope):** server-side grid aggregation for cluster accuracy below the cap; pmtiles refresh cadence (manual rebuild via Task A0 steps 2–4).
- **Naming consistency:** `VITE_TILES_BASE_URL`, source name `protomaps` (basemap) / `gnaf-addresses` (overlay), `buildMapStyle`, `addressesInBbox`, `composeAddressLabel`, `zones.inViewport` used consistently across tasks.
