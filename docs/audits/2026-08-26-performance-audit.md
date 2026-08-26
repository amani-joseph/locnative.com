# Performance audit — 2026-08-26

Measured against production (`api.locnative.com`, `locnative.com`) and the live
Neon database. No code was changed.

---

## 1. Baseline

### API latency (warm, measured from one network vantage point)

| Endpoint | n | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| autocomplete | 40 | 153 ms | 380 ms | 718 ms | 718 ms |
| nearby | 20 | 283 ms | 627 ms | 627 ms | 627 ms |
| reverse | 20 | 188 ms | 359 ms | 359 ms | 359 ms |

Cold (first touch after idle) is materially worse — one autocomplete cold hit
measured **19,373 ms**, and cold/warm pairs routinely differ 3–5x. Cause is
established in F2 below; it is connection setup, not query cost.

### Payloads

All API responses are brotli-encoded. `limit=20` autocomplete is 4.8 KB
uncompressed / ~0.5–1.9 KB on the wire.

### Database

| Metric | Value |
|---|---|
| Database size | 156 GB |
| `addresses` heap | 51 GB |
| `addresses` indexes | **104 GB** |
| Index-to-heap ratio | **2.04** |
| Rows | ~173 M (planner believes 308 M — see F5) |
| `shared_buffers` | 1.27 GB (2.5 % of heap) |
| Heap cache hit ratio | 63.7 % |
| Index cache hit ratio | 96.5 % |

### Frontend

| Metric | Value |
|---|---|
| Landing TTFB | ~1,197 ms |
| Landing HTML | 76.8 KB, zstd |
| Landing JS | 876 KB across **47 modulepreloads** |
| Total built JS | 3.6 MB (maplibre 1,028 KB, main 483 KB) |
| Code splitting | Working — maplibre / terra-draw / analytics excluded from landing |

### Tiles

| Asset | Cold | Warm | Cache |
|---|---|---|---|
| style.json (58 KB) | 219 ms | 38 ms | `max-age=14400` + SWR, CDN HIT |
| z10 tile (72 KB) | 441 ms | 50 ms | `max-age=86400` + SWR, CDN HIT |

---

## 2. What is already right

Stated explicitly so it does not get "optimised" later:

- **Tile serving.** Vector tiles with correct `Cache-Control`, stale-while-
  revalidate, and confirmed CDN HITs. Warm 39–52 ms. Do not change this.
- **`nearby` geospatial query.** 8.2 ms, index-ordered KNN on
  `idx_addresses_geom_geography`, no sort node, 1,045 buffers. Optimal.
- **Dashboard batching.** Six queries issued through one `Promise.all` rather
  than sequentially.
- **Map architecture.** `map-canvas.tsx` is 78 lines and delegates entirely to
  vector tiles — no client-side marker management, no GeoJSON payloads, no
  clustering logic to maintain. This is the correct answer and it already
  scales to 100x, because the client never receives per-feature data.
- **Autocomplete client.** Debounce, TTL cache, and `AbortController` that
  cancels superseded keystrokes are all present in `use-autocomplete.ts`.
- **Usage metering.** The Durable Object meter keeps the quota gate off the
  database round-trip path.
- **No N+1.** Loops in the API package are in-memory transforms, not per-row
  queries.

---

## 3. Findings

### F1 — Hashed static assets are not cached (P0)

**Issue.** Every built asset is served `public, max-age=0, must-revalidate`
despite having a content hash in its filename.

**Evidence.**
```
main-D-y3S6JY.js   cc: public, max-age=0, must-revalidate
conditional revalidation: 304 in 23 ms
landing page: 47 hashed assets
```

**Impact.** Every returning visitor issues **47 conditional requests** before
the page can run. At ~23 ms each and browser connection limits, this is
several hundred milliseconds of pure round-trip on every repeat visit, for
files that are immutable by construction.

**Recommendation.** `Cache-Control: public, max-age=31536000, immutable` for
`/assets/*`. The hash in the filename *is* the invalidation strategy; there is
no consistency trade-off — a changed file gets a new URL.

**Expected improvement.** Eliminates 47 round trips on repeat visits.
Meaningful LCP/FCP improvement for returning users.

**Effort** Low · **Risk** Low · **Priority P0**

---

### F2 — Cold-connection setup costs ~200 ms, twice per request (P1)

**Issue.** The database client is Neon's HTTP driver (`neon()`), one fetch per
query. A cold connection pays TLS setup, and the request path makes two
blocking DB calls (auth, then the query).

