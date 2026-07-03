# Landing Page Content-Truth Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove template residue and fabricated content from the landing page and re-position it around the product's real, international API surface.

**Architecture:** The page composes shadcn-space blocks in `apps/web/src/routes/index.tsx`. We add two new data-driven sections (Capabilities, API in action) derived from the existing tested catalog (`src/lib/api-explorer-endpoints.ts`) and snippet builder (`src/lib/sdk-snippet.ts`), then edit four template blocks (Hero, Integration, Feature, Footer) and the nav data for content truth. New pure data lives in a tested `.ts` module; presentational `.tsx` components are verified by lint + build per the repo's no-DOM-renderer convention.

**Tech Stack:** TanStack Start/Router, React 19, motion/react, Tailwind v4, lucide-react, Vitest, Ultracite/Biome.

---

## Design reference

Spec: `docs/superpowers/specs/2026-06-18-landing-page-content-truth-design.md`

**Authoritative API surface** (from `packages/sdk/README.md` and `src/lib/api-explorer-endpoints.ts`):
`addresses` (autocomplete, reverse, nearby, getById/byId, geocode) · `geocode.batch` (submit, poll, results) · `zones` (create, list, get, update, delete, contains, addresses) · `devices` (location.push, zones) · `webhooks` (create, list, delete, reactivate) · `regions.classify` · `routing.directions`.

**Coverage copy rule:** "US and Australia at the core, expanding" — never imply complete global coverage.

## File structure

**Create:**
- `apps/web/src/lib/landing-content.ts` — pure data: capability cards, featured endpoint ids, example responses, coverage copy. Derived from + validated against `apiExplorerEndpoints`.
- `apps/web/src/lib/landing-content.test.ts` — unit tests asserting referenced endpoint ids exist in the catalog.
- `apps/web/src/components/landing/capabilities.tsx` — Capabilities grid section.
- `apps/web/src/components/landing/api-in-action.tsx` — Quickstart + endpoints showcase section.
- `apps/web/src/lib/landing-no-template-residue.test.ts` — guard test: no `images.shadcnspace.com` and no dead `href="#"` in landing source.

**Modify:**
- `apps/web/src/routes/index.tsx` — compose new sections.
- `apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx` — subtitle, badge, restore CTAs.
- `apps/web/src/components/shadcn-space/blocks/hero-15/index.tsx` — nav data.
- `apps/web/src/components/shadcn-space/blocks/integration-01/integration.tsx` — orbit logos → Locnative surfaces.
- `apps/web/src/components/shadcn-space/blocks/feature-15/feature.tsx` — remove placeholder image, intl copy.
- `apps/web/src/components/shadcn-space/blocks/footer-02/footer.tsx` — fix links, remove newsletter form.

**Unchanged:** `testimonial-07/testimonial.tsx`.

---

## Task 1: Landing content data module

**Files:**
- Create: `apps/web/src/lib/landing-content.ts`
- Test: `apps/web/src/lib/landing-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/landing-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { apiExplorerEndpoints } from "@/lib/api-explorer-endpoints";
import {
	capabilities,
	exampleParamsForEndpoint,
	featuredEndpointIds,
} from "@/lib/landing-content";

const catalogIds = new Set(apiExplorerEndpoints.map((e) => e.id));

describe("landing-content", () => {
	it("exposes exactly seven capability cards", () => {
		expect(capabilities).toHaveLength(7);
		const ids = capabilities.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("every capability references real catalog endpoint ids", () => {
		for (const card of capabilities) {
			expect(card.endpointIds.length).toBeGreaterThan(0);
			for (const id of card.endpointIds) {
				expect(catalogIds.has(id)).toBe(true);
			}
		}
	});

	it("every featured endpoint id exists in the catalog", () => {
		for (const id of featuredEndpointIds) {
			expect(catalogIds.has(id)).toBe(true);
		}
	});

	it("derives example params from the catalog for a featured endpoint", () => {
		const params = exampleParamsForEndpoint("addresses.autocomplete");
		expect(params.q).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/lib/landing-content.test.ts`
