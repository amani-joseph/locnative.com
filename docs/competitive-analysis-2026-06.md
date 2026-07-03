# Locnative.com — Competitive Assessment Report

**Date:** 2026-06-07 · **Updated:** 2026-06-10 (added Mapbox) · **2026-06-16 (current-state refresh)**
**Prepared for:** product/strategy review
**Scope:** Feature & market comparison of locnative.com against 6 competitors —
Radar, Mappify, Google Maps Platform, HERE Technologies, Geoapify, and Mapbox.

> **🔄 2026-06-16 current-state refresh.** Verified against npm + the live codebase, several
> gaps in this baseline have closed: the **TypeScript server SDK is published**
> (`@locnative/sdk@0.4.2`, MIT) and a **web client SDK** shipped (`@locnative/react@0.2.0` —
> hooks + WAI-ARIA combobox); **advanced routing is live** (distance matrix, isochrones,
> map-matching, optimisation, multi-profile — Phase 10 / PR#14); and **international address
> data is being ingested** (Overture/ODA, multiple countries + US), softening the "AU-only"
> framing. Matrix cells and §6 priorities are updated in place (🆕 marks 06-16 changes). Full
> critique + the new Overture-vs-moat strategic fork:
> [`competitive-analysis-evaluation-2026-06-16.md`](./competitive-analysis-evaluation-2026-06-16.md).

> **Mapbox deep-dive:** a dedicated, endpoint-by-endpoint Mapbox comparison and
> roadmap lives in [`analysis/mapbox-comparative-analysis.md`](analysis/mapbox-comparative-analysis.md).
> This report folds Mapbox into the multi-competitor view; the deep-dive carries the
> full gap inventory and the "decline the map-rendering arms race" rationale.

---

## 1. Executive summary

Locnative.com occupies a **genuinely uncontested niche**: *authoritative
Australian location data (G-NAF + ABS ASGS) combined with a real-time geofencing /
device / webhook stack.* No single competitor sits in exactly that square:

- **Mappify** owns AU geocoding but has **no geofencing, devices, or webhooks.**
- **Radar** owns geofencing + device tracking but is global/generic, a large funded
  company, and not built on Australian authoritative data.
- **Google / HERE / Geoapify** are global geocoding/maps platforms; geofencing is
  weak, SDK-side, or absent, and none specialise in G-NAF/ABS.
- **Mapbox** is a global *map-rendering & developer-tooling* platform (GL JS, mobile
  SDKs, Studio, routing depth) with **no hosted geofencing/device/webhook product** and
  no AU-authoritative data — strong where we don't compete, absent where we win.

The strategic one-liner the product can credibly own is **"Radar for Australia,
built on authoritative government data."**

The three biggest competitive gaps, in priority order, are: **(1) no *native* mobile
SDKs** (Radar's core moat — a web client SDK `@locnative/react` has since shipped, but native
iOS/Android/RN/Flutter background geofencing has not), **(2) no places/POI dataset**, and **(3)
no postal address validation/standardisation.** Two gaps this baseline listed have since closed:
the **region/boundary classification** endpoint (ASGS) matched Radar "Regions"/Mappify "area
lookups," and — as of 2026-06-16 — **routing is fully shipped** (matrix / multi-profile /
optimisation / map-matching / isochrones), reaching Mappify/Mapbox routing-feature parity.

---

## 2. Locnative.com feature inventory (as of this review)

**Shipped / in active development:**
- **Geocoding:** autocomplete, forward geocode, reverse geocode, nearby search,
  address-by-ID — over G-NAF.
- **Batch geocoding:** async job submit / poll / results.
- **Zones (custom geofencing):** polygon CRUD, point-in-zone (`contains`),
  addresses-in-zone — PostGIS `ST_Covers`.
- **Devices:** location push, device-in-zone resolution.
- **Real-time events:** boundary crossings + webhook delivery (create/list/delete/
  reactivate).
- **Regions / boundary classification (new):** coordinate → official ABS/ASGS units
  (state, SA1–SA4, LGA, postcode/POA, Commonwealth & State electoral divisions, mesh
  block).
- **Platform:** API explorer, projects/teams, analytics, billing, dashboard,
  self-hosted Protomaps basemap.
