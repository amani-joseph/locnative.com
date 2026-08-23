# Locnative.com — Target User & Market Research Report

**Prepared:** June 2026
**Scope:** ANZ-first (Australia/New Zealand) with global expansion roadmap
**Purpose:** Product roadmap prioritisation, go-to-market & positioning, and fundraising/strategy grounding
**Status:** Strategic working document — figures cited are third-party market estimates (see Sources)

---

## 1. What Locnative.com Actually Is

The repo is framed internally as a "BetterAuth migration," but the implemented product is far larger: **a developer-facing location-intelligence API platform**, ANZ-native, built on Cloudflare Workers + Neon Postgres/PostGIS + R2.

### Implemented capability surface (verified in code)

| Capability | Evidence | Maturity |
|---|---|---|
| **Geocoding API** (forward/reverse + autocomplete) | `packages/api/.../public/geocode.ts`; tiered search prefix→trigram→fuzzy→phonetic with population/proximity ranking (Roadmap Phase 5) | Core, near-complete |
| **G-NAF address corpus** | `addresses` table with `gnaf_pid`, `population_score`, `admin_level`, PostGIS `geometry(Point)` + GIST indexes | Australian national address file |
| **Batch geocoding** | `batchGeocodeJobs` table, R2 results storage, async queue `apps/server/src/queues/batch-geocode.ts`, progress UI | Working |
| **Zones / geofencing** | `zones` (PostGIS Polygon), draw tools, point-in-polygon testing | Working |
| **Device tracking** | `deviceZoneState` (lat/lon per device per project) | Working |
| **Boundary crossings** | `public/boundary-crossings.ts` — entry/exit (geofence) events | Working |
| **Webhooks** | HMAC-signed delivery, `webhookSubscriptions` + `webhookDeliveryAttempts`, retry timeline | Working |
| **Developer platform** | projects, API keys (hashed+encrypted), teams/invitations, usage metering (`apiUsageDaily`), API explorer, docs, billing, analytics, integrations | Working |
| **Auth** | BetterAuth, Google/GitHub OAuth, email/password | Migration in progress |

**One-line positioning:** *Locnative is what Radar.io is to the US — a unified geocoding + geofencing + device-tracking + webhooks API — but ANZ-native, billed in AUD, and built on the open G-NAF address file.*

---

## 2. Market Context & Sizing

### 2.1 The category is growing fast

- **Geocoding API market:** ~US$1.2–1.45B (2024) → ~US$4.2–4.8B (2033), **CAGR ~13–17%**.
- **Broader geocoding + reverse geocoding:** US$12.3B (2022) → US$33.4B (2030), CAGR ~13.3%.
- **Asia-Pacific is the fastest-growing region (~19.3% CAGR)** — favourable for an ANZ-first player.
- Demand drivers: location-based services, IoT/device proliferation, real-time geospatial analytics, e-commerce/last-mile logistics.

### 2.2 The ANZ wedge — last-mile is the on-ramp

- **Australia last-mile delivery:** ~US$3.9–4.2B (2024/26) → ~US$8.6B (2033), CAGR ~7–9%.
- **Last-mile = 41–53% of total logistics cost in Australia** → address quality and arrival-event accuracy have direct, quantifiable ROI (failed deliveries are expensive).
- E-commerce growth, same-day expectations, route optimisation, and EV/autonomous pilots all consume geocoding + geofencing primitives.

### 2.3 SAM framing (top-down, indicative)

- **TAM:** global location-API spend, the multi-billion geocoding + mapping + geofencing pool.
- **SAM:** ANZ developers/businesses needing geocoding, address validation, geofencing and device events — a slice of the APAC-fastest-growing region, anchored by AU's ~16M G-NAF addresses and a digitising logistics/proptech/govtech base.
- **SOM (realistic 3-yr beachhead):** ANZ logistics-tech, proptech, field-service, on-demand marketplaces, and indie SaaS teams currently over-paying Google Maps or wrestling raw G-NAF themselves.

---

## 3. The Competitive Landscape

### 3.1 Global API platforms

| Competitor | Strength | Locnative angle |
|---|---|---|
| **Google Maps Platform** | Ubiquity, coverage, brand | **Price** — Google charges ~US$5/1k geocodes; "bill shock" since 2025 pricing changes is the #1 switching trigger. Also data residency. |
| **Radar.io** | The model to emulate: unified geocoding + geofencing + tracking; ~US$0.50/1k (≈90% cheaper than Google), free tier 100k/mo | US-centric DNA; Locnative wins on **ANZ-native data (G-NAF), AUD billing, AU data residency** |
| **Mapbox / HERE / TomTom / Esri** | Maps, routing, enterprise GIS | Heavier, costlier, not ANZ-address-authoritative |
| **Geoapify / Geocodio / LocationIQ** | Cheap geocoding | Geocoding only — no geofencing/device/webhook stack; weak ANZ authority |
| **Loqate / Melissa / Experian** | Address verification at checkout | Verification only; expensive; Locnative bundles verification + the live stack |

