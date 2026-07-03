# Region / Boundary Classification API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/v1/regions?lat=&lng=` that classifies a coordinate into the official ABS/ASGS administrative regions (state, SA1–SA4, LGA, postcode, electoral divisions, mesh blocks) containing it.

**Architecture:** A new global PostGIS table `regions` holds ingested ASGS boundary multipolygons. A query helper runs `ST_Covers(geom, point)` to find containing regions, and an oRPC public endpoint groups results into a keyed-by-layer object. Boundary data is loaded out-of-band by an `ogr2ogr` ingestion script. The endpoint follows the exact patterns of the existing `zones.contains` / `addresses.reverse` public endpoints.

**Tech Stack:** TypeScript, Drizzle ORM (Neon Postgres + PostGIS), oRPC, Zod, Vitest, GDAL/`ogr2ogr` for ingestion.

**Spec:** `docs/superpowers/specs/2026-06-06-region-boundary-classification-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/database/src/schema/regions.ts` (create) | `regions` table definition + types |
| `packages/database/src/schema/index.ts` (modify) | Export the new table/types |
| `packages/database/drizzle/*` (generated) | Migration for `regions` |
| `packages/database/scripts/ingest-asgs.ts` (create) | ogr2ogr ingestion driver |
| `packages/database/scripts/README-asgs.md` (create) | Source URLs + run instructions |
| `packages/api/src/shared/region-queries.ts` (create) | `parseLayers`, `groupRegionsByLayer` (pure) + `regionsContainingPoint` (DB) |
| `packages/api/src/routers/public/regions.ts` (create) | `regionsClassify` endpoint |
| `packages/api/src/routers/public/regions.test.ts` (create) | Unit tests for pure helpers |
| `packages/api/src/routers/public-http.ts` (modify) | Register endpoint in `publicHttpRouter` |
| `packages/api/src/routers/domains/api-explorer.ts` (modify) | Add `regions.classify` to live-proxy allowlist |
| `apps/web/src/lib/api-explorer-endpoints.ts` (modify) | Add `regions.classify` to the explorer catalog |
| `apps/web/src/components/docs-page.tsx` (modify) | Add a "Regions" docs section |

---

## Task 1: `regions` table schema + migration

**Files:**
- Create: `packages/database/src/schema/regions.ts`
- Modify: `packages/database/src/schema/index.ts`
- Generated: `packages/database/drizzle/*`

- [ ] **Step 1: Create the schema file**

Create `packages/database/src/schema/regions.ts`:

```ts
import {
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	varchar,
} from "drizzle-orm/pg-core";

const multiPolygon = customType<{ data: string }>({
	dataType() {
		return "geometry(MultiPolygon, 4326)";
	},
});

export const regions = pgTable(
	"regions",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		// One of: state, sa1, sa2, sa3, sa4, lga, poa, ced, sed, mb
		layer: varchar({ length: 8 }).notNull(),
		code: varchar({ length: 32 }).notNull(),
		name: text().notNull(),
		state: varchar({ length: 10 }),
		attrs: jsonb(),
		geom: multiPolygon("geom").notNull(),
	},
	(table) => [
		index("idx_regions_geom").using("gist", table.geom),
		index("idx_regions_layer").on(table.layer),
		index("idx_regions_code").on(table.layer, table.code),
	]
);

export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;
```

- [ ] **Step 2: Export from the schema barrel**

In `packages/database/src/schema/index.ts`, add after the `projects` exports block (keep alphabetical-ish ordering consistent with the file):

```ts
export type { NewRegion, Region } from "./regions.ts";
export { regions } from "./regions.ts";
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @locnative/database db:generate`
Expected: a new SQL file appears under `packages/database/drizzle/` containing `CREATE TABLE "regions"` with a `geometry(MultiPolygon,4326)` column and three indexes (one `USING gist`).

- [ ] **Step 4: Inspect the generated SQL**

Open the new `packages/database/drizzle/*.sql` file and confirm:
- `"geom" geometry(MultiPolygon,4326) NOT NULL`
- `CREATE INDEX "idx_regions_geom" ... USING gist ("geom")`
- `CREATE INDEX "idx_regions_layer"` and `"idx_regions_code"`