Expected: FAIL — cannot resolve `@/lib/landing-content`.

- [ ] **Step 3: Write the data module**

Create `apps/web/src/lib/landing-content.ts`:

```ts
import {
	type ApiEndpoint,
	type ApiEndpointId,
	apiExplorerEndpoints,
} from "@/lib/api-explorer-endpoints";

export type CapabilityIcon =
	| "MapPin"
	| "Locate"
	| "Shapes"
	| "Smartphone"
	| "Webhook"
	| "Globe2"
	| "Route";

export interface CapabilityCard {
	description: string;
	endpointIds: ApiEndpointId[];
	icon: CapabilityIcon;
	id: string;
	title: string;
}

/** One card per real SDK namespace. endpointIds must exist in apiExplorerEndpoints. */
export const capabilities: CapabilityCard[] = [
	{
		id: "addresses",
		icon: "MapPin",
		title: "Addresses",
		description:
			"Autocomplete, reverse geocoding, nearby search, and lookup by ID over authoritative address data.",
		endpointIds: [
			"addresses.autocomplete",
			"addresses.reverse",
			"addresses.nearby",
			"addresses.byId",
		],
	},
	{
		id: "geocode",
		icon: "Locate",
		title: "Geocode & batch",
		description:
			"Forward geocode single addresses, or submit batches and poll for results at scale.",
		endpointIds: [
			"addresses.geocode",
			"geocode.batch.submit",
			"geocode.batch.poll",
			"geocode.batch.results",
		],
	},
	{
		id: "zones",
		icon: "Shapes",
		title: "Zones & geofencing",
		description:
			"Create geofence polygons, test point containment, and list the addresses inside a zone.",
		endpointIds: ["zones.create", "zones.contains", "zones.addresses"],
	},
	{
		id: "devices",
		icon: "Smartphone",
		title: "Devices",
		description:
			"Push device locations and resolve which zones a device is currently inside.",
		endpointIds: ["devices.location.push", "devices.zones"],
	},
	{
		id: "webhooks",
		icon: "Webhook",
		title: "Webhooks",
		description:
			"Subscribe to events, then list, delete, and reactivate webhook endpoints.",
		endpointIds: ["webhooks.create", "webhooks.list", "webhooks.reactivate"],
	},
	{
		id: "regions",
		icon: "Globe2",
		title: "Regions",
		description:
			"Classify coordinates into official ABS/ASGS statistical regions.",
		endpointIds: ["regions.classify"],
	},
	{
		id: "routing",
		icon: "Route",
		title: "Routing",
		description:
			"Turn-by-turn directions between coordinates (distance matrices and isochrones via the SDK).",
		endpointIds: ["routing.directions"],
	},
];

/** Endpoints featured as tabs in the "API in action" showcase. GET-friendly. */
export const featuredEndpointIds: ApiEndpointId[] = [
	"addresses.autocomplete",
	"addresses.reverse",
	"addresses.nearby",
];

/** Short, illustrative example responses keyed by endpoint id (marked example in UI). */
export const featuredResponses: Partial<Record<ApiEndpointId, string>> = {
	"addresses.autocomplete": `{
  "results": [
    { "id": 123, "label": "123 Collins St, Melbourne VIC 3000", "lat": -37.8159, "lng": 144.9669 }
  ]
}`,
	"addresses.reverse": `{
  "result": { "id": 123, "label": "123 Collins St, Melbourne VIC 3000", "distanceMeters": 4 }
}`,
	"addresses.nearby": `{
  "results": [
    { "id": 123, "label": "123 Collins St, Melbourne VIC 3000", "distanceMeters": 42 }
  ]
}`,
};

export const DOCS_HREF = "/docs";

export const COVERAGE_LINE =
	"US and Australia at the core, with several European countries live and coverage actively expanding across South America, Europe, Africa, and Asia.";

export function endpointById(id: ApiEndpointId): ApiEndpoint {
	const found = apiExplorerEndpoints.find((endpoint) => endpoint.id === id);
	if (!found) {
		throw new Error(`Unknown endpoint id: ${id}`);
	}
	return found;
}

/** Build { name: example } from a catalog endpoint's documented param examples. */
export function exampleParamsForEndpoint(
	id: ApiEndpointId
): Record<string, string> {
	const entries = endpointById(id)
		.params.filter((param) => param.example !== undefined)
		.map((param) => [param.name, param.example as string] as const);
	return Object.fromEntries(entries);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/lib/landing-content.test.ts`
