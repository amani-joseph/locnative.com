# Locnative.com — Persona-Led Report

**June 2026 · ANZ-first**

Six personas, ordered by fit between what's *built* and what they *need*. Each: who they are, their job-to-be-done (JTBD), which Locnative features serve them, what's missing, the buying motion, and the hook.

---

## 1. "Priya" — Head of Engineering, last-mile logistics startup
**Tier 1 · Beachhead · Uses the whole stack**

- **Context:** 25-person Sydney courier-tech company; thousands of deliveries/day; growing fast; Google Maps bill climbing past comfort.
- **JTBD:** *"When a customer enters a messy address, I need to normalise it, route to it, geofence the depot and drop-off, and notify the customer the moment the driver arrives — without my Maps bill ballooning."*
- **Serves her:** geocoding + reverse, **batch geocoding** (manifests), **zones**, **boundary crossings** (arrival events), **webhooks**, **device tracking**. This is the one persona who lights up *every* primitive.
- **Missing / tune for her:** high-throughput batch, geofence arrival-confidence tuning, **webhook replay + dead-letter**, AUD volume pricing, a "which zone contains this point?" serviceability call.
- **Buying motion:** PLG entry (a dev signs up to test), expands to a paid usage account; becomes a sales-assisted account at scale.
- **Hook:** *"The same stack as Radar, but ANZ-native and ~85% cheaper than your Google bill."*

---

## 2. "Dave" — Ops Manager, field-service / fleet company
**Tier 1 · Compliance-driven**

- **Context:** Plumbing/electrical/trades fleet, or infrastructure contractor; 40–200 vehicles; under Chain-of-Responsibility (CoR) / NHVR obligations.
- **JTBD:** *"I need geofenced job-site clock-in, a defensible audit trail of who was where and when, and alerts when a vehicle enters a restricted or speed-controlled zone."*
- **Serves him:** **device tracking**, **zones** (job sites), **boundary crossings**, **webhooks**.
- **Missing / tune for him:** **dwell-time events** (on-site duration, not just entry/exit), **audit-grade immutable event logs**, per-zone metadata (site ID, compliance tags).
- **Buying motion:** sales-led / channel (via fleet-software integrators); compliance, not price, is the lever.
- **Hook:** *"Audit-grade geofence events with AU data residency — compliance evidence on tap."*

---

## 3. "Mei" — Product Lead, on-demand marketplace (food / grocery / home services)
**Tier 1 · Conversion-driven**

- **Context:** Consumer app; checkout abandonment and failed deliveries hurt; drivers need live dispatch.
- **JTBD:** *"At checkout I need instant address autocomplete, an instant 'do we deliver here?' answer, and live driver geofencing for ETAs."*
- **Serves her:** **autocomplete (<100ms)**, **zones** (serviceability), **device tracking**, **webhooks** (order events).
- **Missing / tune for her:** finish **Phase 5 sub-100ms autocomplete**, a **serviceability endpoint** ("is this address in any active delivery zone?"), zone-membership webhooks.
- **Buying motion:** PLG → usage growth tier; conversion-lift ROI is an easy business case.
- **Hook:** *"Faster autocomplete + one-call serviceability = fewer abandoned carts and fewer failed deliveries."*

---

## 4. "Tom" — CTO, proptech / real-estate platform
**Tier 2 · G-NAF authority play**

- **Context:** Property portal, valuation tool, or conveyancing SaaS; addresses must tie to the *authoritative* property.
- **JTBD:** *"Every address my users type must resolve to a clean, validated, G-NAF-identified property — no duplicates, no ambiguity."*
- **Serves him:** **autocomplete**, **geocoding**, **G-NAF PID resolution**, property/catchment **zones**.
- **Missing / tune for him:** a first-class **G-NAF PID resolution endpoint** (address ⇄ authoritative ID), unit/sub-dwelling precision, bulk validation.
- **Buying motion:** self-serve trial → annual contract; values accuracy + authority over price.
- **Hook:** *"Every address links to its authoritative G-NAF property ID — built on Australia's official address file."*

---

## 5. "Sarah" — Pricing/Risk Lead, insurtech
**Tier 2 · High ARPU, sovereignty-sensitive**

- **Context:** Home/contents or commercial insurer; bushfire and flood peril modelling is existential in AU.
- **JTBD:** *"I need to geocode every policy address precisely and know which peril zones (flood, bushfire) it falls inside, to price risk and stay compliant."*
- **Serves her:** **high-precision geocoding/reverse**, **batch geocoding** (portfolio re-scoring), **zones** (peril boundaries) with **metadata**, **boundary testing**.
- **Missing / tune for her:** rooftop-level precision confidence scores, zone metadata for risk attributes, bulk portfolio geocoding SLAs, **AU data residency guarantees**.
- **Buying motion:** enterprise, sales-led, security/compliance review; high ARPU, sticky.
- **Hook:** *"Precise geocoding + peril-zone membership + AU residency — risk pricing that stays onshore."*

---

## 6. "Alex" — Indie developer / SaaS builder
**Tier 3 · PLG top-of-funnel**

- **Context:** Solo or small team building an AU app; just got a scary Google Maps invoice; wants something cheap, documented, fast to wire up.
- **JTBD:** *"Give me a clean geocoding + autocomplete API with a real free tier and good docs, so I stop dreading my Maps bill."*
- **Serves them:** **geocoding**, **autocomplete**, **API explorer**, **docs**, generous **free tier**, **usage metering**.
- **Missing / tune for them:** a frictionless free-tier signup, copy-paste SDK snippets, a **Google-cost-vs-Locnative calculator**, status page.
- **Buying motion:** pure self-serve PLG; low individual ARPU but high volume — the **funnel that feeds personas 1–5** and drives word-of-mouth.
- **Hook:** *"Drop-in Google Maps geocoding replacement, ~90% cheaper, ANZ-native, free to start."*

---

## How to use these personas

- **Build/tune order follows persona order.** Priya, Dave and Mei (Tier 1) exercise the *unique* part of the stack (geofencing + device + webhooks) — that's where Locnative isn't a commodity. Ship for them first.
- **Tom and Sarah (Tier 2)** monetise the **G-NAF authority + AU residency** angle at high ARPU via sales — pursue once auth/billing is enterprise-ready.
- **Alex (Tier 3)** is not low-value — they're the **acquisition engine**. The free tier + cost calculator + docs are a growth investment, not a cost.
- **Cross-cutting build priorities that serve multiple personas at once:** (1) <100ms autocomplete → Mei + Tom + Alex; (2) serviceability endpoint → Priya + Mei; (3) dwell-time + audit events → Dave + Sarah; (4) webhook replay → Priya + Dave + Mei; (5) G-NAF PID endpoint + residency statement → Tom + Sarah (+ govtech).

*Companion documents: COMPREHENSIVE-REPORT.md (full analysis + sources), EXECUTIVE-BRIEF.md (forecast).*
