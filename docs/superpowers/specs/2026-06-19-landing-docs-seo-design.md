# Landing + Docs SEO Optimization — Design Spec

**Date:** 2026-06-19
**Status:** Approved, pending implementation
**Branch:** `seo-landing-docs` (worktree off master, merges to master)

## Context

The marketing landing page (`/`) and developer docs (`/docs`) on master have minimal SEO:

- `__root.tsx` sets only charset, viewport, and one generic global title ("Locnative — Locations API for developers"). No meta description, Open Graph, Twitter cards, canonical, or structured data.
- `index.tsx` and `docs.tsx` set no per-page title or description — both inherit the generic root title.
- `sitemap.xml.ts` lists only `/`, `/sign-in`, `/sign-up` — missing the real content pages `/docs` and `/pricing`.
- `robots.txt` is fine (allows all, references the sitemap).

TanStack Router's `head()` supports `meta`, `links`, and `scripts` (including `type: "application/ld+json"`), so all of this can be delivered idiomatically per-route and server-rendered.

A 1200×630 Open Graph image already exists at `apps/web/public/brand/png/og-image-1200x630.png` — reuse it; do not generate a new one.

## Goal

Add a complete on-page SEO layer to `/` and `/docs`: per-page titles, meta descriptions, canonical URLs, Open Graph + Twitter cards, and JSON-LD structured data — plus fix the sitemap. All changes are additive and low-risk; no page content is rewritten.

## Architecture

Small, focused, independently testable units.

### 1. `apps/web/src/lib/seo.ts` (new)

Pure helper. No React, no I/O.

```
const SITE_URL = "https://locnative.com";
const SITE_NAME = "Locnative";
const DEFAULT_OG_IMAGE = "/brand/png/og-image-1200x630.png";

interface SeoInput {
  title: string;
  description: string;
  path: string;          // e.g. "/" or "/docs"
  image?: string;        // path or absolute; defaults to DEFAULT_OG_IMAGE
  keywords?: string;     // optional comma-separated
  ogType?: string;       // defaults to "website"
}

interface SeoHead {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
}

function absoluteUrl(pathOrUrl: string): string;   // join SITE_URL + path, pass through absolutes
function buildSeo(input: SeoInput): SeoHead;
```

`buildSeo` returns:
- `meta`: `{ title }`, `{ name: "description", content }`, optional `{ name: "keywords", content }`, Open Graph set (`og:type`, `og:url`, `og:title`, `og:description`, `og:image`, `og:site_name`), Twitter set (`twitter:card: "summary_large_image"`, `twitter:title`, `twitter:description`, `twitter:image`).
- `links`: `{ rel: "canonical", href: absoluteUrl(path) }`.

`og:url` and `twitter`/`og` image are always absolute URLs.

Exports: `SITE_URL`, `SITE_NAME`, `DEFAULT_OG_IMAGE`, `absoluteUrl`, `buildSeo`, and the `SeoInput`/`SeoHead` types.

### 2. `apps/web/src/lib/structured-data.ts` (new)

Pure JSON-LD builders returning plain objects, plus a helper that wraps an object into a TanStack `head().scripts` entry.

```
function organizationJsonLd(): object;            // @type Organization: name, url, logo
function softwareApplicationJsonLd(): object;     // @type SoftwareApplication: name, applicationCategory "DeveloperApplication", offers, featureList
function techArticleJsonLd(): object;             // @type TechArticle for /docs: headline, description, url
function breadcrumbJsonLd(items): object;         // @type BreadcrumbList
function jsonLdScript(data: object): { type: "application/ld+json"; children: string };
```

`jsonLdScript` returns an entry suitable for `head(): { scripts: [...] }`. `children` is `JSON.stringify(data)`.

`softwareApplicationJsonLd` `offers` reflects the live pricing model (free allotment then usage-based — pulled from the pricing page copy, not hardcoded duplicate numbers that could drift; use a generic "free tier then usage-based" `offers` with `price: "0"` for the free entry and a `priceSpecification` note rather than inventing exact figures). `featureList` lists: address autocomplete, geocoding, reverse geocoding, geofencing, routing, device tracking.

Exports: all four builders + `jsonLdScript`.

### 3. `apps/web/src/routes/__root.tsx` (modify)

