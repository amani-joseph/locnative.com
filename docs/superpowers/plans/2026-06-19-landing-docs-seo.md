# Landing + Docs SEO Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete on-page SEO layer (per-page titles, meta descriptions, canonical URLs, Open Graph + Twitter cards, JSON-LD structured data) to the landing page (`/`) and docs (`/docs`), and fix the sitemap to include `/docs` and `/pricing`.

**Architecture:** Two new pure helper modules — `lib/seo.ts` (builds the `{ meta, links }` head fragment) and `lib/structured-data.ts` (builds JSON-LD objects + a `head().scripts` wrapper) — are unit-tested in isolation. The three route files (`__root.tsx`, `index.tsx`, `docs.tsx`) consume those helpers in their TanStack Router `head()` option; route wiring is thin and verified by a final SSR fetch check rather than brittle route-render unit tests. `sitemap.xml.ts` is refactored to export its path list for unit testing and gains the two missing content pages.

**Tech Stack:** TanStack Start / React Router `head()` (supports `meta`, `links`, and `scripts` including `type: "application/ld+json"` — verified in wrangler/router 1.168.x), Vitest (plain node env for pure helpers — no jsdom, no `@testing-library/jest-dom` in this repo), Biome/Ultracite.

## Global Constraints

- Tabs for indentation, double quotes. Run `pnpm dlx ultracite fix <files>` then `pnpm dlx ultracite check <files>` (zero errors) before each commit.
- Named exports for helpers; the route files keep their existing `createFileRoute(...)` default-less `Route` export convention.
- Use the `@/` path alias for intra-app imports inside route files. For the relative import of one lib helper from another lib helper, use `./name.ts` with the `.ts` extension (repo convention for server-adjacent lib files).
- No new npm dependencies.
- No `console.log`/`debugger` statements.
- `SITE_URL` is exactly `https://locnative.com` (no trailing slash). The default OG image is exactly `/brand/png/og-image-1200x630.png` (it already exists in `apps/web/public/brand/png/` — do NOT generate a new image).
- This work is isolated in the `seo-landing-docs` worktree. Do NOT modify any file in the shared main checkout. Stage only the files each task names with explicit `git add <path>` — never `git add -A` or `git commit -a`.
- Ultracite enforces `lint/performance/useTopLevelRegex`: any regex literal used in a test MUST be a module-scope `const`, never inline in an `it()` block.
- This app lives in `apps/web`; run vitest from inside `apps/web` (e.g. `cd apps/web && pnpm exec vitest run <path>`).

---

### Task 1: SEO head builder — `lib/seo.ts`

