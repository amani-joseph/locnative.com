# Country Coverage Page — Design

**Date:** 2026-06-21
**Status:** Approved (pre-implementation)
**Route:** `/coverage`

## Problem

Developers evaluating the Locnative location API and SDKs have no way to see which
countries have address data before integrating. They risk building against the
platform only to discover their country of operation is unsupported. We need a public,
self-serve page that lists supported countries and what each supports.

## Goals

- Public page at `/coverage` listing every country with address data.
- Searchable by country name or ISO-2 code.
- Show per-country capabilities (geocode / reverse / autocomplete).
- Minimalistic, shadcn components, no new backend.

## Non-Goals

- No live row counts / dataset freshness (static curated list only).
- No "coming soon" roadmap of unsupported countries.
- No per-country detail pages.
- No new API endpoint.

## Source of Truth

The supported set is the **17 unique ISO-2 codes** encoded in
`packages/database/src/queries/country-codes.ts` (`COUNTRY_NAME_TO_ISO`):

```
US, AU, GB, FR, DE, ES, IT, NL, BE, AT, CH, PT, PL, DK, NO, FI, CA
```

Rationale: `matchCountry()` is the gate that resolves a country filter. A country not
in that map cannot be queried by country regardless of ingested rows, so this map —
not the broader intl-campaign list — is the honest statement of coverage.

## Data Model

New file `apps/web/src/data/coverage.ts`:

```ts
export type Capability = "geocode" | "reverse" | "autocomplete";

export type CoverageCountry = {
  iso2: string;        // "US"
  name: string;        // "United States"
  capabilities: Capability[];
};

export const COVERAGE_COUNTRIES: CoverageCountry[] = [/* 17 entries */];
```

- All 17 entries carry `["geocode", "reverse", "autocomplete"]` — they share the same
  `addresses` table and the same query paths. The array shape supports per-country
  divergence later without touching the page.
- Names are the canonical names from `country-codes.ts` (e.g. "United Kingdom" for GB).
- Keep `COVERAGE_COUNTRIES` sorted alphabetically by `name`.

### Pure helpers (same file or a sibling)

```ts
// "US" -> "🇺🇸" via regional-indicator code points; no image assets.
export function iso2ToFlag(iso2: string): string;

// Case-insensitive match on name OR iso2. Empty/whitespace query -> full list.
export function filterCountries(query: string, list: CoverageCountry[]): CoverageCountry[];
```

Both are pure and unit-testable without a DOM renderer.

## UI

Route file `apps/web/src/routes/coverage.tsx`:

- `createFileRoute("/coverage")` — public, **no** `beforeLoad` auth guard.
- `head`: title + meta description for SEO (e.g. "Coverage — Locnative | Countries
  with address data").

Layout (top to bottom):

1. **Header** — `<h1>Coverage</h1>`, one-line subtitle ("Countries with address data
   available through the Locnative API."), and a live count line that reflects the
   current filter ("17 countries" / "3 of 17 countries").
2. **Search** — single `Input` (`@locnative/ui/components/input`), `value`/`onChange`
   wired to local `useState`; results computed with `useMemo(() => filterCountries(...))`.
3. **Table** — `@locnative/ui/components/table`:
   | Country | Code | Capabilities |
   |---|---|---|
   | `🇺🇸 United States` | `US` | `Geocode` `Reverse` `Autocomplete` badges |
   - Capabilities rendered as `Badge` (`@locnative/ui/components/badge`), one per
     capability, with a stable `key`.
4. **Empty state** — when the filtered list is empty, render a single full-width row:
   "No countries match \"<query>\"."
5. **Footer line** — muted text: "Don't see your country? Request coverage →" linking
   to the existing contact/docs route.

Styling: Tailwind v4 design tokens already in the app (`text-muted-foreground`,
`border-border`, etc.). No custom CSS beyond utility classes. Container width and
spacing follow the existing `/docs` and `/pricing` route conventions.

## Discoverability

Add a link to `/coverage` from the docs page (and/or primary nav) so developers reach
it without guessing the URL. Exact placement follows the existing nav/docs link
pattern; this is a one-line addition, not a nav redesign.

## Testing

Per the repo's no-DOM React test convention (extract pure logic, no renderer):

- `iso2ToFlag()` — correct emoji for a sample of codes; deterministic.
- `filterCountries()` — matches by name (case-insensitive), matches by ISO-2, returns
  full list on empty/whitespace query, returns empty on no match.

No component/render tests.

## Out of Scope / Future

- Live address counts + dataset source per country (would need a cached public
  endpoint).
- Region grouping / flag-grid alternate layouts.
- Wiring the remaining intl-campaign countries into `country-codes.ts` (separate work;
  this page reflects whatever that map contains).

## Files

| File | Change |
|---|---|
| `apps/web/src/data/coverage.ts` | New — data + pure helpers |
| `apps/web/src/routes/coverage.tsx` | New — route + UI |
| `apps/web/src/data/coverage.test.ts` (or sibling) | New — unit tests for helpers |
| docs/nav link | Edit — one link to `/coverage` |