- **Developer surface:** OpenAPI 3.1 spec; a **TypeScript server SDK**
  (`@locnative/sdk@0.4.2` — published to npm, MIT, full resource-namespaced coverage, hardened
  with retries/idempotency/typed errors); a **web client SDK** (`@locnative/react@0.2.0` —
  hooks + WAI-ARIA combobox, autocomplete session tokens + proximity). *🆕 2026-06-16.*

**Data foundation:** G-NAF (Geoscape, authoritative AU address file) + ABS ASGS
boundaries — both open/government data. **Geographic scope: AU-authoritative, now expanding to
multi-country via Overture/ODA open data (🆕 2026-06-16 — see the evaluation §5 on the strategic
tension this creates with the AU-authoritative moat).**

**Not present:** **native mobile SDKs** (iOS/Android/RN/Flutter — a *web* client SDK has shipped),
places/POI dataset, IP geolocation, postal address validation/standardisation, fraud/spoof
detection, prebuilt integrations (Segment/Braze/etc.), trip tracking/ETAs.
*(🆕 2026-06-16: "advanced routing" removed from this list — distance matrix, multi-profile,
optimisation, map-matching and isochrones have all shipped.)*

> **Update 2026-06-10:** basic driving directions shipped (`GET /api/v1/routing/directions`).
> **Update 2026-06-16:** the **full routing surface** has since shipped (Phase 10 / PR#14) —
> multi-profile directions (driving/walking/cycling), **distance matrix**, **route optimisation
> (TSP/VRP)**, **map-matching**, and **isochrones** on self-hosted OSRM (`/route`, `/table`,
> `/match`, `/trip`) + PostGIS, all exposed via the SDK `routing` namespace. Routing is no longer
> an open gap. Matrices below reflect the corrected status.

---

## 3. Competitor profiles

### 3.1 Radar (radar.com) — the closest strategic competitor
Full-stack location infrastructure. **Geofencing Platform:** geofences, trips
(tracking + live ETAs + arrival detection), places (POI visit detection), regions
(admin-boundary detection), beacons, fraud (GPS spoof/VPN/tamper), campaigns
(location messaging). **Maps Platform:** geocoding, search/autocomplete + address
validation, routing (distance/matrix/route-matching), base maps, static maps.
**Developer surface (its moat):** native SDKs for iOS, Android, React Native,
Flutter, Capacitor, Cordova, Web; ~30 prebuilt integrations (Segment, Braze,
Amplitude, mParticle, AWS, Salesforce…). Global, hundreds of millions of devices.
**Overlap with locnative:** very high on geofencing/devices/webhooks — but locnative
matches the *engine*, not the *breadth*.

### 3.2 Mappify (mappify.io) — the closest AU competitor
AU-only geocoding + routing on G-NAF. Forward/reverse geocode, **area lookups**
(LGA / postcode / ABS SA units), road distances (driveStats), directions, spreadsheet
paste-to-geocode UI; "DIY spatial analytics" (heatmaps, matrices) marked *coming
soon*. Pricing: **2,500 free requests/day, then ~$1/1,000; $1,000/mo unlimited**, AUD,
no contracts. **Gap vs locnative:** no geofencing, no device tracking, no webhooks,
no real-time eventing. Effectively "locnative minus the geofencing stack, plus
routing."

### 3.3 Google Maps Platform — the incumbent gorilla
Geocoding, Places, autocomplete, geolocation (cell/WiFi), **Address Validation Pro**,
Routes, Time Zone, plus new agentic/MCP grounding. Subscription tiers (Starter $100,
Essentials $275/mo) + PAYG; global, deepest POI dataset, strongest brand. **Weakness
relative to locnative:** no managed geofencing-as-a-service product; generic global
address data (not G-NAF-authoritative for AU edge cases like rural/unit addressing);
cost and complexity at scale.

### 3.4 HERE Technologies — the enterprise platform
Location *data* platform: maps + data (200 countries, 1,000+ attributes), geocoding,
routing, positioning/tracking, low-code/no-code tooling, a data marketplace.
Enterprise/fleet/logistics oriented, heavyweight onboarding. **Relative to
locnative:** strong on tracking/routing/data breadth; not developer-self-serve
friendly, not AU-specialised, geofencing aimed at fleet rather than app developers.

### 3.5 Geoapify — the developer-friendly open-data player
Open-data (OSM, GeoNames, OpenAddresses, GTFS) APIs: geocoding/autocomplete,
maps/tiles, routing, **isolines/reachability**, places/POI, postcode API. Generous
commercial free tier, transparent pricing, indie-developer friendly — the closest
*positioning* analogue to locnative' likely go-to-market. **Gap:** no geofencing,
device tracking, or webhooks; global open data rather than AU-authoritative.

### 3.6 Mapbox (mapbox.com) — the global map-rendering & dev-tooling platform
A different *category* of company: Mapbox monetises **map rendering and developer
tooling**, not hosted location-data APIs. **Maps/rendering (its core):** Mapbox GL JS,
native Maps SDKs (iOS/Android/Flutter/RN), Static Images API, Vector/Raster Tiles,
**Studio + Styles API** (custom cartography), Tiling Service (MTS), Datasets/Uploads,
Boundaries, Tilequery. **Navigation (deep):** Directions (driving/traffic/walking/
cycling), **Matrix, Isochrone, Map Matching, Optimization (TSP/VRP)**, turn-by-turn
Navigation SDK. **Search:** Geocoding v6 (forward/reverse/batch), Search Box (POI +
category), Address Autofill. **Developer surface:** mature multi-language SDKs, scoped
tokens, large ecosystem; global coverage. **Overlap with locnative:** moderate on
geocoding/boundaries/basemap; **near-zero on the thing we sell** — Mapbox has **no
hosted geofencing, no device-state tracking, and no enter/exit webhook product** (its
"geofencing" is an on-device SDK primitive, not a hosted zone-state engine). **Where it
beats us:** routing breadth, map rendering, POI/places, static images, cartography
pipeline, global reach. **Where we beat it:** G-NAF/ABS authority, the entire
geofencing/device/webhook stack, ASGS region classification. *Strategic read: Mapbox is
formidable on map-rendering turf we deliberately decline, and absent on the geofencing/
authoritative-data turf we own — the two products barely contest the same buyer.*

---

## 4. Feature matrix

Legend: ✅ strong / native · ⚠️ partial or indirect · ❌ absent

| Capability | Locnative | Radar | Mappify | Google | HERE | Geoapify | Mapbox |
|---|---|---|---|---|---|---|---|
| Forward/reverse geocoding | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Autocomplete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Batch geocoding | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Nearby / radius search | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Admin-boundary classification | ✅ (ASGS) | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ (Boundaries) |
| Custom geofencing (zones) | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Device location tracking | ✅ (server) | ✅ (SDK) | ❌ | ⚠️ | ✅ | ❌ | ❌ |
| Real-time geofence events / webhooks | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Routing / directions | 🆕 ✅ (multi-profile) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Distance matrix | 🆕 ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Route optimisation (TSP/VRP) | 🆕 ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ |
| Map matching | 🆕 ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| Places / POI dataset | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Address validation/standardisation | ❌ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| IP geolocation | ❌ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Isolines / reachability | 🆕 ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| Fraud / spoof detection | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Static map images | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Map rendering SDK (GL/native) | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| Custom cartography / tileset hosting | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ (Studio/MTS) |
| Client / mobile SDKs | 🆕 ⚠️ (web; native mobile pending) | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| Server SDK(s) | 🆕 ✅ (TS on npm, MIT) | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Prebuilt integrations marketplace | ❌ | ✅ | ❌ | ⚠️ | ✅ | ❌ | ⚠️ |
| Self-hosted/base maps | ✅ (Protomaps) | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| AU-authoritative data (G-NAF/ABS) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Global coverage | 🆕 ⚠️ (multi-country via Overture, expanding) | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

---

## 5. Positioning analysis

**Two axes define the market:** *(x) data scope — AU-authoritative ↔ global-generic*
and *(y) capability — pure geocoding ↔ full geofencing/real-time platform.*

- **Mappify** sits AU-authoritative but low on the capability axis (geocoding/routing
  only).
- **Radar** sits high-capability but global-generic.
- **Google / HERE / Geoapify** cluster global-generic, mid-to-high capability.
- **Mapbox** sits global-generic and high-capability, but on a *different capability
  axis* — map rendering & dev tooling — not the geofencing/real-time axis that defines
  our quadrant. It is strong in a direction orthogonal to ours.
- **Locnative is the only player in the AU-authoritative + high-capability quadrant.**

That quadrant is defensible because the two moats compound: the **G-NAF/ABS data
authority** is hard for global players to care about, and the **geofencing/device/
webhook engine** is hard for Mappify-class geocoders to build. Owning both is the
strategy.

**Risks to the position:**
- **Radar could enter AU** with localised data and instantly out-feature locnative on
  SDKs/POI/routing. Speed to entrench the AU-data moat matters.
- **Mappify could add geofencing** — lower likelihood (different architecture) but it
  is the most direct flanking move.
- **Single-market ceiling:** AU-only caps TAM. The data-authority moat doesn't
  translate to other geographies without equivalent national datasets.
  > **🆕 2026-06-16:** the project has begun ingesting **Overture/ODA open data** for other
  > countries to lift this ceiling — but that is the *same open-data class Geoapify already
  > ships*, which trades the AU-authoritative moat for a crowded global-generic fight. This is
  > now the central strategic fork; see
  > [`competitive-analysis-evaluation-2026-06-16.md`](./competitive-analysis-evaluation-2026-06-16.md) §5
  > before treating intl coverage as pure upside.

---

## 6. Gap assessment & recommendations

**Priority 1 — *Native* mobile SDKs (closes Radar's core moat). (Re-scoped 2026-06-16.)**
Radar's defensibility is a drop-in iOS/Android/RN SDK handling background location,
battery, permissions, and on-device geofence evaluation. A **web client SDK**
(`@locnative/react`) has now shipped — useful, but *not* a substitute for on-device
background geofencing. The isolated remaining gap is **native iOS/Android/RN/Flutter**;
without it, locnative cannot win consumer-app/mobile use cases — the highest-value
geofencing segment. *This is the single most strategic investment.* (Large, multi-quarter
native effort — scope as its own milestone.)

**~~Priority 2 — Routing layer.~~ ✅ DONE (2026-06-16).** Full Mappify/Mapbox routing-feature
parity has shipped (Phase 10 / PR#14): multi-profile directions, distance matrix, optimisation
(TSP/VRP), map-matching, and isochrones on the self-hosted OSRM (`/route`, `/table`, `/match`,
`/trip`) + PostGIS stack. *Caveat: depth/scale not yet benchmarked against Mapbox/Google.*

**Priority 3 — ~~Publish the TypeScript SDK~~ ✅ DONE; then add Python.**
`@locnative/sdk@0.4.2` is **live on npm under MIT** (full coverage, hardened). The remaining
half is a **Python SDK** mirroring the namespaced surface — still materially lowers integration
friction for the server-side/data buyer, the segment locnative can win *today* without native
mobile SDKs.

**Priority 4 — Places/POI + address validation.**
POI visit detection (Radar "Places") and postal address validation/standardisation
(Google Address Validation, Smarty) are common buyer asks. G-NAF already gives a
validation head start for AU.

**Lower priority / watch:** isolines/reachability (Geoapify/HERE/**Mapbox**
differentiator), fraud/spoof detection (Radar-only, niche), integrations marketplace
(only once webhooks have traction), static map images (Mapbox/Google convenience
feature — cheap to add on the Protomaps basemap).

> **Mapbox-specific note:** Mapbox sets the bar for *routing depth* (matrix, isochrone,
> map-matching, optimisation) and *map rendering*. The routing-depth gaps reinforce
> Priority 2; the rendering gaps are **deliberately declined** (Mapbox's core business,
> off our thesis). Full breakdown and a sequenced routing roadmap in
> [`analysis/mapbox-comparative-analysis.md`](analysis/mapbox-comparative-analysis.md).

**Defend now (cheap, high-leverage):**
- Market the **G-NAF + ABS authority** explicitly — it's the moat global players
  won't match. Lead with "official government address & boundary data."
- Lean on the **all-in-one AU geofencing** story against Mappify ("they geocode; we
  geocode *and* tell you when a device enters a zone").
- Price transparently against Mappify's AUD/no-contract model — developer-self-serve
  is where Geoapify and Mappify win and where Google/HERE are weak.

---

## 7. Bottom line

Locnative is **not** a "me-too geocoder." It is the only product pairing
Australian authoritative data with a working real-time geofencing/device/webhook
platform. The recent ASGS region-classification work and the in-progress TypeScript
SDK both reinforce that position. To convert the niche into a durable business:
**entrench the AU-data moat fast, ship client SDKs to unlock mobile geofencing, and
add routing for feature parity with the incumbents buyers already compare against.**