**Evidence.** A bare `SELECT 1` on a fresh client: **225 ms first call, 24 ms
warm**. A never-requested suburb returns in 120 ms on a warm connection, while
a *repeat* of a seen suburb took 672 ms after a 20 s idle gap — cost tracks
connection idleness, not query novelty.

**Impact.** The entire cold/warm gap (153 ms → 500 ms+, occasionally seconds).
This is the single largest remaining latency contributor.

**Recommendation.** Options, in order of preference:
1. **Cache validated API keys in the Worker** (short TTL, e.g. 60 s) so auth
   does not need its own round trip. Removes one of two cold setups. Low risk,
   contained.
2. **Neon pooled/WebSocket driver** so connections persist across requests.
   Larger win, but affects every query in the app — a broader change.
3. Keepalive pings. Crude, fights isolate lifecycle. Not recommended.

**Expected improvement.** Option 1 roughly halves cold latency. Option 2 could
largely eliminate it.

**Effort** Medium · **Risk** Medium (touches auth) · **Priority P1**

---

### F3 — PBKDF2 at 100 k iterations on every request (P1)

**Issue.** `validateApiKey` runs PBKDF2-SHA256 at 100,000 iterations per
request.

**Evidence.** Measured locally: **23.8 ms per verification** at 100 k, 2.4 ms
at 10 k, 0.2 ms at 1 k. That is ~15 % of the 153 ms p50 — spent on every
autocomplete keystroke.

**Impact.** Pure CPU burn on the hottest path. On Workers this is billable CPU
time as well as latency. A user typing a nine-character suburb pays it ~8
times.

**Recommendation.** Do **not** simply lower the iteration count — that weakens
the hash. Instead cache the *verification result* (F2 option 1): the same key
is presented thousands of times per minute, so verifying it once per 60 s per
isolate preserves the security property while removing the cost from 99 % of
requests. API keys are high-entropy random secrets, not user passwords; the
threat model that justifies 100 k iterations (offline cracking of a
low-entropy secret) does not apply the same way, but caching is the safer fix
than reducing work.

**Expected improvement.** ~24 ms off p50 (~15 %).

**Effort** Medium · **Risk** Medium · **Priority P1**

---

### F4 — 20.5 GB of low-value indexes; 104 GB total on 51 GB of data (P1)

**Issue.** Index-to-heap ratio is 2.04. Several large indexes serve almost no
queries, and two are strict leftmost-prefix duplicates of wider ones.

**Evidence.**

| Index | Size | Scans | Note |
|---|---|---|---|
| `idx_addresses_population_score` | 2.18 GB | **4** | column is **0 in all 158,716 sampled rows** — zero selectivity |
| `idx_addresses_country` | 2.11 GB | 152 | leftmost prefix of `country_locality` |
| `idx_addresses_state` | 2.10 GB | 128 | leftmost prefix of `idx_addresses_locality` |
| `idx_addresses_geom` | 14.08 GB | 77 | genuinely used by `ST_Covers`/`ST_Contains` (zones) — **keep** |
| `idx_addresses_search_text_trgm` | 20.55 GB | 330 | required by `%` / `<%` fuzzy operators — **keep** |

**Impact.** Storage cost on a 156 GB Neon database; slower writes and
autovacuum; and — most importantly — index pages competing for a 1.27 GB
`shared_buffers`, which is why heap hit ratio sits at 63.7 %.

**Recommendation.** Drop `population_score`, `country`, and `state` indexes
(~6.4 GB) after confirming with `pg_stat_statements`. Investigate whether
`population_score` should be *populated* rather than dropped — `fuzzy-locality.ts`
already notes it is all-zero, which means suburb ranking has no popularity
signal. That is a product gap, not just an index one.

**Expected improvement.** ~6 GB reclaimed; better buffer cache residency.

**Effort** Low · **Risk** Medium (verify usage first) · **Priority P1**

---

### F5 — Autovacuum has not run since 2026-06-14 (P1)

**Issue.** `last_autovacuum` and `last_autoanalyze` on `addresses` are both
**2026-06-14** — over two months stale. The planner believes the table has
**308 M rows**; it has ~173 M.

**Evidence.**
```
n_live_tup: 308,127,709   n_dead_tup: 2,820,648
last_autovacuum:  2026-06-14T16:59:06Z
last_autoanalyze: 2026-06-14T17:06:27Z
```

**Impact.** Every query plan on the hottest table is costed against row counts
that are ~78 % too high. This silently degrades plan selection everywhere and
makes future regressions harder to diagnose. It is plausibly a contributor to
several of the pathological plans found over the past week.

