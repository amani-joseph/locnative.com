# Locnative.com vs Mapbox — Comparative Analysis & Roadmap

**Date:** 2026-06-10
**Scope:** Feature-by-feature comparison of locnative.com against the Mapbox platform, gap inventory, mutual strengths, and a prioritised roadmap.
**Companion docs:** `competitive-analysis-2026-06.md` (Radar/Mappify/Google/HERE/Geoapify), `competitive-analysis-update-2026-06-08.md` (SDK depth). This doc adds the missing Mapbox dimension.

---

## 0. Framing — read this first

Mapbox and Locnative are **not the same kind of company**, and the comparison only makes sense if that is explicit up front:

- **Mapbox** is a *global map-rendering and developer-tooling platform*. Its centre of gravity is **client-side rendering SDKs** (GL JS, iOS/Android, Navigation SDK), a **map-styling pipeline** (Studio, Styles API, tileset hosting), and a global, generic geospatial dataset. It monetises map loads and SDK usage.
- **Locnative** is an *authoritative-data location API for Australia* with a **Radar-style geofencing/device/webhook engine**. It monetises API calls over G-NAF/ABS data. It serves a basemap (self-hosted Protomaps) but does **not** render maps for customers.

**Therefore: most of Mapbox's catalog is deliberately out of strategic scope.** The goal of this analysis is *not* "catch up to Mapbox" wholesale — that would dilute the only defensible moat Locnative has. The goal is to identify the **subset of Mapbox capabilities that a location-data API buyer actually expects**, and close those, while consciously declining the map-rendering arms race.

---

## 1. Verified current Locnative surface (from code)

Public API (`/api/v1/*`, API-key auth):

| Domain | Endpoints |
|---|---|
| **Geocoding** | `addresses/geocode` (forward), `addresses/reverse`, `addresses/nearby`, `addresses/autocomplete` (4-tier: prefix → trigram → fuzzy/levenshtein → phonetic/dmetaphone), `addresses/{id}` |
| **Batch geocoding** | `geocode/batch` (POST job), `geocode/batch/{jobId}`, `.../results` (async queue) |
| **Regions** | `regions` — ABS/ASGS statistical-area classification (SA1–SA4, LGA, etc.) |
| **Routing** | `routing/directions` — **driving only**, self-hosted OSRM (Australia OSM extract) |
| **Zones (geofencing)** | CRUD, `zones/contains`, `zones/{id}/addresses`, `zones/inViewport` |
| **Devices** | `devices/{id}/location` (POST), `devices/{id}/zones` |
| **Webhooks** | CRUD, `reactivate`, deliveries — geofence **enter/exit** events, HMAC-signed |
| **Basemap** | Self-hosted Protomaps vector tiles via R2 (`/tiles`) |
| **Platform** | Projects, API keys (PBKDF2-hashed), usage, dashboard, API explorer |
| **SDK** | `@locnative/sdk` (TypeScript): resource-namespaced, auto-retry, idempotent writes, typed errors |

**Data scope:** Australia only. **Data authority:** G-NAF (addresses) + ABS ASGS (boundaries) — government-authoritative.

---

## 2. Mapbox catalog (reference)

**Maps / rendering:** Mapbox GL JS, Maps SDKs (iOS/Android/Flutter/RN), Static Images API, Vector/Raster Tiles API, Styles API, Mapbox Studio, Tilequery API, Tiling Service (MTS), Datasets/Uploads/Tilesets APIs, Boundaries API (v3/v4).

**Navigation:** Directions API (driving / driving-traffic / walking / cycling), Map Matching API, Matrix API, Isochrone API, Optimization API (v1 TSP + v2 VRP), Navigation SDK (turn-by-turn, voice).

**Search:** Geocoding API (v6 — forward/reverse/batch), Search Box API (interactive autosuggest + POI + category search), Address Autofill, Tilequery.

**Data / platform:** Tokens API, Movement/Traffic data products, Terrain-DEM / elevation (Terrain RGB tiles), Weather (newer), Vision SDK. Mature multi-language SDKs, scoped tokens, usage analytics.

---

## 3. Gap inventory — everything Mapbox has that Locnative does not

Grouped by strategic disposition, not just by presence.

