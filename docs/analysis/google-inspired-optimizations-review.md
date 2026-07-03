# Project-wide optimizations — learning from Google Maps Platform

**Date:** 2026-06-16 · **Status:** review list (no code changes)

> **Source note:** the `claude.ai/share` link couldn't be auto-fetched (SPA shell), but the user pasted its content — a Google Maps/Places **data → index → serving** architecture breakdown. Section 0 below evaluates those 5 architecture patterns against the *verified* current Locnative stack; sections A–G cover API-surface patterns from the `@googlemaps/*` libraries.

## 0. Architecture & scaling (from the shared Google breakdown)
Google's speed comes less from algorithms than from **(a) tile-partitioned data, (b) pre-built read indexes separate from the write store, and (c) regional edge caching.** Verified verdicts against our stack (Neon Postgres+PostGIS, ~300M rows/28 countries, Cloudflare Workers):

| # | Google pattern | Locnative state (verified) | Verdict / action |
|---|---|---|---|
| 0.1 | **Tile/geohash partitioning** — prune bbox queries to 1–4 partitions | **No partitioning**; single `addresses` table. Coarse `idx_addresses_country` only. | 🆕 **Biggest structural win, biggest risk.** Declarative-partition by `country` first (cheap, natural — most queries already filter country), then consider an H3/geohash sub-partition for radius/bbox. ⚠️ A partition migration on a live 300M-row prod table is a planned campaign, not a quick PR. |
| 0.2 | **Separate write vs read DB**; nightly job builds denormalized read replicas | **Single Neon endpoint** for read+write; no replica. | 🆕 Route GET endpoints to a **Neon read replica** (separate conn string; low risk, offloads the heavy intl-ingestion write contention from the API hot path). Mind workerd/neon-http constraints + `[[a4-pooled-driver-breaks-hot-path]]`. |
| 0.3 | **GiST geo index + text index** as the core 90% | **Done:** GiST on `geom` **and** `(geom::geography)`; trigram GIN + `text_pattern_ops` btree on `search_text`. | 🟢 Already there. Note we use **trigram (typo-tolerant)** not `tsvector` — intentional and better for our fuzzy autocomplete. |
| 0.4 | **Denormalize for read speed** (one flat row) | **Partial:** `search_text` flattened column + flat address row already exist. | 🟢 Mostly done. A materialized read-view could pre-join the few remaining computed fields, but low marginal gain. |
| 0.5 | **Prefix precompute + cache** for autocomplete (top-N per region, Redis) | **Live tiered query per keystroke** (index-optimized, but no cache). No Redis (workerd) / KV cache. | 🆕 Two tiers: (cheap) edge-cache the autocomplete response in the Workers **Cache API** keyed on `(q, country, rounded lat/lng)`; (richer) a precomputed `prefix→top-N per geohash` table fronted by **Cloudflare KV** (the workerd-native "Redis"). |
| 0.6 | **Regional CDN cache, lat/lng rounded for cache key** | ⚠️ **API responses are `cache-control: no-store` (actively disabled)** at `apps/server/src/index.ts:270`. Tiles already use ETag + cache. | 🆕 **Highest ROI / lowest effort.** Address/geocode/region data is effectively static. Cache read endpoints via the **Workers Cache API *after* auth** (round lat/lng to 3 dp ≈ 111 m for key normalization). ⚠️ Don't switch to a `public` CDN cache blindly — responses are auth-gated; cache the data internally post-auth so one key's hit can't bypass authz, and never cache 401s/errors. |

**Architecture takeaways:** the gap to Google here is **write/read path separation + edge caching**, not the query algorithm (our PostGIS indexing already matches lesson 0.3). Sequence: **0.6 (edge cache, days) → 0.5 (prefix cache, weeks) → 0.2 (read replica) → 0.1 (partitioning, a quarter-scale migration).**

---

## API-surface patterns (from the `@googlemaps/*` library family)

Legend: 🟢 already in flight this session · 🆕 new idea · ⚠️ touches live billing/prod (needs sign-off)