### 3.2 The ANZ incumbents — and the moat question

- **Geoscape Australia** is the source-of-truth: it publishes **G-NAF Core for free** (quarterly), and sells **G-NAF Live** (daily/weekly freshness) + Hub APIs (verification, autocomplete, bulk CSV). ~15.9M addresses.
- **Critical implication:** *the raw address data is not a moat* — G-NAF Core is open. Anyone can load it. **The defensibility is the layer on top:**
  1. **Unified primitives** — geocoding + geofencing + device state + webhooks in one API/key/bill (Geoscape sells data, not a live event platform).
  2. **Developer experience & price** — self-serve keys, API explorer, docs, usage metering, AUD pricing that undercuts Google.
  3. **Data residency / sovereignty** — Cloudflare + Neon hosted in AU regions; an ANZ-data-stays-in-ANZ promise that US platforms can't easily match.
  4. **Freshness pass-through** — option to layer G-NAF Live on top for enterprise customers who need it.

> **Strategic risk to name in any investor doc:** Geoscape could move "up the stack" into developer APIs, and Radar could localise to ANZ. The defensible position is to own the *ANZ developer relationship + the unified event stack* before either does.

---

## 4. Target User Segments (ANZ-first)

Ranked by fit between **implemented features** and **segment job-to-be-done (JTBD)**.

### Tier 1 — Beachhead (build/tune for these first)

**A. Logistics & last-mile / courier tech**
- JTBD: normalise messy customer addresses, geofence depots/delivery zones, fire arrival/ETA webhooks, batch-geocode manifests for routing.
- Uses: geocoding, batch, zones, boundary crossings, webhooks, device tracking — *the whole stack*.
- Why now: AU last-mile boom; last-mile = ~half of logistics cost; Google bill pain at scale.
- Feature tuning: bulk/manifest geocoding throughput, arrival-confidence tuning on geofences, webhook reliability/replay, AUD volume pricing.

**B. Field service / fleet / trades (compliance-driven)**
- JTBD: geofenced job-site clock-in, vehicle/asset location, Chain-of-Responsibility (CoR/NHVR) audit trails.
- Uses: device tracking, zones, boundary crossings, webhooks.
- Feature tuning: dwell-time events (not just entry/exit), audit-grade event logs, per-site zone metadata.

**C. On-demand marketplaces (food, grocery, home services, gig)**
- JTBD: address autocomplete at checkout, delivery-zone eligibility, driver geofencing, order-event webhooks.
- Uses: autocomplete, zones, device tracking, webhooks.
- Feature tuning: sub-100ms autocomplete (Phase 5), serviceability "is this address in any zone?" endpoint, zone-membership webhooks.

### Tier 2 — High-value expansion

**D. Proptech / real estate** — address autocomplete + **G-NAF PID resolution** (link any address to the authoritative property ID), property/catchment zones, form-fill validation.

**E. Insurtech / risk** — geocode-to-risk, peril zones (flood/bushfire — acutely ANZ-relevant), boundary-based pricing. Tuning: high-precision reverse geocoding, zone metadata for risk attributes.

**F. Govtech / utilities / emergency services** — authoritative G-NAF addressing, service/asset zones, data-sovereignty mandate. Sales-led; values residency + accuracy over price.

### Tier 3 — PLG volume / funnel

**G. Indie developers, internal tools, SaaS builders** — escaping Google Maps bill shock; want a cheap, well-documented geocoding/autocomplete API with a generous free tier. Low ARPU individually but the **top of the funnel** that feeds Tiers 1–2 and produces word-of-mouth.

---

## 5. Feature ↔ Segment Fit Matrix

| Feature | Logistics | Field svc | Marketplace | Proptech | Insurtech | Govtech | Indie/PLG |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Geocoding / reverse | ●●● | ●● | ●● | ●●● | ●●● | ●●● | ●●● |
| Autocomplete (<100ms) | ●● | ● | ●●● | ●●● | ● | ●● | ●●● |
| Batch geocoding | ●●● | ●● | ● | ●● | ●●● | ●●● | ● |
| Zones / geofencing | ●●● | ●●● | ●●● | ●● | ●●● | ●●● | ● |
| Device tracking | ●●● | ●●● | ●●● | ○ | ○ | ●● | ○ |
| Boundary crossings | ●●● | ●●● | ●●● | ○ | ●● | ●● | ○ |
| Webhooks | ●●● | ●●● | ●●● | ● | ● | ● | ● |
| G-NAF PID resolution | ●● | ●● | ● | ●●● | ●●● | ●●● | ● |
| Data residency (AU) | ●● | ●● | ●● | ●● | ●●● | ●●● | ● |