### 3A. Gaps worth closing — they fit the data-API positioning
| # | Capability | Mapbox equivalent | Why it matters to *our* buyer |
|---|---|---|---|
| G1 | **Travel-time / distance Matrix** | Matrix API | Logistics/dispatch buyers need N×M ETAs; pure table-stakes alongside directions |
| G2 | **Isochrones / reachability** | Isochrone API | "What's within 15 min drive of this branch?" — catchment analysis, site selection; pairs naturally with our ABS regions |
| G3 | **Map Matching** | Map Matching API | Snap noisy GPS traces to roads — directly complements our device-tracking product |
| G4 | **Multi-profile routing** | walking / cycling / driving-traffic | We only serve `driving`; OSRM supports foot/bike profiles cheaply |
| G5 | **Route optimisation (VRP/TSP)** | Optimization API | High-value for last-mile/field-service; the premium tier of the routing story |
| G6 | **Static Images API** | Static Images API | Server-rendered map PNG (markers, paths) for emails/reports/notifications — many API buyers want this without a JS map |
| G7 | **POI / category search** | Search Box API | Our search is address-only; "find cafes near X" is a top buyer ask (matches Radar Places) |
| G8 | **Address validation/standardisation** | (Mapbox partial; Google/Smarty stronger) | G-NAF gives us an authoritative head-start most can't match |
| G9 | **Tilequery (point-in-tile feature lookup)** | Tilequery API | Lightweight spatial enrichment; partially covered by `zones/contains` + `regions` |
| G10 | **Scoped/restricted tokens + analytics depth** | Tokens API | URL/scope restrictions, per-key usage breakdowns — DX maturity |

### 3B. Gaps to deliberately NOT chase (out of strategic scope)
| Capability | Why decline |
|---|---|
| **GL JS / mobile *rendering* SDKs** | Map rendering is Mapbox's core business and a multi-year, capital-intensive moat. We are a *data* API. (Note: a *mobile geofencing client SDK* — Radar-style — IS strategic, but that's a device/location SDK, **not** a map renderer. Tracked separately in the main competitive doc as P1.) |
| **Mapbox Studio / Styles API / MTS / Datasets / Uploads** | Self-serve cartography pipeline — entirely off-thesis |
| **Global generic geocoding** | Going global forfeits the G-NAF/ABS authority moat; AU-depth beats global-breadth for us |
| **Terrain-DEM / Vision / Weather / Movement data** | Adjacent data products with no tie to our AU-authoritative or geofencing story |
| **Turn-by-turn Navigation SDK (voice)** | Consumer-nav UX; enormous scope, wrong buyer |

### 3C. Already at or near parity (no gap)
- **Forward/reverse/batch geocoding** — we match, and exceed on AU authority + tiered fuzzy/phonetic search.
- **Boundaries** — our ABS/ASGS `regions` endpoint ≈ Mapbox Boundaries, but *more authoritative for AU*.
- **Basemap tiles** — we self-host Protomaps vector tiles (Mapbox Vector Tiles equivalent for display).
- **Server SDK ergonomics** — our TS SDK matches Mapbox's services-js on retries/typing/idempotency.

---

## 4. Where Locnative is BETTER than Mapbox

1. **Authoritative AU address data (G-NAF).** Mapbox's AU address coverage is derived/aggregated; ours is the government source of truth — higher precision, official identifiers, legal defensibility.
2. **Native hosted geofencing + device tracking + webhooks.** Mapbox has **no** hosted zone-state engine with enter/exit webhook events. This is a Radar-class capability Mapbox simply doesn't sell. Our single biggest structural advantage.
3. **ABS/ASGS statistical-region classification.** Native SA1–SA4/LGA classification — Mapbox Boundaries is generic admin/postal, not Australian statistical geography.
4. **Tiered fuzzy/phonetic autocomplete tuned for AU** (trigram + levenshtein + dmetaphone), population/admin-ranked.
5. **Transparent, AU-market pricing potential + owned stack.** No per-map-load metering model; simpler for data-only buyers. Self-hosted OSRM/Protomaps = cost control.
6. **Idempotent writes + HMAC-signed webhooks** as first-class API contracts (Mapbox is read-heavy; less relevant on its side, but a real plus for our event model).