If the gist index is missing, drizzle-kit did not recognize the geometry type — confirm the `customType` `dataType()` returns exactly `geometry(MultiPolygon, 4326)`.

- [ ] **Step 5: Apply the migration**

Run: `pnpm --filter @locnative/database db:migrate`
Expected: migration applies cleanly (PostGIS is already enabled — `addresses`/`zones` use it).

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/schema/regions.ts packages/database/src/schema/index.ts packages/database/drizzle
git commit -m "feat(db): add regions table for ASGS boundary classification"
```

---

## Task 2: Region query helper (pure functions + DB query) — TDD

**Files:**
- Create: `packages/api/src/shared/region-queries.ts`
- Test: `packages/api/src/routers/public/regions.test.ts`

The pure functions (`parseLayers`, `groupRegionsByLayer`) are unit-tested without a database — matching how `geocode.test.ts` tests `buildGeocodeQuery` and `zones.test.ts` tests schema validation. The DB function `regionsContainingPoint` is exercised via the live endpoint after ingestion (Task 5).

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/public/regions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	groupRegionsByLayer,
	parseLayers,
	REGION_LAYERS,
} from "../../shared/region-queries.ts";

describe("parseLayers", () => {
	it("returns undefined when no layers param is given", () => {
		expect(parseLayers(undefined)).toBeUndefined();
	});

	it("returns undefined when the param has no valid layer codes", () => {
		expect(parseLayers("banana, xyz")).toBeUndefined();
	});

	it("parses a csv of valid layer codes, trimming and lowercasing", () => {
		expect(parseLayers(" SA2 , lga ,poa")).toEqual(["sa2", "lga", "poa"]);
	});

	it("drops unknown codes but keeps valid ones", () => {
		expect(parseLayers("sa2,banana,mb")).toEqual(["sa2", "mb"]);
	});

	it("exposes the full set of supported layers", () => {
		expect(REGION_LAYERS).toEqual([
			"state",
			"sa1",
			"sa2",
			"sa3",
			"sa4",
			"lga",
			"poa",
			"ced",
			"sed",
			"mb",
		]);
	});
});

describe("groupRegionsByLayer", () => {
	it("keys regions by their layer with code+name only", () => {
		const result = groupRegionsByLayer([
			{ layer: "state", code: "2", name: "Victoria", state: "VIC" },
			{ layer: "lga", code: "24600", name: "Melbourne (C)", state: "VIC" },
		]);
		expect(result).toEqual({
			state: { code: "2", name: "Victoria" },
			lga: { code: "24600", name: "Melbourne (C)" },
		});
	});

	it("returns an empty object for no rows", () => {
		expect(groupRegionsByLayer([])).toEqual({});
	});

	it("keeps the first row when a layer appears more than once", () => {
		const result = groupRegionsByLayer([
			{ layer: "poa", code: "3000", name: "3000", state: "VIC" },
			{ layer: "poa", code: "3001", name: "3001", state: "VIC" },
		]);
		expect(result.poa).toEqual({ code: "3000", name: "3000" });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @locnative/api test -- regions.test.ts`
Expected: FAIL — `region-queries.ts` does not exist / exports undefined.

- [ ] **Step 3: Write the helper module**

Create `packages/api/src/shared/region-queries.ts`:

