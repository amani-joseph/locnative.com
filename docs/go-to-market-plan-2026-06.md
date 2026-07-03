# Locnative.com — Go-To-Market & Monetization Plan

**Version:** 1.0 · **Date:** 2026-06-11 · **Owner:** Founder
**Assumptions (locked with founder):** Bootstrapped budget **< $2,000 AUD/mo** · **Product-led self-serve (PLG)** motion · **Solo founder** execution · **90-day launch sprint nested inside a 12-month arc**.

> Companion docs: `docs/competitive-analysis-2026-06.md`, `docs/competitive-analysis-update-2026-06-08.md`, `docs/analysis/mapbox-comparative-analysis.md`.

---

## 1. Executive Summary

Locnative.com is the **only** product sitting in an uncontested square: *authoritative Australian location data (G-NAF + ABS ASGS) combined with a real-time geofencing / device / webhook stack.* The strategic one-liner we own:

> **"Radar for Australia, built on authoritative government data."**

The GTM thesis for a bootstrapped solo founder is **not** to out-spend Radar or out-feature Google. It is to **win the developer-self-serve AU segment we can win *today*** — geocoding, address autocomplete/validation, ASGS boundary classification, and hosted geofencing — through:

1. **A frictionless free tier + transparent AUD pricing** (beat Google/HERE on simplicity, match Mappify/Geoapify on developer-friendliness).
2. **SEO + content + free tools** as the primary, compounding acquisition engine (near-zero marginal cost, ideal for solo + bootstrapped).
3. **The published `@locnative/sdk` on npm** as a distribution and discovery channel.
4. **A handful of lighthouse design partners** in logistics, proptech, and govtech to produce case studies and referenceable revenue.

**12-month goal:** reach **$8–12k AUD MRR** from self-serve + 1–2 larger accounts, with a content/SEO moat that makes acquisition cheaper every quarter.
**90-day goal:** publicly launch, achieve **first 10 paying customers** and **150+ activated free accounts** (first successful API call).

---

## 2. Product & Positioning Recap

**Shipped & sellable today:**
- **Geocoding:** autocomplete, forward/reverse geocode, nearby search, address-by-ID (over G-NAF).
- **Batch geocoding** (async job submit/poll/results).
- **Zones / custom geofencing** (polygon CRUD, point-in-zone, addresses-in-zone — PostGIS).
- **Devices:** location push, device-in-zone resolution.
- **Real-time events:** boundary crossings + webhook delivery.
- **Regions:** coordinate → official ABS/ASGS units (state, SA1–SA4, LGA, postcode/POA, electoral divisions, mesh block).
- **Routing:** point-to-point driving directions (OSRM).
- **Platform:** API explorer, projects/teams, analytics, billing, dashboard, self-hosted Protomaps basemap.
- **Developer surface:** OpenAPI 3.1 spec + typed, hardened **TypeScript SDK** (retries, idempotency, typed errors) — *publishing to npm is the P0 launch blocker.*

**Deliberately out of scope (don't market against):** global coverage, map rendering/cartography (Mapbox's turf), client/mobile SDKs (future milestone).

**Three pillars of differentiation (the whole pitch):**
| Pillar | Proof | Beats |
|---|---|---|
| **Authority** | Official G-NAF + ABS ASGS, AU-hosted | Google, HERE, Geoapify, Radar (none AU-authoritative) |
| **All-in-one geofencing** | Zones + devices + webhooks + events | Mappify, Geoapify (none have it) |
| **Developer experience** | Typed SDK, OpenAPI, transparent AUD pricing | Google/HERE (opaque, USD, enterprise-gated) |

---

## 3. Ideal Customer Profile (ICP)

**Firmographic:** Australian-operating company, building software that touches addresses, locations, territories, or moving assets. Sweet spot **5–200 employees** (startups → mid-market SMBs); plus a **govtech/public-sector** lane that values AU data sovereignty.

**Technographic:** Has developers. Already calling a maps/geocoding API (Google Maps Platform bill-shock is a top trigger) **or** hand-rolling address handling.

**Trigger events:** Google Maps invoice spike · needs AU-accurate addresses · needs ABS/LGA/electoral boundary classification · needs "did the driver/asset enter the zone" · data-residency/sovereignty requirement · new product needing address autocomplete.

