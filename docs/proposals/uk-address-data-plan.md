# UK (GB) Address Data — Free-Source Ingestion Plan

**Status:** LOADED TO PROD 2026-06-23 · **Date:** 2026-06-21 · **Author:** Joseph Amani (+ Claude)

## Load status — DONE 2026-06-23 (prod `neondb` @ ep-muddy-cake-a72eh7us-pooler.ap-southeast-2)

GB went from 0 → **8,557,377 rows**, 0 null geoms:

| source | rows | what |
|---|---:|---|
| `OSM` (NULL) | 5,782,574 | house-number addresses (Phase 1) |
| `OS_CODEPOINT` | 1,747,841 | postcode-unit centroids (Phase 2) |
| `OS_OPENNAMES` | 1,026,962 | streets + populated places (Phase 2) |

Notes:
- **Phase-0 sizing was an overcount.** `osmium fileinfo` on the tags-filtered PBF
  counts geometry-support nodes too — actual distinct GB OSM addresses = ~5.78M, not
  the ~24.7M reported below. (The Phase-0 table is left as-is for the record.)
- The `source` column was added to prod via a direct
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS source text` (migration 0015 lived
  only in this then-unpushed branch). **Reconciled 2026-06-24:** inserted the 0015
  bookkeeping row into `drizzle.__drizzle_migrations` (created_at=1782204256148), so a
  future `db:migrate` against prod skips 0015 instead of erroring on the existing column.
- Re-loads: `ingest.ts GB --replace` (OSM); `gb-coverage.ts --replace` (OS,
  source-scoped — never touches OSM rows).

**Ranking — FIXED 2026-06-24.** OS coverage rows promoted at `admin_level=5` tied with
real addresses; autocomplete orders `population_score DESC, admin_level ASC` and all GB
`population_score=0`, so `admin_level` is the live tiebreaker. Coverage rows are now
tiered so real addresses (5) win: populated place=6, street=7, postcode=8 — applied to
the 2.77M loaded rows (UPDATE) and baked into `gb-coverage.ts` promote for future loads.
(structured-search needs a house number to match, so coverage rows never surface there.)

**Remaining (optional, deferred):** NI has OSM-only coverage (OGL sources are GB-only);
Phase 3 (UPRN spatial enrichment) — not needed given OSM strength.

## TL;DR

The UK cannot be loaded the way the other 28 countries were. **Overture's address
theme contains 0 GB rows** (verified 2026-06-21 against release `2026-05-20.0`:
`SELECT count(*) … WHERE country='GB'` → 0). The authoritative full-text UK address
files (Royal Mail **PAF**, OS **AddressBase**) are commercial. To get UK data for
free we must build a **dedicated GB pipeline that merges several open datasets**,
each covering a different layer of the address pyramid.

No single free source gives house-number-level address *text* nationwide. We get
there by layering:

1. **OSM** — the only free source of premise-level address *text* (house number +
   street + postcode + coords). Incomplete coverage, but real individual addresses.
2. **OS Open Names + Code-Point Open** — nationwide street and postcode geocoding to
   guarantee 100% postcode/street coverage where OSM has no premises.
3. **OS Open UPRN** (optional) — ~40M property-point coordinates to enrich premise
   coverage via spatial join. Heavy; deferred.

## How this fits the existing pipeline

The intl pipeline (`scripts/intl/`) is adapter-based:
`ingest.ts` (orchestrator) → adapter (`overture` | `oda`) emits a canonical staging
CSV → staged into `addresses_staging` → promoted into `addresses` with `search_text`
+ `geom` built in SQL. A country is registered in
`scripts/intl/lib/source-registry.ts` and loaded from exactly one adapter.

This plan adds **two new adapters** (`osm`, `os-open`) and registers `GB`. The
staging CSV contract, dedup-at-extract pattern, pre/post-flight safety checks, and
`--db`/`--replace`/`--dry-run` semantics are reused unchanged.

Staging CSV columns (unchanged contract):
`source,country,state,locality,postcode,street_name,street_type,street_suffix,
building_name,flat_type,flat_number,level_type,level_number,number_first,
number_last,longitude,latitude,confidence`

GB field mapping decisions:
- `country='GB'`, `state="none"` (→ promotes to NULL) — mirrors the European
  single-level countries. (Optionally map the 4 home nations to `state` later;
  not required for v1.)
- `locality` = post town / city (OSM `addr:city`/`addr:town`/`addr:suburb`;
  OS Open Names populated place).
- `postcode` = `addr:postcode` / OS postcode unit.
- `street_name` = `addr:street` / OS Open Names road name.
- `number_first` = `addr:housenumber`; `building_name` = `addr:housename`.
- Coords: WGS84 (EPSG:4326). **OS data is British National Grid (EPSG:27700)** and
  must be reprojected (`ST_Transform(geom, 27700, 4326)` in DuckDB spatial, or use
  the lat/lon columns OS Open UPRN ships natively).

## Free sources (verified 2026-06-21)

| Source | Gives us | Coverage | Format | Licence |
|---|---|---|---|---|
| **OSM** (Geofabrik `united-kingdom-latest.osm.pbf`, 2.1 GB) | house no. + street + postcode + city + coords | Partial (strong in cities, sparse rural) | PBF | **ODbL** (attribution + share-alike) |
| **OS Open UPRN** (~40M points) | UPRN + coords (no text) | Complete (every addressable location) | CSV / GeoPackage | **OGL** (attribution) |
| **OS Open Names** | streets, settlements, postcodes (no house no.) | Complete street/place | CSV / GeoPackage (GML) | **OGL** |
| **Code-Point Open** (~1.7M postcodes) | postcode-unit centroids | Complete postcodes | CSV | **OGL** |
| **ONS Postcode Directory (ONSPD)** | postcode → lat/lon + admin geog | Complete postcodes | CSV | **OGL** |

Geofabrik UK note: includes Great Britain **and Northern Ireland**, but **not** the
Isle of Man or Channel Islands (use the `britain-and-ireland` extract if those are
needed). OS OpenData (UPRN / Open Names / Code-Point) is **GB only** (no NI) — NI
premise coords would come from OSM + OSNI open data separately if required.

### Licensing — DECIDED 2026-06-21: include OSM (ODbL)

**Decision:** v1 **includes OSM** to get real house-number-level addresses, accepting
ODbL obligations. Required follow-through:
- Add attribution: "© OpenStreetMap contributors" (ODbL) **and** "Contains OS data ©
  Crown copyright and database right 2026" (OGL) wherever the corpus is exposed
  (API docs, attribution endpoint, data downloads).
- Treat the served address DB as an ODbL-affected derived database; keep an
  attribution/licence notice with any bulk export.
- (Permissive G-NAF/Overture data is unaffected; ODbL attaches only to the
  OSM-derived GB rows.)

## Phased plan

### Phase 0 — Decide & size (no DB writes) — COMPLETE 2026-06-21
- [x] Confirm Overture GB = 0 (done — release `2026-05-20.0`, 0 rows).
- [x] Size OSM (Geofabrik `united-kingdom-latest.osm.pbf`, data to 2026-06-19, via
  `osmium tags-filter`).
- [x] Licensing sign-off — **DECIDED: include OSM (ODbL)**, territory **GB + NI**.

**OSM GB+NI sizing results:**

| Tag | nodes | ways | relations | **total** |
|---|---|---|---|---|
| `addr:housenumber` (full individual addresses) | 20,354,289 | 4,344,685 | 3,735 | **~24.7M** |
| `addr:postcode` (anything with a postcode) | 33,203,443 | 6,609,663 | 7,021 | **~39.8M** |

**Takeaway:** OSM coverage is far better than feared — **~24.7M objects carry a house
number**, in the same ballpark as commercial PAF (~31M) and AddressBase (~40M). The
free path delivers near-commercial premise coverage.

Caveats that lower the *distinct* count: (a) some `addr:housenumber` nodes are POIs /
sub-features inside a building that also carries addr tags → same-property
double-count; (b) `way`/`relation` objects need `ST_Centroid` for a point; (c) the
pipeline's existing dedup (window function on locality/street/number/coords) will
collapse further. Realistic promoted distinct addresses: on the order of **~15–20M** —
still excellent, and Phase 2 (OGL Code-Point/Open Names) covers the postcode/street
gaps where OSM has no premise.

**Consequence for the plan:** Phase 1 (OSM) is clearly worth building as the primary
source. Phase 2 becomes a *coverage backstop* rather than a necessity. Phase 3 (UPRN)
is likely unnecessary for launch given OSM's strength.

### Phase 1 — `osm` adapter → individual GB addresses — BUILT & VALIDATED 2026-06-22
- [x] `scripts/intl/adapters/osm.ts` added; registered `GB` (adapter `osm`,
  state `none`) in `source-registry.ts`; dispatch wired in `ingest.ts`.
- **Final toolchain** (the GDAL points/multipolygons-layer idea was dropped — colon
  tag names and a temp SQLite build made it fragile):
  `osmium tags-filter nwr/addr:housenumber` → `osmium export -f geojsonseq`
  (trimmed to addr tags) → strip the RFC 8142 `0x1E` record-separator byte (DuckDB's
  JSON reader rejects it) → one DuckDB pass: `ST_Centroid(ST_GeomFromGeoJSON(...))`
  for the point, pull `addr:*` via `->>'…'`, dedup with the shared window function,
  write the 18-column staging CSV.
- **Validation** (central-London bbox, run through the real adapter, no DB): 4269
  rows, exactly 18 columns, 91% locality / 60% postcode; sample rows correct, e.g.
  `44–46 Aldwych, London, WC2B 4LL`.
- Lint: `ultracite check` clean on all three changed files.
- **Pure surfaces for review:** `buildShapeSql()` and `geofabrikUrl()` are I/O-free.
- **Operational notes for the real load (not yet run — needs DB approval + disk):**
  - `ensurePbf` does **not** auto-download (2 GB). Place the full extract at
    `/tmp/osm/united-kingdom-latest.osm.pbf` first (pre-staged on this machine).
  - Then `bun scripts/intl/ingest.ts GB --db @<file>` (add `--dry-run` first).
    Re-runs use `--replace`.
  - Disk: the intermediate NDJSON for full GB is ~3–4 GB; ensure ~10 GB free.

### Phase 2 — `os-open` adapter → nationwide street + postcode coverage — ADAPTER BUILT & VALIDATED 2026-06-23
- [x] `scripts/intl/adapters/os-open.ts` added. Pulls **Code-Point Open**
  (`codepo_gb.zip`) + **OS Open Names** (`opname_csv_gb.zip`) key-free from the OS
  Downloads API, reprojects EPSG:27700→4326 in DuckDB (`ST_Transform … always_xy`),
  emits the 18-column staging CSV. Pure `buildShapeSql()` + product registry.
- **Validation** (real full GB data through the adapter, no DB): **2,774,803 rows** —
  1,747,841 Code-Point postcode centroids (`OS_CODEPOINT`) + 1,026,962 Open Names
  (`OS_OPENNAMES`: 983,694 streets + ~43k populated places). 0 null coords, 0 outside
  GB bounds. Samples correct: `Fairway Crescent, Brighton and Hove, BN41`; `NN9 5AG`.
  Lint clean. Filter keeps `transportNetwork` + `populatedPlace`, drops
  `other/Postcode` (Code-Point covers postcodes better), landcover/landform/hydro.
- Coverage rows carry no house number (`number_first` NULL). Confirm rerank/
  autocomplete read paths handle number-less rows (they do for European street rows).

#### Loading — DECIDED 2026-06-23: add a `source` column (option A); loader BUILT
`addresses` had no `source` column (it lived only in `addresses_staging` and was
dropped on promote), and `ingest.ts`'s `--replace` is country-wide — so OS coverage
rows couldn't be appended/refreshed without wiping the Phase-1 OSM rows. Resolved:
- [x] **Schema:** added nullable `source` to `addresses`
  (`packages/database/src/schema/addresses.ts`). NULL for legacy/Overture/OSM rows;
  set only by coverage loaders.
- [x] **Migration:** `drizzle/0015_thankful_toad_men.sql` —
  `ALTER TABLE "addresses" ADD COLUMN "source" text;` (generated via `db:generate`,
  offline). **Not applied** — applying is the gated DB step.
- [x] **Loader:** `scripts/intl/gb-coverage.ts` — runs the os-open adapter, stages,
  and promotes **source-scoped**: pre-flight and `--replace` key on
  `country='GB' AND source IN ('OS_CODEPOINT','OS_OPENNAMES')`, so a reload never
  touches the OSM rows (they carry `source` NULL). Mirrors ingest.ts staging/promote
  (kept in sync; promote additionally carries `source`). Guards on the `source`
  column existing. `--dry-run` verified.
- Shared `ingest.ts` PROMOTE_SQL is deliberately **unchanged** — OSM/Overture/ODA
  rows keep `source` NULL, which is exactly what the source-scoped delete relies on.
- Follow-up (not blocking): coverage rows promote with the default
  `population_score=0, admin_level=5` like everything else; revisit ranking so
  postcode/street/place points don't outrank real OSM addresses.

**To load (gated — needs DB approval + the migration applied):**
1. `pnpm --filter @locnative/database db:migrate` (applies 0015)
2. `bun scripts/intl/gb-coverage.ts --db @<file> --dry-run`, then without `--dry-run`.
   Re-runs use `--replace` (OSM rows untouched).

### Phase 3 — OS Open UPRN spatial enrichment (optional, heavy)
- Spatially join the ~40M UPRN points to nearest OS Open Names street + Code-Point
  postcode to synthesise premise-point rows where OSM lacks them. Near-complete
  point coverage, but large; assess Neon cost first (campaign already at 8–16 CU /
  153 GB). Defer until Phases 1–2 are validated in prod.

## Risks / open questions
- **Coverage honesty:** Tier-1 (OSM) alone is partial. Set expectations: "best-effort
  free UK addresses + complete postcode/street geocoding," not PAF parity.
- **Dedup across tiers:** an OSM premise and a UPRN-derived point for the same
  property could double-count — Phase 3 needs a proximity+street dedup rule.
- **Neon cost / sizing** — confirm after Phase 0 sizing.
- **Territory — DECIDED 2026-06-21: GB + NI.** OSM UK extract covers both. OGL
  sources (UPRN / Open Names / Code-Point) are GB-only, so **NI premise coords come
  from OSM only** (no OGL postcode/street fill for NI). Isle of Man / Channel Islands
  excluded.
- **Update cadence:** OSM weekly, OS OpenData every 6 weeks — wire into the queue
  later; v1 is a one-shot load.

## Recommendation
Start with **Phase 0 sizing + the licensing decision**, then ship **Phase 1 (OSM)**
for real individual addresses and **Phase 2 (Code-Point + Open Names)** for complete
postcode/street geocoding. That delivers usable UK data entirely from free sources.
Phase 3 (UPRN) is a later coverage upgrade, not needed for launch.
