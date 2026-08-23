# Pricing Page Copy — Locnative.com

**Source of truth:** §6 of `docs/go-to-market-plan-2026-06.md`
**Date drafted:** 2026-06-11
**Currency:** All prices AUD. **Voice:** honest, developer-first, no enterprise theatre.
**Use:** Drop sections into the marketing site. `[CTA]` = signup link. Toggle = monthly/annual (annual = 2 months free).

---

## Hero

# Honest pricing for Australian location data
### Start free. Pay in AUD. No contracts, no surprise bills, no sales call.

Geocoding, address autocomplete, ABS boundary classification, and real-time geofencing — on authoritative G-NAF + ABS government data, hosted in Australia.

`[Start free →]`  ·  `[Read the docs]`

*10,000 free requests every month. No credit card to start.*

---

## Billing toggle

**Monthly** / **Annual — save ~16% (2 months free)**

---

## Plans

> Six tiers, one promise: you always know what you'll pay. Free covers real evaluation; paid scales with you; only Enterprise needs a conversation.

### Free — Developer
**$0** /month
*For building and evaluating.*
- 10,000 API requests / month *(soft cap 1,000/day)*
- Geocoding, autocomplete, batch, regions, routing
- 3 geofence zones · 1 device · 100 events
- Live API explorer + typed SDK
- Community support & docs

`[Start free]`

---

### Indie
**$29** /month
*Side projects and solo developers.*
- 100,000 requests / month
- 25 zones · 10 devices · 5,000 events
- Email support (best-effort)
- Everything in Free

`[Choose Indie]`

---

### Starter
**$99** /month
*Early-stage startups shipping to users.*
- 500,000 requests / month
- 100 zones · 50 devices · 50,000 events
- Email support (48h)
- Everything in Indie

`[Choose Starter]`

---

### Growth  ⭐ Most popular
**$349** /month
*Scaling teams running real workloads.*
- 2,000,000 requests / month
- 1,000 zones · 500 devices · 500,000 events
- Priority email (24h)
- Usage analytics + team seats
- Everything in Starter

`[Choose Growth]`

---

### Scale
**$999** /month
*High-volume, mission-critical.*
- 8,000,000 requests / month
- 5,000 zones · 2,500 devices · 5,000,000 events
- Priority support + shared Slack channel
- Everything in Growth

`[Choose Scale]`

---

### Enterprise
**Let's talk**
*Government, insurance, and large logistics.*
- Custom volume & pricing
- SLA, DPA, and data-residency guarantees
- Invoicing & procurement support
- Dedicated onboarding & priority roadmap input

`[Contact sales]`

---

## Usage beyond your plan

> No hard cutoffs that break your app, no mystery multipliers. Go over and you pay simple, published AUD rates — or upgrade any time.

| What | Overage rate (AUD) |
|---|---|
| Geocoding / regions / routing requests | **$0.60** per 1,000 |
| Geofence / webhook events | **$0.50** per 1,000 |
| Additional tracked device | **$0.50** per device / month |

*The Free tier hard-stops at its limit (we email you well before) — so a free project can never generate a bill.*

---

## Launch offers (limited)

- **🪧 Founding customers:** the first 20 paying accounts lock in **30% off for life.**
- **🗓️ Annual billing:** pay yearly, get **2 months free** (~16% off).
- **❤️ Charities & open civic projects:** free — [tell us what you're building].

---

## Why metered this way?

We charge a low, transparent rate for commodity geocoding, and meter the **real-time geofencing layer** (devices + events) separately — because that's the part nobody else in Australia offers, and it's where your usage actually grows. You're never paying enterprise rates to look up an address.

---

## Compare

| | Locnative | Google Maps Platform | Mappify | Geoapify |
|---|---|---|---|---|
| Australian-authoritative data (G-NAF/ABS) | ✅ | ❌ | ✅ | ❌ |
| Hosted geofencing + devices + webhooks | ✅ | ❌ | ❌ | ❌ |
| ABS region classification (SA/LGA/electoral) | ✅ | ⚠️ | ✅ | ⚠️ |
| Typed SDK with retries/idempotency | ✅ | ⚠️ | ⚠️ | ✅ |
| Priced in AUD, no contract | ✅ | ❌ | ✅ | ⚠️ |
| Free tier to build on | ✅ | ⚠️ | ✅ | ✅ |

`[See the full comparison →]`

---

## FAQ

**Is there really a free tier?**
Yes — 10,000 requests every month, forever, no credit card. It hard-stops at the limit so a free project can never run up a bill.

**What counts as a "request"?**
One API call to a geocoding, autocomplete, region, or routing endpoint. Geofence/webhook *events* are metered separately (see overage table).

**What's a "device" and an "event"?**
A *device* is a tracked entity whose location you push to us (a driver, vehicle, asset). An *event* is a zone enter/exit we detect and deliver via webhook.

**Can I change plans anytime?**
Yes — upgrade, downgrade, or cancel from the dashboard. Changes are prorated. No contracts.

**Do you charge in USD?**
No. Everything is AUD, including overage. No FX surprises on your invoice.

**What happens if I exceed my plan?**
On paid plans you keep working and pay the published per-1k overage, or upgrade for a better rate. On Free, you hard-stop until the next month (we warn you first).

**Where is my data hosted?**
In Australia. Data residency and a DPA are available on Enterprise.

**Do you offer discounts?**
Annual billing (2 months free), a founding-customer lifetime discount for the first 20 accounts, and free access for charities and open civic projects.

**Which data do you use?**
G-NAF (Geoscape's authoritative AU address file) and ABS ASGS boundaries — official Australian government data, kept current with each release.

**Can I self-host?**
The hosted API is the product. Enterprise customers with residency or air-gap needs can talk to us about options.

`[Still have questions? Email us]`

---

## Closing CTA

### Build on Australia's authoritative location data today.
Free to start. AUD pricing. No contracts.

`[Start free →]`  ·  `[Talk to us]`