●●● critical · ●● valuable · ● nice-to-have · ○ irrelevant

**Read:** Logistics, field-service and marketplaces light up the *entire* stack — they are where the product is uniquely differentiated vs. geocoding-only competitors. Proptech/insurtech/govtech monetise the **G-NAF authority + residency** angle. Indie/PLG monetises **price + DX**.

---

## 6. Business Model Recommendation (you asked me to advise)

**Recommended: hybrid PLG → enterprise, usage-based, AUD-native.**

1. **PLG core (bottom-up):** free tier on open G-NAF Core (e.g. generous monthly geocodes/autocompletes), self-serve keys, transparent usage-based pricing that **undercuts Google ~80–90%** (benchmark Radar's ~$0.50/1k). Capture the bill-shock refugees and indie builders → Segment G feeds the funnel.
2. **Usage-based growth tier:** metered geocoding + geofencing MAU/events + webhook volume. `apiUsageDaily` already exists to support this.
3. **Enterprise/sales-led upsell (top-down):** logistics, insurtech, govtech. Sell **G-NAF Live freshness, SLAs, data residency, audit-grade event logs, dedicated zones, volume commits.** This is where Geoscape-data-only and US-only competitors can't follow.

**Why hybrid:** the implemented feature set (cheap geocoding *and* a full event stack *and* usage metering *and* teams) is built for both motions. Pure-PLG leaves the high-ARPU compliance segments (gov/insurance) on the table; pure-enterprise wastes the unfair DX/price advantage. The PLG funnel also *de-risks* enterprise sales by producing reference logos and bottom-up champions.

---

## 7. Roadmap Implications (what to build/tune next, by priority)

1. **Finish Phase 5 autocomplete (<100ms tiered + proximity)** — unlocks marketplaces & proptech; it's your most-demanded primitive.
2. **Serviceability endpoint** — "which zones contain this point/address?" (one call) — directly serves logistics + marketplaces.
3. **Dwell-time & richer geofence events** (not just entry/exit) — unlocks field-service compliance and fleet.
4. **Webhook reliability: replay, dead-letter, delivery dashboard** — table-stakes for logistics/marketplace trust (timeline UI exists; add replay).
5. **G-NAF PID resolution endpoint + AU data-residency statement** — unlocks proptech/insurtech/govtech and is a clean differentiator vs. US APIs.
6. **AUD usage-based pricing + free tier page** — convert the bill-shock narrative into signups.
7. **NZ address dataset (expansion trigger)** — the `country` column is already there; NZ (LINZ data) is the natural second market.

---

## 8. Risks & Open Questions

- **Data moat is thin** (G-NAF Core is free) → defensibility must come from DX, the unified event stack, residency, and freshness. Make this explicit.
- **Incumbent encroachment** — Geoscape moving up-stack; Radar localising. Speed to own the ANZ dev relationship matters.
- **Auth migration is still in flight** — Tier-1 enterprise deals need rock-solid auth/teams/billing; finish it before sales-led motion.
- **Coverage credibility** — buyers will test edge addresses (units, rural, new estates). Accuracy benchmarking vs Geoscape/Google is a needed sales asset.

---

## Sources

- [Geocoding API Market (market.us / growthmarketreports / marketintelo)](https://market.us/report/address-geocoding-software-market/)
- [Geocoding & Reverse Geocoding to US$33.4B by 2030 (openPR)](https://www.openpr.com/news/4316198/geocoding-and-reverse-geocoding-market-to-reach-usd-33-4-billion)
- [Location Intelligence Market (Mordor Intelligence)](https://www.mordorintelligence.com/industry-reports/location-intelligence-market)
- [Geoscape G-NAF product & free G-NAF Core](https://geoscape.com.au/products/g-naf/)
- [G-NAF dataset on data.gov.au](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf)
- [Radar: true cost of Google Maps API (2026) & pricing comparison](https://radar.com/blog/google-maps-api-cost)
- [Radar geocoding pricing & alternatives](https://radar.com/blog/google-geocoding-api-pricing)
- [Australia Last-Mile Delivery Market (IMARC)](https://www.imarcgroup.com/australia-last-mile-delivery-market)
- [Australia Last Mile Delivery Market (Mordor Intelligence)](https://www.mordorintelligence.com/industry-reports/australia-last-mile-delivery-market)

*Market-size figures are third-party analyst estimates and vary by source; treat ranges as directional, not precise.*