Extend the existing `head()`:
- Keep charset, viewport, existing title (acts as fallback for routes without their own title).
- Add a default `{ name: "description", content }` (site-level), `og:site_name`, default `og:type: "website"`, `twitter:card: "summary_large_image"`, and a default `og:image`/`twitter:image` pointing at the existing OG image.
- Add site-wide **Organization** JSON-LD via `scripts: [jsonLdScript(organizationJsonLd())]`.

Per-route `head()` meta with the same keys overrides the root defaults (TanStack merges by replacing later-defined keys), so `/` and `/docs` titles/descriptions win on their pages.

### 4. `apps/web/src/routes/index.tsx` (modify)

Add `head:` returning `buildSeo({...})` spread into the route head, plus **SoftwareApplication** JSON-LD via `scripts`.

- Title: "Geocoding, Geofencing & Routing APIs for Developers | Locnative"
- Description: "Production-ready location APIs — address autocomplete, geocoding, geofencing, routing, and device tracking. Ship location features fast with US & Australia coverage."
- path: "/", ogType: "website"

### 5. `apps/web/src/routes/docs.tsx` (modify)

Add `head:` returning `buildSeo({...})` plus **TechArticle** + **BreadcrumbList** JSON-LD.

- Title: "API Documentation — Geocoding & Address Autocomplete | Locnative"
- Description: "Developer docs for the Locnative location API: address autocomplete, reverse geocoding, nearby lookup, and canonical address retrieval with API-key auth."
- path: "/docs", ogType: "article"
- Breadcrumb: Home → Documentation.

### 6. `apps/web/src/routes/sitemap.xml.ts` (modify)

Add entries: `/docs` (priority 0.9), `/pricing` (priority 0.8). Refactor so `PUBLIC_PATHS` is exported for unit testing. No other behavior change.

## Testing

Vitest unit tests (no DOM needed for the pure helpers):

- `apps/web/src/lib/seo.test.ts`:
  - `buildSeo` returns a title meta, a description meta, and a canonical link.
  - canonical href and `og:url` are absolute (`https://locnative.com/...`).
  - `og:image`/`twitter:image` resolve to an absolute URL even when given a root-relative path.
  - Twitter card is `summary_large_image`.
  - `absoluteUrl` passes through an already-absolute URL unchanged and joins a root-relative path.
- `apps/web/src/lib/structured-data.test.ts`:
  - `organizationJsonLd` has `@context`, `@type: "Organization"`, `name`, `url`.
  - `softwareApplicationJsonLd` has `@type: "SoftwareApplication"`, a non-empty `featureList`, and an `offers` object.
  - `techArticleJsonLd` has `@type: "TechArticle"` and a `headline`.
  - `jsonLdScript` returns `type: "application/ld+json"` and `children` that is valid JSON parsing back to the input.
- `apps/web/src/routes/sitemap-paths.test.ts` (or co-located): `PUBLIC_PATHS` includes `/docs` and `/pricing` and every entry has a non-empty `priority`.

All new files must pass `pnpm dlx ultracite check` with no new errors.

## Constraints

- Tabs for indentation, double quotes (Ultracite/Biome enforced).
- Named exports for helpers; default-export pattern only where existing route convention requires.
- `@/` path alias for intra-app imports; include `.ts` extension in relative server-side imports per repo convention.
- No new npm dependencies.
- No `console.log`/`debugger`.
- Do not modify any of the 14 uncommitted files in the shared main checkout — this work is isolated in the `seo-landing-docs` worktree and merges to master at the end.
- Reuse the existing OG image; do not generate a new one.

## Out of Scope

- Page content/heading rewrites (pages already have proper single h1s).
- Core Web Vitals / performance work.
- A per-page `head` for `/pricing` (it gets root defaults + a sitemap entry only).
- Hero section variants (separate, already-completed work on a different branch).

## Verification

- Unit tests green; `ultracite check` clean.
- Start dev server, fetch `/` and `/docs` SSR HTML, and confirm: per-page `<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:*` and `twitter:*` tags, and `<script type="application/ld+json">` blocks are present and correct; root pages without their own head still get the Organization JSON-LD + defaults.
- Fetch `/sitemap.xml` and confirm `/docs` and `/pricing` appear.