**Disqualifiers:** Needs global coverage · needs heavy map rendering/custom cartography · needs native mobile background-location SDK *today*.

---

## 4. Personas

### Developer / Champion personas (PLG entry point)

**1. "Dev Dana" — Integrating Developer** *(primary, highest volume)*
Backend/full-stack dev at an AU startup/SMB. Needs address autocomplete + validation + geocoding to ship a feature this sprint. Discovers via Google search, npm, or Show HN. Wants: copy-paste quickstart, free tier, typed SDK, clear docs. **Converts self-serve.** *Win by: best-in-class docs + free tier + SDK.*

**2. "Ops Owen" — Logistics / Field-Service Engineer**
Building delivery, fleet, or field-service software. Needs geocoding + routing + **geofencing** ("alert when driver enters customer zone"). Values webhooks and reliability. **Highest expansion potential** (devices × events metering). *Win by: the all-in-one geofencing story + reliability.*

**3. "Civic Sam" — GovTech / Civic Developer**
Local council, state agency, or gov-contractor dev. Needs official **ASGS boundaries**, electoral divisions, mesh blocks, and **AU data residency**. Procurement-driven, slower, but sticky + referenceable. *Win by: authority + sovereignty + a credible reference customer.*

### Buyer / Economic personas

**4. "Founder Finn" — Startup Founder / Eng Lead** *(economic buyer in small teams)*
Approves the card. Cares about transparent AUD pricing, no lock-in, no surprise bills, no sales call required. *Win by: pricing page that's honest and self-serve checkout.*

**5. "Insight Priya" — Proptech / Insurance Data Analyst/PM**
Needs authoritative address + ABS boundary classification for risk scoring, catchment, territory, valuation. Values data provenance over flashy features. *Win by: G-NAF/ABS authority + batch geocoding + region classification.*

---

## 5. Target Segments / Verticals (priority order)

| Pri | Vertical | Use case | Pillar leveraged | Why now |
|---|---|---|---|---|
| **1** | **Logistics / delivery / field service** | Geocode + route + geofence drivers/assets, enter/exit webhooks | All-in-one geofencing | Highest expansion + clearest ROI; routing now shipped |
| **1** | **Proptech / real estate** | Address validation, catchment, LGA/suburb enrichment | Authority | Address-heavy, AU-specific, large TAM |
| **2** | **Insurance / risk / actuarial** | Geocode + ASGS/hazard zone classification, batch enrich | Authority + batch | High value per call, provenance matters |
| **2** | **Retail / FMCG / franchise** | Store catchment, territory, trade-area zones | Geofencing + regions | Clear territory/zone fit |
| **2** | **Healthcare / NDIS / home services** | Service-area validation, visit/zone verification | Geofencing | Growing AU sector, address + zone native |
| **3** | **GovTech / public sector / civic** | Official boundaries, electoral, mesh blocks, residency | Authority + sovereignty | Sticky, referenceable; slow procurement |
| **3** | **Fintech / KYC / onboarding** | AU address verification at signup | Authority | Compliance-driven, recurring volume |

**Beachhead:** Lead the 90-day launch with **Logistics + Proptech developers** (fastest self-serve conversion), seed **GovTech** as design-partner/long-game.

---

## 6. Pricing & Packaging

**Principles:** transparent, AUD-denominated, no contracts, self-serve checkout, **meter value where the moat is** (geofencing/devices), generous free tier to win developers. Anchored against Mappify (2,500 free req/day, ~$1/1,000, $1,000/mo unlimited) and Geoapify's generous free tier.

**Two value metrics:**
- **API requests** (geocode / region / routing) — commodity, priced low and transparently.
- **Monthly tracked devices + geofence evaluations / webhook events** — the differentiated moat, where we capture value.

### Tiers