Expected: PASS (4 tests). If a catalog id used above is missing, fix the `endpointIds` to match `ApiEndpointId` in `src/lib/api-explorer-endpoints.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/landing-content.ts apps/web/src/lib/landing-content.test.ts
git commit -m "feat(landing): add catalog-derived landing content data module"
```

---

## Task 2: Capabilities grid section

**Files:**
- Create: `apps/web/src/components/landing/capabilities.tsx`

Presentational component — verified by lint + typecheck/build (repo has no DOM test renderer; pure data already covered in Task 1).

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/capabilities.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import {
	ArrowUpRight,
	Globe2,
	Locate,
	MapPin,
	Route,
	Shapes,
	Smartphone,
	Webhook,
} from "lucide-react";
import type { ComponentType } from "react";
import {
	type CapabilityIcon,
	capabilities,
	DOCS_HREF,
} from "@/lib/landing-content";

const ICONS: Record<CapabilityIcon, ComponentType<{ className?: string }>> = {
	MapPin,
	Locate,
	Shapes,
	Smartphone,
	Webhook,
	Globe2,
	Route,
};

const Capabilities = () => {
	return (
		<section className="dark bg-background py-16 md:py-24" id="capabilities">
			<div className="mx-auto max-w-7xl px-4 lg:px-8 xl:px-16">
				<div className="flex max-w-2xl flex-col gap-4">
					<h2 className="font-medium text-3xl text-foreground sm:text-4xl md:text-5xl">
						One API for the whole location stack
					</h2>
					<p className="text-base text-muted-foreground sm:text-lg">
						Everything below is live today over plain HTTP and the typed SDK.
					</p>
				</div>
				<div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{capabilities.map((card) => {
						const Icon = ICONS[card.icon];
						return (
							<Link
								className="group flex flex-col gap-3 rounded-2xl border border-border bg-background/60 p-6 transition-colors hover:border-foreground/30"
								key={card.id}
								to={DOCS_HREF}
							>
								<div className="flex items-center justify-between">
									<Icon className="size-6 text-foreground" />
									<ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
								</div>
								<p className="font-medium text-foreground text-lg">
									{card.title}
								</p>
								<p className="text-muted-foreground text-sm">
									{card.description}
								</p>
							</Link>
						);
					})}
				</div>
			</div>
		</section>
	);
};

export default Capabilities;
```

- [ ] **Step 2: Verify it typechecks/lints**

Run: `cd apps/web && pnpm dlx ultracite check src/components/landing/capabilities.tsx`
Expected: no errors (formatting auto-fixable with `pnpm dlx ultracite fix` if needed).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/capabilities.tsx
git commit -m "feat(landing): add capabilities grid section"
```

---

## Task 3: API-in-action section (quickstart + endpoints showcase)

**Files:**
- Create: `apps/web/src/components/landing/api-in-action.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/api-in-action.tsx`:

```tsx
"use client";
import { useState } from "react";
import { endpointById } from "@/lib/api-explorer-endpoints";
import {
	exampleParamsForEndpoint,
	featuredEndpointIds,
	featuredResponses,
} from "@/lib/landing-content";
import { buildSdkSnippet } from "@/lib/sdk-snippet";
import { cn } from "@/lib/utils";

const ApiInAction = () => {
	const [activeId, setActiveId] = useState(featuredEndpointIds[0]);
	const endpoint = endpointById(activeId);
	const snippet = buildSdkSnippet(
		activeId,
		exampleParamsForEndpoint(activeId),
		undefined
	);
	const response = featuredResponses[activeId];

	return (
		<section className="dark bg-background py-16 md:py-24" id="api">
			<div className="mx-auto max-w-7xl px-4 lg:px-8 xl:px-16">
				<div className="flex max-w-2xl flex-col gap-4">
					<h2 className="font-medium text-3xl text-foreground sm:text-4xl md:text-5xl">
						From API key to first result in minutes
					</h2>
					<p className="text-base text-muted-foreground sm:text-lg">
						Install the SDK or call the same endpoints over plain HTTP. Pick an
						endpoint to see a real request.
					</p>
				</div>

				<div className="mt-8 flex flex-wrap gap-2">
					{featuredEndpointIds.map((id) => (
						<button
							className={cn(
								"cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors",
								id === activeId
									? "border-foreground/40 bg-foreground/10 text-foreground"
									: "border-border text-muted-foreground hover:text-foreground"
							)}
							key={id}
							onClick={() => setActiveId(id)}
							type="button"
						>
							{endpointById(id).summary}
						</button>
					))}
				</div>

				<div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div className="overflow-hidden rounded-2xl border border-border bg-background/70">
						<div className="flex items-center gap-2 border-border border-b px-4 py-2">
							<span className="rounded-full border border-border px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
								{endpoint.method} {endpoint.path}
							</span>
						</div>
						<pre className="overflow-x-auto p-4 text-foreground text-sm">
							<code>{snippet}</code>
						</pre>
					</div>
					<div className="overflow-hidden rounded-2xl border border-border bg-background/70">
						<div className="flex items-center gap-2 border-border border-b px-4 py-2">
							<span className="rounded-full border border-border px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
								Example response
							</span>
						</div>
						<pre className="overflow-x-auto p-4 text-muted-foreground text-sm">
							<code>{response ?? "// See the docs for the full response shape."}</code>
						</pre>
					</div>
				</div>
			</div>
		</section>
	);
};

export default ApiInAction;
```

- [ ] **Step 2: Verify buildSdkSnippet signature matches**

Run: `cd apps/web && pnpm dlx ultracite check src/components/landing/api-in-action.tsx`
Expected: no type errors. Confirm `buildSdkSnippet(endpointId, paramValues, body)` matches `src/lib/sdk-snippet.ts`; adjust the call if the exported signature differs.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/api-in-action.tsx
git commit -m "feat(landing): add API-in-action quickstart and endpoints showcase"
```

---

## Task 4: Compose new sections into the index route

**Files:**
- Modify: `apps/web/src/routes/index.tsx`

- [ ] **Step 1: Replace the route file contents**

Replace the entire body of `apps/web/src/routes/index.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import ApiInAction from "@/components/landing/api-in-action";
import Capabilities from "@/components/landing/capabilities";
import Feature from "@/components/shadcn-space/blocks/feature-15/feature";
import Footer from "@/components/shadcn-space/blocks/footer-02/footer";
import HeroPage from "@/components/shadcn-space/blocks/hero-15";
import Integration from "@/components/shadcn-space/blocks/integration-01/integration";
import Testimonial from "@/components/shadcn-space/blocks/testimonial-07/testimonial";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	return (
		<div>
			<HeroPage />
			<Integration />
			<Capabilities />
			<ApiInAction />
			<Feature />
			<Testimonial />
			<Footer />
		</div>
	);
}
```

- [ ] **Step 2: Verify build resolves the new imports**

Run: `cd apps/web && pnpm build`
Expected: build succeeds (the route now imports the two new components).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat(landing): compose capabilities and API-in-action into home"
```