**Files:**
- Create: `apps/web/src/lib/seo.ts`
- Test: `apps/web/src/lib/seo.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3, 4, 5):
  - `SITE_URL = "https://locnative.com"`, `SITE_NAME = "Locnative"`, `DEFAULT_OG_IMAGE = "/brand/png/og-image-1200x630.png"` (string consts).
  - `absoluteUrl(pathPrefixOrUrl: string): string`
  - `type SeoMetaTag = Record<string, string>`
  - `type SeoLinkTag = Record<string, string>`
  - `interface SeoInput { title: string; description: string; path: string; image?: string; keywords?: string; ogType?: string }`
  - `interface SeoHead { meta: SeoMetaTag[]; links: SeoLinkTag[] }`
  - `buildSeo(input: SeoInput): SeoHead`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/seo.test.ts
import { describe, expect, it } from "vitest";
import { absoluteUrl, buildSeo, SITE_URL } from "./seo.ts";

describe("absoluteUrl", () => {
	it("joins a root-relative path onto SITE_URL", () => {
		expect(absoluteUrl("/docs")).toBe(`${SITE_URL}/docs`);
	});

	it("passes an already-absolute URL through unchanged", () => {
		expect(absoluteUrl("https://cdn.example.com/x.png")).toBe(
			"https://cdn.example.com/x.png"
		);
	});

	it("treats '/' as the site root", () => {
		expect(absoluteUrl("/")).toBe(`${SITE_URL}/`);
	});
});

describe("buildSeo", () => {
	const head = buildSeo({
		title: "Test Title",
		description: "Test description.",
		path: "/docs",
		keywords: "geocoding, api",
	});

	function metaContent(predicate: (m: Record<string, string>) => boolean) {
		return head.meta.find(predicate);
	}

	it("emits a title meta tag", () => {
		expect(metaContent((m) => m.title === "Test Title")).toBeTruthy();
	});

	it("emits a description meta tag", () => {
		const d = metaContent((m) => m.name === "description");
		expect(d?.content).toBe("Test description.");
	});

	it("emits a keywords meta tag only when provided", () => {
		expect(metaContent((m) => m.name === "keywords")?.content).toBe(
			"geocoding, api"
		);
		const noKeywords = buildSeo({
			title: "t",
			description: "d",
			path: "/",
		});
		expect(
			noKeywords.meta.find((m) => m.name === "keywords")
		).toBeUndefined();
	});

	it("emits an absolute canonical link", () => {
		const canonical = head.links.find((l) => l.rel === "canonical");
		expect(canonical?.href).toBe(`${SITE_URL}/docs`);
	});

	it("emits an absolute og:url", () => {
		expect(
			metaContent((m) => m.property === "og:url")?.content
		).toBe(`${SITE_URL}/docs`);
	});

	it("resolves a root-relative og:image to an absolute URL", () => {
		const img = metaContent((m) => m.property === "og:image")?.content;
		expect(img?.startsWith(`${SITE_URL}/`)).toBe(true);
	});

	it("uses the summary_large_image twitter card", () => {
		expect(
			metaContent((m) => m.name === "twitter:card")?.content
		).toBe("summary_large_image");
	});

	it("defaults og:type to website", () => {
		expect(metaContent((m) => m.property === "og:type")?.content).toBe(
			"website"
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/seo.test.ts`
Expected: FAIL with "Cannot find module './seo.ts'"

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/seo.ts
export const SITE_URL = "https://locnative.com";
export const SITE_NAME = "Locnative";
export const DEFAULT_OG_IMAGE = "/brand/png/og-image-1200x630.png";

export type SeoMetaTag = Record<string, string>;
export type SeoLinkTag = Record<string, string>;

export interface SeoInput {
	title: string;
	description: string;
	path: string;
	image?: string;
	keywords?: string;
	ogType?: string;
}

export interface SeoHead {
	meta: SeoMetaTag[];
	links: SeoLinkTag[];
}

/** Resolve a root-relative path to an absolute URL; pass absolutes through. */
export function absoluteUrl(pathPrefixOrUrl: string): string {
	if (
		pathPrefixOrUrl.startsWith("http://") ||
		pathPrefixOrUrl.startsWith("https://")
	) {
		return pathPrefixOrUrl;
	}
	const suffix = pathPrefixOrUrl.startsWith("/")
		? pathPrefixOrUrl
		: `/${pathPrefixOrUrl}`;
	return `${SITE_URL}${suffix}`;
}