| Tier | Price (AUD/mo) | Included | Geofencing stack | Support | Target |
|---|---|---|---|---|---|
| **Free / Developer** | $0 | 10,000 req/mo (soft 1k/day) | 3 zones, 1 device, 100 events | Community/docs | Dana evaluating |
| **Indie** | **$29** | 100k req/mo | 25 zones, 10 devices, 5k events | Email (best-effort) | Solo devs, side projects |
| **Starter** | **$99** | 500k req/mo | 100 zones, 50 devices, 50k events | Email 48h | Early-stage startups |
| **Growth** | **$349** | 2M req/mo | 1,000 zones, 500 devices, 500k events | Priority email 24h | Scaling SMBs (Owen) |
| **Scale** | **$999** | 8M req/mo | 5,000 zones, 2,500 devices, 5M events | Priority + Slack | Mid-market |
| **Enterprise** | Custom | Volume + SLA | Custom | SLA, DPA, residency, invoicing | Gov, insurance, large logistics |

**Overage (transparent, AUD):** geocoding/region/routing **$0.60 / 1,000 req** beyond plan; events **$0.50 / 1,000**; extra device **$0.50/device/mo**. (Undercuts Mappify's ~$1/1,000 while protecting the geofencing premium.)

**Launch promos:** annual = **2 months free** (16% off, improves cash + retention); **founding-customer 30% lifetime discount** for the first 20 paying accounts (creates urgency + testimonials); **free for registered charities / open civic projects** (PR + goodwill).

**Billing:** Stripe (AUD), usage metering already in platform; self-serve upgrade/downgrade; hard-stop + email warnings on free tier (never a surprise bill).

---

## 7. Messaging Architecture

**Master tagline:** *"The official location API for Australia."*
**Supporting:** *"Geocode, classify, and geofence on authoritative G-NAF + ABS data — with a typed SDK and honest AUD pricing."*

**By persona headline:**
- **Dana:** "Australian address autocomplete & geocoding in 5 minutes. `npm i @locnative/sdk`."
- **Owen:** "Know the moment a driver or asset enters a zone — geofencing + webhooks, built in."
- **Sam:** "Official ABS boundaries — SA1–SA4, LGA, electoral, mesh block — from one endpoint, hosted in Australia."
- **Finn:** "Transparent AUD pricing. Generous free tier. No sales call, no lock-in."
- **Priya:** "Authoritative G-NAF addresses + ABS classification for risk, catchment, and territory."

**Comparison narratives (build dedicated pages — high-intent SEO):**
- *vs Google Maps Platform:* AU-authoritative, AUD pricing, no bill-shock, geofencing included.
- *vs Mappify:* we geocode **and** geofence + devices + webhooks + typed SDK.
- *vs Geoapify/HERE:* AU-authoritative government data, not global open data.
- *vs Radar:* purpose-built for Australia on official data (Radar is global/generic).

---

## 8. GTM Motion — The PLG Funnel

```
Discover → Sign up (free) → Activate (first successful API call) → Habit (integrated in app)
        → Convert (hit free limit / need geofencing) → Expand (devices, events, seats) → Advocate
```

**Activation = first successful API call.** Everything in onboarding optimizes for time-to-first-call (target < 10 min): instant API key, copy-paste quickstart, live API explorer, SDK quickstart, sample requests.

**Conversion triggers:** approaching free-tier limit (in-dashboard nudge + email), needing a 4th zone/2nd device, needing email support/SLA. **Sales-assist only** for inbound Enterprise/Gov.

---

## 9. Channels & Tactics (organic-first, solo-founder, < $2k/mo)

### A. SEO + Content (the primary compounding engine — ~50% of effort)
The defensible moat. AU geocoding/boundary queries are long-tail and under-served.
- **Programmatic / data pages:** "postcode → LGA", "suburb → SA2", "[suburb] boundaries", electoral division lookups, "list of LGAs in [state]" — generated from the same G-NAF/ABS data we host. Hundreds of pages, each a free tool + funnel.
- **Tutorials/guides:** "Add Australian address autocomplete to a React/Next form", "Geocode a CSV of AU addresses", "Build a delivery geofence with webhooks", "Classify any coordinate into ABS regions".
- **Comparison pages** (§7) — highest commercial intent.
- **Docs as marketing:** world-class quickstarts, recipes, runnable examples.

### B. Free tools / lead magnets (rank + funnel)
- **Free public widgets:** address autocomplete demo, postcode/boundary explorer (map), spreadsheet/CSV geocoder, "what region am I in" tool. Each gated lightly (free key) → top-of-funnel.

### C. Distribution via the SDK
- Publish `@locnative/sdk` to npm (P0). Rich README, keywords, badges. npm + GitHub are discovery + SEO surfaces. Add a Python SDK when bandwidth allows.

### D. Launch & community
- **Show HN / Hacker News**, **Product Hunt**, **Reddit** (r/webdev, r/australia, r/programming, r/sysadmin), **Dev.to / Hashnode** cross-posts, **Lobsters**.
- AU developer communities (Slack/Discord, local meetups), **build-in-public** on X + LinkedIn (founder voice).

### E. Light-touch design-partner outbound (for lighthouse accounts only)
- 20–30 hand-picked logistics/proptech/gov targets → personalised email offering founding-customer deal + white-glove onboarding in exchange for a case study.

### F. Partnerships (low-cost, high-leverage)
- AU SaaS/agencies that build for clients (proptech, logistics, gov consultancies); integration listings; "powered by Locnative" referrals.

### G. Email
- Onboarding drip (activation), usage-trigger nudges, monthly changelog/newsletter.

**Explicitly deprioritised at this budget:** paid social, conferences/booths, paid PR, broad display.

---

## 10. 90-Day Launch Sprint

### Pre-launch — Days 0–14 ("Make it buyable")
- [ ] **Publish `@locnative/sdk` to npm** (org + token + license decision). *P0 — nothing ships without this.*
- [ ] Stripe AUD billing live; self-serve signup → API key → checkout verified end-to-end.
- [ ] Pricing page + 5 persona landing sections + 1 comparison page (vs Google).
- [ ] Docs quickstart polished; live API explorer working; 3 copy-paste recipes.
- [ ] Analytics: signup, activation, conversion funnel instrumented (e.g., PostHog free tier).
- [ ] Onboarding email drip (3 emails) wired (Resend — already in stack).

### Launch — Days 15–45 ("Get discovered")
- [ ] Ship 2 free public tools (CSV geocoder + boundary explorer).
- [ ] **Product Hunt + Show HN** launch (same week, Tue/Wed).
- [ ] 4 cornerstone tutorials published + cross-posted (Dev.to, Reddit, LinkedIn).
- [ ] 3 comparison pages live (Google, Mappify, Geoapify).
- [ ] Begin daily build-in-public posting (X/LinkedIn).
- [ ] Send 20 design-partner outreach emails (logistics + proptech).

### Traction — Days 46–90 ("Convert & prove")
- [ ] Ship 50–100 programmatic data/SEO pages (postcode/LGA/suburb).
- [ ] First **case study** from a design partner.
- [ ] 8 more tutorials/recipes (2/week cadence).
- [ ] First Google Ads experiment on high-intent terms ("australian geocoding api") — $300–500 test.
- [ ] Iterate onboarding to lift activation; add in-app conversion nudges.

**90-day targets:** 150+ activated free accounts · **10 paying customers** · ~$600–1,200 AUD MRR · 1 published case study · 60+ indexed content/tool pages.

---

## 11. 12-Month Phased Arc

| Quarter | Theme | Key moves | Exit targets |
|---|---|---|---|
| **Q1 (0–90d)** | **Launch & activate** | SDK on npm, billing, launch, founding content + tools | 10 customers · $1k MRR · 150 activations |
| **Q2** | **Content moat + convert** | Scale programmatic SEO, 2 more case studies, Python SDK, advanced routing (matrix/isochrones) marketing | 35 customers · $3–4k MRR |
| **Q3** | **Vertical depth** | Vertical landing pages + playbooks (logistics, proptech, insurance), partnerships, first gov/enterprise deal in pipeline | 70 customers · $6–8k MRR |
| **Q4** | **Scale & expand** | Expansion revenue (devices/events), referral program, Places/POI + address validation GA, first paid newsletter sponsorships | 110+ customers + 1–2 enterprise · $8–12k MRR |

---

## 12. Budget — < $2,000 AUD/mo

| Category | Q1 (launch) | Steady-state | Notes |
|---|---|---|---|
| Tooling (analytics, email, monitoring) | $120 | $150 | PostHog free→paid, Resend, uptime |
| SEO/content (freelance writer / editing) | $400 | $500 | 2–4 outsourced pieces/mo; rest founder-written |
| Backlinks / directory listings | $150 | $150 | Quality AU/dev directories |
| Paid search experiments | $300 | $500 | High-intent terms only; expand if ROAS works |
| Newsletter / podcast sponsorship (AU dev) | $0 | $300 | Start Q3 once funnel proven |
| Design/lead-magnet & misc tools | $150 | $150 | Figma, OG images, tool hosting |
| Launch costs (PH assets, etc.) | $200 | $0 | One-off |
| Experiments / buffer | $480 | $250 | Reallocate to what works |
| **Total** | **~$1,800** | **~$2,000** | Stays within envelope |

**Reallocation rule:** every 30 days, shift spend toward the channel with the lowest CAC / best activation. Kill anything not paying back within 60 days. Founder time is the scarcest resource — automate onboarding, billing, and reporting first.

---

## 13. Metrics & KPIs

**North Star:** weekly **activated accounts** (made ≥1 successful API call).

| Funnel stage | Metric | 90-day target | 12-mo target |
|---|---|---|---|
| Acquisition | Free signups / mo | 60 → 80 | 250+/mo |
| Activation | % reaching first API call | 50% | 65% |
| Conversion | Free → paid | 6–8% | 10–12% |
| Revenue | MRR (AUD) | $1k | $8–12k |
| Expansion | Net revenue retention | — | >105% |
| Efficiency | Blended CAC | < $80 | < $60 |
| Content | Organic sessions/mo | 2k | 25k+ |

Review weekly (funnel + content), monthly (budget reallocation + cohort retention).

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **AU-only TAM ceiling** | Own the niche fully first; treat global as a later milestone, not a launch dependency. |
| **No mobile SDK loses consumer-app geofencing** | Target server-side geofencing (logistics/asset) where API-only is fine; flag mobile SDK as roadmap. |
| **Google/Mappify price pressure** | Compete on authority + geofencing + AUD transparency, not raw geocoding price. |
| **Solo-founder bandwidth** | Automate funnel; outsource content; ruthless prioritisation; programmatic SEO scales without proportional time. |
| **Free-tier abuse / cost** | Rate limits, soft daily caps, key-based metering already in platform. |
| **Long gov procurement** | Run gov as a parallel slow lane; don't let it gate self-serve revenue. |
| **G-NAF/ABS data licensing/update cadence** | Track Geoscape/ABS release cycles; document provenance as a feature. |

---

## 15. Solo-Founder Operating Cadence

- **Daily (30–60 min):** 1 build-in-public post; respond to signups/support; check funnel dashboard.
- **Weekly:** ship 1–2 content pieces or tools; review funnel metrics; 5 design-partner touches.
- **Monthly:** reallocate budget by CAC; cohort retention review; ship 1 product/marketing improvement to activation or conversion.
- **Quarterly:** revisit pricing, tier limits, and segment focus against actuals.

**Automate first (protect founder time):** onboarding emails, usage-limit nudges, billing, weekly metric digest, programmatic page generation.

---

## Appendix A — First 10 Content Assets (write in order)
1. Quickstart: "AU address autocomplete in a React form (5 min)"
2. Comparison: "Locnative vs Google Maps Platform for Australian geocoding"
3. Tutorial: "Geocode a CSV of Australian addresses"
4. Tutorial: "Build a delivery geofence with webhooks"
5. Comparison: "Locnative vs Mappify"
6. Guide: "Classify any coordinate into ABS regions (SA1–SA4, LGA, electoral)"
7. Free tool: CSV/spreadsheet geocoder
8. Free tool: ABS boundary explorer
9. Comparison: "Locnative vs Geoapify for AU data"
10. Use-case: "Address verification at signup for AU fintech/KYC"

## Appendix B — Design-Partner Outreach Shortlist (categories to source)
AU last-mile delivery & courier SaaS · field-service platforms · proptech/valuation tools · home-services/NDIS marketplaces · insurance/insurtech · local-council digital teams · logistics consultancies/agencies.