---

## Task 5: Hero — subtitle, badge, restore CTAs

**Files:**
- Modify: `apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx`

- [ ] **Step 1: Add imports for Link and buttonVariants**

At the top of the file, add these imports alongside the existing ones (after the `motion/react` import group):

```tsx
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
```

- [ ] **Step 2: Update the badge text**

Find:

```tsx
						<p className="font-normal text-foreground text-sm">
							Locations API — public beta
						</p>
```

Replace with:

```tsx
						<p className="font-normal text-foreground text-sm">
							Location & geocoding API — US, Australia &amp; expanding
						</p>
```

- [ ] **Step 3: Update the subtitle**

Find:

```tsx
							<motion.p
								className="max-w-2xl text-pretty font-normal text-foreground text-sm sm:text-base md:text-lg"
								variants={itemVariants}
							>
								Address autocomplete and geocoding API. Ship location features
								without the complexity.
							</motion.p>
```

Replace the inner text with:

```tsx
							<motion.p
								className="max-w-2xl text-pretty font-normal text-foreground text-sm sm:text-base md:text-lg"
								variants={itemVariants}
							>
								Address autocomplete, geocoding, geofencing, routing, device
								tracking, and webhooks — ship location features without the
								complexity.
							</motion.p>
```

- [ ] **Step 4: Restore real CTAs and delete the dead commented blocks**

Delete the two commented blocks spanning the old `{/* <motion.div ... Explore the API ... */}` CTA block and the `{/* <motion.div ... brandList ... */}` block (originally around lines 680-728). In their place (immediately after the `AddressDemoInput` `motion.div` closing tag) insert:

```tsx
						<motion.div
							className="flex flex-wrap justify-center gap-2 pt-2"
							variants={itemVariants}
						>
							<Link
								className={cn(
									buttonVariants({ variant: "default" }),
									"h-auto cursor-pointer rounded-full px-5 py-2.5 md:px-6 md:py-3.5"
								)}
								to="/sign-up"
							>
								Get API access
							</Link>
							<Link
								className={cn(
									buttonVariants({ variant: "outline" }),
									"inline-flex h-auto cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-foreground md:px-6 md:py-3.5"
								)}
								to="/docs"
							>
								Read the docs
								<ArrowRight className="text-foreground" size={16} />
							</Link>
						</motion.div>
```

(`ArrowRight` and `cn` are already imported.)

- [ ] **Step 5: Verify lint and build**

Run: `cd apps/web && pnpm dlx ultracite check src/components/shadcn-space/blocks/hero-15/hero.tsx && pnpm build`
Expected: no lint errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx
git commit -m "feat(landing): expand hero copy and restore working CTAs"
```

---

## Task 6: Integration — replace orbit logos with Locnative surfaces

**Files:**
- Modify: `apps/web/src/components/shadcn-space/blocks/integration-01/integration.tsx`

- [ ] **Step 1: Add lucide icon imports**

At the top of the file add:

```tsx
import {
	Atom,
	Component,
	FileJson,
	Package,
	Terminal,
	Webhook,
} from "lucide-react";
```

- [ ] **Step 2: Update the intro copy to international positioning**

Find the paragraph beginning `Call Locnative from your backend or edge with plain REST` and replace its text with:

```tsx
							Call Locnative from your backend or edge with plain REST—no
							embedded map SDK required to validate an address, power
							autocomplete, or geocode a signup. US and Australia are at the
							core, with coverage expanding across Europe, South America, Africa,
							and Asia.
