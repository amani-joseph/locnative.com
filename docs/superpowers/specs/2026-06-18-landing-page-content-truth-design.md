# Landing Page Content-Truth Revamp — Design

**Date:** 2026-06-18
**Status:** Approved (design); implementation pending
**Scope:** Medium rebuild of the public landing page (`apps/web/src/routes/index.tsx`)

## Problem

The landing page composes five shadcn-space template blocks (Hero → Integration →
Feature → Testimonial → Footer). The copy was largely rewritten for Locnative and
is honest/hedged, but several blocks still carry **template residue and fabricated
content** that misrepresents the product, and the positioning **understates what is
actually shipped**.

### Audit findings

**Credibility / factual problems**

1. **Integration orbit logos** — `integration-01/integration.tsx:73-131` orbits
   Supabase, Vercel, Make, Figma, Slack, Claude, ChatGPT, Stripe from
   `images.shadcnspace.com`. Implies integrations that don't exist; irrelevant to a
   geocoding API.
2. **Placeholder feature image** — `feature-15/feature.tsx:55-61` uses
   `feature-15-bg.png` / `feature-15-img.png` from the shadcnspace CDN; shows nothing
   about the real product.
3. **Dead footer links** — `footer-02/footer.tsx` Documentation, Changelog, System
   status, Privacy, Terms, Security all point to `#`. Newsletter form has no submit
   handler.

**Positioning gaps (understates the product)**

4. Hero subtitle says only "Address autocomplete and geocoding API," but the product
   ships reverse geocoding, nearby, geocode/batch, zones (geofencing), devices,
   webhooks, regions classify, and routing.
5. Hero CTAs are commented out (`hero.tsx:680-703`) — no actionable button in the hero.
6. Badge "Locations API — public beta" + Australia-only framing don't match the
   intended international positioning.

**Decisions taken (from brainstorming)**

- **Testimonials:** keep as-is for now (no removal/replacement this pass).
- **Integration orbit:** replace with Locnative' own surfaces.
- **Positioning:** international coverage — US + Australia at the core, several
  European countries, actively expanding across South America, Europe, Africa, Asia.
- **Scope:** content + light rebuild → grew to **medium rebuild** (all four rebuild
  targets selected, consolidated into two new sections).

## Source of truth — real API surface

From `packages/sdk/README.md` (authoritative). All capability/code content must match:

| Namespace | Methods |
|---|---|
| `client.addresses` | `autocomplete`, `getById`, `nearby`, `reverse` |
| `client.geocode` | `forward`, `batch.submit`, `batch.poll`, `batch.results` |
| `client.zones` | `create`, `list`, `get`, `update`, `delete`, `contains`, `addresses` |
| `client.devices` | `pushLocation`, `zones` |
| `client.webhooks` | `create`, `list`, `delete`, `reactivate` |
| `client.regions` | `classify` |
| `client.routing` | `directions`, `matrix`, `isochrone` |

- SDK package: `@locnative/sdk`; entry `createLocnativeClient({ apiKey })`.
- Base URL: `https://api.locnative.com`; OpenAPI at `/api/v1/openapi.json`.
- **Coverage truth:** G-NAF Australian addresses are *authoritative*; international
  (US, parts of EU, more) is *in beta, rolling out*. Marketing copy must say
  "US + Australia at the core, expanding" — never imply complete global coverage.

## Target page structure

`apps/web/src/routes/index.tsx` final order:

```
Hero → Integration → Capabilities (NEW) → API in action (NEW) → Feature accordion → Testimonial (unchanged) → Footer
```

### 1. Hero — `hero-15/hero.tsx` + `index.tsx` (block) + `navbar.tsx`

- Expand subtitle to name the real surface: geocoding, geofencing, routing, device
  tracking, and webhooks — "ship location features without the complexity."
- **Restore CTAs** (currently commented out): primary "Get API access" → `/sign-up`,
  secondary "Read the docs" → `/docs`. Use TanStack `Link`, not `<a href="#">`.
