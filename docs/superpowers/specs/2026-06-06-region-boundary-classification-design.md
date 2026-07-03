# Region / Boundary Classification API — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Phase goal:** Add an endpoint that classifies a coordinate into the official
Australian administrative regions that contain it, closing the most-cited gap vs
Radar ("Regions") and mappify ("classify coordinates").

---

## 1. Problem & motivation

locnative.com today offers geocoding (forward/reverse/autocomplete/nearby),
user-drawn **zones** (custom geofences), devices, boundary-crossings, and
webhooks. It has **no way to map a coordinate onto *official* administrative
boundaries** — ABS Statistical Areas, LGAs, postcodes, or electoral divisions.

Both competitors expose this as a headline capability:
- **Radar** → "Regions" (country / state / postal-code detection).
- **mappify** → "Area Lookups / Classify Coordinates" (LGA, postcode, ABS SA units).

This phase delivers a true point-in-polygon classification endpoint over ingested
ABS ASGS boundaries.

## 2. Approach (decided)

**Ingest official ABS boundary polygons into PostGIS and classify via
`ST_Contains`.** Rejected alternative: deriving region from the nearest G-NAF
address (only yields state/locality/postcode, is approximate, and breaks for
coordinates with no nearby address). Polygon ingestion works for **any**
coordinate in Australia and supports all ASGS layers.

The stack already supports this: PostGIS is live on Neon, `addresses.geom` is
`geometry(Point,4326)` with a GiST index, and `zones` already do point-in-polygon
via `ST_Contains(geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))`.

## 3. Coverage (v1 layers)

Full ASGS Edition 3 (2021, valid Jul 2021 – Jun 2026):

| layer code | layer | approx polygons | notes |
|---|---|---|---|
| `state` | State / Territory | 8 | cheap, always returned |
| `sa1` | Statistical Area 1 | ~61,000 | heavy |
| `sa2` | Statistical Area 2 | ~2,500 | |
| `sa3` | Statistical Area 3 | ~360 | |
| `sa4` | Statistical Area 4 | ~90 | |
| `lga` | Local Government Area | ~560 | high ops value |
| `poa` | Postal Area (postcode) | ~2,600 | high ops value |
| `ced` | Commonwealth Electoral Division | ~150 | |
| `sed` | State Electoral Division | ~400 | |
| `mb`  | Mesh Block | ~360,000 | heaviest; most granular |

Total ≈ 430,000 polygons. Mesh Blocks + SA1 dominate ingestion time; GiST keeps
query latency flat regardless of row count.

## 4. Data model

New **global reference table** `regions` (NOT project-scoped — unlike `zones`).
File: `packages/database/src/schema/regions.ts`.

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `layer` | varchar | one of the layer codes in §3 |
| `code` | varchar | official ASGS code |
| `name` | text | official name |
| `state` | varchar (nullable) | parent state, for filtering |
| `attrs` | jsonb | parent codes, area, ASGS edition/year |
| `geom` | `geometry(MultiPolygon,4326)` | boundaries are multipolygons (islands) |

Indexes:
- GiST on `geom` (`using("gist", table.geom)`)
- btree on `layer`
- btree on `code`

Drizzle migration generated via the existing migration workflow
(`packages/database/drizzle/*`). The custom `geometry` type follows the existing
pattern in `addresses.ts` / `zones.ts` (returning `geometry(MultiPolygon, 4326)`).

## 5. Ingestion pipeline

File: `packages/database/scripts/ingest-asgs.ts` (+ a README documenting the run).

- **Source:** ABS ASGS Edition 3 GeoPackage / shapefiles, licensed CC-BY 4.0
  (open). Attribution recorded in `attrs` and project docs.
- **Mechanism (recommended):** `ogr2ogr` loading each layer directly into Neon
  Postgres, mapping native fields → (`layer`, `code`, `name`, `state`, `geom`),
  reprojecting to EPSG:4326. One invocation per layer.
- **Idempotency:** truncate-by-layer then reload (`DELETE FROM regions WHERE
  layer = $1` → insert), so re-running a layer is safe.
- **Out of the request path:** a one-off / repeatable operational script, never
  invoked at runtime. Document the exact commands and source URLs in the README.
