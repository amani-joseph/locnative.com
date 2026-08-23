# Hero Section Variants — Design Spec

**Date:** 2026-06-19
**Status:** Approved, pending implementation

## Context

The current hero (`apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx`) shows an animated address-autocomplete demo as its centerpiece. We want to explore alternative directions before committing, informed by a scan of competing location-API landing pages.

## Competitive research summary

Fetched and indexed: Radar (radar.com), Mapbox (mapbox.com), HERE Platform (here.com/platform), Google Maps Platform (mapsplatform.google.com).

- **Radar**: short headline + subhead, customer logo wall directly under the fold, solution cards (Protect/Optimize/Engage) rather than a live product demo.
- **Mapbox**: headline "Maps that do more", two CTAs (Sign up free / Contact us), product-update carousel and customer-story cards — static imagery, no inline interactive demo.
- **HERE**: enterprise/data-platform framing, "3 simple steps" explainer, screenshot tiles per product (Geocoding & Search, Routing, etc.).
- **Google Maps Platform**: leads with "AI-powered insights", news/blog carousel, broad breadth messaging (250 countries, 100M daily updates).

**Key gap found:** none of the four competitors run a *live, interactive* demo in the hero — they all rely on static screenshots, logo walls, or news carousels. Locnative' existing animated address-search demo is a genuine differentiator and should be preserved in at least one variant rather than discarded.

## Decision: 3 variants

All three variants share:
- Same `Navbar` + page chrome (unchanged)
- Same badge pill: "Location & geocoding API — US, Australia & expanding"
- Same headline base: "Production-ready APIs for every location workflow" (copy tightened per variant, not replaced)
- Same two CTAs: "Get API access" (`/sign-up`), "Read the docs" (`/docs`)
- Same dark theme + background glow/globe treatment

### Variant A — "Live Demo" (refined current)
Keep the animated address-autocomplete panel as the centerpiece (existing `AddressDemoInput` logic, lightly refined spacing). Add a small rotating capability tag-line under the demo panel, e.g. "Now resolving: geocoding · autocomplete · reverse geocode", cycling in sync with demo scenario changes, so the single demo reads as proof of a multi-capability API rather than just autocomplete.

### Variant B — "Code Snippet" (dev-credibility)
Split two-column layout: left = headline/subhead/CTAs (text-only, no inline demo); right = a tabbed terminal-style panel showing real request/response JSON for 2–3 endpoints (autocomplete, geocode, geofence-check). Tabs auto-cycle on a timer (reusing the existing scenario-cycling pattern from `AddressDemoInput`, adapted for code blocks instead of suggestion rows). Syntax highlighting via existing styling conventions (no new dependency — hand-rolled span coloring consistent with the rest of the dark theme).

### Variant C — "Capability Grid"
Headline/CTAs centered, shorter copy, no inline demo. Below: a 4-up grid of capability cards — Geocoding, Geofencing, Routing, Device Tracking — each with a 1-line description and a small static/looped mini-visual (pin marker, polygon+dot, route line, moving dot trail respectively). Communicates product breadth at a glance, closest to Radar's solution-card pattern.

## Delivery mechanism for review

- New components: `apps/web/src/components/shadcn-space/blocks/hero-15/variants/hero-demo.tsx`, `hero-code.tsx`, `hero-grid.tsx` (extracted/adapted from current `hero.tsx`).
- New dev-only preview route: `apps/web/src/routes/_public/hero-preview.tsx`, reading a `hero` search param (`demo` | `code` | `grid`, default `demo`) and rendering the matching variant under the same `Navbar`.
- This route is a temporary review tool — once a variant is chosen, it gets wired into the real `apps/web/src/routes/index.tsx` (replacing current `HeroSection` import) and the preview route is deleted.

## Out of scope

- SEO optimization for landing + docs pages (separate spec, follow-up).
- Final copy polish beyond what's specified per variant — headline wording stays as specified above; no full copywriting pass.
- New icon/animation dependencies — build with existing `lucide-react`, `motion/react`, and Tailwind utilities already in the codebase.

## Testing / verification

- Each variant must render correctly in both light/dark (project is dark-only per `dark` class on root, but verify no broken contrast).
- Verify in browser via `hero-preview?hero=demo|code|grid` — confirm animations run, CTAs link correctly, responsive behavior holds at mobile/tablet/desktop widths.
- `pnpm dlx ultracite check` must pass with no new lint errors.
