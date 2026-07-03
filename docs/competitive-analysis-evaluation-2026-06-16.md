# Evaluation — Competitive Analysis (`competitive-analysis-update-2026-06-08.md`)

**Date:** 2026-06-16 · **Evaluator pass over:** the 2026-06-08 update (corrections through 06-10)
**Method:** read the 06-08 + 06-07 reports, then cross-checked every load-bearing claim
against the live codebase, npm, and the prod ingestion manifest.

---

## 1. Verdict on the 06-08 document

**As a piece of analysis it is good: well-structured, honest about its own caveats, and
methodologically sound** for the moment it was written. Strengths worth keeping:

- **The quadrant thesis** (AU-authoritative data × full geofencing/real-time) is a genuine,
  defensible framing — not the usual "feature-count" comparison.
- **It separated SDK *presence* from SDK *quality*** (§4) — the right instinct; quality is
  where buyers feel friction.
- **It self-corrected** (the 06-10 routing amendment) rather than leaving a wrong ❌ standing.
- **It was honest about the publish gap** ("shipped as code, not on the registry").

**But it is now materially stale.** The document's own framing made it fragile: it pinned the
whole story on two pending items ("publish the SDK" + "client SDKs"), and *one of those plus three
other rows have since moved.* An eight-day-old strategy doc in a repo shipping multiple PRs/week
should be treated as a snapshot, not current truth — and this one has aged past its half-life.

The deeper methodological weakness: **it under-scoped the comparison to a feature presence/absence
matrix.** It never examined *how* competitors build their SDKs, what DX patterns they standardise
on, or where their approaches have gaps Locnative could exploit. That is the widening this
evaluation adds (§4).

---

## 2. Staleness audit — claims now false or outdated

Verified against code/npm/manifest on 2026-06-16:

| 06-08 claim | Status now | Evidence |
|---|---|---|
| "P0: actually publish the SDK … not yet installable … `UNLICENSED`" | **DONE** | `@locnative/sdk@0.4.2` live on npm, **MIT** (`npm view`; commits `df09671`, `2111813`) |
| "Distance matrix / optimisation / map-matching ❌" | **SHIPPED** | Phase 10 / PR#14 `6e1a0ce`: matrix, isochrone, match, optimize + OSRM 3-profile |
| "Routing ⚠️ driving only" | **Multi-profile + advanced** | OSRM foot/bike/car wired; `routing.ts` SDK surface |
| "Client / mobile SDKs ❌ (unchanged)" | **Partially false** | `@locnative/react@0.2.0` on npm — web client SDK: `use-autocomplete`, `use-routing`, `use-reverse-geocode`, `use-zone-contains`, WAI-ARIA `combobox`, autocomplete cache. *(Native iOS/Android/RN/Flutter still absent — see §5.)* |
| "Global coverage ❌ / AU-authoritative only" | **Being dismantled** | `addresses.country` varchar(2) + country indexes; Overture + ODA adapters; manifest shows IS/LU/FO/LI promoted to prod; intl ingestion PRs #15/#19; full US queue |
| "Python SDK: none" | **Still true** | only TS + React packages exist |
| Autocomplete = basic | **Google-grade** | session tokens + proximity biasing (`4447042`); `google-inspired-optimizations-review.md` |

**Net:** of the 06-08 report's six "what did NOT change" items, **three have since changed**
(SDK published, routing depth, web client SDK), and a fourth (global coverage) is mid-flight.
The document's "bottom line" — *"the needle turns on one cheap action (publish it) and one
expensive one (client SDKs)"* — is **half-resolved**: the cheap action is done; the expensive one
narrowed from "all client SDKs" to "native mobile only."