- Heavy layers (`mb`, `sa1`) called out as long-running; allow ingesting a
  subset of layers via a CLI arg so devs can seed a light dataset locally.

## 6. Query helper

File: `packages/api/src/shared/region-queries.ts`.

```ts
regionsContainingPoint(db, lat, lng, layers?)
// SELECT layer, code, name, state
// FROM regions
// WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
//   [AND layer = ANY(layers)]
```

Returns rows grouped into a keyed-by-layer object (see §7). Exactly one polygon
per layer normally contains a point, so the per-layer value is a single object.

## 7. Endpoint

File: `packages/api/src/routers/public/regions.ts`. Procedure id `regions.classify`.

- **Method/path:** `GET /api/v1/regions`
- **Middleware:** `apiKeyAuth` + `usageMiddleware("regions.classify")`
- **Input (GET → strings, must coerce):**
  ```ts
  z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    layers: z.string().optional(), // csv e.g. "sa2,lga,poa"
  })
  ```
  > ⚠️ Bare `z.number()` makes the oRPC OpenAPI handler reject every request with
  > 400 — GET params arrive as strings. Use `z.coerce` (same gotcha as
  > `zones.contains`).
- **Response — keyed-by-layer object (approved):**
  ```json
  {
    "query": { "lat": -37.81, "lng": 144.96 },
    "regions": {
      "state": { "code": "2", "name": "Victoria" },
      "sa2":   { "code": "206041122", "name": "Melbourne" },
      "sa3":   { "code": "20604", "name": "Melbourne City" },
      "lga":   { "code": "24600", "name": "Melbourne (C)" },
      "poa":   { "code": "3000", "name": "3000" }
    }
  }
  ```
- **No region (outside AU / no coverage):** `200` with `"regions": {}`. A point
  with no containing polygon is a valid answer, not a `404`.
- **Layer filter:** `?layers=sa2,lga` restricts both the query and the response
  keys. Unknown layer codes are ignored (not an error).
- **Registration:** export from `routers/index.ts` and wire into
  `public-http.ts` like the other public procedures.

## 8. Surfacing (parity with existing endpoints)

- **API explorer catalog** (`apps/web/src/lib/api-explorer-endpoints.ts`): add a
  `regions.classify` entry under a new "Regions" group with `lat`/`lng`/`layers`
  params and an example.
- **Backend GET allowlist** (`endpointMap` in the api-explorer proxy): add
  `regions.classify` so the explorer can execute it live (it is GET).
- **Docs page** (`apps/web/src/components/docs-page.tsx`): new "Regions" section
  with curl + client examples, mirroring existing sections.
- **Usage metering:** add `regions.classify` to the usage/endpoint enum consumed
  by `usageMiddleware`.

## 9. Tests

File: `packages/api/src/routers/public/regions.test.ts`.

- Known coordinate (e.g. central Melbourne) → returns expected `state`, `sa2`,
  `lga`, `poa` codes.
- Coordinate in the ocean / outside AU → `200`, `regions: {}`.
- `layers` filter returns only requested layers.
- Missing or invalid `lat`/`lng` → `422` (schema rejection).
- Pure helper (`regionsContainingPoint`) unit-tested against a seeded fixture
  region or mocked SQL, consistent with how `zones`/`geocode` tests are
  structured.

## 10. Out of scope (v1)

- Non-Australian coverage.
- Returning polygon geometry in the response (codes + names only).
- Reverse lookup (region → contained addresses) — `zones.addresses` already
  covers the project-scoped analog; an ABS-region variant can be a later phase.
- Caching layer / CDN edge caching of classifications.

## 11. Risks & notes

- **Ingestion volume:** ~430k polygons. Run ingestion from a workstation via
  `ogr2ogr` against Neon; do not attempt from a Worker. Provide a light-subset
  mode for local dev.
- **Data licensing:** ASGS boundaries are CC-BY 4.0; record attribution. G-NAF
  (address data) is separate and unaffected.
- **Data freshness:** ASGS Edition 3 is valid through Jun 2026. Store the edition
  in `attrs` so a future re-ingest is auditable.
- **Geometry validity:** ABS polygons are generally valid; run `ST_MakeValid`
  during ingestion if any layer reports invalid geometries.
