# Locnative.com — Public-Facing Pages Audit & Critique

_Senior Product Designer / UX Architect / SaaS Growth / Content Strategy / Frontend Eng review_
_Scope: Homepage (`/`), Coverage (`/coverage`), Pricing (`/pricing`), shared Navbar + Footer._
_Date: 2026-06-22_

---

## 1. Executive Summary

The marketing surface is **visually polished but strategically inconsistent**, and it leaks several trust-damaging bugs that undercut a developer-first API positioning.

The single most damaging class of issue is **anchor links in shared chrome that only resolve on the homepage**. The nav (`#why`, `#capabilities`, `#api`) and footer (`#capabilities`, `#api`) are rendered on `/coverage` and `/pricing` via the `_public` layout, but those sections don't exist there — so a third of the nav silently does nothing (or jumps to top) on two of three public pages. For a product whose entire pitch is "errors you can act on, not opaque failures," dead navigation is the worst possible first impression.

The second is **a positioning contradiction**: the homepage SEO + hero claim "US & Australia coverage… expanding across South America," while the **Pricing page hero says "Australian address autocomplete… on G-NAF data"** — single-country, narrower, and off-message. A developer comparing you to Mapbox/Radar will notice in 5 seconds.

Third, **social proof is fabricated** — six invented companies (Fleetbird, Gridline, Parcela, Routora, Saveo, Wayfare) with invented people and quotes. For an early-stage API this is a legal/credibility liability, not an asset. Replace with honest signals (data sources, SLAs, "built on G-NAF/OSM," request volume) until real logos exist.

Everything else — nav taxonomy, footer organization, missing pricing detail, no API reference/status/legal — is fixable and is laid out below, prioritized by impact.

**Verdict:** Strong design system, weak information architecture and content discipline. The gap between "looks like a real API company" and "behaves like one" is the thing to close.

---

## 2. Navigation Audit

**Current nav (`navigation-data.ts`):** Dashboard · Why Locnative (`#why`, marked active) · Capabilities (`#capabilities`) · API (`#api`) · Docs (`/docs`) · Coverage (`/coverage`) · Pricing (`/pricing`) — plus Log in / Sign up buttons (desktop) and a mobile dropdown.

This is **7 primary items, 3 of which are on-page anchors**, shown identically on three different routes. That's the core problem: anchors are page-scoped but the nav is global.

