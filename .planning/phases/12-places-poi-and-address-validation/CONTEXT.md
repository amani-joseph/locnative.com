# Phase 12 Context — Places/POI + Address Validation

## Goal

Move Locnative beyond addresses into two new product surfaces that AU competitors
(Mapbox/Google) under-serve for Australia:

1. **POI / category search** (Radar Places parity) — `/api/v1/places/search` with text +
   category filters and ranked results, backed by an ingested AU POI dataset.
2. **G-NAF-canonical address validation** — `/api/v1/addresses/validate` returns a
   corrected / standardised address plus a confidence score, scored against the canonical
   G-NAF `addresses` table.

Both endpoints must **reuse the existing tiered search machinery** (Phase 5) rather than
inventing new ranking. SDK gets a `places` resource and `addresses.validate`.

## Phase 5 dependency (tiered search — what exists today)

The ranking engine lives in **`packages/database/src/queries/autocomplete.ts`**
(`autocompleteAddresses()`), and is the canonical example to reuse. It is a **pure query
module** (no env/middleware imports) so it stays unit-testable. It implements a length-tiered
fuzzy search over the `addresses.search_text` column:

| Tier | Trigger | Technique | `similarity_score` |
|---|---|---|---|
| Prefix | very short input (`len <= PREFIX_SEARCH_MAX_LEN=4`) | bare `LIKE prefix%` on `search_text` | `1.0` |
| Tier 2 | `4 < len < WIDE_FUZZY_MIN_LEN=8` | pg_trgm `search_text % q` (`similarity()`); Levenshtein `<= 1` fallback | `similarity()` / `0.5` |
| Tier 3 | `len >= 8` | pg_trgm `search_text <% q` (`word_similarity()`); Levenshtein `<= 2` + `dmetaphone` phonetic fallbacks | `word_similarity()` / `0.5` / `0.3` |

Key constants: `TRIGRAM_SIMILARITY_THRESHOLD = 0.3` (set per-query via `SELECT set_limit(...)`),
`LEVENSHTEIN_SHORT_MAX_DISTANCE = 1`, `LEVENSHTEIN_LONG_MAX_DISTANCE = 2`,
`PREFIX_SEARCH_MAX_LEN = 4`, `WIDE_FUZZY_MIN_LEN = 8`.

Ranking helpers reused by all tiers:
- `buildWhereClause(matchExpr, filters)` — composes the fuzzy match with country/state/locality
  equality filters.
- `buildOrderBy(latitude, longitude)` — when caller passes a proximity point, results are
  reordered by `geom <-> point` distance (KNN) **after** the fuzzy match narrows candidates;
  otherwise ordered by `similarity_score DESC` then `population_score`/`admin_level`.
- `SELECT_COLUMNS` / `formatStreetAddress()` — reconstruct a display `formattedAddress` from
  G-NAF parts (see `address-label.ts` below).

The Postgres extensions backing this (`pg_trgm`, `fuzzystrmatch` for `levenshtein`/`dmetaphone`,
GiST trigram index on `search_text`) were installed by migration
`drizzle/0009_tiered_search_extensions.sql` + `0004_autocomplete_search.sql`. **POI search and
validation must reuse these same extensions and the same tier helpers** — do not re-derive
similarity logic.

The public oRPC endpoint `forwardGeocode` (`packages/api/src/routers/public/geocode.ts`) is the
reference wiring: zod input (discriminated union `structured` true/false), `usageMiddleware`,
`apiKeyAuth`, OpenAPI `route` metadata, then it delegates ranking to `autocompleteAddresses`.
The query-string assembly is split into the pure `geocode-query.ts` (`buildGeocodeQuery`) for
testability — mirror that split for places/validate.

`packages/api/src/shared/address-label.ts` (`buildAddressLabel` / `addressLabelParts`) is the
single source of truth for turning G-NAF parts into a `formattedAddress` string. Validation's
"standardised address" output MUST be produced by this function so it matches geocode output.