> Note: a `feature-gap-reevaluation-2026-06-15.html` (commit #16) already exists and partially
> refreshes this. This evaluation supersedes the *strategic* read and widens the SDK scope.

---

## 3. Refreshed feature posture (2026-06-16)

Rows that should flip from the 06-08 matrix:

- **Routing / directions:** ⚠️ → **✅** (multi-profile p2p)
- **Distance matrix / optimisation / map-matching:** ❌ → **✅**
- **Isolines / reachability:** ❌ → **✅** (isochrone shipped)
- **Server SDK(s):** ⚠️/pending → **✅ (on npm, MIT)**
- **SDK installable from npm today:** ⚠️ → **✅**
- **Client SDKs:** ❌ → **⚠️ (web yes; native mobile no)**
- **Global coverage:** ❌ → **⚠️ (multi-country live, expanding)**

This is a large swing. On the **server-developer surface Locnative is now at or above parity
with everyone except Radar**, and with the routing block closed it has reached **Mappify/Mapbox
routing-feature parity** (depth/scale untested, but the surface exists).

---

## 4. Widening the scope — competitor SDK *approaches* & best practices

The 06-08 report scored SDKs as a checklist. Here is the qualitative comparison it omitted —
*how* each competitor builds, what they standardise on, and where Locnative now lands.

### Radar — the bar for *client* SDKs
- **Approach:** native-first. iOS (Swift), Android (Kotlin), RN, Flutter, Capacitor, Cordova,
  Web. The product *is* the on-device SDK: background location, battery/permission management,
  on-device geofence evaluation, offline queueing. Server SDKs are secondary.
- **Best practice they own:** the hard, unglamorous mobile-runtime work (Doze mode, iOS
  significant-location-change, motion-activity fusion). This is a multi-quarter moat, not a
  feature.
- **Locnative vs:** server SDK now at parity (namespaced, retries, idempotency, typed errors).
  **Native mobile is the one true remaining gap** — and it is the expensive one.

### Google Maps Platform — the *billing-aware* DX bar
- **Approach:** `@googlemaps/google-maps-services-js` (server, thin but typed),
  `@googlemaps/js-api-loader` + Places library (client), and **session tokens** for autocomplete
  to control per-keystroke billing. Pushing agentic/MCP grounding.
- **Best practice they own:** autocomplete **session tokens** (bill per session, not keystroke)
  and proximity/`locationBias`. **Locnative has now adopted both** (`4447042`) — a concrete DX
  parity win the 06-08 doc predates.
- **Locnative vs:** ahead on resilience (Google's JS client has no idempotency/typed-error
  envelope); behind on POI/global breadth.

### Mapbox — the bar for *framework-native* components & routing depth
- **Approach:** `mapbox-sdk-js` (server, service-namespaced), GL JS, native nav SDKs, and
  **Search JS + Address Autofill as React components** (`<AddressAutofill>`, `<SearchBox>`).
  Scoped tokens, large ecosystem.
- **Best practice they own:** drop-in **framework-native UI components** (not just hooks) and
  routing depth (matrix/isochrone/optimization/map-matching).
- **Locnative vs:** routing depth now matched; `@locnative/react` gives hooks + a combobox but
  **not yet a batteries-included `<AddressAutofill>`-style component** — a cheap, high-leverage
  next step that would close the visible-DX gap with Mapbox/Geoapify.

### Geoapify — the *positioning* analogue (open data + indie DX)
- **Approach:** thin REST + a **React Geocoder Autocomplete** component + Leaflet plugins.
  Open data (OSM/OpenAddresses/**Overture-class**), generous free tier, transparent pricing.
- **Best practice they own:** frictionless self-serve + a ready-made autocomplete widget.
- **Locnative vs:** **this is now the most dangerous comparison** — see §5. SDK resilience is
  ahead; the open-data-global story is converging.

### HERE / Mappify — SDK-light
- HERE: enterprise REST, heavyweight onboarding, not self-serve-friendly.
- Mappify: essentially SDK-less (REST + spreadsheet UI). Locnative is decisively ahead on DX.

### Scorecard — Locnative SDK posture, 2026-06-16
- **Leads the field on:** server-SDK resilience (retry/backoff/idempotency/typed errors w/
  `requestId`/`docUrl`/`fields`) — Stripe-grade, beyond every geocoder and on par with Radar's
  server tier.
- **At parity on:** namespaced surface, ESM+CJS+types, npm availability, autocomplete session
  tokens/proximity, React hooks, routing-feature surface.
- **Behind on:** **native mobile SDKs** (Radar), **Python/multi-language** server SDKs (Google/
  HERE/Mapbox), **drop-in framework UI components** (Mapbox/Geoapify), **OpenAPI-generated client
  fan-out** (most majors auto-generate; Locnative hand-writes — fine now, a scaling tax later).

---

## 5. The strategic tension the docs miss — Overture dilutes the moat thesis

This is the most important finding and **neither dated report addresses it.**

The entire 06-08/06-07 positioning rests on one sentence: *"AU-authoritative G-NAF/ABS data that
global players won't match."* But the live intl ingestion uses **Overture Maps** (open data) — the
**same class of open data Geoapify already ships globally.** As Locnative adds Overture-backed
countries it is **walking out of the uncontested AU-authoritative quadrant and into the crowded
global-generic open-data quadrant** where Geoapify, and ultimately Google/HERE/Mapbox, are
stronger and better-funded.

Two coherent strategies; the project must pick one consciously:

1. **Stay AU-deep (recommended for the moat):** treat intl as *opportunistic coverage*, keep the
   marketing and pricing anchored on G-NAF/ABS authority + the geofencing stack. Overture
   countries are a "nice to have," never the headline. Moat intact.
2. **Go global-generic:** accept the head-on fight with Geoapify/Mapbox on open data. Then the
   *real* differentiator must become the **hosted geofencing/device/webhook engine + SDK
   resilience**, because the data is no longer unique. This is viable but is a different company.

**The risk of drifting between them:** spending scarce effort ingesting 28 countries of
Overture data that is *worse than Geoapify's equivalent and undermines the "authoritative"
claim*, while the actual moat (native mobile SDK + AU data depth) goes unfunded. The dated docs
can't flag this because they predate the ingestion.

---

## 6. Re-prioritised gaps (2026-06-16)

- **~~P0 publish the SDK~~ — DONE.**
- **P1 — Native mobile SDKs (iOS/Android/RN/Flutter).** Unchanged and now *isolated* as the
  single defining gap vs Radar. The web React SDK is a partial down-payment, not a substitute for
  on-device background geofencing. Own milestone, multi-quarter.
- **P2 — Resolve the Overture/moat tension (§5).** A *positioning* decision, not engineering —
  but it gates how every other gap is prioritised. Do this first; it's free.
- **P3 — Close the visible-DX gap:** ship a drop-in `<AddressAutofill>`-style React component
  (Mapbox/Geoapify parity) and the **Python SDK** (the remaining half of the original baseline
  P3). Both cheap, both high-leverage for self-serve.
- **P4 — Server-side DX completion:** API must *emit/enforce* the resilience signals the SDK
  already sends (error envelope, rate-limit headers, idempotency enforcement).
- **P5 — Places/POI + address validation.** Unchanged. (Note: Overture also has a Places theme —
  if going global anyway, this gets cheaper.)
- **Watch:** routing now shipped but **untested at scale/depth** vs Mapbox/Google — validate
  before claiming parity in sales material.

---

## 7. Bottom line

The 06-08 report was a sound snapshot that **aged out faster than it expected** — three of its
six "unchanged" gaps have closed and a fourth is mid-flight. The server-developer story it framed
as the cheap win is **largely won**: published, hardened, multi-profile routing, Google-grade
autocomplete, a web React SDK. **Two things now define the competitive frontier:** (1) the
**native-mobile gap vs Radar** (the real, expensive moat), and (2) an **unacknowledged strategic
fork** — the Overture global ingestion quietly trades the AU-authoritative moat for a fight
Locnative is not yet equipped to win. Decide §5 before funding anything else.
