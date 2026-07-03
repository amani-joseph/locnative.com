# Launch Copy — Show HN & Product Hunt

**For:** Locnative.com launch (90-day sprint, §10 of `docs/go-to-market-plan-2026-06.md`)
**Date drafted:** 2026-06-11
**How to use:** Launch both Tue/Wed. Post Show HN early AM AEST/PT; submit PH 12:01am PT. Replace `[LINK]`, `[npm link]`, `[docs link]`, `[X handle]` before posting. Reply to every comment in the first 4 hours.

---

## PART 1 — Show HN (Hacker News)

> HN norms: lead with what it is, be specific and technical, no marketing adjectives, no "revolutionary/seamless/powerful," disclose it's a paid product with a free tier, invite criticism. The title carries most of the weight.

### Title options (pick one — keep under ~80 chars)

1. **Show HN: Locnative – Geocoding + geofencing API for Australia on G-NAF/ABS**
2. **Show HN: An Australian geocoding and geofencing API built on government data**
3. **Show HN: Radar-style geofencing for Australia, on authoritative G-NAF/ABS data**

*Recommended: #1 — most concrete, names the data sources HN-savvy AU devs will recognise.*

### Post body (the URL field gets `[LINK]`; this goes in the text/first comment)

```
Hi HN — I built Locnative, a location API for Australia: forward/reverse
geocoding, address autocomplete, batch geocoding, ABS/ASGS region
classification, custom geofencing (zones), device tracking, and enter/exit
webhooks. Point-to-point driving directions too.

The reason it exists: if you build software in Australia, your two realistic
options are (1) Google/HERE — global, accurate-ish on AU, opaque USD pricing,
no hosted geofencing — or (2) wire together G-NAF yourself. Geocoding gets you
addresses, but the part I actually needed — "tell me when a device/asset enters
this zone" — meant a second vendor or a pile of PostGIS glue. I wanted both on
one authoritative AU dataset.

What's under the hood:
- Data: G-NAF (Geoscape's authoritative AU address file) + ABS ASGS boundaries
  (SA1–SA4, LGA, postcode/POA, Commonwealth & state electoral divisions, mesh
  block). Both open government data; everything hosted in Australia.
- Autocomplete: tiered Postgres search instead of Elasticsearch — prefix for
  short queries, pg_trgm trigram + fuzzystrmatch for longer ones, dmetaphone
  phonetic fallback, ranked by population/admin-level/similarity with optional
  lat/lon proximity boosting. Targeting <100ms.
- Geofencing: PostGIS ST_Covers for point-in-zone and addresses-in-zone;
  boundary-crossing events fan out to webhooks.
- Routing: self-hosted OSRM.
- Basemap: self-hosted Protomaps (PMTiles on R2), so no per-tile map vendor.
- API: oRPC + OpenAPI 3.1; runs on Cloudflare Workers + Neon Postgres.
- SDK: a hand-written, typed TypeScript SDK on npm — automatic retries with
  backoff/jitter + Retry-After, per-request timeouts/AbortSignal, idempotent
  writes, and typed errors carrying requestId/docUrl. Python next.

What it deliberately does NOT do: global coverage, map rendering/cartography
(that's Mapbox's job), and there's no native mobile background-location SDK yet
— it's API-only, so it fits server-side/asset geofencing better than consumer
mobile apps today. Happy to talk about that trade-off.

Pricing: free tier (10k req/mo) to build and evaluate; paid tiers in AUD with
transparent per-1k overage and no contracts.

Try it: [LINK]   Docs/quickstart: [docs link]   SDK: [npm link]

I'd love feedback on: the autocomplete ranking approach, whether the
geofencing+webhook model fits how you'd actually use it, and the SDK ergonomics.
Tear it apart.
```

### Prepared replies (paste-ready for likely comments)

**"Why not just use G-NAF directly / it's free?"**
> You absolutely can — I did first. The work isn't getting the data, it's keeping the monthly G-NAF/ASGS releases loaded, building fast fuzzy autocomplete on top, and adding the geofencing/device/webhook layer that G-NAF doesn't give you. If you only need a static lookup, self-hosting is genuinely fine. This is for people who'd rather not run that pipeline.