`packages/api/src/shared/batch-geocode.ts` provides `MAX_BATCH_ADDRESSES` and the batch-job
plumbing — relevant only if we later add batch validation (out of scope this phase).

## G-NAF schema facts (verified — `packages/database/src/schema/addresses.ts`)

The canonical AU address table is **`addresses`** (~5.6M rows). Columns relevant to validation:

- Identity / canonical: `id` (identity PK), `gnafPid` (`gnaf_pid`, varchar 30 — the canonical
  G-NAF persistent identifier), `confidence` (integer — G-NAF's own confidence level).
- Parts: `country` (2), `state` (10), `locality`, `postcode` (10), `streetName`, `streetType`,
  `streetSuffix`, `buildingName`, `flatType`/`flatNumber`, `levelType`/`levelNumber`,
  `numberFirst`, `numberLast`.
- Geo: `longitude`, `latitude` (real), `geom geometry(Point,4326)` (custom Drizzle type).
- Search/ranking: `searchText` (`search_text` — the concatenated normalised string the tiers
  match against), `populationScore`, `adminLevel`.
- Indexes: btree on country/state/postcode/locality/street/gnaf_pid; **GiST `idx_addresses_geom`
  on `geom`**, plus **GiST `idx_addresses_geom_geography` on `(geom::geography)`** (the latter
  exists specifically so `ST_DWithin(geom::geography, point, meters)` proximity queries use an
  index instead of a 5.6M-row seq scan — ~130-220ms vs 15-48s).

Migrations live in **`packages/database/drizzle/`** (drizzle-kit journal, latest `0012_*`). Per
project memory the lineage was consolidated; **never hand-write out-of-journal `.sql`** — run
`drizzle-kit generate` from the schema change. Next migration number is `0013`.

## Existing ingestion precedent

`scripts/import-gnaf.ts` (repo root) already ingests the G-NAF dataset into `addresses` — use it
as the structural template for the POI importer (streamed parse → normalise → batch upsert).

## GOTCHAS (carry into every plan)

- **neon-http has NO transactions.** `db.transaction()` throws on the neon-http driver. POI
  ingestion must be **batch-idempotent** — chunked `INSERT ... ON CONFLICT DO UPDATE` keyed on a
  stable natural key (e.g. OSM `type:id`), never `FOR UPDATE` / multi-statement transactions.
- **oRPC GET params need `z.coerce`.** `/places/search` and `/addresses/validate` are GET
  endpoints; numeric/boolean query params (lat, lng, limit, radius) must use `z.coerce.number()`
  not bare `z.number()`, or they 400. (This previously broke `zones.contains`.)
- **Workers `fetch` illegal invocation** — if any ingestion runs in-Worker and passes
  `globalThis.fetch` by reference, bind it. (Ingestion is expected to run as a Node script, not
  in-Worker, so likely N/A — but note it.)

## SDK facts (verified — `packages/sdk/src/`)

- Resources are factory functions: `createAddresses(request: Requester): AddressesResource`
  returning an object of methods; each method calls `request<T>({ method, path, query })`.
- `client.ts` imports each `createX` and assembles `LocnativeClient` in `createLocnativeClient`
  (`addresses: createAddresses(request)`, etc.). A new `places` resource gets registered here.
- Tests (`*.test.ts`) use a `vi.fn()` mock as the `request` and assert the exact
  `{ method, path, query }` shape — e.g. `addresses.test.ts` asserts
  `path: "/api/v1/addresses/autocomplete"`. New tests mirror this; no live HTTP.

## Decisions (locked unless flagged OPEN)

| Decision | Choice | Rationale |
|---|---|---|
| POI source | **OpenStreetMap (AU extract via Geofabrik `australia-latest.osm.pbf`)** | ODbL-licensed, free, comprehensive AU coverage, no per-call cost; attribution requirement is manageable. Licensed (Foursquare) deferred. |
| POI storage | New **`places`** table in Postgres + PostGIS, mirroring `addresses` patterns (`geom geometry(Point,4326)`, GiST geom + geography indexes, `search_text` + pg_trgm index, `population_score`) | Lets `/places/search` reuse the exact tier helpers and proximity KNN. |
| POI ranking | **Reuse `autocompleteAddresses` tier engine**, generalised to accept a target table/columns, or a sibling `searchPlaces()` built from the same `buildWhereClause`/`buildOrderBy`/tier constants | Criterion: ranked results without re-deriving similarity. |
| Category taxonomy | **Fixed top-level taxonomy** (~12-15 categories: food-drink, retail, accommodation, transport, health, education, finance, leisure, services, government, religious, automotive…) with an **OSM tag→category mapping table** | Radar/Foursquare-style; stored as a `category` enum/varchar column + optional `categories[]` for multi-tag POIs. |
| Validation confidence | Composite **0.0–1.0 score**: (a) tier/match score of the best G-NAF candidate, (b) component agreement (street #, street, locality, postcode, state each matched vs corrected), (c) presence of a `gnaf_pid`. Buckets surfaced as `verified` / `corrected` / `partial` / `unverified`. | Criterion 3 needs a confidence score; scoring leans on existing `similarity_score` + part-level comparison. |
| Validate input | GET, structured (`street`,`locality`,`state`,`postcode`,`country`) OR freeform `q` — same discriminated-union shape as `forwardGeocode` | Consistency + reuse of `buildGeocodeQuery`. |

## OPEN questions (resolve in discuss/plan)

1. **OSM extraction pipeline**: planet/AU PBF parsed locally (osmium/`osmtogeojson`) vs Overpass
   API. PBF is more reproducible for ~millions of POIs; Overpass is rate-limited. Leaning PBF.
2. **`places` ranking integration**: parameterise `autocompleteAddresses` (risk: regressing
   geocode) vs extract shared tier primitives into a `tiered-search.ts` helper consumed by both.
   Leaning extract-shared-primitives to avoid touching the geocode hot path.
3. **Category model**: single `category` + free `tags` jsonb, vs normalised `place_categories`
   join. Single column + jsonb is simpler and matches neon-http idempotent-upsert constraints.
4. **Validation correction granularity**: do we auto-correct misspelled localities/streets via
   the fuzzy tiers, or only standardise casing/format of an exact match? Affects confidence
   buckets. Leaning: fuzzy-correct but downgrade confidence to `corrected` when parts changed.
5. **Confidence weighting**: exact numeric weights for the composite score (a/b/c) need a small
   labelled eval set — flag as a verification sub-task, not a blocker.
6. **POI dataset size / Neon cost**: AU OSM POIs are ~2-4M rows; confirm Neon storage headroom
   alongside the 5.6M `addresses` rows before bulk load.

## Out of scope

- Batch places/validate jobs (reuse `batch-geocode` later if demanded).
- Licensed POI data (Foursquare/Google) — OSM only this phase.
- Frontend / API-explorer UI for the new endpoints (docs-only until a later phase).
- Python SDK additions.

## Key files

- `packages/database/src/queries/autocomplete.ts` — tier engine to reuse / extract from.
- `packages/database/src/schema/addresses.ts` — G-NAF schema + PostGIS index patterns to mirror.
- `packages/database/drizzle/` — migration journal (next: `0013`); use `drizzle-kit generate`.
- `packages/api/src/routers/public/geocode.ts` + `geocode-query.ts` — endpoint wiring reference.
- `packages/api/src/shared/address-label.ts` — canonical `formattedAddress` builder.
- `scripts/import-gnaf.ts` — ingestion structural template.
- `packages/sdk/src/resources/addresses.ts`, `packages/sdk/src/client.ts` — SDK patterns.