export function buildSeo(input: SeoInput): SeoHead {
	const ogType = input.ogType ?? "website";
	const canonical = absoluteUrl(input.path);
	const imageUrl = absoluteUrl(input.image ?? DEFAULT_OG_IMAGE);

	const meta: SeoMetaTag[] = [
		{ title: input.title },
		{ name: "description", content: input.description },
		{ property: "og:type", content: ogType },
		{ property: "og:url", content: canonical },
		{ property: "og:title", content: input.title },
		{ property: "og:description", content: input.description },
		{ property: "og:image", content: imageUrl },
		{ property: "og:site_name", content: SITE_NAME },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: input.title },
		{ name: "twitter:description", content: input.description },
		{ name: "twitter:image", content: imageUrl },
	];

	if (input.keywords) {
		meta.push({ name: "keywords", content: input.keywords });
	}

	return {
		meta,
		links: [{ rel: "canonical", href: canonical }],
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/seo.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Lint and commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
pnpm dlx ultracite fix apps/web/src/lib/seo.ts apps/web/src/lib/seo.test.ts
pnpm dlx ultracite check apps/web/src/lib/seo.ts apps/web/src/lib/seo.test.ts
git add apps/web/src/lib/seo.ts apps/web/src/lib/seo.test.ts
git commit -m "feat(seo): add buildSeo head helper for titles, OG, and Twitter tags"
```

---

### Task 2: JSON-LD structured-data builders — `lib/structured-data.ts`

**Files:**
- Create: `apps/web/src/lib/structured-data.ts`
- Test: `apps/web/src/lib/structured-data.test.ts`

**Interfaces:**
- Consumes: `SITE_URL`, `SITE_NAME`, `absoluteUrl` from `./seo.ts` (Task 1).
- Produces (consumed by Tasks 3, 4, 5):
  - `organizationJsonLd(): Record<string, unknown>`
  - `softwareApplicationJsonLd(): Record<string, unknown>`
  - `techArticleJsonLd(input: { title: string; description: string; path: string }): Record<string, unknown>`
  - `breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown>`
  - `interface JsonLdScriptTag { type: "application/ld+json"; children: string }`
  - `jsonLdScript(data: Record<string, unknown>): JsonLdScriptTag`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/structured-data.test.ts
import { describe, expect, it } from "vitest";
import {
	breadcrumbJsonLd,
	jsonLdScript,
	organizationJsonLd,
	softwareApplicationJsonLd,
	techArticleJsonLd,
} from "./structured-data.ts";

describe("organizationJsonLd", () => {
	it("is a well-formed Organization node", () => {
		const o = organizationJsonLd();
		expect(o["@context"]).toBe("https://schema.org");
		expect(o["@type"]).toBe("Organization");
		expect(typeof o.name).toBe("string");
		expect(typeof o.url).toBe("string");
	});
});

describe("softwareApplicationJsonLd", () => {
	const s = softwareApplicationJsonLd();

	it("is a SoftwareApplication with a developer category", () => {
		expect(s["@type"]).toBe("SoftwareApplication");
		expect(s.applicationCategory).toBe("DeveloperApplication");
	});

	it("lists product features", () => {
		expect(Array.isArray(s.featureList)).toBe(true);
		expect((s.featureList as string[]).length).toBeGreaterThan(0);
	});

	it("carries an offers node", () => {
		expect(s.offers).toBeTruthy();
	});
});

describe("techArticleJsonLd", () => {
	it("is a TechArticle with a headline and absolute url", () => {
		const a = techArticleJsonLd({
			title: "Docs",
			description: "d",
			path: "/docs",
		});
		expect(a["@type"]).toBe("TechArticle");
		expect(a.headline).toBe("Docs");
		expect(String(a.url).startsWith("https://locnative.com/")).toBe(true);
	});
});

describe("breadcrumbJsonLd", () => {
	it("builds an ordered BreadcrumbList", () => {
		const b = breadcrumbJsonLd([
			{ name: "Home", path: "/" },
			{ name: "Documentation", path: "/docs" },
		]);
		expect(b["@type"]).toBe("BreadcrumbList");
		const items = b.itemListElement as Array<Record<string, unknown>>;
		expect(items).toHaveLength(2);
		expect(items[0].position).toBe(1);
		expect(items[1].position).toBe(2);
	});
});

describe("jsonLdScript", () => {
	it("wraps data into an ld+json script whose children parse back", () => {
		const tag = jsonLdScript({ a: 1 });
		expect(tag.type).toBe("application/ld+json");
		expect(JSON.parse(tag.children)).toEqual({ a: 1 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/structured-data.test.ts`
Expected: FAIL with "Cannot find module './structured-data.ts'"

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/structured-data.ts
import { absoluteUrl, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "./seo.ts";

export interface JsonLdScriptTag {
	type: "application/ld+json";
	children: string;
}

export function organizationJsonLd(): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: SITE_NAME,
		url: SITE_URL,
		logo: absoluteUrl("/brand/png/logo-mark-512.png"),
	};
}