```ts
import type { Database } from "@locnative/database";
import { regions } from "@locnative/database/schema";
import { inArray, sql } from "drizzle-orm";

export const REGION_LAYERS = [
	"state",
	"sa1",
	"sa2",
	"sa3",
	"sa4",
	"lga",
	"poa",
	"ced",
	"sed",
	"mb",
] as const;

export type RegionLayer = (typeof REGION_LAYERS)[number];

export type RegionRow = {
	layer: string;
	code: string;
	name: string;
	state: string | null;
};

const REGION_LAYER_SET = new Set<string>(REGION_LAYERS);

/**
 * Parse the optional `?layers=sa2,lga` csv into a list of valid layer codes.
 * Unknown codes are dropped. Returns undefined when nothing valid remains so
 * the caller queries all layers.
 */
export function parseLayers(raw: string | undefined): RegionLayer[] | undefined {
	if (!raw) {
		return undefined;
	}
	const parsed = raw
		.split(",")
		.map((part) => part.trim().toLowerCase())
		.filter((part): part is RegionLayer => REGION_LAYER_SET.has(part));
	return parsed.length > 0 ? parsed : undefined;
}

/** Collapse region rows into a { layer: { code, name } } object (first wins). */
export function groupRegionsByLayer(
	rows: RegionRow[]
): Record<string, { code: string; name: string }> {
	const out: Record<string, { code: string; name: string }> = {};
	for (const row of rows) {
		if (!out[row.layer]) {
			out[row.layer] = { code: row.code, name: row.name };
		}
	}
	return out;
}

/** Find every region polygon that covers the given point. */
export async function regionsContainingPoint(
	db: Database,
	lat: number,
	lng: number,
	layers?: RegionLayer[]
): Promise<RegionRow[]> {
	const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
	const whereParts = [
		// ST_Covers (not ST_Contains) so points exactly on a boundary count as
		// inside — matches the zones.contains semantics.
		sql`ST_Covers(${regions.geom}, ${point})`,
	];
	const query = db
		.select({
			layer: regions.layer,
			code: regions.code,
			name: regions.name,
			state: regions.state,
		})
		.from(regions);
	if (layers && layers.length > 0) {
		return query.where(
			sql`${inArray(regions.layer, layers)} AND ${whereParts[0]}`
		);
	}
	return query.where(whereParts[0]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @locnative/api test -- regions.test.ts`
Expected: PASS (all `parseLayers` and `groupRegionsByLayer` cases green).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/region-queries.ts packages/api/src/routers/public/regions.test.ts
git commit -m "feat(api): add region classification query helpers"
```

---

## Task 3: `regions.classify` endpoint + router registration

**Files:**
- Create: `packages/api/src/routers/public/regions.ts`
- Modify: `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Write the endpoint**

Create `packages/api/src/routers/public/regions.ts`:

```ts
import { z } from "zod";
import {
	groupRegionsByLayer,
	parseLayers,
	regionsContainingPoint,
} from "../../shared/region-queries.ts";
import { o as baseBuilder } from "../builder.ts";
import { apiKeyAuth, usageMiddleware } from "../public-middleware.ts";

export const regionsClassify = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("regions.classify"))
	.route({
		method: "GET",
		path: "/api/v1/regions",
		summary: "Classify a coordinate into administrative regions",
		tags: ["regions"],
	})
	.input(
		// GET query params arrive as strings — coerce like every other GET handler.
		// Bare z.number() makes the OpenAPI handler reject every request with 400.
		z.object({
			lat: z.coerce.number().min(-90).max(90),
			lng: z.coerce.number().min(-180).max(180),
			layers: z.string().optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const { lat, lng } = input;
		const layers = parseLayers(input.layers);
		const rows = await regionsContainingPoint(context.db, lat, lng, layers);
		return { query: { lat, lng }, regions: groupRegionsByLayer(rows) };
	});
```

> Note: unlike `zones.*`, this endpoint is NOT project-scoped (regions are global reference data), so there is no `requireProjectId` call. `apiKeyAuth` is still required for auth + usage metering. `usageMiddleware` takes a plain string key — no enum to update.

- [ ] **Step 2: Register the endpoint in the public router**

In `packages/api/src/routers/public-http.ts`:

Add an import near the other `./public/*` imports:

```ts
import { regionsClassify } from "./public/regions.ts";
```

Add a `regions` group to the `publicHttpRouter` object (place it after the `zones` block):

```ts
	regions: {
		classify: regionsClassify,
	},
```

- [ ] **Step 3: Type-check the API package**

Run: `pnpm --filter @locnative/api typecheck`
Expected: PASS (no type errors; `publicHttpRouter` includes the new `regions.classify`).

- [ ] **Step 4: Run the API test suite**