- Reframe badge: *"Location & geocoding API — US, Australia & expanding."*
- Keep globe + animated `AddressDemoInput` (mixed US/UK/AU examples are accurate).

### 2. Integration — `integration-01/integration.tsx`

- Keep heading "Drop-in HTTP, not a maps widget" and copy; retune to international.
- **Replace the orbit's external brand SVGs** with Locnative' own surfaces as
  labeled icon nodes: REST API, `@locnative/sdk`, React UI, Vue UI, Webhooks.
  Use lucide icons (no `images.shadcnspace.com` URLs). Keep the orbit animation.

### 3. Capabilities grid (NEW) — `apps/web/src/components/landing/capabilities.tsx`

- `id="capabilities"`. 7 cards, one per real namespace, each with lucide icon,
  title, one-line description, and a link to `/docs`:
  Addresses (autocomplete/reverse/nearby), Geocode & Batch, Zones (geofencing),
  Devices, Webhooks, Regions, Routing.
- Match dashboard dark theme + existing card primitives from `@/components/ui`.

### 4. API in action (NEW) — `apps/web/src/components/landing/api-in-action.tsx`

- `id="api"`. Replaces the placeholder feature image. Two halves:
  - **Quickstart code sample** — real SDK snippet (install + `createLocnativeClient`
    + an `addresses.autocomplete` call) and a representative JSON response.
  - **Endpoints showcase** — small tabbed list of real endpoints with example params.
- Static, copy-accurate content; no live network calls.

### 5. Feature accordion — `feature-15/feature.tsx`

- Keep the 3 accordion items (predictable pricing / developer experience / coverage).
- Update coverage item copy to the international story.
- **Remove the placeholder image column** (now covered by section 4); rebalance layout.

### 6. Testimonial — `testimonial-07/testimonial.tsx`

- **Unchanged** this pass.

### 7. Footer — `footer-02/footer.tsx`

- Fix dead links: Documentation → `/docs`, API overview → `#capabilities`,
  Pricing → `/pricing`.
- Remove (or mark clearly as upcoming) links with no destination: Changelog,
  System status, Privacy, Terms, Security.
- Newsletter form: wire to a real handler or remove the form until one exists.
- Update footer pricing headline to the international framing.

### Navbar / navigation data — `hero-15/index.tsx`

- Update `navigationData` to match new anchors: add "Capabilities" (`#capabilities`)
  and "API" (`#api`); keep Docs (`/docs`), Pricing (`/pricing`); review "Updates"
  (`#newsletter`) given footer newsletter changes.

## Coverage visual

No new map component. Reinforce the international story via the existing hero globe
plus a single honest coverage line in copy. Keeps the page lean.

## Components & boundaries

New files (focused, single-purpose, dark-theme, reuse `@/components/ui`):

- `apps/web/src/components/landing/capabilities.tsx`
- `apps/web/src/components/landing/api-in-action.tsx`

Edited files: `index.tsx` (route), the five block files, and `hero-15/index.tsx`
(nav data). No backend, API, or schema changes — this is presentation only.

## Out of scope

- Building Changelog, System status, Privacy, Terms, Security pages.
- Real newsletter backend.
- Replacing/expanding the Testimonial section.
- Any API, schema, or pricing-logic changes.

## Success criteria

- No `images.shadcnspace.com` assets remain on the landing page.
- Every visible link resolves to a real route/anchor or is removed (no `href="#"`).
- All capability/code content matches the SDK surface table above.
- Coverage copy states "US + Australia core, expanding" with no overclaim.
- Hero has working primary + secondary CTAs.
- `pnpm dlx ultracite check` passes; page builds and renders in dark theme.

## Implementation note

Per `CLAUDE.md` GSD enforcement, code edits should run through a GSD-style flow.
GSD tooling is currently broken (see project memory), so execution proceeds manually
in GSD style. Next step after spec approval: the writing-plans skill to produce the
task-by-task implementation plan.
