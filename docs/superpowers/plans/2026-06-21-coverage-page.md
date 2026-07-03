# Country Coverage Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, searchable `/coverage` page listing the 17 countries with address data and the capabilities each supports.

**Architecture:** A static curated data module (`coverage.ts`) holds the country list plus two pure, unit-tested helpers (`iso2ToFlag`, `filterCountries`). A TanStack Start file route (`coverage.tsx`) renders a shadcn `Table` driven by client-side search state. A one-line footer link makes it discoverable. No backend, no new endpoint.

**Tech Stack:** TanStack Start / React 19, TypeScript, Tailwind v4, shadcn components from `@locnative/ui`, Vitest.

## Global Constraints

- Indent with **tabs**; **double quotes**; self-closing elements (Biome/Ultracite enforced).
- Named exports only (except React route default-export patterns already in use).
- Intra-app imports use the `@/` alias (`@/lib/...`); shared UI via `@locnative/ui/components/*`.
- File names are `kebab-case`; React components `PascalCase`; constants `UPPER_SNAKE_CASE`.
- Supported set is exactly the 17 ISO-2 codes in `packages/database/src/queries/country-codes.ts`: US, AU, GB, FR, DE, ES, IT, NL, BE, AT, CH, PT, PL, DK, NO, FI, CA.
- Do NOT run `pnpm dlx ultracite fix` without explicit file paths (it reformats unrelated files). Lint only the files this plan touches.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/data/coverage.ts` | Curated country list + `Capability`/`CoverageCountry` types + `iso2ToFlag` + `filterCountries` |
| `apps/web/src/data/coverage.test.ts` | Unit tests for the two pure helpers |
| `apps/web/src/routes/coverage.tsx` | `/coverage` route: SEO head + searchable table UI |
| `apps/web/src/components/shadcn-space/blocks/footer-02/footer.tsx` | Add one "Coverage" link (discoverability) |

---

### Task 1: Coverage data module and pure helpers

**Files:**
- Create: `apps/web/src/data/coverage.ts`
- Test: `apps/web/src/data/coverage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Capability = "geocode" | "reverse" | "autocomplete"`
  - `type CoverageCountry = { iso2: string; name: string; capabilities: Capability[] }`
  - `const COVERAGE_COUNTRIES: CoverageCountry[]` (17 entries, sorted by `name`)
  - `function iso2ToFlag(iso2: string): string`
  - `function filterCountries(query: string, list: CoverageCountry[]): CoverageCountry[]`
  - `const CAPABILITY_LABELS: Record<Capability, string>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/data/coverage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	COVERAGE_COUNTRIES,
	type CoverageCountry,
	filterCountries,
	iso2ToFlag,
} from "./coverage";

describe("iso2ToFlag", () => {
	it("converts an ISO-2 code to its flag emoji", () => {
		expect(iso2ToFlag("US")).toBe("🇺🇸");
		expect(iso2ToFlag("AU")).toBe("🇦🇺");
	});

	it("is case-insensitive", () => {
		expect(iso2ToFlag("gb")).toBe(iso2ToFlag("GB"));
	});
});

describe("filterCountries", () => {
	const sample: CoverageCountry[] = [
		{ iso2: "US", name: "United States", capabilities: ["geocode"] },
		{ iso2: "AU", name: "Australia", capabilities: ["geocode"] },
		{ iso2: "DE", name: "Germany", capabilities: ["geocode"] },
	];

	it("returns the full list for an empty or whitespace query", () => {
		expect(filterCountries("", sample)).toHaveLength(3);
		expect(filterCountries("   ", sample)).toHaveLength(3);
	});

	it("matches by name, case-insensitively", () => {
		expect(filterCountries("german", sample)).toEqual([sample[2]]);
	});

	it("matches by ISO-2 code", () => {
		expect(filterCountries("au", sample)).toEqual([sample[1]]);
	});

	it("returns an empty array when nothing matches", () => {
		expect(filterCountries("zzz", sample)).toEqual([]);
	});
});

