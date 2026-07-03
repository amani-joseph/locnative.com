# API Endpoint Audit — locnative.com

**Date:** 2026-06-13
**Target:** Production — `https://api.locnative.com`
**Method:** Cold (first call) vs warm (median of 3) latency, read-only `GET` endpoints only. No mutations executed.
**Auth:** Bearer API key provided by owner. The key authenticates but is **not scoped to a project** — see [Auth findings](#auth--scope-findings).
**Test parameters:** Sydney CBD `lat=-33.8688, lng=151.2093`; query terms `George St` / `10 Bourke St` / `Sydney Opera House`; `country=AU` (data is G-NAF Australia).

> Caveat: Cloudflare Worker isolates and the Neon HTTP driver add a cold-start tax to the *first* request in a burst. "Cold" below is the first call to each path; "warm median" is the steady-state cost. There is a consistent **~450–500 ms floor** on every DB-backed endpoint, attributable to the `neon-http` driver doing a fresh HTTPS round-trip per query from the Cloudflare edge.

---

## Response-time table

| # | Endpoint | Method | Auth tier | Cold (ms) | Warm med (ms) | Status | Verdict |
|---|----------|--------|-----------|-----------|---------------|--------|---------|
| 1 | `/api/v1/addresses/autocomplete` | GET | API key | 1475 | ~1030–2100 | 200 | ⚠️ Slow for typeahead |
| 2 | `/api/v1/addresses/geocode` (forward) | GET | API key | **>30000 (some queries)** | n/a | 200 / 404 / **TIMEOUT** | 🔴 **Critical** — query-dependent hang |
| 3 | `/api/v1/addresses/nearby` | GET | API key | 6973 (cold) → ~1300 steady | 934 | 200 | ⚠️ Severe cold start |
| 4 | `/api/v1/addresses/reverse` | GET | API key | 495 | 526 | 200 | ✅ Acceptable |
| 5 | `/api/v1/addresses/{id}` | GET | API key | 627 | 618 | 200 | ⚠️ High for a PK lookup |
| 6 | `/api/v1/regions` | GET | API key | 463 | 453 | 200 (empty) | ⚠️ Returns `{}` — data coverage |
| 7 | `/api/v1/routing/directions` | GET | API key | 1717 | ~1450 | 200 | ⚠️ External OSRM dependency |
| 8 | `/api/v1/zones` (list) | GET | Project key | 116 | 109 | 200 (empty) | ✅ Fast — see caveat |
| 9 | `/api/v1/zones/{id}` | GET | Project key | 108 | 104 | 200 | ✅ Fast (loaded) |
| 10 | `/api/v1/zones/contains` | GET | Project key | 111 (hit) | 102 | 200 | ✅ Fast (loaded) |
| 11 | `/api/v1/zones/{id}/addresses` | GET | Project key | 1917 | 155 | 200 | ⚠️ Slow cold; spatial join |
| 12 | `/api/v1/devices/{deviceId}/zones` | GET | Project key | 128 | — | 404 | ✅ Clean 404 |
| 13 | `/api/v1/geocode/batch/{jobId}` (poll) | GET | Project key | 5564 | ~110 | 200 | ⚠️ Slow first poll |
| 14 | `/api/v1/geocode/batch/{jobId}/results` | GET | Project key | 908 | — | 200 | ✅ OK (R2-backed) |
| 15 | `/api/v1/webhooks` (list) | GET | Project key | 125 | 114 | 200 (empty) | ✅ Fast — see caveat |
| 16 | `/tiles/v1/{z}/{x}/{y}.mvt` | GET | Public | 906 | 754 | 200 | ✅ OK (CDN-cacheable) |

**Not benchmarked (require session cookie, not API key):** `/api/auth/*` (BetterAuth), `/rpc/*` (dashboard, projects, api-keys, webhook management). Documented from code only.

---

## 🔴 Critical: forward geocode times out on certain queries

Forward geocode latency is **query-shape dependent**, ranging from fast to a hard hang:

| Query `q` | Result | Time |
|-----------|--------|------|
| `George Street` | 200 (1 match) | 2147 ms |
| `10 Bourke St` | 200 (1 match) | 420 ms |
| `1 George St, Sydney` | **TIMEOUT** | >30000 ms |
| `Sydney Opera House` | **TIMEOUT** | >30000 ms |
| structured `street=1 George St&locality=Sydney&state=NSW` | 404 (no match) | 3697 ms |

**Root cause (high confidence).** The tiered fuzzy search in `packages/database/src/queries/autocomplete.ts` (shared by forward geocode) escalates:
1. **Tier 1** — `search_text ILIKE 'query%'` (B-tree friendly, fast).
2. **Tier 2** — trigram `similarity(search_text, q)` with `set_limit(threshold)`.
3. **Tier 3** — `word_similarity(search_text, q)` and the `<%` operator with wider tolerance, plus levenshtein/phonetic fallbacks.

Queries that **don't prefix-match** `search_text` (POI-style `Sydney Opera House`, or number-led multi-token `1 George St, Sydney` where the stored `search_text` ordering differs) fall through Tier 1 and Tier 2 into **Tier 3 `word_similarity` / `<%`**. If the planner can't use a `gin/gist_trgm_ops` index for that operator (or the index is missing), Tier 3 becomes a **sequential trigram scan over the entire G-NAF address table** (millions of rows) — which blows past any reasonable request budget and hangs >30 s.

**Impact:** Any end user typing a place name or a full street address into forward geocode can hang the request indefinitely. On Cloudflare Workers this also burns wall-clock against the subrequest/CPU limits and holds a Neon connection open.

**Recommended fixes (in order):**
1. **Add a hard statement timeout** for the geocode path: `SET LOCAL statement_timeout = '2s'` (or per-query) so a pathological search fails fast as a 504/empty result instead of hanging. *Immediate mitigation.*
2. **Verify/create a GIN trigram index** on `search_text`: `CREATE INDEX CONCURRENTLY ... USING gin (search_text gin_trgm_ops);` and confirm via `EXPLAIN (ANALYZE)` that Tier 2/3 actually use it (`Bitmap Index Scan`, not `Seq Scan`).
3. **Cap Tier 3 candidate set** — pre-filter with a cheap selective predicate (e.g. first-token `ILIKE 'tok%'` or a locality/state filter) before applying `word_similarity`, so the fuzzy operator runs over a bounded set.
4. **Add a regression test** that asserts `Sydney Opera House` and `1 George St, Sydney` return within a fixed budget.

---

## ⚠️ Secondary concerns

### Autocomplete is too slow for typeahead (#1)
Steady-state **1.0–2.1 s**. A type-ahead box needs sub-300 ms to feel live; at 1.5–2 s the suggestions arrive after the user has finished typing. Same tiered-search engine as geocode, so it shares the Tier 2/3 cost risk. Mitigations: ensure Tier 1 `ILIKE 'q%'` covers the common case with a B-tree/`text_pattern_ops` index; debounce + cap `limit`; consider a materialized prefix table or `pg_trgm` GIN as above. Confirm it never silently escalates to Tier 3 on short prefixes.

### Nearby cold start ~7 s (#3)
First call hit **6973 ms**; steady state **~1.2–1.6 s**. The 7 s is cold-start tax (isolate spin-up + first Neon connection). The steady ~1.3 s is the real cost of `ST_DWithin(...::geography) ... ORDER BY ST_Distance(...::geography)`. Casting `geom::geography` per row defeats a plain GiST index on `geom`. Recommendations:
- Add a **GiST index on the `geography` cast** (or store a `geography` column): `CREATE INDEX ... USING gist ((geom::geography));` so `ST_DWithin` + KNN `ORDER BY` use it.
- Confirm the `addresses.geom` GiST index exists and the planner uses a KNN (`<->`) plan for the distance ordering.

### `addresses/{id}` at ~620 ms (#5)
A primary-key lookup should be <100 ms server-side; the ~620 ms is dominated by the Neon HTTP round-trip floor. This is the clearest illustration of the **`neon-http` per-query HTTP cost** — see architectural note below.

### `regions` returns empty for Sydney CBD (#6)
`GET /regions?lat=-33.8688&lng=151.2093` → `200 {"regions":{}}`. Fast (~460 ms) but returns nothing for a major-city coordinate. Either region/boundary layers aren't loaded in production, or `ST_Covers(regions.geom, point)` matched nothing. **Verify region data coverage** — a 200-with-empty-body is easy to miss in monitoring.

### `routing/directions` ~1.45 s + external dependency (#7)
Calls an external **OSRM** service. Latency is reasonable but the endpoint inherits OSRM availability and latency. Note the docs/SDK must specify `from`/`to` as **`lat,lng`** (sending `lng,lat` yields a 400 — easy client mistake). Recommend: cache common routes, set a client-facing timeout, and surface OSRM errors as a clean 502 rather than a generic 500.

---

## Auth & scope findings

**Update (2026-06-14):** Re-run with a **project-scoped key** — all 8 project endpoints (rows 8–15) now authenticate. See the [project-scoped re-run addendum](#addendum-2026-06-14--project-scoped-re-run) for results and caveats.

On the first pass (2026-06-13) the key authenticated but was **not associated with a project**, so project-scoped endpoints returned `401`:
- `zones`, `zones/contains`, `devices/*/zones`, `webhooks` → `"This API key is not scoped to a project."`
- `geocode/batch/*` → `"No project associated with this API key."`

This is correct, well-messaged authorization behavior — the project scope is enforced before the handler runs.

**Positive security posture:**
- No key → `401` with a clear, non-leaky message (`"API key required. Send Authorization: Bearer <key> or X-API-Key."`).
- Invalid key → `401`.
- Error envelopes are consistent: `{"error":{"code":"...","message":"..."}}`.

One thing to confirm: the `401` responses for project-scoped endpoints took **760–2507 ms**. The auth/project lookup runs a DB query before rejecting — consider short-circuiting unscoped keys earlier and confirm the API-key lookup is indexed, so rejected/abusive traffic is cheap.

---

## Architectural note: per-query Neon round-trip cost

The address/geocoding endpoints show a ~450–600 ms minimum (even a PK lookup at #5), attributable to the `neon-http` driver opening a fresh HTTPS connection per query from the Cloudflare edge (consistent with the project memory note that `neon-http` has no transaction support).

**Revised by the 2026-06-14 re-run:** the project-scoped endpoints querying small, well-indexed, `project_id`-scoped tables (empty `zones`/`webhooks`) returned in **~110 ms**. So the true warm floor is closer to ~110 ms; the 450–600 ms on the address endpoints is mostly **query work** (PostGIS distance, trigram fuzzy matching) and connection cold-start, not a fixed connection tax. This sharpens the optimization target: the slow address endpoints are slow because of their *queries*, not merely the driver.

Endpoints that issue **multiple sequential queries** still pay the per-query round-trip multiple times. Options to reduce it:
- Batch independent queries / reduce round-trips per request.
- Evaluate Neon's connection-pooling endpoint or a WebSocket/`Pool` driver where Workers compatibility allows.
- Cache hot read paths (e.g. `addresses/{id}`, popular tiles already cache well) at the edge.

---

## Timeouts observed

| Endpoint | Condition | Behavior |
|----------|-----------|----------|
| `addresses/geocode` | `q="1 George St, Sydney"`, `q="Sydney Opera House"` | No response within 30 s (hard hang) |
| `addresses/nearby` | First (cold) request | 6973 ms — recovered on warm calls |

No other endpoint exceeded ~2.5 s.

---

## Prioritized action list

1. **🔴 P0 — Bound forward geocode.** Add `statement_timeout` to the geocode path and verify/repair the `gin_trgm_ops` index on `search_text`. Add a regression test for POI and number-led queries.
2. **⚠️ P1 — Speed up autocomplete** to typeahead range; ensure it never escalates to the Tier 3 fuzzy scan on common prefixes.
3. **⚠️ P1 — Index the `geography` cast** used by `nearby`/`reverse` so `ST_DWithin`/KNN ordering uses an index.
4. **⚠️ P2 — Investigate the cold-start tax** and the `neon-http` per-query round-trip floor (pooling / fewer round-trips / edge caching).
5. **⚠️ P2 — Verify `regions` data coverage** in production.
6. **⚠️ P2 — `zones/{id}/addresses` point-in-polygon join** — confirm `ST_Contains(zone.geom, addresses.geom)` uses a GiST index (not a seq scan); the result cap (`truncated` at 50) currently masks worst-case cost for large polygons.
7. **⚠️ P2 — Batch poll first-call 5.5 s** — investigate the cold/initial poll on `batch/{jobId}`; ensure `(projectId, jobId)` lookup is indexed and the first poll doesn't block on queue init.
8. **✅ Done — project-scoped + loaded-path benchmarks** completed (Addendums 1 & 2). Remaining untested surface: `/api/auth/*` and `/rpc/*` (need a session cookie).

---

### Reproduction
All measurements were taken against production with the owner-supplied key over HTTPS, cold call followed by 3 warm calls, 12–30 s per-request abort. The API key was used only in request headers and is not recorded in this document.

---

## Addendum (2026-06-14) — project-scoped re-run

Re-ran rows 8–15 with a **project-scoped key**. All endpoints authenticated. **The project contains no data** (0 zones, 0 webhooks, 0 devices, 0 batch jobs), so these are **best-case / empty-result timings, not loaded-path latency.**

| # | Endpoint | Cold (ms) | Warm med (ms) | Status | Body |
|---|----------|-----------|---------------|--------|------|
| 8 | `zones` (list) | 116 | 109 | 200 | `{"zones":[],"count":0,"page":1}` |
| 10 | `zones/contains` | 292 | 117 | 200 | `{"zones":[],"count":0}` |
| 15 | `webhooks` (list) | 125 | 114 | 200 | `{"results":[],"count":0}` |
| 12 | `devices/{deviceId}/zones` | 128 | — | 404 | `Device not found.` |
| 13 | `geocode/batch/{jobId}` | 120 | — | 404 | `Job not found.` |
| 14 | `geocode/batch/{jobId}/results` | 112 | — | 404 | `Job not found.` |
| 9 | `zones/{id}` | skip | — | — | no zone exists to fetch |
| 11 | `zones/{id}/addresses` | skip | — | — | no zone exists to fetch |

**Observations:**
- All project endpoints are **fast (~110–290 ms)** on the empty path, well under the address-endpoint latencies. Authorization + scoping adds no meaningful overhead, and 404s short-circuit cleanly.
- `zones/contains` cold 292 ms vs warm 117 ms — normal connection/plan warm-up; the point-in-polygon `ST_Contains` had no zones to test against.

**Still not measured (require seeded data, i.e. mutations — out of scope per the read-only decision):**
- `zones/{id}` and `zones/{id}/addresses` — need at least one zone.
- `zones/contains` and `devices/{deviceId}/zones` **with real polygons** — the spatial `ST_Contains` / point-in-polygon work is what could get expensive at scale; the empty-project numbers don't exercise it.
- `geocode/batch/{jobId}/results` — needs a completed batch job.

To benchmark these realistically, create a test zone (a `POST /zones` mutation) and submit a small batch job, then re-measure and clean up. That requires opting into the **"mutations with cleanup"** scope.

---

## Addendum 2 (2026-06-14) — loaded spatial + batch paths (with cleanup)

With owner approval, created one temporary zone and one small batch job to exercise the data-dependent paths, then **deleted the zone and verified it was gone (404).**

**Test fixtures:**
- Zone: a ~2.5 km box polygon over Sydney CBD (`151.195–151.220 lng`, `−33.885 to −33.855 lat`), named `AUDIT-TEMP-zone (delete me)` → assigned `id=5`.
- Batch: 5 addresses (`10 Bourke St`, `20 Bourke St`, `5 Market St`, `10 Pitt St`, `1 George St`).

### Mutation + loaded read results

| Operation | Method | Time (ms) | Status | Notes |
|-----------|--------|-----------|--------|-------|
| Create zone | POST `/zones` | 602 | 200 | Includes `ST_IsValid` polygon check + insert |
| `zones/{id}` | GET | 108 cold / 104 warm | 200 | Fetch zone w/ geometry — fast |
| `zones/contains` (point inside) | GET | 111 cold / 102 warm | 200 | `ST_Contains` returned the zone — fast |
| **`zones/{id}/addresses`** | GET | **1917 cold / 155 warm** | 200 | **Point-in-polygon address join** — matched **50** addresses, response `truncated:true`, 13.5 KB |
| Submit batch | POST `/geocode/batch` | 1049 | 200 | Enqueues job; returns `status:"processing"` |
| Poll job (`batch/{jobId}`) | GET | **5564 first** / ~110 after | 200 | First poll very slow; subsequent ~100–126 ms |
| Batch results (`/results`) | GET | 908 | 200 | 5/5 matched, served from R2 (`GEOCODE_RESULTS`) |
| **Delete zone (cleanup)** | DELETE `/zones/{id}` | 104 | 200 | `{"success":true}`; GET afterwards → 404 ✅ |

### Findings

1. **`zones/{id}/addresses` is the real spatial cost (#11).** Cold **1.9 s**, warm 155 ms, for a CBD-sized polygon matching 50 addresses. The result is **capped/`truncated` at 50** — so the warm number reflects a bounded scan, not the worst case. A larger polygon (or a higher cap) over the full G-NAF table is where this could degrade; confirm the point-in-polygon join uses a GiST index on `addresses.geom` with the zone polygon as the index probe (`ST_Contains(zone.geom, addresses.geom)` should be an `Index Scan`, not a `Seq Scan`). The 1.9 s cold is connection/plan warm-up.

2. **First batch poll took 5.5 s (#13).** Subsequent polls were ~110 ms. The first poll races the queue consumer / cold job-table query. For a status endpoint that clients poll in a loop, a 5.5 s first response is poor UX — investigate whether the initial poll blocks on queue/job initialization, and ensure the `batch_geocode_jobs` lookup by `(projectId, jobId)` is indexed.

3. **Batch end-to-end ≈ 38 s for 5 addresses.** `processedCount` was 0 at the 5.5 s mark and reached 5/5 by ~38 s — driven by Cloudflare Queue pickup latency (`max_batch_size:10`), not per-address geocode cost. Acceptable for an async batch API, but worth documenting expected turnaround to callers.

4. **Batch absorbed the geocode pathology safely.** `1 George St` is in the same family as the queries that hang the synchronous forward geocoder, yet the batch job completed 5/5. The async/queue path is more resilient than the live `/addresses/geocode` endpoint — but the underlying Tier-3 scan risk (P0) still applies and could slow or stall a batch containing many pathological inputs.

5. **Mutation + delete paths are healthy.** `POST /zones` 602 ms (with geometry validation), `DELETE /zones/{id}` 104 ms, scoping enforced throughout.

### Cleanup status
- ✅ Zone `id=5` deleted; confirmed `404` on re-fetch.
- ⚠️ Batch job `abe789f2-07ec-401f-8561-19d4f4bc7271` **persists** — there is **no batch-delete endpoint**. It remains as a completed job record plus a result object in the `GEOCODE_RESULTS` R2 bucket. Harmless, but if you require zero residue, delete the row/object manually (or consider adding a batch-delete/expiry endpoint).