**"How is this different from Mappify?"**
> Mappify is great at AU geocoding + routing, but has no geofencing, devices, or webhooks. Locnative geocodes *and* tells you when something enters a zone. Overlap on geocoding; the real-time stack is the difference.

**"Why not global?"**
> Authoritative AU data (G-NAF/ABS) is the whole point — global players don't have it and I'd rather be the best at one country than mediocre everywhere. Global is a much later question.

**"Cloudflare Workers + Postgres for spatial — performance?"**
> Spatial work (ST_Covers, KNN nearby) runs in PostGIS on Neon with index-assisted KNN; Workers is the API/edge layer. Autocomplete is the latency-sensitive path and that's the tiered pg_trgm/fuzzy approach above. Real numbers welcome if you want to stress it on the free tier.

**"Pricing?"**
> Free tier to evaluate, then AUD tiers with transparent per-1k overage, no contracts. Pricing page: [LINK]. Meter is API requests plus tracked devices/events for the geofencing side.

---

## PART 2 — Product Hunt

> PH norms: benefit-led, scannable, emoji OK, a strong tagline, a gallery story, and a warm maker's first comment. Less technical than HN, more "what it unlocks."

### Name
**Locnative**

### Tagline (60 char max — pick one)
1. **The official location API for Australia** *(recommended)*
2. **Geocoding + geofencing for Australia, on government data**
3. **Radar-style geofencing, built for Australia**

### Topics
Developer Tools · APIs · Maps · SaaS · Location

### Description (260 char max)
```
Locnative is the location API for Australia: geocoding, address autocomplete,
ABS boundary classification, and real-time geofencing with webhooks — all on
authoritative G-NAF + ABS government data. Typed SDK, transparent AUD pricing,
generous free tier.
```

### Gallery slide captions (write 5–6 visuals; captions below)
1. **One API, the whole AU location stack** — geocode, classify, geofence, route.
2. **Built on authoritative data** — G-NAF addresses + ABS ASGS boundaries, hosted in Australia.
3. **Real-time geofencing** — define zones, track devices, get enter/exit webhooks. The part Google and Mappify don't do.
4. **Address autocomplete in minutes** — `npm i @locnative/sdk`, typed, with retries and idempotency built in.
5. **Classify any coordinate** — SA1–SA4, LGA, postcode, electoral division, mesh block from one endpoint.
6. **Honest, AUD pricing** — generous free tier, transparent per-1k overage, no contracts, no sales call.

### Maker's first comment (pin this)
```
Hey Product Hunt 👋

I'm the maker of Locnative. I built it because building location features in
Australia is weirdly hard: Google is global, opaque, and priced in USD; doing it
yourself means hosting G-NAF and ABS data and gluing PostGIS together — and even
then you don't get the thing I actually needed most: "tell me when a device or
asset enters this zone."

Locnative puts the whole stack on one authoritative, AU-hosted dataset:

🇦🇺 Official data — G-NAF addresses + ABS ASGS boundaries (open government data)
📍 Geocoding & autocomplete — forward/reverse, batch, nearby, sub-100ms search
🗺️ Region classification — coordinate → SA1–SA4, LGA, postcode, electoral, mesh block
🛰️ Real-time geofencing — zones, device tracking, enter/exit webhooks
🧰 Typed TypeScript SDK on npm — retries, timeouts, idempotency, typed errors
💸 Transparent AUD pricing — free tier to build on, no contracts

Honest about the edges: it's Australia-only by design, and it's API-first — no
native mobile background-location SDK yet (it's on the roadmap), so today it fits
server-side and asset geofencing better than consumer mobile apps.

Free tier is live — would genuinely love your feedback on the developer
experience and the geofencing model. I'm here all day answering everything.

— [name] · [X handle]
```

### Launch-day amplification checklist
- [ ] Post the Show HN early AEST; submit PH at 12:01am PT.
- [ ] Cross-post to X/LinkedIn (build-in-public), r/webdev, r/australia, Dev.to.
- [ ] Ask 5–10 friendly AU devs to try the free tier and comment honestly (no fake upvotes — PH penalises that).
- [ ] Reply to every comment within minutes for the first 4 hours.
- [ ] Pin the maker comment; keep the free-tier signup link above the fold.
```