export function softwareApplicationJsonLd(): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: SITE_NAME,
		url: SITE_URL,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Any",
		image: absoluteUrl(DEFAULT_OG_IMAGE),
		description:
			"Production-ready location APIs — address autocomplete, geocoding, geofencing, routing, and device tracking.",
		featureList: [
			"Address autocomplete",
			"Geocoding",
			"Reverse geocoding",
			"Geofencing",
			"Routing",
			"Device tracking",
		],
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
			description:
				"Free monthly request allotment, then usage-based pricing.",
		},
	};
}

export function techArticleJsonLd(input: {
	title: string;
	description: string;
	path: string;
}): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "TechArticle",
		headline: input.title,
		description: input.description,
		url: absoluteUrl(input.path),
		image: absoluteUrl(DEFAULT_OG_IMAGE),
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			url: SITE_URL,
		},
	};
}

export function breadcrumbJsonLd(
	items: { name: string; path: string }[]
): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: absoluteUrl(item.path),
		})),
	};
}

export function jsonLdScript(
	data: Record<string, unknown>
): JsonLdScriptTag {
	return {
		type: "application/ld+json",
		children: JSON.stringify(data),
	};
}
```

Note on the logo path: `organizationJsonLd` references `/brand/png/logo-mark-512.png`, which exists in `apps/web/public/brand/png/` (verified). Do not change it to another filename.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/structured-data.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Lint and commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
pnpm dlx ultracite fix apps/web/src/lib/structured-data.ts apps/web/src/lib/structured-data.test.ts
pnpm dlx ultracite check apps/web/src/lib/structured-data.ts apps/web/src/lib/structured-data.test.ts
git add apps/web/src/lib/structured-data.ts apps/web/src/lib/structured-data.test.ts
git commit -m "feat(seo): add JSON-LD structured-data builders"
```

---

### Task 3: Site-wide SEO defaults + Organization JSON-LD — `__root.tsx`

**Files:**
- Modify: `apps/web/src/routes/__root.tsx` (the `head()` option, currently around lines 37-66)

**Interfaces:**
- Consumes: `SITE_NAME`, `DEFAULT_OG_IMAGE`, `absoluteUrl` from `@/lib/seo`; `organizationJsonLd`, `jsonLdScript` from `@/lib/structured-data`.
- Produces: no new exported symbols. Adds default description, default OG/Twitter tags, and a site-wide Organization JSON-LD script to the root head. Per-route `head()` meta with matching keys (e.g. `{ title }`, `{ name: "description" }`) override these defaults.

- [ ] **Step 1: Read the current head block**

Run: `sed -n '1,66p' apps/web/src/routes/__root.tsx`
Confirm the existing imports and the `head: () => ({ meta: [...], links: [...] })` shape (charset, viewport, a `{ title: ... }`, and the favicon/stylesheet links).

- [ ] **Step 2: Add the helper imports**

At the top of the file, alongside the existing imports, add:

```tsx
import { absoluteUrl, DEFAULT_OG_IMAGE, SITE_NAME } from "@/lib/seo";
import { jsonLdScript, organizationJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 3: Extend the head() return**

In the `head: () => ({ ... })` option, keep the existing `charSet`, `viewport`, and `{ title: ... }` meta entries and the existing `links`. Add the default description + social tags to the `meta` array, and add a `scripts` array. The resulting `head()` body:

```tsx
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
			},
			{
				title: "Locnative — Locations API for developers",
			},
			{
				name: "description",
				content:
					"Production-ready location APIs — address autocomplete, geocoding, geofencing, routing, and device tracking. US & Australia coverage.",
			},
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:type", content: "website" },
			{
				property: "og:image",
				content: absoluteUrl(DEFAULT_OG_IMAGE),
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{
				name: "twitter:image",
				content: absoluteUrl(DEFAULT_OG_IMAGE),
			},
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/brand/favicon.svg",
			},
			{
				rel: "apple-touch-icon",
				href: "/brand/favicon.svg",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
		scripts: [jsonLdScript(organizationJsonLd())],
	}),
```

(Keep `appCss` referencing the same imported value already used in the file — do not change that import.)

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
pnpm dlx ultracite fix apps/web/src/routes/__root.tsx
pnpm dlx ultracite check apps/web/src/routes/__root.tsx
cd apps/web && pnpm exec tsc --noEmit
```
Expected: lint clean; typecheck passes (the `head()` return now includes `scripts`, which the router types allow).

