# Locnative.com — Executive Brief & Forecast

**June 2026 · ANZ-first · Read time: ~3 min**

---

## The one-liner

**Locnative is Radar.io for ANZ** — a single API for geocoding, address autocomplete, geofencing, device tracking and webhooks — built on the open G-NAF address file, billed in AUD, and hosted with AU data residency. It undercuts Google Maps on price and beats US platforms on local-address authority and sovereignty.

## What's already built (de-risked)

Geocoding + reverse, tiered autocomplete, batch geocoding (async, R2), zones/geofencing (PostGIS), device tracking, boundary-crossing events, HMAC webhooks with retry, plus the full dev platform (projects, API keys, teams, usage metering, API explorer, docs, billing). **This is a working platform, not a concept.** The main open item is finishing the BetterAuth migration and the <100ms autocomplete (Phase 5).

## Why now

1. **Google Maps "bill shock"** since the 2025 pricing changes (~$5/1k geocodes) is driving an active hunt for alternatives — Radar wins US deals at ~$0.50/1k. ANZ has no native equivalent.
2. **AU last-mile boom** — ~US$4B (2026) → ~US$8.6B (2033); last-mile is **41–53% of logistics cost**, so address accuracy + arrival events have hard ROI.
3. **APAC is the fastest-growing geocoding region (~19.3% CAGR).**
4. **Open G-NAF + data-sovereignty tailwinds** make an ANZ-native, AU-hosted platform both cheap to supply and easy to differentiate.

## Market size (directional)

| Layer | Estimate |
|---|---|
| Global geocoding API | ~US$1.2–1.45B (2024) → ~US$4.2–4.8B (2033), CAGR ~13–17% |
| Global geocoding + reverse | US$12.3B (2022) → US$33.4B (2030) |
| AU last-mile delivery (beachhead-adjacent) | ~US$4B (2026) → ~US$8.6B (2033) |

## Target customers (priority order)

1. **Logistics & last-mile / courier tech** — uses the whole stack; biggest pain, clearest ROI.
2. **Field service / fleet (CoR/NHVR compliance)** — geofenced clock-in, audit trails.
3. **On-demand marketplaces** — autocomplete + delivery zones + driver geofencing.
4. **Proptech / insurtech / govtech** — G-NAF authority + AU data residency (sales-led, high ARPU).
5. **Indie devs / SaaS** — Google bill-shock refugees; the PLG top-of-funnel.

## Recommended model

**Hybrid PLG → enterprise, usage-based, AUD-native.** Free tier on open G-NAF Core → metered usage (geocodes, geofence MAU/events, webhooks) → enterprise upsell (G-NAF Live freshness, SLAs, residency, audit logs, volume) to logistics/insurtech/govtech. The PLG funnel produces the reference logos that de-risk enterprise sales.

## Defensibility (be honest in any pitch)

The address data is **not** the moat — G-NAF Core is free. The moat is: **(1)** unified geocoding + geofencing + device + webhook primitives on one key/bill; **(2)** developer experience + price vs Google; **(3)** AU data residency US platforms can't match; **(4)** optional G-NAF Live freshness for enterprise. Speed to own the ANZ developer relationship — before Geoscape moves up-stack or Radar localises — is the real race.

## 18-month forecast (scenario framing, not a financial model)

| Scenario | Driver | Outcome shape |
|---|---|---|
| **Base** | Ship Phase 5 + serviceability endpoint + AUD pricing; PLG capturing bill-shock refugees | Steady self-serve signups, a handful of logistics/marketplace paid accounts, 1–2 enterprise pilots |
| **Bull** | Above + 2–3 lighthouse logistics/insurtech logos + NZ dataset + audit-grade events | PLG funnel compounds, enterprise upsell motion proven, defensible ANZ category leader |
| **Bear** | Auth/billing unfinished, accuracy not benchmarked, Geoscape/Radar move first | Stuck as a cheaper-geocoding commodity; differentiation erodes to price alone |

**The fork between Bull and Bear is execution, not market** — the demand and the build both exist.

## Next 5 moves

1. Finish auth/billing migration → enterprise-ready.
2. Ship <100ms autocomplete + a one-call **serviceability** endpoint.
3. Add **dwell-time / richer geofence events** + **webhook replay** → logistics/field-service trust.
4. Publish **AUD usage pricing + free tier** and a **Google-cost-vs-Locnative** calculator (Radar's #1 acquisition asset).
5. Land **2 lighthouse logos** (one logistics, one insurtech/govtech) as proof + accuracy benchmark.

*Figures are third-party analyst estimates; see COMPREHENSIVE-REPORT.md §Sources. Forecast scenarios are directional, not a financial projection.*