Run: `pnpm --filter @locnative/api test`
Expected: PASS (existing tests + the Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/public/regions.ts packages/api/src/routers/public-http.ts
git commit -m "feat(api): add regions.classify endpoint"
```

---

## Task 4: API explorer live-proxy allowlist

**Files:**
- Modify: `packages/api/src/routers/domains/api-explorer.ts`

The explorer only proxies GET endpoints listed in its `endpointMap`. `regions.classify` is GET, so add it.

- [ ] **Step 1: Add the id to the local union**

In `packages/api/src/routers/domains/api-explorer.ts`, extend the `ApiEndpointId` union (the one declared in this file) — add after `"webhooks.list"`:

```ts
	| "regions.classify"
```

- [ ] **Step 2: Add the endpointMap entry**

In the same file, add a new entry to the `endpointMap` Map (place it after the `zones.addresses` entry):

```ts
	[
		"regions.classify",
		{
			id: "regions.classify",
			method: "GET",
			path: "/api/v1/regions",
			params: [{ name: "lat" }, { name: "lng" }, { name: "layers" }],
		},
	],
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @locnative/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/domains/api-explorer.ts
git commit -m "feat(api): allow regions.classify in api explorer proxy"
```

---

## Task 5: ASGS boundary ingestion script

**Files:**
- Create: `packages/database/scripts/ingest-asgs.ts`
- Create: `packages/database/scripts/README-asgs.md`

This is an operational one-off/repeatable script, never run in the request path. It shells out to `ogr2ogr` (GDAL) to load each ASGS layer into `regions`. It requires `DATABASE_URL` and a local GDAL install.

- [ ] **Step 1: Write the ingestion driver**

Create `packages/database/scripts/ingest-asgs.ts`:

```ts
import { execFileSync } from "node:child_process";
import { argv, env, exit } from "node:process";

type LayerSpec = {
	/** Our `regions.layer` code. */
	layer: string;
	/** Path to the source GeoPackage/shapefile for this layer. */
	source: string;
	/** Source field holding the official code. */
	codeField: string;
	/** Source field holding the human name. */
	nameField: string;
	/** Source field holding the parent state abbreviation (or null). */
	stateField: string | null;
};

// Field names follow ABS ASGS Edition 3 GeoPackage attribute schemas.
const LAYERS: Record<string, LayerSpec> = {
	state: {
		layer: "state",
		source: "data/asgs/STE_2021_AUST_GDA2020.gpkg",
		codeField: "STE_CODE21",
		nameField: "STE_NAME21",
		stateField: "STE_NAME21",
	},
	sa1: {
		layer: "sa1",
		source: "data/asgs/SA1_2021_AUST_GDA2020.gpkg",
		codeField: "SA1_CODE21",
		nameField: "SA1_CODE21",
		stateField: "STE_NAME21",
	},
	sa2: {
		layer: "sa2",
		source: "data/asgs/SA2_2021_AUST_GDA2020.gpkg",
		codeField: "SA2_CODE21",
		nameField: "SA2_NAME21",
		stateField: "STE_NAME21",
	},
	sa3: {
		layer: "sa3",
		source: "data/asgs/SA3_2021_AUST_GDA2020.gpkg",
		codeField: "SA3_CODE21",
		nameField: "SA3_NAME21",
		stateField: "STE_NAME21",
	},
	sa4: {
		layer: "sa4",
		source: "data/asgs/SA4_2021_AUST_GDA2020.gpkg",
		codeField: "SA4_CODE21",
		nameField: "SA4_NAME21",
		stateField: "STE_NAME21",
	},
	lga: {
		layer: "lga",
		source: "data/asgs/LGA_2021_AUST_GDA2020.gpkg",
		codeField: "LGA_CODE21",
		nameField: "LGA_NAME21",
		stateField: "STE_NAME21",
	},
	poa: {
		layer: "poa",
		source: "data/asgs/POA_2021_AUST_GDA2020.gpkg",
		codeField: "POA_CODE21",
		nameField: "POA_NAME21",
		stateField: null,
	},
	ced: {
		layer: "ced",
		source: "data/asgs/CED_2021_AUST_GDA2020.gpkg",
		codeField: "CED_CODE21",
		nameField: "CED_NAME21",
		stateField: "STE_NAME21",
	},
	sed: {
		layer: "sed",
		source: "data/asgs/SED_2021_AUST_GDA2020.gpkg",
		codeField: "SED_CODE21",
		nameField: "SED_NAME21",
		stateField: "STE_NAME21",
	},
	mb: {
		layer: "mb",
		source: "data/asgs/MB_2021_AUST_GDA2020.gpkg",
		codeField: "MB_CODE21",
		nameField: "MB_CODE21",
		stateField: "STE_NAME21",
	},
};

function ingestLayer(spec: LayerSpec, dbUrl: string): void {
	const stateExpr = spec.stateField ? spec.stateField : "NULL";
	// Select into our column shape, force MultiPolygon, reproject to EPSG:4326.
	const sql = `SELECT ${spec.codeField} AS code, ${spec.nameField} AS name, ${stateExpr} AS state, '${spec.layer}' AS layer FROM "${layerNameFromSource(spec.source)}"`;

	// Idempotent: clear this layer first.
	execFileSync(
		"psql",
		[dbUrl, "-c", `DELETE FROM regions WHERE layer = '${spec.layer}';`],
		{ stdio: "inherit" }
	);

	execFileSync(
		"ogr2ogr",
		[
			"-f",
			"PostgreSQL",
			`PG:${dbUrl}`,
			spec.source,
			"-nln",
			"regions",
			"-append",
			"-t_srs",
			"EPSG:4326",
			"-nlt",
			"MULTIPOLYGON",
			"-makevalid",
			"-dialect",
			"SQLITE",
			"-sql",
			sql,
			"-lco",
			"GEOMETRY_NAME=geom",
		],
		{ stdio: "inherit" }
	);
}

function layerNameFromSource(source: string): string {
	const file = source.split("/").pop() ?? source;
	return file.replace(/\.gpkg$/i, "");
}

function main(): void {
	const dbUrl = env.DATABASE_URL;
	if (!dbUrl) {
		// biome-ignore lint/suspicious/noConsole: CLI script
		console.error("DATABASE_URL is required.");
		exit(1);
	}
	// Optional layer filter: `node ingest-asgs.ts sa2 lga` ingests a subset.
	const requested = argv.slice(2);
	const chosen =
		requested.length > 0
			? requested.filter((l) => l in LAYERS)
			: Object.keys(LAYERS);
	for (const key of chosen) {
		// biome-ignore lint/suspicious/noConsole: CLI script progress
		console.log(`Ingesting layer: ${key}`);
		ingestLayer(LAYERS[key], dbUrl);
	}
	// biome-ignore lint/suspicious/noConsole: CLI script
	console.log(`Done. Layers ingested: ${chosen.join(", ")}`);
}

main();
```

> The GeoPackage attribute field names above follow ABS ASGS Edition 3 (`*_CODE21` / `*_NAME21`). If a downloaded layer uses different field names, run `ogrinfo -so <file.gpkg>` to confirm and adjust the `LayerSpec`.

- [ ] **Step 2: Write the README**

Create `packages/database/scripts/README-asgs.md`:

```markdown
# ASGS boundary ingestion

Loads ABS ASGS Edition 3 (2021) administrative boundaries into the `regions` table.

## Prerequisites
- GDAL (`ogr2ogr`, `ogrinfo`) and `psql` installed locally.
- `DATABASE_URL` set to the target Postgres (PostGIS enabled).

## Data sources (CC-BY 4.0, attribute to the ABS)
Download the GeoPackage for each layer from the ABS ASGS Edition 3 downloads
page (https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3)
and place the `.gpkg` files under `packages/database/scripts/data/asgs/`:

| layer | file |
|-------|------|
| state | STE_2021_AUST_GDA2020.gpkg |
| sa1   | SA1_2021_AUST_GDA2020.gpkg |
| sa2   | SA2_2021_AUST_GDA2020.gpkg |
| sa3   | SA3_2021_AUST_GDA2020.gpkg |
| sa4   | SA4_2021_AUST_GDA2020.gpkg |
| lga   | LGA_2021_AUST_GDA2020.gpkg |
| poa   | POA_2021_AUST_GDA2020.gpkg |
| ced   | CED_2021_AUST_GDA2020.gpkg |
| sed   | SED_2021_AUST_GDA2020.gpkg |
| mb    | MB_2021_AUST_GDA2020.gpkg  |

## Run
Light subset (fast, good for local dev):
    DATABASE_URL=... pnpm --filter @locnative/database exec tsx scripts/ingest-asgs.ts state sa4 lga poa

Full ingest (mb + sa1 are large, ~430k polygons total):
    DATABASE_URL=... pnpm --filter @locnative/database exec tsx scripts/ingest-asgs.ts

Re-running a layer is safe — each layer is deleted before reload.
```

- [ ] **Step 3: Verify a light ingest (manual)**

With GDAL installed and the `state`/`sa4`/`lga`/`poa` GeoPackages downloaded, run:

```bash
DATABASE_URL=$DATABASE_URL pnpm --filter @locnative/database exec tsx scripts/ingest-asgs.ts state sa4 lga poa
```

Then verify counts and a sample classification with `psql`:

```bash
psql "$DATABASE_URL" -c "SELECT layer, count(*) FROM regions GROUP BY layer ORDER BY layer;"
psql "$DATABASE_URL" -c "SELECT layer, code, name FROM regions WHERE ST_Covers(geom, ST_SetSRID(ST_MakePoint(144.9631, -37.8136), 4326));"
```

Expected: non-zero counts per ingested layer; the second query returns Victoria + the Melbourne LGA + postcode 3000 for the central-Melbourne coordinate.

> If GDAL/data are not available in this environment, mark this step as a follow-up ops task and proceed — Tasks 6–8 do not depend on ingested data, and the endpoint returns `{ regions: {} }` until data is loaded.

- [ ] **Step 4: Commit**

```bash
git add packages/database/scripts/ingest-asgs.ts packages/database/scripts/README-asgs.md
git commit -m "feat(db): add ASGS boundary ingestion script"
```

---

## Task 6: API explorer catalog entry (frontend)

**Files:**
- Modify: `apps/web/src/lib/api-explorer-endpoints.ts`

- [ ] **Step 1: Add the id to the catalog union**

In `apps/web/src/lib/api-explorer-endpoints.ts`, extend `ApiEndpointId` — add a new commented group after the `// Webhooks` block:

```ts
	// Regions
	| "regions.classify"
```

- [ ] **Step 2: Add the catalog entry**

Append a new object to the `apiExplorerEndpoints` array (after the last zones/webhooks entry):

```ts
	{
		id: "regions.classify",
		method: "GET",
		path: "/api/v1/regions",
		summary: "Classify a coordinate into administrative regions",
		description:
			"Returns the official ABS/ASGS administrative regions that contain a coordinate — state, SA1–SA4, LGA, postcode (POA), electoral divisions, and mesh block. Results are keyed by layer. Optionally filter with the `layers` parameter.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude (-90 to 90)",
				example: "-37.8136",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude (-180 to 180)",
				example: "144.9631",
			},
			{
				name: "layers",
				type: "string",
				required: false,
				description:
					"Comma-separated layer filter (state,sa1,sa2,sa3,sa4,lga,poa,ced,sed,mb). Omit to return all layers.",
				example: "sa2,lga,poa",
			},
		],
	},
```

- [ ] **Step 3: Type-check the web app**

Run: `pnpm --filter @locnative/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-explorer-endpoints.ts
git commit -m "feat(web): add regions.classify to api explorer catalog"
```

---

## Task 7: Docs page "Regions" section

**Files:**
- Modify: `apps/web/src/components/docs-page.tsx`

This file drives the docs sidebar + endpoint reference. Mirror the existing "Zones" entries' field shape exactly (the file defines `DocsSectionGroup { items, label }` and `DocsSectionLink { href, title }` for the nav, and an endpoint-section object array for content).

- [ ] **Step 1: Add the sidebar nav group**

Locate the array of `DocsSectionGroup` objects (the sidebar groups, where "Zones", "Devices", "Webhooks" are defined). Add a new group after "Webhooks":

```ts
		{
			label: "Regions",
			items: [{ title: "Classify Coordinate", href: "#regions-classify" }],
		},
```

- [ ] **Step 2: Add the endpoint reference section**

Locate the endpoint-section array (the objects that render each endpoint's `path`/`summary`/`params`/curl). Add an entry mirroring the existing zones entries' field names, anchored to `#regions-classify`:

```ts
		{
			title: "Classify Coordinate",
			href: "#regions-classify",
			path: "/api/v1/regions",
			method: "GET",
			summary:
				"Return the administrative regions that contain a coordinate.",
			description:
				"Classifies a latitude/longitude into the official ABS/ASGS regions that contain it — state, SA1–SA4, LGA, postcode, electoral divisions, and mesh block — keyed by layer. Outside Australia the `regions` object is empty.",
			curl: `curl "https://api.locnative.com/api/v1/regions?lat=-37.8136&lng=144.9631" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
		},
```

> If the existing section objects include additional fields (e.g. `params`, `response`, code-sample variants), copy those field names from the adjacent "Zone Contains" entry and fill them with the region equivalents (params: `lat`, `lng`, optional `layers`; response: the keyed-by-layer object from the spec §7). Do not invent new field names — match the file's existing shape.

- [ ] **Step 3: Type-check + verify the docs route renders**

Run: `pnpm --filter @locnative/web typecheck`
Expected: PASS.

Then run the web dev server and open `/docs`; confirm the "Regions → Classify Coordinate" entry appears in the sidebar and scrolls to the new section.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/docs-page.tsx
git commit -m "docs(web): add Regions classify section to API docs"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Lint the whole change set**

Run: `pnpm dlx ultracite check`
Expected: no errors in the new/modified files (fix with `pnpm dlx ultracite fix` if needed, then re-commit).

- [ ] **Step 2: Type-check all packages**

Run: `pnpm --filter @locnative/api typecheck && pnpm --filter @locnative/web typecheck`
Expected: PASS.

- [ ] **Step 3: Run the full API test suite**

Run: `pnpm --filter @locnative/api test`
Expected: PASS.

- [ ] **Step 4: Smoke-test the endpoint locally (after ingestion)**

With the dev server running and a valid API key, and at least the light layer subset ingested (Task 5):

```bash
curl "http://localhost:PORT/api/v1/regions?lat=-37.8136&lng=144.9631" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `200` with a `regions` object containing at least `state` and `lga`. A coordinate in the ocean (e.g. `lat=0&lng=0`) returns `200` with `"regions": {}`.

- [ ] **Step 5: Final commit (if lint/fix changed anything)**

```bash
git add -A
git commit -m "chore: lint pass for regions classification"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §2 polygon-ingestion approach → Tasks 1, 5 ✅
- §3 all ASGS layers → Task 5 `LAYERS` map + Task 2 `REGION_LAYERS` ✅
- §4 data model (table, columns, indexes, global/not project-scoped) → Task 1 ✅
- §5 ingestion pipeline (ogr2ogr, idempotent, subset mode, README) → Task 5 ✅
- §6 query helper `regionsContainingPoint` → Task 2 ✅
- §7 endpoint (GET, z.coerce, keyed-by-layer, layers filter, 200-empty for no region) → Tasks 2 (grouping) + 3 (endpoint) ✅
- §8 surfacing (explorer catalog, proxy allowlist, docs, usage) → Tasks 4, 6, 7 (usage = plain string in Task 3) ✅
- §9 tests → Task 2 (pure) + Task 8 (smoke) ✅
- §10 out-of-scope items not implemented ✅

**Type consistency:** `REGION_LAYERS`, `RegionLayer`, `RegionRow`, `parseLayers`, `groupRegionsByLayer`, `regionsContainingPoint` names are identical across Tasks 2 and 3. The `regions.classify` id string matches across endpoint, proxy allowlist, and catalog. `layer` codes are identical between `REGION_LAYERS` (Task 2) and the ingestion `LAYERS` map (Task 5).

**Placeholder scan:** No TBD/TODO. The only soft spots are deliberate and bounded: ASGS field names (verifiable via `ogrinfo`) and docs-page section field shape (instructed to mirror the adjacent zones entry). Both are flagged inline with exact verification commands.