- [ ] **Step 5: Commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
git add apps/web/src/routes/__root.tsx
git commit -m "feat(seo): add site-wide meta defaults and Organization JSON-LD"
```

---

### Task 4: Landing-page head + SoftwareApplication JSON-LD — `index.tsx`

**Files:**
- Modify: `apps/web/src/routes/index.tsx` (the `createFileRoute("/")({ ... })` options)

**Interfaces:**
- Consumes: `buildSeo` from `@/lib/seo`; `jsonLdScript`, `softwareApplicationJsonLd` from `@/lib/structured-data`.
- Produces: a `head` option on the `/` route. Overrides the root title/description on the landing page and adds SoftwareApplication JSON-LD.

- [ ] **Step 1: Add imports and the head option**

Replace the current route definition in `apps/web/src/routes/index.tsx`:

```tsx
export const Route = createFileRoute("/")({
	component: HomeComponent,
});
```

with:

```tsx
import { buildSeo } from "@/lib/seo";
import {
	jsonLdScript,
	softwareApplicationJsonLd,
} from "@/lib/structured-data";

export const Route = createFileRoute("/")({
	head: () => {
		const seo = buildSeo({
			title:
				"Geocoding, Geofencing & Routing APIs for Developers | Locnative",
			description:
				"Production-ready location APIs — address autocomplete, geocoding, geofencing, routing, and device tracking. Ship location features fast with US & Australia coverage.",
			path: "/",
			ogType: "website",
			keywords:
				"geocoding API, geofencing API, routing API, address autocomplete, reverse geocoding, location API",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [jsonLdScript(softwareApplicationJsonLd())],
		};
	},
	component: HomeComponent,
});
```

Keep the existing component imports and `HomeComponent` exactly as they are. Place the two new `import` lines with the other imports at the top of the file (Biome's import organizer will sort them on `ultracite fix`).

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
pnpm dlx ultracite fix apps/web/src/routes/index.tsx
pnpm dlx ultracite check apps/web/src/routes/index.tsx
cd apps/web && pnpm exec tsc --noEmit
```
Expected: lint clean; typecheck passes.

- [ ] **Step 3: Commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
git add apps/web/src/routes/index.tsx
git commit -m "feat(seo): add landing-page title, description, OG, and SoftwareApplication JSON-LD"
```

---

### Task 5: Docs head + TechArticle/Breadcrumb JSON-LD — `docs.tsx`

**Files:**
- Modify: `apps/web/src/routes/docs.tsx`

**Interfaces:**
- Consumes: `buildSeo` from `@/lib/seo`; `breadcrumbJsonLd`, `jsonLdScript`, `techArticleJsonLd` from `@/lib/structured-data`.
- Produces: a `head` option on the `/docs` route.

- [ ] **Step 1: Add imports and the head option**

Replace the current route definition in `apps/web/src/routes/docs.tsx`:

```tsx
export const Route = createFileRoute("/docs")({
	component: RouteComponent,
});
```

with:

```tsx
import { buildSeo } from "@/lib/seo";
import {
	breadcrumbJsonLd,
	jsonLdScript,
	techArticleJsonLd,
} from "@/lib/structured-data";

const DOCS_TITLE =
	"API Documentation — Geocoding & Address Autocomplete | Locnative";
const DOCS_DESCRIPTION =
	"Developer docs for the Locnative location API: address autocomplete, reverse geocoding, nearby lookup, and canonical address retrieval with API-key auth.";

export const Route = createFileRoute("/docs")({
	head: () => {
		const seo = buildSeo({
			title: DOCS_TITLE,
			description: DOCS_DESCRIPTION,
			path: "/docs",
			ogType: "article",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					techArticleJsonLd({
						title: DOCS_TITLE,
						description: DOCS_DESCRIPTION,
						path: "/docs",
					})
				),
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Documentation", path: "/docs" },
					])
				),
			],
		};
	},
	component: RouteComponent,
});
```

Keep the existing `DocsPage` import and `RouteComponent` exactly as they are.

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
pnpm dlx ultracite fix apps/web/src/routes/docs.tsx
pnpm dlx ultracite check apps/web/src/routes/docs.tsx
cd apps/web && pnpm exec tsc --noEmit
```
Expected: lint clean; typecheck passes.