**Recommendation.** Run `ANALYZE addresses` now, and set per-table autovacuum
thresholds appropriate to a 173 M-row table (the defaults scale poorly at this
size). Verify `autovacuum_vacuum_scale_factor` / `analyze_scale_factor` are
tuned down for this table.

**Expected improvement.** Correct planner input; prevents a class of regression.

**Effort** Low · **Risk** Low · **Priority P1**

---

### F6 — API responses are `no-store`, including immutable data (P2)

**Issue.** Every API endpoint returns `Cache-Control: no-store`, including
`/addresses/{id}`, which returns a static G-NAF record that has not changed in
years.

**Evidence.** `byId` → `cc=no-store`. `reverse`, `nearby`, `autocomplete` all
the same.

**Impact.** No CDN or browser caching is possible for genuinely static
reference data. Repeated lookups of the same address ID always reach the
database.

**Recommendation.** Differentiate by endpoint:
- `/addresses/{id}` → `public, max-age=86400, stale-while-revalidate=604800`.
  The data is immutable between G-NAF imports.
- `reverse` → `public, max-age=3600` (coordinates→address is stable).
- `autocomplete` → keep `no-store`, or `private, max-age=60`. It is
  user-specific and high-cardinality; CDN caching would have a poor hit rate.

**Consistency trade-off.** A G-NAF import would serve stale records for up to
the TTL. Mitigate by bumping a version segment in the path on import, or
accept a day of staleness for address reference data.

**Expected improvement.** Near-zero latency for repeat `byId`/`reverse`;
reduced database load.

**Effort** Low · **Risk** Low · **Priority P2**

---

### F7 — All 13 routes fetch in `useEffect`; zero use router loaders (P2)

**Issue.** Every data-bearing route fetches after mount via `useEffect` +
`useState`. No route uses TanStack Router's `loader`.

**Evidence.** 13 route files contain `useEffect`; 0 contain `loader:`.
`dashboard.tsx` is representative: `useState(null)` → `useEffect` →
`orpcClient.dashboard.getStats()`.

**Impact.** A guaranteed client-side waterfall: HTML → JS parse → hydrate →
render → *then* fetch. The user sees a skeleton for the full round trip. With
loaders, TanStack Start can begin the fetch during SSR and stream, removing
one full round trip from perceived load.

**Recommendation.** Migrate the highest-traffic routes (dashboard, api-keys) to
route loaders. This is *perceived* performance rather than raw latency — the
query is not slower, the user just waits longer to see it.

**Expected improvement.** Removes one round trip from time-to-content on
authenticated pages.

**Effort** Medium · **Risk** Low · **Priority P2**

---

### F8 — `parsedQuery` debug field shipped to every client (P3)

**Issue.** The autocomplete response includes a `parsedQuery` object — internal
parser state — on every response.

**Evidence.** `"parsedQuery" in response === true`.

**Impact.** Small payload waste; more importantly it leaks internal parsing
implementation into a public API contract, constraining future refactors.

**Recommendation.** Remove it, or gate it behind an explicit `?debug=1`. Check
SDK/consumer usage first — this is a breaking change if anyone depends on it.

**Effort** Low · **Risk** Medium (public contract) · **Priority P3**

---

### F9 — Autocomplete returns full address rows for suburb-shaped queries (P3)

**Issue.** A suburb query returns nine fields per row including
`formattedAddress`, `streetAddress`, `id`, `latitude`, `longitude` — but a
suburb picker needs three.

**Evidence.** `limit=20` = 4.8 KB uncompressed; the suburb-only equivalent is
0.8 KB — **83 % smaller**.

**Impact.** Modest on the wire after brotli, but real serialization cost and a
misleading contract: the row describes an arbitrary representative address, not
the suburb the user asked for.

**Recommendation.** Consider a `fields=` parameter or the `/localities`
endpoint careproviders.com originally asked for. Do **not** change the default
response shape — that breaks existing consumers.

**Effort** Medium · **Risk** Medium · **Priority P3**

---

### F10 — HTML document has no `Cache-Control` (P3)

**Issue.** The landing HTML returns no `Cache-Control` header and no
`cf-cache-status`.

**Impact.** The document is re-fetched from origin on every navigation. At a
1,197 ms TTFB this is the largest single component of first paint.

