# Locnative.com — Competitive Reassessment (Post-SDK-Hardening Update)

**Date:** 2026-06-08 · **Amended:** 2026-06-10 (Mapbox column added to matrices) · **2026-06-16 (current-state refresh)**
**Updates:** [`competitive-analysis-2026-06.md`](./competitive-analysis-2026-06.md) (2026-06-07 baseline)
**See also:** [`analysis/mapbox-comparative-analysis.md`](./analysis/mapbox-comparative-analysis.md) — full Mapbox deep-dive & routing roadmap.
**See also:** [`competitive-analysis-evaluation-2026-06-16.md`](./competitive-analysis-evaluation-2026-06-16.md) — critique of this report + the Overture-vs-moat strategic fork.
**Trigger:** The TypeScript SDK moved from *addresses-only, work-in-progress* to
**full 22-method coverage (Phase 0) + publishable & hardened (Phase 1)** this cycle.
This re-scores the same feature framework — only the developer-surface dimensions
moved; the competitor set and capability rows are unchanged.

> **🔄 2026-06-16 current-state refresh.** Several gaps this report listed as open have since
> shipped. Verified against npm + the live codebase: **(1)** `@locnative/sdk@0.4.2` and
> `@locnative/react@0.2.0` are **published to npm (MIT)** — the P0 "publish it" blocker is
> closed; **(2)** advanced routing shipped — **distance matrix, isochrones, map-matching, route
> optimisation, multi-profile** (Phase 10 / PR#14), so those rows flip ❌→✅; **(3)** a **web
> client SDK** (`@locnative/react` — hooks + WAI-ARIA combobox) now exists, so "client SDKs ❌"
> becomes ⚠️; **(4)** **international address data is live** (Overture/ODA adapters, multiple
> countries + US queued), so "AU-only / global ❌" is now ⚠️ and partly obsolete. Cells changed
> in this refresh are marked 🆕; §6 priorities are updated in place. Full critique + the new
> Overture-vs-moat strategic fork it introduces:
> [`competitive-analysis-evaluation-2026-06-16.md`](./competitive-analysis-evaluation-2026-06-16.md).

---

## 1. What changed since the 2026-06-07 baseline

The prior report's §6 ranked the gaps: **P1 client/mobile SDKs**, **P2 routing**,
**P3 finish & publish the TypeScript SDK (then Python)**. This cycle closed most of **P3**:

- **Full endpoint coverage** — the SDK now spans all six resource namespaces
  (`addresses`, `geocode`, `zones`, `devices`, `webhooks`, `regions`), not just addresses.
- **Publishable package** — renamed to the npm-legal `@locnative/sdk`, dual **ESM+CJS**
  with bundled types, `publint` + `are-the-types-wrong` clean. *(Actual `npm publish`
  still pending an org + token + license — so "shipped as code," not yet "on the registry.")*
- **Production-grade hardening** — automatic retries with backoff/jitter, `Retry-After`,
  per-request timeouts + `AbortSignal`, idempotent writes, and typed errors carrying
  `requestId`/`docUrl`/`fields`.

What did **not** change: no client/mobile SDKs (P1), no Python SDK, no places/POI, no
address validation. The strategic picture is the same; the **developer-surface gap
narrowed materially.**

> **2026-06-10 correction:** this line originally read "no routing (P2)." A code
> cross-check shows **basic driving directions have shipped** (`/api/v1/routing/directions`,
> point-to-point, driving only). P2 is therefore *partially* addressed — the *advanced*
> routing surface (distance matrix, multi-profile, optimisation, map-matching, isochrones)
> is what remains. See the §6 P2 update.
> **🆕 2026-06-16:** that advanced surface has since fully shipped (Phase 10 / PR#14); P2 is
> now closed — the matrices and §6 below reflect this.

---

## 2. Developer-surface delta

| Dimension | 2026-06-07 baseline | Now (2026-06-08) |
|---|---|---|
| TS server SDK coverage | addresses-only, WIP | **Full (22 methods)** |
| Packaging / installability | private, raw source | 🆕 **Published — `@locnative/sdk@0.4.2` on npm, MIT** |
| SDK resilience (retries/timeouts) | none | **Built-in** |
| Idempotent writes | none | **Auto `Idempotency-Key`** |
| Typed errors w/ correlation id | basic (code+message) | **`requestId`/`docUrl`/`fields`** |
| Python SDK | none | none (unchanged) |
| Client / mobile SDKs | none | 🆕 **web client SDK shipped** (`@locnative/react` on npm); native mobile still none |

---

## 3. Updated feature matrix

Legend: ✅ strong/native · ⚠️ partial/indirect · ❌ absent · 🔼 improved since baseline

| Capability | Locnative | Radar | Mappify | Google | HERE | Geoapify | Mapbox |
|---|---|---|---|---|---|---|---|
| Forward/reverse geocoding | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Autocomplete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Batch geocoding | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Nearby / radius search | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Admin-boundary classification | ✅ (ASGS) | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| Custom geofencing (zones) | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Device location tracking | ✅ (server) | ✅ (SDK) | ❌ | ⚠️ | ✅ | ❌ | ❌ |
| Real-time geofence events / webhooks | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| **Routing / directions** | **🆕 ✅ (multi-profile)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Distance matrix / optimisation / map-matching | 🆕 **✅** | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Places / POI dataset | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Address validation/standardisation | ❌ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| IP geolocation | ❌ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Isolines / reachability | 🆕 **✅** | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| Fraud / spoof detection | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Map rendering / cartography | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| Client / mobile SDKs | 🆕 **⚠️ (web; native mobile pending)** | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| **Server SDK(s)** | **🆕 ✅ (TS on npm, MIT)** | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| **SDK resilience (retry/idempotency/typed errors)** | **🔼 ✅** | ✅ | n/a (SDK-light) | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Prebuilt integrations marketplace | ❌ | ✅ | ❌ | ⚠️ | ✅ | ❌ | ⚠️ |
| Self-hosted/base maps | ✅ (Protomaps) | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| AU-authoritative data (G-NAF/ABS) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Global coverage | 🆕 **⚠️ (multi-country via Overture, expanding)** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

**Changes from baseline:** *Server SDK(s)* ⚠️→✅ (with publish caveat); added an explicit
**SDK resilience** row — a depth dimension the original presence/absence matrix didn't capture,
where Locnative now matches Radar and *exceeds* the geocoding-only players whose SDKs are thin
wrappers. **2026-06-10 (status correction):** *Routing / directions* ❌→**⚠️🔼** — a code
cross-check confirmed `GET /api/v1/routing/directions` is **live** (point-to-point, **driving
only**, OSRM `/route`, returns distance + duration + geometry; SDK `routing.directions`). It was
mis-scored ❌ in the SDK-focused baseline. *Distance matrix, route optimisation, map-matching,
isochrones remain genuinely absent* (OSRM `/table` and `/match` are not wired up). **2026-06-10:**
added the **Mapbox** column (and a *map rendering / cartography* row) —
Mapbox is strong on map-rendering/routing-depth dimensions and, like every non-Radar competitor,
**absent on hosted geofencing/device/webhooks**. Its server SDK is mature but not idempotency-
hardened, so it lands ⚠️ on the resilience row alongside the other geocoders.

---

## 4. SDK depth — the new competitive surface

The original matrix scored SDK *presence*. Post-hardening, the more honest comparison is
*quality*, which is where buyers actually feel friction:

| SDK quality trait | Locnative | Radar | Google (services-js) | Mapbox (sdk-js) | Mappify/Geoapify |
|---|---|---|---|---|---|
| Resource-namespaced surface | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| Auto-retry + backoff | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| Idempotent writes | ✅ | n/a | n/a | n/a | ❌ |
| Typed errors + request id | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Dual ESM+CJS + shipped types | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Installable from npm today | 🆕 ✅ (`@locnative/sdk@0.4.2`, MIT) | ✅ | ✅ | ✅ | ✅ |

**Read:** on *server-SDK ergonomics* Locnative now sits at parity with Radar and ahead of the
AU/open-data geocoders — a credible "Stripe-grade server SDK for AU location data" claim, **once
it's actually on npm.** The publish step is now the gating item, not the engineering.

---

## 5. Updated positioning

The quadrant thesis is unchanged — **AU-authoritative data × full geofencing/real-time
platform** remains uncontested. What shifted is the *credibility of the developer story within
that quadrant*: the server-side buyer (data/geocoding/backend integrations) can now adopt a
typed, resilient SDK rather than hand-rolling fetch calls. That is the segment Locnative can
win **today, without mobile SDKs** — and the baseline report named it as exactly the cheap,
high-leverage move. It is now largely executed on the engineering side.

The ceiling is also unchanged: the **client/mobile SDK gap (Radar's moat)** still caps the
consumer-app/mobile-geofencing segment, and remains the single most strategic investment.

---

## 6. Re-prioritised gaps

**~~P0 — actually publish the SDK.~~ ✅ DONE (2026-06-16).** `@locnative/sdk@0.4.2` and
`@locnative/react@0.2.0` are live on npm under **MIT**. The Phase 1 value now reaches buyers; this
was the highest-ROI item and it is closed.

**P1 — Native mobile SDKs (re-scoped 2026-06-16).** A **web client SDK** (`@locnative/react` —
hooks + WAI-ARIA combobox) has shipped, so the gap is now isolated to **native iOS/Android/RN/
Flutter** — on-device background geofencing, the actual Radar moat. Still multi-quarter; own
milestone.

**~~P2 — Routing.~~ ✅ DONE (2026-06-16).** Full surface shipped (Phase 10 / PR#14): multi-profile
directions (driving/walking/cycling), **distance matrix**, **route optimisation (TSP/VRP)**,
**map-matching**, and **isochrones** on self-hosted OSRM (`/route`, `/table`, `/match`, `/trip`) +
PostGIS. *Caveat: depth/scale not yet validated against Mapbox/Google before sales claims.*

**P3 — Server-side DX completion.** (a) **Phase 2 API-side DX** (error envelope, rate-limit
headers, idempotency *enforcement*) — the SDK is already forward-compatible and *sends* the
signals; the server must *emit/enforce* them to realise the resilience story end-to-end.
(b) **Python SDK** — the remaining half of baseline P3, mirroring the now-proven namespaced
surface.

**P4 — Places/POI + address validation (unchanged).**

**Defend now (unchanged):** lead with G-NAF + ABS authority and all-in-one AU geofencing; price
transparently in AUD against Mappify; and **now add "typed, resilient official SDK" to the
developer-self-serve pitch** — a concrete, demonstrable edge over Mappify/Geoapify the moment the
package is published.

---

## 7. Bottom line

The baseline's verdict holds — Locnative is the only AU-authoritative + real-time-geofencing
player — but the **developer surface is no longer a soft spot on the server side.** This cycle
converted the most-cited "SDK is WIP" gap into a publishable, Radar-grade server SDK. The
competitive needle now turns on one cheap action (**publish it**) and one expensive one (**client
SDKs**). Ship the former this week; scope the latter as its own milestone.

> **2026-06-16:** the cheap action is **done** (SDK + React on npm, MIT) and routing has fully
> shipped. The remaining frontier is two-fold: (1) **native mobile SDKs** (the expensive Radar
> moat — web client SDK is only a down-payment), and (2) a strategic fork the Overture global
> ingestion has opened — staying AU-authoritative vs competing global-generic. See
> [`competitive-analysis-evaluation-2026-06-16.md`](./competitive-analysis-evaluation-2026-06-16.md) §5.