- [ ] **Step 3: Commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
git add apps/web/src/routes/docs.tsx
git commit -m "feat(seo): add docs title, description, OG, TechArticle + Breadcrumb JSON-LD"
```

---

### Task 6: Sitemap — add `/docs` and `/pricing`, export paths for testing

**Files:**
- Modify: `apps/web/src/routes/sitemap.xml.ts` (the file is named `sitemap[.]xml.ts` on disk — the brackets are TanStack's escaping for a literal dot in the route path)
- Test: `apps/web/src/routes/sitemap-paths.test.ts`

**Interfaces:**
- Produces: `export const PUBLIC_PATHS: readonly { path: string; priority: string }[]` (was previously a module-private const). The handler behavior is unchanged except for the two added entries.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/sitemap-paths.test.ts
import { describe, expect, it } from "vitest";
import { PUBLIC_PATHS } from "./sitemap[.]xml.ts";

describe("PUBLIC_PATHS", () => {
	it("includes the docs page", () => {
		expect(PUBLIC_PATHS.some((p) => p.path === "/docs")).toBe(true);
	});

	it("includes the pricing page", () => {
		expect(PUBLIC_PATHS.some((p) => p.path === "/pricing")).toBe(true);
	});

	it("gives every entry a non-empty priority", () => {
		for (const entry of PUBLIC_PATHS) {
			expect(entry.priority.length).toBeGreaterThan(0);
		}
	});
});
```

Note: the import specifier is the escaped on-disk name `"./sitemap[.]xml.ts"` (verified: `routeTree.gen.ts` imports this route via the same escaped path `'./routes/sitemap[.]xml'`). Keep that exact specifier.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/routes/sitemap-paths.test.ts`
Expected: FAIL — the import of `PUBLIC_PATHS` errors because it is not yet exported (currently a module-private const), or once exported the `/docs` and `/pricing` assertions fail because those entries don't exist yet.

- [ ] **Step 3: Export PUBLIC_PATHS and add the two paths**

In `apps/web/src/routes/sitemap[.]xml.ts`, change the `PUBLIC_PATHS` declaration from module-private to exported and add the two content pages:

```ts
/** Public indexable paths (omit auth-only and API routes). */
export const PUBLIC_PATHS: readonly { path: string; priority: string }[] = [
	{ path: "/", priority: "1.0" },
	{ path: "/docs", priority: "0.9" },
	{ path: "/pricing", priority: "0.8" },
	{ path: "/sign-in", priority: "0.5" },
	{ path: "/sign-up", priority: "0.5" },
];
```

Leave the rest of the file (the `escapeXml` helper and the `createFileRoute("/sitemap.xml")` GET handler that maps over `PUBLIC_PATHS`) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/routes/sitemap-paths.test.ts`
Expected: PASS (3 cases)

- [ ] **Step 5: Lint and commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs
pnpm dlx ultracite fix "apps/web/src/routes/sitemap[.]xml.ts" apps/web/src/routes/sitemap-paths.test.ts
pnpm dlx ultracite check "apps/web/src/routes/sitemap[.]xml.ts" apps/web/src/routes/sitemap-paths.test.ts
git add "apps/web/src/routes/sitemap[.]xml.ts" apps/web/src/routes/sitemap-paths.test.ts
git commit -m "feat(seo): add /docs and /pricing to sitemap; export PUBLIC_PATHS"
```

---

### Task 7: Integration verification — SSR head + sitemap

**Files:** none modified. This task is the end-to-end verification of the route-wiring tasks (3, 4, 5, 6), which were gated only on typecheck/lint individually.

- [ ] **Step 1: Run the full SEO unit-test sweep**

Run:
```bash
cd /Users/mac/Developer/projects/locnative.com/.claude/worktrees/seo-landing-docs/apps/web
pnpm exec vitest run src/lib/seo.test.ts src/lib/structured-data.test.ts src/routes/sitemap-paths.test.ts
```
Expected: all suites pass.

- [ ] **Step 2: Start the dev server**

Run (from the worktree's `apps/web`): `pnpm dev`
Wait for "ready" and note the port (it prints `Local: http://localhost:<port>/` — it will pick 3001 or the next free port).