describe("COVERAGE_COUNTRIES", () => {
	it("contains exactly the 17 supported countries", () => {
		expect(COVERAGE_COUNTRIES).toHaveLength(17);
	});

	it("is sorted alphabetically by name", () => {
		const names = COVERAGE_COUNTRIES.map((c) => c.name);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});

	it("gives every country at least one capability", () => {
		for (const country of COVERAGE_COUNTRIES) {
			expect(country.capabilities.length).toBeGreaterThan(0);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/data/coverage.test.ts`
Expected: FAIL — cannot resolve `./coverage` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/data/coverage.ts`:

```ts
export type Capability = "geocode" | "reverse" | "autocomplete";

export type CoverageCountry = {
	iso2: string;
	name: string;
	capabilities: Capability[];
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
	geocode: "Geocode",
	reverse: "Reverse",
	autocomplete: "Autocomplete",
};

const ALL_CAPABILITIES: Capability[] = ["geocode", "reverse", "autocomplete"];

// Source of truth: the 17 ISO-2 codes resolved by matchCountry() in
// packages/database/src/queries/country-codes.ts. A country absent from that
// matcher cannot be filtered by country, so it is not "covered". All loaded
// countries share the same addresses table and query paths, hence the uniform
// capability set; the per-country array allows divergence later.
export const COVERAGE_COUNTRIES: CoverageCountry[] = [
	{ iso2: "AU", name: "Australia", capabilities: ALL_CAPABILITIES },
	{ iso2: "AT", name: "Austria", capabilities: ALL_CAPABILITIES },
	{ iso2: "BE", name: "Belgium", capabilities: ALL_CAPABILITIES },
	{ iso2: "CA", name: "Canada", capabilities: ALL_CAPABILITIES },
	{ iso2: "DK", name: "Denmark", capabilities: ALL_CAPABILITIES },
	{ iso2: "FI", name: "Finland", capabilities: ALL_CAPABILITIES },
	{ iso2: "FR", name: "France", capabilities: ALL_CAPABILITIES },
	{ iso2: "DE", name: "Germany", capabilities: ALL_CAPABILITIES },
	{ iso2: "IT", name: "Italy", capabilities: ALL_CAPABILITIES },
	{ iso2: "NL", name: "Netherlands", capabilities: ALL_CAPABILITIES },
	{ iso2: "NO", name: "Norway", capabilities: ALL_CAPABILITIES },
	{ iso2: "PL", name: "Poland", capabilities: ALL_CAPABILITIES },
	{ iso2: "PT", name: "Portugal", capabilities: ALL_CAPABILITIES },
	{ iso2: "ES", name: "Spain", capabilities: ALL_CAPABILITIES },
	{ iso2: "CH", name: "Switzerland", capabilities: ALL_CAPABILITIES },
	{ iso2: "GB", name: "United Kingdom", capabilities: ALL_CAPABILITIES },
	{ iso2: "US", name: "United States", capabilities: ALL_CAPABILITIES },
];

const REGIONAL_INDICATOR_BASE = 0x1f1e6;
const UPPERCASE_A = 65;

// "US" -> "🇺🇸". Maps each ASCII letter to its regional-indicator code point.
export function iso2ToFlag(iso2: string): string {
	return [...iso2.toUpperCase()]
		.map((char) =>
			String.fromCodePoint(
				REGIONAL_INDICATOR_BASE + (char.charCodeAt(0) - UPPERCASE_A)
			)
		)
		.join("");
}

export function filterCountries(
	query: string,
	list: CoverageCountry[]
): CoverageCountry[] {
	const normalized = query.trim().toLowerCase();
	if (normalized === "") {
		return list;
	}
	return list.filter(
		(country) =>
			country.name.toLowerCase().includes(normalized) ||
			country.iso2.toLowerCase().includes(normalized)
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/data/coverage.test.ts`
Expected: PASS — all suites green.

- [ ] **Step 5: Lint the new files**

Run: `pnpm dlx ultracite check apps/web/src/data/coverage.ts apps/web/src/data/coverage.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/data/coverage.ts apps/web/src/data/coverage.test.ts
git commit -m "feat(web): coverage country data + pure helpers"
```

---

### Task 2: `/coverage` route page

**Files:**
- Create: `apps/web/src/routes/coverage.tsx`

**Interfaces:**
- Consumes from Task 1: `COVERAGE_COUNTRIES`, `CAPABILITY_LABELS`, `filterCountries`, `iso2ToFlag`, type `CoverageCountry`.
- Consumes existing app helpers: `buildSeo` from `@/lib/seo`; `jsonLdScript`, `breadcrumbJsonLd` from `@/lib/structured-data` (same imports `docs.tsx` uses).
- Produces: the `/coverage` route (registered automatically by the router plugin into `routeTree.gen.ts` on next dev/build).

- [ ] **Step 1: Create the route component**

Create `apps/web/src/routes/coverage.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge } from "@locnative/ui/components/badge";
import { Input } from "@locnative/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";
import {
	CAPABILITY_LABELS,
	COVERAGE_COUNTRIES,
	filterCountries,
	iso2ToFlag,
} from "@/data/coverage";
import { buildSeo } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

const COVERAGE_TITLE =
	"Coverage — Countries with Address Data | Locnative";
const COVERAGE_DESCRIPTION =
	"See which countries the Locnative location API supports for geocoding, reverse geocoding, and address autocomplete before you integrate.";

export const Route = createFileRoute("/coverage")({
	head: () => {
		const seo = buildSeo({
			title: COVERAGE_TITLE,
			description: COVERAGE_DESCRIPTION,
			path: "/coverage",
			ogType: "website",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Coverage", path: "/coverage" },
					])
				),
			],
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	const [query, setQuery] = useState("");
	const countries = useMemo(
		() => filterCountries(query, COVERAGE_COUNTRIES),
		[query]
	);

	return (
		<main className="mx-auto max-w-4xl px-4 py-16 md:px-6">
			<header className="mb-8">
				<h1 className="font-semibold text-3xl tracking-tight">Coverage</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Countries with address data available through the Locnative API.
				</p>
				<p className="mt-1 text-muted-foreground text-xs">
					{countries.length === COVERAGE_COUNTRIES.length
						? `${COVERAGE_COUNTRIES.length} countries`
						: `${countries.length} of ${COVERAGE_COUNTRIES.length} countries`}
				</p>
			</header>

			<Input
				aria-label="Search countries"
				className="mb-6 max-w-sm"
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Search by country or code…"
				type="search"
				value={query}
			/>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Country</TableHead>
						<TableHead>Code</TableHead>
						<TableHead>Capabilities</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{countries.length === 0 ? (
						<TableRow>
							<TableCell
								className="text-center text-muted-foreground"
								colSpan={3}
							>
								No countries match “{query}”.
							</TableCell>
						</TableRow>
					) : (
						countries.map((country) => (
							<TableRow key={country.iso2}>
								<TableCell className="font-medium">
									<span aria-hidden="true" className="mr-2">
										{iso2ToFlag(country.iso2)}
									</span>
									{country.name}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{country.iso2}
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{country.capabilities.map((capability) => (
											<Badge key={capability} variant="secondary">
												{CAPABILITY_LABELS[capability]}
											</Badge>
										))}
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			<p className="mt-8 text-muted-foreground text-sm">
				Don’t see your country?{" "}
				<a
					className="underline underline-offset-4 hover:text-foreground"
					href="mailto:hello@locnative.com"
				>
					Request coverage →
				</a>
			</p>
		</main>
	);
}
```

- [ ] **Step 2: Verify `buildSeo` / `structured-data` signatures match**

Run: `grep -n "export function buildSeo\|export function jsonLdScript\|export function breadcrumbJsonLd" apps/web/src/lib/seo.ts apps/web/src/lib/structured-data.ts`
Expected: all three exist. If `buildSeo`'s `ogType` does not accept `"website"`, use the value its type allows (check the union) — do not invent one.

- [ ] **Step 3: Verify the route compiles and registers**

Run: `pnpm --filter web exec vitest run src/data/coverage.test.ts && pnpm dlx ultracite check apps/web/src/routes/coverage.tsx`
Expected: tests still PASS; lint clean.

Then start the dev server and load the page:
Run: `pnpm --filter web dev` (background), open `http://localhost:3001/coverage`.
Expected: 17 rows render; typing "ger" filters to Germany; typing "zzz" shows the empty-state row; count line updates. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/coverage.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): /coverage page with searchable country table"
```

> Note: `routeTree.gen.ts` is regenerated by the router plugin when dev/build runs. Stage it if it changed; if it did not regenerate, run `pnpm --filter web build` once to regenerate, then stage.

---

### Task 3: Footer discoverability link

**Files:**
- Modify: `apps/web/src/components/shadcn-space/blocks/footer-02/footer.tsx:6-10`

**Interfaces:**
- Consumes: the `/coverage` route from Task 2.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the Coverage link**

In `footer.tsx`, change the `footerLinksProduct` array:

```tsx
		const footerLinksProduct = [
			{ label: "Documentation", href: "/docs" },
			{ label: "Coverage", href: "/coverage" },
			{ label: "Capabilities", href: "#capabilities" },
			{ label: "API in action", href: "#api" },
		];
```

- [ ] **Step 2: Lint the changed file**

Run: `pnpm dlx ultracite check apps/web/src/components/shadcn-space/blocks/footer-02/footer.tsx`
Expected: no errors.

- [ ] **Step 3: Verify the link renders**

With the dev server running, load any page containing the footer (e.g. `http://localhost:3001/`) and confirm a "Coverage" link appears under Product and navigates to `/coverage`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/shadcn-space/blocks/footer-02/footer.tsx
git commit -m "feat(web): link Coverage page from footer"
```

---

## Self-Review

**Spec coverage:**
- Public `/coverage` route → Task 2. ✓
- Static curated data from the 17-country matcher → Task 1. ✓
- Search by name/ISO → `filterCountries` (Task 1) wired in Task 2. ✓
- Capability badges → `CAPABILITY_LABELS` + Badge rendering (Tasks 1–2). ✓
- Flag emoji, no assets → `iso2ToFlag` (Task 1). ✓
- Empty state + count line → Task 2. ✓
- "Request coverage" footer line → Task 2. ✓
- Discoverability link → Task 3. ✓
- Pure helpers unit-tested, no DOM renderer → Task 1. ✓
- No backend / no endpoint → confirmed (no API task). ✓

**Placeholder scan:** No TBDs; every code step shows complete code. Step 2 of Task 2 instructs verifying the real `ogType` union rather than guessing — a deliberate guard, not a placeholder.

**Type consistency:** `Capability`, `CoverageCountry`, `COVERAGE_COUNTRIES`, `CAPABILITY_LABELS`, `filterCountries`, `iso2ToFlag` are defined in Task 1 and consumed with identical names/signatures in Task 2. ✓