**Recommendation.** `public, max-age=0, must-revalidate` at minimum (explicit
rather than absent), or short-TTL edge caching with SWR for anonymous traffic.
Investigate the 1,197 ms TTFB separately — that is high for an edge-rendered
document and may share the F2 cold-connection root cause.

**Effort** Low · **Risk** Low · **Priority P3**

---

### F11 — `shared_buffers` at 2.5 % of heap (P4)

**Issue.** 1.27 GB `shared_buffers` against a 51 GB heap; heap cache hit ratio
63.7 %.

**Impact.** Contributes to cold page-in cost.

**Recommendation.** **Do not act on this yet.** On Neon, `shared_buffers` is
managed by the platform and local page cache behaves differently from
self-hosted Postgres. Index hit ratio is already 96.5 % and the hot paths are
index-only. Reducing index bloat (F4) is the cheaper lever on the same problem.
Revisit only if F2 and F4 are done and cold latency is still unacceptable.

**Effort** High · **Risk** High · **Priority P4**

---

## 4. Quick wins

Low effort, low risk, measurable benefit — implement these first.

| # | Change | Effort | Impact |
|---|---|---|---|
| F1 | `immutable` cache headers on `/assets/*` | Low | 47 round trips removed per repeat visit |
| F5 | `ANALYZE addresses` + tune autovacuum thresholds | Low | Correct plans across the hottest table |
| F4a | Drop `idx_addresses_population_score` (all-zero column) | Low | 2.2 GB reclaimed |
| F6 | Cache headers on `/addresses/{id}` and `reverse` | Low | Near-zero repeat latency |

---

## 5. Roadmap

**Phase 1 — Immediate (low risk, high impact)**
F1 asset caching · F5 ANALYZE + autovacuum tuning · F4a drop the all-zero index
· F6 differentiated API cache headers.

**Phase 2 — Performance (moderate effort)**
F2/F3 together — cache validated API keys in the Worker. One change addresses
both the second cold connection and the 24 ms PBKDF2 cost. Then F7, route
loaders on dashboard and api-keys.

**Phase 3 — Scaling (matters as traffic/data grows)**
F4b drop the remaining prefix-duplicate indexes after `pg_stat_statements`
confirmation · evaluate the Neon pooled driver (F2 option 2) · decide whether
`population_score` should be populated to give suburb ranking a popularity
signal.

**Phase 4 — Revisit later (premature today)**
F11 `shared_buffers` · F9 response-shape changes · F8 `parsedQuery` removal
(bundle with the next intentional API version bump rather than breaking
consumers for a small win).

---

## 6. Architectural challenges

**The map architecture is right; do not change it.** Vector tiles served from
CDN with a 78-line client component is the correct answer at this dataset size,
and it is the one part of the stack that already scales to 100x without
modification — the client never receives per-feature data, so marker count is
irrelevant. A GeoJSON/marker/clustering approach would be strictly worse here.

**The tiered fuzzy-search design is now sound but was structurally fragile.**
Four separate incidents in one week (slash-unit, Tier 1 ILIKE, Tier 2
unanchored, `ORDER BY 1`) all came from unbounded predicates in
`autocomplete.ts`. The invariant test added on 2026-08-26 closes that class.
The remaining question is whether a tiered cascade is the right shape at all,
versus a single anchored query with ranking — worth revisiting if a fifth
incident appears, not before.

**Index strategy needs a governing principle.** 104 GB of indexes on 51 GB of
data accumulated by adding an index per problem without removing any. Recommend
a standing rule: any new index must state which query it serves, and
`pg_stat_user_indexes` should be reviewed quarterly.

**`population_score` being all-zero is a product gap, not just a dead index.**
Suburb ranking currently has no popularity signal, which is why fuzzy matching
returns Sydenham before Sydney. Populating it would improve search quality more
than any latency work in this document.

---

## 7. Method and limits

- All timings measured from a single network vantage point; absolute numbers
  include network distance and will differ from a user's.
- Cold/warm distinction is by first-touch versus immediate repeat, not by
  cache eviction, so "cold" conflates connection setup with page-in.
- `EXPLAIN ANALYZE` plans were taken against production with live traffic
  present; buffer counts are indicative, not isolated.
- Core Web Vitals were **not** measured — no field data (RUM) is collected, and
  synthetic Lighthouse runs were out of scope. TTFB and payload sizes are
  proxies. **Recommend adding RUM** before optimising perceived performance
  further; F7 in particular should be validated against real user data.
- No `pg_stat_statements` data was available, so per-query aggregate cost across
  production traffic could not be confirmed. Index drop recommendations (F4)
  should be verified against it before action.