| Item | Verdict | Why |
|---|---|---|
| **Logo → /** | Keep | Standard, correct. |
| **Dashboard** (`/dashboard`) | **Remove from public nav** | Surfacing "Dashboard" to logged-out visitors is confusing — it implies they already have an account and reads as a misplaced app link. Show it only when `isAuthenticated` (the navbar already branches on session for the auth buttons; do the same here), or replace the whole right-side cluster with a single contextual "Dashboard" when signed in. |
| **Why Locnative** (`#why`) | **Remove** | On-page anchor; dead on /coverage and /pricing. "Why" belongs in the page scroll, not the nav. |
| **Capabilities** (`#capabilities`) | **Convert to route** | High-value content, but as an anchor it's broken off-homepage. Either promote to a real `/capabilities` (or `/products`) route, or drop from nav and keep it as a homepage section only. |
| **API** (`#api`) | **Convert / rename** | Ambiguous label ("API" = the product, the reference, or a demo?). This anchors to the "API in action" demo. Replace nav slot with **API Reference** (`/docs/api` or `/reference`) once it exists; until then, remove. |
| **Docs** (`/docs`) | **Keep** | Essential for developer adoption. Arguably the #1 nav item — consider moving it left, ahead of Coverage/Pricing. |
| **Coverage** (`/coverage`) | Keep | Real route, genuinely useful pre-integration. |
| **Pricing** (`/pricing`) | Keep | Real route, expected. |
| **Log in** (`/sign-in`) | Keep | Standard; make it visually secondary. |
| **Sign up** (`/sign-up`) | **Rename → "Get started" / "Start for free"** | Higher-intent, consistent with the Pricing CTA ("Start for free"). Should be the only filled/primary button in the bar. |

**Issues beyond taxonomy**
- The desktop nav uses raw `<a href>` (full page reloads) instead of TanStack `<Link>` for internal routes — the auth buttons correctly use `<Link>`, the nav links don't. Inconsistent and slower; convert internal links to `<Link>`.
- `isActive` is hardcoded to "Why Locnative" in data — active state should derive from the current route, not a static flag.
- Mobile nav renders links at `text-2xl/3xl` — visually heavy and inconsistent with the desktop scale.

**Recommended final nav (current maturity):**
`Logo` · **Products** (or Capabilities) · **Docs** · **Coverage** · **Pricing** · | `Log in` · **Get started**
Add **API Reference**, **Changelog**, **Blog** only when those pages actually exist (see §12). Keep it to 4–5 left-side items.

---

## 3. Footer Audit

**Current footer (`footer-02/footer.tsx`):**
- **Product:** Documentation (`/docs`) · Coverage (`/coverage`) · Capabilities (`#capabilities`) · API in action (`#api`)
- **Company:** Pricing (`/pricing`) · Contact (`mailto:`)
- A "Talk to us" CTA block (mailto) + copyright line.

**Problems**
1. **Anchor links again** — `#capabilities` and `#api` are dead on every page except `/`. The footer is global; it must not link to homepage-only anchors.
2. **Mis-categorized links** — **Pricing is under "Company"** (it's a Product link). The variable is even named `footerLinksLegal` but contains Pricing + Contact and **zero legal links**.
3. **No legal section at all** — no Privacy Policy, Terms of Service, or Acceptable Use. For an API that processes addresses/location (PII-adjacent, GDPR-relevant), this is a real trust and compliance gap, not a nicety.
4. **No developer/trust signals** — no GitHub, no API Status/uptime, no Support, no SDKs link.
5. **Contact is a bare mailto** — fine as a fallback, but there's no Contact/Sales page.

**Recommended footer (honest, current-stage):**
- **Product:** Coverage · Pricing · Documentation · API Reference (when live) · SDKs (when live)
- **Developers:** Docs · API Status _(stub a status page or omit until real)_ · GitHub · Support (`mailto` ok)
- **Company:** Contact · _About (optional, only if there's content)_
- **Legal:** Privacy Policy · Terms of Service · Acceptable Use Policy ← **add these before any paid usage goes live**

Omit Blog/Changelog/Careers/Guides/Tutorials until the content exists — empty or 404 footer links erode the exact trust a footer is meant to build. A short, honest footer beats a comprehensive-looking but broken one.

---

## 4. Homepage Audit

**Section order:** Hero → Integration → Capabilities → API in action → Feature → Testimonial → Footer.
**Hero:** "Every location workflow, one API" + "Reliable place search, autocomplete, and geocoding… US and Australia anchor the data, with several European countries live and coverage expanding across South America." CTAs: **Sign up** + **Read the docs**. Animated particle globe.

**What works**
- Clear primary value prop ("Every location workflow, one API") and a developer-appropriate dual CTA (start + docs).
- "API in action" with a live address-autocomplete demo is the strongest asset — show, don't tell. Keep and elevate it.
- Honest coverage framing in the hero copy ("US and Australia anchor the data…").

**Problems & friction (prioritized)**
1. **🔴 Fabricated testimonials.** Six fictional companies + named people + quotes. This is the highest-risk item on the whole site. **Remove or clearly relabel as illustrative**, and replace with real trust signals: "Built on official G-NAF & US address data," coverage counts, latency/uptime numbers, "X requests served." Invented social proof is worse than none.
2. **🟠 Section ordering buries proof of value.** Integration (logos/partners) appears _before_ Capabilities and the live demo. Lead with the demo and capabilities; move integrations lower.
3. **🟠 No single, scannable feature grid above the fold-adjacent area.** Capabilities exist but the value ("autocomplete, geocoding, geofencing, routing, device tracking") should appear as a tight icon grid early, so a developer knows in 10s whether you do what they need.
4. **🟡 Two H2s share identical styling** (`capabilities.tsx:34`, `api-in-action.tsx:26`) — fine, but verify heading hierarchy is sequential (single H1 in hero, H2s for sections) for SEO/a11y.
5. **🟡 No pricing teaser.** The homepage never states "10,000 requests/month free." That free tier is your strongest acquisition hook — surface it in the hero subtext or a CTA ("Start free — 10k requests/month").
6. **🟡 No code snippet on the landing page.** "Developer experience" is claimed in copy but the homepage shows a UI demo, not a `curl`/SDK snippet. Add a minimal request/response block — developers buy from code, not prose.

**Recommendation order:** (1) fix testimonials, (2) add free-tier hook to hero, (3) reorder so demo + capabilities lead, (4) add a code snippet, (5) move integrations down.

---

## 5. Coverage Page Audit

**Current:** H1 "Coverage" + one-line description, a live country-count, a search input, and a table (Country · Code · Capabilities-as-badges). "Don't see your country? Request coverage →" (mailto). Decorative background.

**What works**
- Searchable, honest, and developer-useful — lets people check support _before_ integrating (explicitly the stated goal). The "Request coverage" mailto is a smart low-effort demand signal.
- Capability badges per country are genuinely informative.

**Gaps**
1. **No sense of scale or quality.** A table of country codes communicates breadth poorly. Add a **map/choropleth** (or at minimum a summary band: "N countries · M addresses · primary regions US, AU, EU") so global reach is felt, not just listed.
2. **No data provenance.** Developers evaluating geocoding accuracy care intensely about _sources_. State them: "US & Australia on official G-NAF / US address data; Europe via OSM," with freshness ("updated monthly"). This is the single biggest credibility lever on this page.
3. **No data-quality / reliability framing.** No mention of match rates, rooftop vs. interpolated, update cadence, or per-region accuracy caveats. Even a short "How our data works" note builds trust.
4. **Capabilities legend is implicit.** Badges use `CAPABILITY_LABELS` but there's no key explaining what each capability means or links to the relevant doc.
5. **Weak conversion.** The only CTA is "Request coverage." Add a "Start building" / "Read the geocoding docs" CTA for the (majority) case where their country _is_ supported.
6. **Title says "Countries with Address Data"** but the product also does routing/geofencing/device tracking — clarify which capabilities are per-country vs. global.

---

## 6. Pricing Page Audit

**Current:** Badge "Pricing" + H1 "Geocoding that scales with you" + subcopy "Australian address autocomplete, reverse geocoding, and geofencing on G-NAF data. Pay only for what you use — start free, no card required." Single "Pay-as-you-go" card: **10,000 requests/month free, then $1.00 / 1,000 requests**, feature checklist, "Start for free" CTA. Footnote linking docs + "Get in touch."

**What works**
- **Genuinely good model for developer adoption:** generous free tier, no card, no minimums, transparent per-request rate, "no surprise spikes" positioning (a real differentiator vs. Google Maps Platform). This is the right pricing _philosophy_.
- Clean single-card layout removes choice paralysis.

**Problems**
1. **🔴 Positioning contradiction.** H1/subcopy scope pricing to **"Australian address autocomplete… on G-NAF data,"** contradicting the homepage's US + AU + EU + SA story. Rewrite to match: "Geocoding, geofencing & routing that scale with you. Pay only for what you use."
2. **🟠 No enterprise / volume path.** Pure self-serve with no "Contact sales," no volume discount tiers, no SLA/SSO/dedicated-support story. You'll cap deal size and lose any team comparing to Radar/Mapbox enterprise. Add a second card or a band: **"Scaling past X requests? Talk to us"** (custom pricing, SLA, SSO, priority support).
3. **🟠 "Get in touch" links to `/sign-up`.** A pricing-questions link should go to Contact/Sales (mailto or form), not the signup flow. Confusing and a conversion leak.
4. **🟡 No cost calculator / examples.** "$1.00 / 1,000" is abstract. Add worked examples ("50k req/mo = $40 after the free 10k") or a small slider. Developers want to forecast — and forecasting is literally your pitch.
5. **🟡 No clarity on what counts as a "request."** Is a batch geocode N requests or 1? Autocomplete keystrokes? This ambiguity blocks adoption decisions — define it inline or link to a "what counts" doc.
6. **🟡 No comparison / objection handling.** A short "vs. usage-priced consumer maps APIs" line or FAQ (overage behavior, do free requests roll over, payment methods, can I cap spend) would close the page.
7. **🟡 Feature list mixes pricing terms with product features** ("Webhooks, analytics, team billing"). Fine, but ensure they're all actually shipped — listing unshipped features here is a trust risk.

---

## 7. Information Architecture Recommendations

1. **Separate global from page-local navigation.** Global chrome (nav + footer) must only ever link to **real routes**. Move all `#why / #capabilities / #api` interactions into homepage-local in-page nav (or a sticky sub-nav on `/` only). This single rule fixes the largest bug class.
2. **Establish a clear top-level taxonomy:** Product/Capabilities · Docs · Coverage · Pricing · (Login/Get started). Everything else (Reference, SDKs, Changelog, Blog, Status, Legal) lives in the footer until it earns a nav slot.
3. **One source of truth for coverage/positioning copy.** Hero, Pricing, Coverage, and SEO all describe scope differently. Centralize the canonical "what we cover / what we do" string and reuse it.
4. **Capabilities deserve real URLs.** Per-capability landing/doc pages (geocoding, autocomplete, geofencing, routing, device tracking) are SEO gold for an API product and let nav/footer link somewhere real.
5. **Add the boring-but-critical pages:** Privacy, Terms, Acceptable Use, Status, Contact/Sales. These are IA, not afterthoughts, for a paid API.

---

## 8. Conversion Optimization Recommendations

1. **Lead every page with the free-tier hook** — "10,000 requests/month free, no card." It's your best acquisition lever and currently only appears on /pricing.
2. **One primary CTA per page**, consistently labeled ("Get started" / "Start for free"), filled style; "Read the docs" as the secondary. Today labels drift (Sign up / Start for free / Get in touch).
3. **Fix the "Get in touch" → /sign-up leak** on Pricing.
4. **Add a code snippet + live demo above the testimonial fold** — developers convert on proof they can integrate, not on quotes.
5. **Give Coverage a "supported → start building" path**, not just "not supported → email us."
6. **Add an enterprise/volume CTA** to capture larger deals the self-serve flow can't.
7. **Replace fabricated proof with verifiable proof** (data sources, volume, uptime) — credibility _is_ conversion for infra products.

---

## 9. Quick Wins (1–2 days)

- **Remove homepage-only anchors from the global nav and footer** (or gate them to `/`). Highest impact, lowest effort.
- **Remove/relabel fabricated testimonials**; swap in "Built on G-NAF & official US address data" + coverage stats.
- **Fix Pricing positioning copy** to match the multi-region homepage story.
- **Repoint Pricing "Get in touch"** away from `/sign-up`.
- **Move "Pricing" out of footer "Company" into "Product";** rename the mislabeled `footerLinksLegal` array.
- **Hide "Dashboard" from the logged-out nav.**
- **Add the free-tier line** ("10k requests/month free") to the homepage hero.
- **Convert internal nav `<a href>` to TanStack `<Link>`;** derive active state from route.

## 10. Medium-Term Improvements (1–2 weeks)

- Add **Legal pages** (Privacy, Terms, Acceptable Use) and link them in a real footer "Legal" column.
- Build an **enterprise/volume band** on Pricing + a Contact/Sales page or form.
- Add a **pricing examples/calculator** and a "what counts as a request" definition.
- Add **data-source & quality** content to Coverage (provenance, freshness, match quality) + a summary band/visual.
- Reorder homepage (demo + capabilities first, integrations lower) and add a **code snippet** block.
- Stand up a **Changelog** and **Status** page (even minimal) and a real **API Reference** route.

## 11. Long-Term Strategic Improvements

- **Per-capability landing/doc pages** (geocoding, autocomplete, geofencing, routing, device tracking) for SEO and clearer IA.
- **Interactive coverage map** with drill-down to per-country data quality.
- **Real social proof program** — case studies, logos, and usage metrics as customers land.
- **Developer hub**: guides, tutorials, SDK quickstarts, sandbox/API explorer surfaced publicly.
- **Trust center**: status history/uptime SLA, security/compliance (GDPR, data handling), changelog feed.
- **Tiered + enterprise pricing** with SSO, SLAs, and volume commitments once self-serve demand is proven.

---

## 12. Proposed Final Navigation & Footer (world-class geospatial API platform)

_Target state, competing with Google Maps Platform / Mapbox / Radar / Foursquare. Roll out incrementally as pages exist._

### Final Navigation
```
[Logo]   Products ▾    Docs    Coverage    Pricing            [Log in]  [Get started]
            │
            ├─ Geocoding & Autocomplete
            ├─ Reverse Geocoding
            ├─ Geofencing
            ├─ Routing
            └─ Device / Location Tracking
```
- "Products" is a dropdown to real per-capability pages (replaces the broken `#capabilities`/`#api` anchors).
- "Docs" surfaces API Reference, Guides, SDKs, Changelog in its own sub-nav/megamenu.
- Right side: secondary "Log in" + primary "Get started"; swap to a "Dashboard" affordance when authenticated.
- Optional later additions: "Solutions" (by use-case/industry) and "Resources" (Blog/Guides) once content depth justifies them.

### Final Footer
```
Product            Developers          Company           Legal
─────────          ──────────          ─────────         ─────
Geocoding          Documentation       About             Privacy Policy
Autocomplete       API Reference       Contact / Sales   Terms of Service
Geofencing         SDKs                Careers*          Acceptable Use
Routing            Changelog           Blog*             DPA / GDPR
Coverage           API Status
Pricing            GitHub
                   Support

[Locnative logo]   © 2026 Locnative. All rights reserved.   [Status badge] [GitHub] [X/LinkedIn]
```
\* Add Careers/Blog only when staffed/published — never ship empty footer links.

**Guiding principle:** ship the *honest* subset of this today (Product + a Legal column + Docs/GitHub/Status under Developers), and grow into the full structure as real content, real customers, and real reference docs come online. A small footer that works beats a large one that 404s.