## A. Payload & cost — "retrieve only what you need" (Google **field masks**)
Google bills Places by how many fields you request and pushes **field masks** so clients fetch only what they render. Locnative returns full records everywhere.
1. 🆕 **`fields` / sparse-fieldset param** on geocode, autocomplete, nearby, byId — return only requested fields. Smaller payloads → faster mobile, lower egress, and a natural future billing lever. Highest-leverage item here.
2. 🆕 **Result quality metadata** (Google geocoding's `location_type`, `partial_match`, `viewport`). We expose `confidence`; add `match_type` (exact/interpolated/locality) + a `viewport`/bbox per result so clients can zoom correctly and trust/score matches.

## B. HTTP caching — Google leans on CDN/ETag heavily
G-NAF/boundary data is effectively static; today responses look uncacheable.
3. 🆕 **`Cache-Control` + `ETag`** on read endpoints (geocode, byId, regions/classify, tiles). Cloudflare edge-caches them → big latency + cost win, and clients revalidate cheaply. Pair with a short TTL for autocomplete, long for byId/regions.
4. 🆕 **Conditional requests** (`If-None-Match` → 304) so the SDK/hooks skip re-downloading unchanged results.

## C. Client efficiency (Google Places: debounce, session tokens, client cache)
5. 🟢 **Debounce + abort + client cache + minLength** in `useAutocomplete` — in flight (PR `feat/react-sdk-dx-places`).
6. 🟢⚠️ **Autocomplete session tokens** — SDK scaffolding shipped (`sessionToken`, `newSessionToken()`); the **server-side billing change** (count a token's keystrokes as one billable search) is written up as an approval-gated plan, not built.
7. 🟢 **Honor `Retry-After`/`RateLimit-*`** — SDK already does; server emitting the headers is Phase 11.

## D. UI building blocks — Google **Web Components** + **MarkerClusterer**
Google ships `<gmp-map>`/`<gmpx-place-picker>` (encapsulated best-practice HTML elements) and `markerclusterer` for dense points.
8. 🆕 **Framework-agnostic Web Components** (`<locnative-autocomplete>`, `<locnative-map>`) so non-React users (plain HTML, Vue, Svelte) get the same debounced/cached/a11y autocomplete as React users. Mirrors Google's Extended Component Library; keeps our React hooks as the React-specific layer.
9. 🆕 **Marker clustering** for nearby/places/zone-member rendering in the dashboard & playground. We use MapLibre (self-hosted Protomaps), so use `supercluster`/MapLibre clustering rather than Google's lib. Prevents the "10k pins melt the map" problem.

## E. Static rendering & link security (Google **Static Maps** + **url-signature**)
10. 🆕 **Static map / thumbnail endpoint** — render a pin (or a route/zone) on our tiles server-side and return a PNG, for emails, link previews, and embeds (Google Static Maps analog). Reuses the OSRM/PostGIS + Protomaps stack.
11. 🆕 **Signed, expiring URLs** for tiles and any static-map endpoint (Google `url-signature`). Stops hotlink/abuse of the self-hosted tile server and makes responses safely CDN-cacheable. Relevant given tiles are on R2.

## F. Routing & places parity (Google Directions/Distance Matrix/Places)
12. 🟢 **Advanced routing** (matrix/isochrone/match/optimize) — shipped (Phase 10, live).
13. 🆕 **Routing hooks** (`useDirections`/`useMatrix`/`useIsochrone`) — in flight (PR task #4).
14. 🆕 **Place types taxonomy + structured place result** for Phase 12 Places/POI — adopt a Google/Foursquare-style category enum so `places.search` filters are predictable.

## G. DX & types (Google **typescript-guards**, multi-package family)
15. 🟢 **Type guards** (`isLocnativeApiError`, etc.) + **geo utils** (`getLatLng`, `toLngLat`, `distanceMeters`) — shipped this session.
16. 🆕 **Package family discipline** — keep core SDK zero-dep; add `@locnative/web-components` (D8) and keep React in `@locnative/react`. Mirrors Google's `js-api-loader` (core) / `react-google-maps` (framework) split.

## Suggested priority
**P1 (cost/latency, broad impact):** #1 field masks, #3 HTTP caching/ETag, #9 marker clustering.
**P2 (reach & security):** #8 Web Components, #10 static-map endpoint, #11 signed tile URLs, #2 result-quality metadata.
**P3 (already moving):** the autocomplete-hook + routing-hook + guards/utils PR, Phase 11 rate-limit headers, Phase 12 place taxonomy.

## Avoid
- Don't adopt `@googlemaps/react-wrapper` (archived → `@vis.gl/react-google-maps`); for our own maps prefer **MapLibre** since tiles are self-hosted.