---

## 5. Where Mapbox is BETTER than Locnative

1. **Map rendering** — GL JS + mobile SDKs are best-in-class; we render nothing client-side. *(By design — see §3B.)*
2. **Routing breadth** — multi-profile, traffic-aware, matrix, isochrone, optimisation, map-matching vs our single driving-directions endpoint.
3. **POI/places dataset & search** — global POI index + Search Box; we have addresses only.
4. **Static map images** — we have none.
5. **Cartography pipeline** — Studio/Styles/MTS/Datasets; we serve one fixed basemap.
6. **Global coverage** — worldwide vs AU-only.
7. **SDK & integration breadth** — many languages + huge ecosystem; we have one TS SDK (Python pending).
8. **Elevation/terrain, traffic, weather, movement** data products.
9. **Token scoping & usage analytics maturity.**

---

## 6. Roadmap — closing the in-scope gaps

Phasing reflects buyer pull, effort, and fit with the existing PostGIS + OSRM + Protomaps stack. Sequenced *after* the two items the main competitive doc already flags as higher priority (publish SDK → P0; mobile geofencing client SDK → P1).

### Milestone A — Routing depth ("logistics-ready") · *medium effort, high pull*
Builds directly on the existing self-hosted OSRM deployment.
- **A1. Multi-profile routing** (G4) — enable `walking` + `cycling` OSRM profiles behind the existing `routing/directions` contract. *Smallest win; mostly deployment.*
- **A2. Matrix API** (G1) — `routing/matrix` N×M durations/distances via OSRM `/table`. Add SDK `client.routing.matrix(...)`.
- **A3. Isochrones** (G2) — `routing/isochrone` via OSRM isochrone/`/table` sampling + PostGIS concave-hull; market as "catchment + ABS region overlap" (ties to our moat).
- **A4. Map Matching** (G3) — `routing/match` via OSRM `/match`; position as the natural complement to device tracking.

### Milestone B — Map output & enrichment ("report-ready") · *medium effort*
- **B1. Static Images API** (G6) — server-render Protomaps tiles + markers/paths to PNG (e.g. via a Workers-side raster step or maplibre-gl headless). High utility for notification/email/report use cases with zero client SDK.
- **B2. Tilequery** (G9) — generalise `zones/contains`/`regions` into a point→features lookup endpoint.

### Milestone C — Places & validation ("beyond addresses") · *larger effort*
- **C1. POI/category search** (G7) — ingest an AU POI dataset (OSM POIs, or licensed) into the existing tiered-search infra; expose `places/search` + category filters. Mirrors Radar Places.
- **C2. Address validation/standardisation** (G8) — `addresses/validate` returning corrected/standardised G-NAF-canonical form + confidence. Leverages data authority — *a feature we can do better than Mapbox or Google for AU.*

### Milestone D — Premium routing & DX polish · *opportunistic*
- **D1. Route optimisation** (G5) — VRP/TSP `routing/optimize` (OSRM Trip or a VROOM sidecar). Premium-tier monetisation.
- **D2. Scoped tokens + analytics** (G10) — URL/scope restrictions on API keys, per-key usage breakdowns.
- **D3. Traffic-aware routing** — only if a viable AU traffic feed is sourced; otherwise defer.

### Explicitly deferred / declined
GL JS & map-rendering SDKs, Studio/Styles/MTS cartography pipeline, global geocoding, terrain/vision/weather/movement, turn-by-turn nav SDK (see §3B). Revisit only on a strategy change away from the AU-authoritative-data thesis.

---

## 7. Bottom line

Against Mapbox, Locnative is **behind on the breadth of the geospatial-developer toolkit** (rendering, routing depth, POI, cartography) but **ahead on the two things that define its category**: authoritative Australian government data and a hosted geofencing/device/webhook engine Mapbox doesn't sell at all.

The correct competitive posture is **not parity** — it's to close the *routing-depth* and *places/validation* gaps that data-API buyers genuinely expect (Milestones A–C), borrow the *static-image* convenience (B1), and **consciously decline the map-rendering arms race** that is Mapbox's home turf. Lead, as always, with G-NAF/ABS authority + all-in-one AU geofencing — the quadrant no competitor, Mapbox included, occupies.