- [ ] **Step 3: Verify the landing-page head over SSR**

Fetch the SSR HTML for `/` and confirm the tags are present. Using the sandbox fetch (replace `<port>`):

```javascript
const html = await (await fetch("http://localhost:<port>/")).text();
const checks = {
  title: /Geocoding, Geofencing & Routing APIs for Developers/i.test(html),
  description: /<meta[^>]+name="description"[^>]+Production-ready location APIs/i.test(html),
  canonical: /<link[^>]+rel="canonical"[^>]+href="https:\/\/locnative\.com\/"/i.test(html),
  ogImage: /property="og:image"[^>]+og-image-1200x630\.png/i.test(html),
  twitterCard: /name="twitter:card"[^>]+summary_large_image/i.test(html),
  softwareApp: /"@type":"SoftwareApplication"/.test(html),
  organization: /"@type":"Organization"/.test(html),
};
console.log(checks);
```
Expected: every value `true`.

- [ ] **Step 4: Verify the docs head over SSR**

```javascript
const html = await (await fetch("http://localhost:<port>/docs")).text();
const checks = {
  title: /API Documentation — Geocoding & Address Autocomplete/i.test(html),
  canonical: /rel="canonical"[^>]+href="https:\/\/locnative\.com\/docs"/i.test(html),
  techArticle: /"@type":"TechArticle"/.test(html),
  breadcrumb: /"@type":"BreadcrumbList"/.test(html),
  ogType: /property="og:type"[^>]+article/i.test(html),
};
console.log(checks);
```
Expected: every value `true`.

- [ ] **Step 5: Verify the sitemap**

```javascript
const xml = await (await fetch("http://localhost:<port>/sitemap.xml")).text();
console.log({
  docs: xml.includes("/docs"),
  pricing: xml.includes("/pricing"),
  root: xml.includes("<loc>") && /locnative\.com\/<\/loc>|localhost:\d+\/<\/loc>/.test(xml),
});
```
Expected: `docs` and `pricing` both `true`.

- [ ] **Step 6: Stop the dev server**

Stop the `pnpm dev` process. No commit (verification only — nothing changed).

If any check is `false`, the failure points at the corresponding route task (3/4/5/6); fix that task's wiring, re-run its own typecheck/lint, then re-run this verification.

---

## Self-Review Notes

- **Spec coverage:** `seo.ts` (Task 1) → titles/description/canonical/OG/Twitter; `structured-data.ts` (Task 2) → JSON-LD; `__root.tsx` (Task 3) → site-wide defaults + Organization; `index.tsx` (Task 4) → landing head + SoftwareApplication; `docs.tsx` (Task 5) → docs head + TechArticle/Breadcrumb; `sitemap.xml.ts` (Task 6) → /docs + /pricing; SSR verification (Task 7). All spec sections covered. Reuses existing OG image per spec; no new image generated. `/pricing` per-page head is explicitly out of scope (spec) — it gets root defaults + a sitemap entry only.
- **Type consistency:** `buildSeo`/`absoluteUrl`/`SITE_URL`/`DEFAULT_OG_IMAGE`/`SITE_NAME` (Task 1) are consumed with matching names in Tasks 2–5. `jsonLdScript`/`organizationJsonLd`/`softwareApplicationJsonLd`/`techArticleJsonLd`/`breadcrumbJsonLd` (Task 2) consumed with matching signatures in Tasks 3–5. `PUBLIC_PATHS` (Task 6) shape matches the existing handler's `.map(({ path, priority }) => ...)`.
- **No placeholders:** every code step contains complete code. The two conditional fallbacks (logo filename in Task 2, sitemap import specifier in Task 6) name the exact alternative to use and how to detect which applies — they are not open-ended TODOs.