```

- [ ] **Step 3: Replace the orbit icon data arrays**

Find the array literal passed to `.map((orbit, orbitIndex) => {` (the three objects whose `icons` use `src: "https://images.shadcnspace.com/..."`). Replace the entire array with icon components and labels:

```tsx
				{[
					{
						size: "w-110 h-110 md:w-180 md:h-180",
						duration: 18,
						icons: [
							{ icon: Terminal, alt: "REST API", angle: -60 },
							{ icon: Package, alt: "@locnative/sdk", angle: 0 },
							{ icon: Webhook, alt: "Webhooks", angle: 60 },
						],
					},
					{
						size: "w-150 h-150 md:w-220 md:h-220",
						duration: 24,
						icons: [
							{ icon: Atom, alt: "React UI", angle: 0 },
							{ icon: Component, alt: "Vue UI", angle: -90 },
						],
					},
					{
						size: "w-180 h-180 md:w-265 md:h-265",
						duration: 30,
						icons: [
							{ icon: FileJson, alt: "OpenAPI", angle: -60 },
							{ icon: Terminal, alt: "curl", angle: 0 },
							{ icon: Package, alt: "npm", angle: 60 },
						],
					},
				].map((orbit, orbitIndex) => {
```

- [ ] **Step 4: Render icon components instead of `<img>`**

Within the inner `allIcons.map((iconData) => (` block, find the `<img ... src={iconData.src} ... />` element and replace it with:

```tsx
											<iconData.icon
												aria-label={iconData.alt}
												className="h-6 w-6 text-foreground md:h-8 md:w-8"
											/>
```

The mirrored-duplicate logic that spreads `...orbit.icons` and sets `alt: \`${ic.alt}-mirror\`` stays as-is — it now carries the `icon` component through unchanged. The `key={\`${iconData.alt}-${iconData.angle}\`}` line stays valid.

- [ ] **Step 5: Verify no shadcnspace URLs remain and build**

Run: `cd apps/web && grep -c "shadcnspace" src/components/shadcn-space/blocks/integration-01/integration.tsx`
Expected: `0`.
Run: `pnpm dlx ultracite check src/components/shadcn-space/blocks/integration-01/integration.tsx && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shadcn-space/blocks/integration-01/integration.tsx
git commit -m "feat(landing): replace orbit brand logos with Locnative surfaces"
```

---

## Task 7: Feature — remove placeholder image, international copy

**Files:**
- Modify: `apps/web/src/components/shadcn-space/blocks/feature-15/feature.tsx`

- [ ] **Step 1: Update the coverage accordion item copy**

Find the `coverage-api-first` object's `description` and replace it with:

```tsx
		description:
			"Reliable place search, autocomplete, and geocoding for addresses and venues. US and Australia anchor the data, with several European countries live and coverage expanding across South America, Africa, and Asia. See regions, endpoints, and data guarantees in the documentation.",
```

- [ ] **Step 2: Update the section intro paragraph**

Find the intro `<p>` containing `Pricing you can plan around` and replace its text with:

```tsx
								Pricing you can plan around, APIs you can integrate quickly, and
								international coverage aimed at real app flows—not a generic maps
								platform bolt-on.
```

- [ ] **Step 3: Remove the placeholder image column and make the accordion full-width**

Find the grid block:

```tsx
						<div className="grid grid-cols-1 border-border border-t md:grid-cols-2">
							<div className="border-border border-r p-5 sm:p-6">
								<div className="relative flex h-full w-full items-end justify-end rounded-xl bg-[url('https://images.shadcnspace.com/assets/feature/feature-15-bg.png')] bg-cover">
									<img
										alt="feature-15"
										className="max-h-full w-auto object-contain pt-6 pl-6 sm:pt-12 sm:pl-12"
										height={840}
										src="https://images.shadcnspace.com/assets/feature/feature-15-img.png"
										width={960}
									/>
								</div>
							</div>
							<div>
```

Replace those opening lines with (deleting the entire image `<div className="border-border border-r p-5 sm:p-6">…</div>` and collapsing to a single column):

```tsx
						<div className="grid grid-cols-1 border-border border-t">
							<div>
```

Leave the `<Accordion>` block and the rest of the file unchanged.

- [ ] **Step 4: Verify no shadcnspace URLs remain and build**

Run: `cd apps/web && grep -c "shadcnspace" src/components/shadcn-space/blocks/feature-15/feature.tsx`
Expected: `0`.
Run: `pnpm dlx ultracite check src/components/shadcn-space/blocks/feature-15/feature.tsx && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shadcn-space/blocks/feature-15/feature.tsx
git commit -m "feat(landing): drop placeholder feature image, internationalize copy"
```

---

## Task 8: Footer — fix dead links, remove non-functional newsletter

**Files:**
- Modify: `apps/web/src/components/shadcn-space/blocks/footer-02/footer.tsx`

- [ ] **Step 1: Replace the link arrays with real destinations**

Find:

```tsx
		const footerLinksProduct = [
			{ label: "Documentation", href: "#" },
			{ label: "API overview", href: "#features" },
			{ label: "Changelog", href: "#" },
			{ label: "System status", href: "#" },
		];
		const footerLinksLegal = [
			{ label: "Privacy", href: "#" },
			{ label: "Terms", href: "#" },
			{ label: "Security", href: "#" },
			{ label: "Contact", href: "mailto:hello@locnative.com" },
		];
```

Replace with:

```tsx
		const footerLinksProduct = [
			{ label: "Documentation", href: "/docs" },
			{ label: "Capabilities", href: "#capabilities" },
			{ label: "API in action", href: "#api" },
		];
		const footerLinksLegal = [
			{ label: "Pricing", href: "/pricing" },
			{ label: "Contact", href: "mailto:hello@locnative.com" },
		];
```

- [ ] **Step 2: Rename the second column header from "Legal" to "Company"**

Find:

```tsx
								<p className="mb-3 font-medium text-foreground text-sm">Legal</p>
```

Replace with:

```tsx
								<p className="mb-3 font-medium text-foreground text-sm">
									Company
								</p>
```

- [ ] **Step 3: Remove the non-functional newsletter block**

Delete the entire `<div ... id="newsletter">…</div>` block (the grid containing the email `<Input>` + `Subscribe` `<Button>` and its surrounding `flex flex-col gap-12` wrapper that ends just before `<Separator />`). Specifically, replace:

```tsx
					<div className="flex flex-col gap-12">
						<div
							className="fade-in slide-in-from-bottom-10 grid animate-in grid-cols-12 gap-6 fill-mode-both delay-100 duration-1000 ease-in-out"
							id="newsletter"
						>
```

…through its matching closing tags up to and including the `<Separator />` that follows, with nothing (the next sibling is the `grid grid-cols-12` pricing/links block). After deletion, remove the now-unused `Input` import at the top of the file.

- [ ] **Step 4: Update the footer pricing headline to international framing**

Find:

```tsx
								<h2 className="mb-6 font-medium text-3xl text-foreground sm:text-5xl">
									Predictable pricing for location workloads in production.
								</h2>
```

Replace with:

```tsx
								<h2 className="mb-6 font-medium text-3xl text-foreground sm:text-5xl">
									Predictable pricing for international location workloads in
									production.
								</h2>
```

- [ ] **Step 5: Verify no dead anchors remain and build**

Run: `cd apps/web && grep -n 'href="#"' src/components/shadcn-space/blocks/footer-02/footer.tsx`
Expected: no matches.
Run: `pnpm dlx ultracite check src/components/shadcn-space/blocks/footer-02/footer.tsx && pnpm build`
Expected: no errors; build succeeds (no unused `Input` import).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shadcn-space/blocks/footer-02/footer.tsx
git commit -m "fix(landing): repair footer links and remove dead newsletter form"
```

---

## Task 9: Navbar navigation data

**Files:**
- Modify: `apps/web/src/components/shadcn-space/blocks/hero-15/index.tsx`

- [ ] **Step 1: Replace the navigationData array**

Find the `navigationData` array and replace it with anchors that all resolve:

```tsx
const navigationData: NavigationSection[] = [
	{
		name: "Dashboard",
		href: "/dashboard",
	},
	{
		name: "Why Locnative",
		href: "#why",
		isActive: true,
	},
	{
		name: "Capabilities",
		href: "#capabilities",
	},
	{
		name: "API",
		href: "#api",
	},
	{
		name: "Docs",
		href: "/docs",
	},
	{
		name: "Pricing",
		href: "/pricing",
	},
];
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && pnpm dlx ultracite check src/components/shadcn-space/blocks/hero-15/index.tsx && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shadcn-space/blocks/hero-15/index.tsx
git commit -m "feat(landing): align navbar links with real page anchors"
```

---

## Task 10: Guard test + full verification

**Files:**
- Create: `apps/web/src/lib/landing-no-template-residue.test.ts`

- [ ] **Step 1: Write the guard test**

Create `apps/web/src/lib/landing-no-template-residue.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const LANDING_FILES = [
	"components/shadcn-space/blocks/hero-15/hero.tsx",
	"components/shadcn-space/blocks/hero-15/index.tsx",
	"components/shadcn-space/blocks/integration-01/integration.tsx",
	"components/shadcn-space/blocks/feature-15/feature.tsx",
	"components/shadcn-space/blocks/footer-02/footer.tsx",
	"components/landing/capabilities.tsx",
	"components/landing/api-in-action.tsx",
	"routes/index.tsx",
];

describe("landing page content truth", () => {
	for (const rel of LANDING_FILES) {
		const source = readFileSync(join(ROOT, rel), "utf8");

		it(`${rel} has no shadcnspace placeholder assets`, () => {
			expect(source).not.toContain("images.shadcnspace.com");
		});

		it(`${rel} has no dead "#" anchors`, () => {
			expect(source).not.toContain('href="#"');
		});
	}
});
```

- [ ] **Step 2: Run the guard test**

Run: `cd apps/web && pnpm vitest run src/lib/landing-no-template-residue.test.ts`
Expected: PASS. (Testimonial is intentionally excluded — it keeps its example imagery.)

- [ ] **Step 3: Run the full check suite**

Run: `cd apps/web && pnpm vitest run && pnpm dlx ultracite check && pnpm build`
Expected: all tests pass, no lint errors, build succeeds.

- [ ] **Step 4: Manual smoke check**

Run: `cd apps/web && pnpm dev` and open `http://localhost:3001/`. Confirm:
- Hero shows the new subtitle, badge, and two working CTA buttons (Get API access → sign-up, Read the docs → docs).
- Integration orbit shows lucide surface icons, no external brand logos.
- Capabilities grid shows 7 cards linking to /docs.
- API-in-action tabs switch the rendered SDK snippet.
- Footer links all resolve; no newsletter form; no testimonial changes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/landing-no-template-residue.test.ts
git commit -m "test(landing): guard against template residue and dead anchors"
```

---

## Self-review notes

- **Spec coverage:** Hero copy/CTAs/badge (T5), Integration orbit (T6), Capabilities (T1-T2), API in action / quickstart / endpoints (T1, T3), Feature placeholder removal + intl copy (T7), Footer links + newsletter (T8), nav data (T9), testimonials untouched (excluded everywhere), coverage-truth wording (`COVERAGE_LINE`, T1; applied T6/T7), success criteria as guard test + verification (T10). Coverage visual handled via existing hero globe (no new component), per spec.
- **No invented data:** capability + endpoint content derives from the tested `apiExplorerEndpoints` catalog; quickstart uses the existing `buildSdkSnippet`. Example responses are clearly labeled illustrative.
- **Type consistency:** `CapabilityIcon` union ↔ `ICONS` record keys; `featuredEndpointIds`/`endpointIds` typed as `ApiEndpointId`; `exampleParamsForEndpoint`/`endpointById` signatures consistent across Tasks 1 and 3.
```
