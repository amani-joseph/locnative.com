# SDK Playground — API-key Select + place-name routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the SDK Playground, replace the raw-API-key input with a combobox over the user's saved keys (managed auth), and let `routing.directions` `from`/`to` accept a city/town/address that resolves to `"lat,lng"` via an interactive picker.

**Architecture:** A new session-authed `geocode.autocomplete` backend procedure wraps the existing `autocompleteAddresses` query. The playground gains two focused frontend components (`ApiKeyComboboxField`, `LocationInput`), each backed by a pure, unit-tested logic helper. `buildSdkSnippet` gains optional per-arg comments so the code panel can annotate a resolved coordinate with its place name.

**Tech Stack:** TanStack Start (React 19), oRPC, Drizzle, Vitest + Testing Library, Base UI. Tabs + double quotes (Ultracite/Biome).

**Spec:** `docs/superpowers/specs/2026-06-09-sdk-playground-key-select-geocode-design.md`

**Deviation from spec (intentional):** the autocomplete `q` minimum is **3** chars, not 5. `autocompleteAddresses` already guards at 3 internally (`packages/database/src/queries/autocomplete.ts:226`), and 3 is better for an as-you-type picker. The manual `"lat,lng"` fallback still covers shorter inputs.

---

## File Structure

**Backend (`packages/api`)**
- Modify `src/routers/domains/geocode.ts` — add `autocomplete` procedure + pure `mapAutocompleteCandidates` helper.
- Create `src/routers/domains/geocode.test.ts` — unit test for the pure mapper. *(Note: the existing geocode test lives at `src/routers/public/geocode.test.ts`; this new one is for the dashboard router.)*

**Frontend (`apps/web`)**
- Create `src/components/sdk-playground/auth-input.ts` — pure `detectAuthInput` helper.
- Create `src/components/sdk-playground/auth-input.test.ts` — tests for `detectAuthInput`.
- Create `src/components/sdk-playground/api-key-combobox.tsx` — `ApiKeyComboboxField` component.
- Create `src/components/sdk-playground/location-value.ts` — pure `isValidLatLng` + `coordValueFromCandidate` helpers.
- Create `src/components/sdk-playground/location-value.test.ts` — tests for those helpers.
- Create `src/components/sdk-playground/location-input.tsx` — `LocationInput` component.
- Modify `src/lib/sdk-snippet.ts` — optional `comments` arg.
- Modify `src/lib/sdk-snippet.test.ts` — test the comment rendering.
- Modify `src/components/sdk-playground.tsx` — wire auth combobox, `LocationInput` for `routing.directions` `from`/`to`, and snippet comments.

---

## Task 1: Backend `geocode.autocomplete` procedure

**Files:**
- Modify: `packages/api/src/routers/domains/geocode.ts`
- Test: `packages/api/src/routers/domains/geocode.test.ts` (create)

- [ ] **Step 1: Write the failing test for the pure mapper**

Create `packages/api/src/routers/domains/geocode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapAutocompleteCandidates } from "./geocode.ts";

describe("mapAutocompleteCandidates", () => {
	it("projects only the fields the picker needs", () => {
		const out = mapAutocompleteCandidates([
			{
				id: 42,
				formattedAddress: "1 George St, Brisbane QLD 4000, AU",
				streetAddress: "1 George St",
				locality: "Brisbane",
				state: "QLD",
				postcode: "4000",
				country: "AU",
				latitude: -27.47,
				longitude: 153.02,
			},
		]);
		expect(out).toEqual([
			{
				id: 42,
				formattedAddress: "1 George St, Brisbane QLD 4000, AU",
				locality: "Brisbane",
				state: "QLD",
				postcode: "4000",
				latitude: -27.47,
				longitude: 153.02,
			},
		]);
	});

	it("returns an empty array for no results", () => {
		expect(mapAutocompleteCandidates([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @locnative/api test -- geocode.test.ts`
Expected: FAIL — `mapAutocompleteCandidates` is not exported.

- [ ] **Step 3: Implement the procedure + mapper**

In `packages/api/src/routers/domains/geocode.ts`, add the import at the top (alongside existing imports):

```ts
import { autocompleteAddresses } from "@locnative/database/queries";
import type { AutocompleteResult } from "@locnative/database/queries";
```

Add the exported pure mapper above `export const geocodeRouter`:

```ts
export interface GeocodeCandidate {
	id: number;
	formattedAddress: string;
	locality: string;
	state: string;
	postcode: string;
	latitude: number;
	longitude: number;
}

export function mapAutocompleteCandidates(
	results: AutocompleteResult[]
): GeocodeCandidate[] {
	return results.map((r) => ({
		id: r.id,
		formattedAddress: r.formattedAddress,
		locality: r.locality,
		state: r.state,
		postcode: r.postcode,
		latitude: r.latitude,
		longitude: r.longitude,
	}));
}
```

Add the `autocomplete` procedure as a new property inside the `geocodeRouter` object (e.g. after `batchList`):

```ts
	autocomplete: protectedProcedure
		.input(
			z.object({
				q: z.string().min(3),
				limit: z.number().int().min(1).max(10).default(5),
			})
		)
		.handler(async ({ context, input }) => {
			const { results } = await autocompleteAddresses(context.db, input.q, {
				limit: input.limit,
			});
			return { results: mapAutocompleteCandidates(results) };
		}),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @locnative/api test -- geocode.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Verify the import is exported by the database package**

Run: `grep -n "AutocompleteResult\|autocompleteAddresses" packages/database/src/queries/index.ts`
Expected: both symbols are re-exported. If `AutocompleteResult` is not exported as a type from the queries barrel, change the import in geocode.ts to `import type { AutocompleteResult } from "@locnative/database/queries/autocomplete.ts";` (the file path it is defined in). Re-run Step 4.

- [ ] **Step 6: Typecheck the api package**

Run: `pnpm --filter @locnative/api check-types`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/domains/geocode.ts packages/api/src/routers/domains/geocode.test.ts
git commit -m "feat(api): session-authed geocode.autocomplete for the SDK playground picker"
```

---

## Task 2: Pure auth-input helper

**Files:**
- Create: `apps/web/src/components/sdk-playground/auth-input.ts`
- Test: `apps/web/src/components/sdk-playground/auth-input.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/sdk-playground/auth-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectAuthInput, type SavedApiKey } from "./auth-input.ts";

const KEYS: SavedApiKey[] = [
	{ id: "11111111-1111-1111-1111-111111111111", name: "Prod", displayLabel: "wh_1111…aaaa" },
	{ id: "22222222-2222-2222-2222-222222222222", name: "Staging", displayLabel: "wh_2222…bbbb" },
];

describe("detectAuthInput", () => {
	it("classifies a wh_<id>_<secret> string as a raw key", () => {
		const out = detectAuthInput("wh_abc_secretpart", KEYS);
		expect(out).toEqual({ kind: "raw", rawApiKey: "wh_abc_secretpart" });
	});

	it("filters saved keys by name, case-insensitive", () => {
		const out = detectAuthInput("stag", KEYS);
		expect(out).toEqual({ kind: "filter", matches: [KEYS[1]] });
	});

	it("filters saved keys by display label", () => {
		const out = detectAuthInput("2222", KEYS);
		expect(out).toEqual({ kind: "filter", matches: [KEYS[1]] });
	});

	it("returns all keys for empty input", () => {
		const out = detectAuthInput("", KEYS);
		expect(out).toEqual({ kind: "filter", matches: KEYS });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- auth-input.test.ts`
Expected: FAIL — module not found / `detectAuthInput` undefined.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/components/sdk-playground/auth-input.ts`:

```ts
// Mirrors RAW_KEY_FORMAT_RE in packages/api/src/routers/domains/api-explorer.ts.
const RAW_KEY_FORMAT_RE = /^wh_[^_]+_.+$/i;

export interface SavedApiKey {
	id: string;
	name: string;
	displayLabel: string;
}

export type AuthInputResult =
	| { kind: "raw"; rawApiKey: string }
	| { kind: "filter"; matches: SavedApiKey[] };

export function detectAuthInput(
	text: string,
	keys: SavedApiKey[]
): AuthInputResult {
	const trimmed = text.trim();
	if (RAW_KEY_FORMAT_RE.test(trimmed)) {
		return { kind: "raw", rawApiKey: trimmed };
	}
	if (trimmed === "") {
		return { kind: "filter", matches: keys };
	}
	const needle = trimmed.toLowerCase();
	const matches = keys.filter(
		(k) =>
			k.name.toLowerCase().includes(needle) ||
			k.displayLabel.toLowerCase().includes(needle)
	);
	return { kind: "filter", matches };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- auth-input.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/sdk-playground/auth-input.ts apps/web/src/components/sdk-playground/auth-input.test.ts
git commit -m "feat(web): pure auth-input detection helper for key combobox"
```

---

## Task 3: `ApiKeyComboboxField` component

**Files:**
- Create: `apps/web/src/components/sdk-playground/api-key-combobox.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/web/src/components/sdk-playground/api-key-combobox.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { orpcClient } from "@/lib/orpc";
import { type SavedApiKey, detectAuthInput } from "./auth-input.ts";

export type ApiKeyAuthValue =
	| { mode: "managed"; managedKeyId: string; label: string }
	| { mode: "raw"; rawApiKey: string };

interface ApiKeyComboboxFieldProps {
	value: ApiKeyAuthValue | null;
	onChange: (value: ApiKeyAuthValue | null) => void;
}

export function ApiKeyComboboxField({
	value,
	onChange,
}: ApiKeyComboboxFieldProps) {
	const [keys, setKeys] = useState<SavedApiKey[]>([]);
	const [text, setText] = useState("");
	const [open, setOpen] = useState(false);
	const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		orpcClient.apiKeys
			.list()
			.then((rows) =>
				setKeys(
					rows.map((r) => ({
						id: r.id,
						name: r.name,
						displayLabel: r.displayLabel,
					}))
				)
			)
			.catch(() => setKeys([]));
	}, []);

	const detection = useMemo(() => detectAuthInput(text, keys), [text, keys]);

	const handleText = (next: string) => {
		setText(next);
		const result = detectAuthInput(next, keys);
		if (result.kind === "raw") {
			onChange({ mode: "raw", rawApiKey: result.rawApiKey });
		} else if (value?.mode === "managed") {
			// Typing a filter clears a previously selected managed key.
			onChange(null);
		}
	};

	const selectKey = (key: SavedApiKey) => {
		onChange({ mode: "managed", managedKeyId: key.id, label: key.displayLabel });
		setText(key.displayLabel);
		setOpen(false);
	};

	return (
		<div className="relative flex flex-col gap-1">
			<label className="text-sm" htmlFor="pg-api-key">
				API key
			</label>
			<input
				autoComplete="off"
				className="rounded border px-2 py-1 text-sm"
				id="pg-api-key"
				onBlur={() => {
					blurTimer.current = setTimeout(() => setOpen(false), 120);
				}}
				onChange={(ev) => handleText(ev.target.value)}
				onFocus={() => {
					if (blurTimer.current) {
						clearTimeout(blurTimer.current);
					}
					setOpen(true);
				}}
				placeholder="Pick a saved key or paste wh_…"
				value={text}
			/>
			{open && detection.kind === "filter" ? (
				<ul className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded border bg-popover text-sm shadow">
					{detection.matches.length === 0 ? (
						<li className="px-2 py-1.5 text-muted-foreground">
							No saved keys.{" "}
							<a className="underline" href="/api-keys">
								Create one
							</a>{" "}
							or paste a raw key.
						</li>
					) : (
						detection.matches.map((k) => (
							<li key={k.id}>
								<button
									className="block w-full px-2 py-1.5 text-left hover:bg-accent"
									onClick={() => selectKey(k)}
									type="button"
								>
									<span className="font-medium">{k.name}</span>{" "}
									<span className="text-muted-foreground">{k.displayLabel}</span>
								</button>
							</li>
						))
					)}
				</ul>
			) : null}
			{value?.mode === "raw" ? (
				<p className="text-muted-foreground text-xs">Using a pasted raw key.</p>
			) : null}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web check-types`
Expected: no new errors. (If `bg-popover`/`bg-accent` tokens are unavailable, substitute `bg-background`/`bg-muted` — confirm against `packages/ui/src/globals.css`.)

- [ ] **Step 3: Lint/format**

Run: `pnpm dlx ultracite fix apps/web/src/components/sdk-playground/api-key-combobox.tsx`
Expected: formatted, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/sdk-playground/api-key-combobox.tsx
git commit -m "feat(web): ApiKeyComboboxField (managed key select + raw paste)"
```

---

## Task 4: Pure location-value helpers

**Files:**
- Create: `apps/web/src/components/sdk-playground/location-value.ts`
- Test: `apps/web/src/components/sdk-playground/location-value.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/sdk-playground/location-value.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { coordValueFromCandidate, isValidLatLng } from "./location-value.ts";

describe("isValidLatLng", () => {
	it("accepts a well-formed coordinate", () => {
		expect(isValidLatLng("-27.47,153.02")).toBe(true);
	});
	it("rejects out-of-range latitude", () => {
		expect(isValidLatLng("120,10")).toBe(false);
	});
	it("rejects non-numeric and wrong-arity input", () => {
		expect(isValidLatLng("Brisbane")).toBe(false);
		expect(isValidLatLng("1,2,3")).toBe(false);
	});
});

describe("coordValueFromCandidate", () => {
	it("formats latitude,longitude", () => {
		expect(
			coordValueFromCandidate({ latitude: -27.47, longitude: 153.02 })
		).toBe("-27.47,153.02");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- location-value.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `apps/web/src/components/sdk-playground/location-value.ts`:

```ts
// Mirrors parseLatLng in packages/api/src/shared/routing-queries.ts:36.
const LAT_MAX = 90;
const LNG_MAX = 180;

export function isValidLatLng(raw: string): boolean {
	const parts = raw.split(",");
	if (parts.length !== 2) {
		return false;
	}
	const lat = Number(parts[0]);
	const lng = Number(parts[1]);
	if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
		return false;
	}
	return Math.abs(lat) <= LAT_MAX && Math.abs(lng) <= LNG_MAX;
}

export function coordValueFromCandidate(c: {
	latitude: number;
	longitude: number;
}): string {
	return `${c.latitude},${c.longitude}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- location-value.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/sdk-playground/location-value.ts apps/web/src/components/sdk-playground/location-value.test.ts
git commit -m "feat(web): pure lat/lng helpers for the location picker"
```

---

## Task 5: `LocationInput` component

**Files:**
- Create: `apps/web/src/components/sdk-playground/location-input.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/web/src/components/sdk-playground/location-input.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { orpcClient } from "@/lib/orpc";
import { coordValueFromCandidate, isValidLatLng } from "./location-value.ts";

interface Candidate {
	id: number;
	formattedAddress: string;
	locality: string;
	state: string;
	postcode: string;
	latitude: number;
	longitude: number;
}

interface LocationInputProps {
	id: string;
	label: string;
	placeholder?: string;
	value: string;
	onChange: (sentValue: string) => void;
	onResolvedLabelChange?: (label: string | null) => void;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY = 3;

export function LocationInput({
	id,
	label,
	placeholder,
	value,
	onChange,
	onResolvedLabelChange,
}: LocationInputProps) {
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
	const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (debounce.current) {
				clearTimeout(debounce.current);
			}
		};
	}, []);

	const queryFor = (text: string) => {
		if (debounce.current) {
			clearTimeout(debounce.current);
		}
		if (text.length < MIN_QUERY || isValidLatLng(text)) {
			setCandidates([]);
			setOpen(false);
			return;
		}
		debounce.current = setTimeout(() => {
			setLoading(true);
			orpcClient.geocode
				.autocomplete({ q: text })
				.then((res) => {
					setCandidates(res.results);
					setOpen(true);
				})
				.catch(() => setCandidates([]))
				.finally(() => setLoading(false));
		}, DEBOUNCE_MS);
	};

	const handleText = (text: string) => {
		onChange(text);
		onResolvedLabelChange?.(null);
		queryFor(text);
	};

	const pick = (c: Candidate) => {
		onChange(coordValueFromCandidate(c));
		onResolvedLabelChange?.(`${c.locality} ${c.state}`.trim());
		setOpen(false);
		setCandidates([]);
	};

	return (
		<div className="relative flex flex-col gap-1">
			<label className="text-sm" htmlFor={id}>
				{label}
			</label>
			<input
				autoComplete="off"
				className="rounded border px-2 py-1 text-sm"
				id={id}
				onBlur={() => {
					blurTimer.current = setTimeout(() => setOpen(false), 120);
				}}
				onChange={(ev) => handleText(ev.target.value)}
				onFocus={() => {
					if (blurTimer.current) {
						clearTimeout(blurTimer.current);
					}
					if (candidates.length > 0) {
						setOpen(true);
					}
				}}
				placeholder={placeholder ?? "Place name or lat,lng"}
				value={value}
			/>
			{open ? (
				<ul className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded border bg-background text-sm shadow">
					{candidates.length === 0 ? (
						<li className="px-2 py-1.5 text-muted-foreground">
							{loading ? "Searching…" : "No matches — paste lat,lng instead."}
						</li>
					) : (
						candidates.map((c) => (
							<li key={c.id}>
								<button
									className="block w-full px-2 py-1.5 text-left hover:bg-muted"
									onClick={() => pick(c)}
									type="button"
								>
									<span className="block">{c.formattedAddress}</span>
									<span className="block text-muted-foreground text-xs">
										{c.latitude},{c.longitude}
									</span>
								</button>
							</li>
						))
					)}
				</ul>
			) : null}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web check-types`
Expected: no new errors. The `orpcClient.geocode.autocomplete` call must resolve — depends on Task 1 being merged into the same working tree.

- [ ] **Step 3: Lint/format**

Run: `pnpm dlx ultracite fix apps/web/src/components/sdk-playground/location-input.tsx`
Expected: formatted, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/sdk-playground/location-input.tsx
git commit -m "feat(web): LocationInput place-name picker with lat,lng fallback"
```

---

## Task 6: Snippet comments support

**Files:**
- Modify: `apps/web/src/lib/sdk-snippet.ts`
- Test: `apps/web/src/lib/sdk-snippet.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/sdk-snippet.test.ts`:

```ts
import { buildSdkSnippet } from "./sdk-snippet.ts";

it("appends a trailing comment to a matching param line", () => {
	const snippet = buildSdkSnippet(
		"routing.directions",
		{ from: "-27.47,153.02", to: "-33.87,151.21" },
		undefined,
		{ from: "Brisbane QLD", to: "Sydney NSW" }
	);
	expect(snippet).toContain('from: "-27.47,153.02", // Brisbane QLD');
	expect(snippet).toContain('to: "-33.87,151.21", // Sydney NSW');
});

it("omits comments when none are provided", () => {
	const snippet = buildSdkSnippet(
		"routing.directions",
		{ from: "-27.47,153.02" },
		undefined
	);
	expect(snippet).toContain('from: "-27.47,153.02"');
	expect(snippet).not.toContain("//");
});
```

(If the test file already imports `buildSdkSnippet`, do not duplicate the import.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- sdk-snippet.test.ts`
Expected: FAIL — `buildSdkSnippet` takes 3 args; comment not rendered.

- [ ] **Step 3: Implement**

Replace `renderArg` and `buildSdkSnippet` in `apps/web/src/lib/sdk-snippet.ts` with:

```ts
function renderArg(
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined,
	comments: Record<string, string> | undefined
): string {
	if (body !== undefined) {
		const inner = Object.entries(body)
			.map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
			.join(",\n");
		return `{\n${inner}\n}`;
	}
	const entries = Object.entries(paramValues).filter(([, v]) => v !== "");
	if (entries.length === 0) {
		return "";
	}
	const inner = entries
		.map(([k, v]) => {
			const comment = comments?.[k];
			const line = `  ${k}: ${literal(v)}`;
			return comment ? `${line}, // ${comment}` : line;
		})
		.join(",\n");
	return `{\n${inner}\n}`;
}

export function buildSdkSnippet(
	endpointId: string,
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined,
	comments?: Record<string, string>
): string {
	const call = sdkCallForEndpoint(endpointId);
	const arg = renderArg(paramValues, body, comments);
	return [
		'import { createLocnativeClient } from "@locnative/sdk";',
		"",
		"const client = createLocnativeClient({",
		"  apiKey: process.env.LOCNATIVE_API_KEY!,",
		"});",
		"",
		`const result = await ${call}(${arg});`,
		"console.log(result);",
	].join("\n");
}
```

Note: the commented line emits a trailing `,` before the comment even on the last entry; this keeps the join simple and is valid JS. Existing callers passing 3 args are unaffected.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- sdk-snippet.test.ts`
Expected: PASS (new and pre-existing cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sdk-snippet.ts apps/web/src/lib/sdk-snippet.test.ts
git commit -m "feat(web): optional per-arg comments in buildSdkSnippet"
```

---

## Task 7: Wire everything into the playground

**Files:**
- Modify: `apps/web/src/components/sdk-playground.tsx`

- [ ] **Step 1: Replace auth + key state and the `run()` body**

In `apps/web/src/components/sdk-playground.tsx`:

Add imports near the top (after existing imports):

```tsx
import {
	ApiKeyComboboxField,
	type ApiKeyAuthValue,
} from "./sdk-playground/api-key-combobox";
import { LocationInput } from "./sdk-playground/location-input";
```

Replace the line `const [rawApiKey, setRawApiKey] = useState("");` with:

```tsx
	const [authValue, setAuthValue] = useState<ApiKeyAuthValue | null>(null);
	const [locationComments, setLocationComments] = useState<
		Record<string, string>
	>({});
```

Replace the `snippet` assignment:

```tsx
	const snippet = endpoint
		? buildSdkSnippet(endpoint.id, paramValues, snippetBody, locationComments)
		: "";
```

Replace the body of `run()` (the `try` block's request section) so auth comes from `authValue`:

```tsx
		try {
			let parsedBody: Record<string, unknown> | undefined;
			try {
				parsedBody = parseBodyOrUndefined();
			} catch {
				setResult("Request body is not valid JSON.");
				setRunning(false);
				return;
			}
			if (!authValue) {
				setResult("Select a saved API key or paste a raw key first.");
				setRunning(false);
				return;
			}
			const auth =
				authValue.mode === "managed"
					? { authMode: "managed" as const, managedKeyId: authValue.managedKeyId }
					: { authMode: "raw" as const, rawApiKey: authValue.rawApiKey };
			const res = await orpcClient.apiExplorer.sendRequest({
				...auth,
				endpointId: endpoint.id,
				paramValues,
				body: parsedBody,
			});
			setResult(JSON.stringify(res.body, null, 2));
		} catch (err) {
			setResult(err instanceof Error ? err.message : "Request failed");
		} finally {
			setRunning(false);
		}
```

- [ ] **Step 2: Render `LocationInput` for `routing.directions` from/to, and the combobox**

Replace the `endpoint?.params.map(...)` block so `from`/`to` on `routing.directions` use `LocationInput`:

```tsx
					{endpoint?.params.map((p) => {
						const isLocation =
							endpoint.id === "routing.directions" &&
							(p.name === "from" || p.name === "to");
						if (isLocation) {
							return (
								<LocationInput
									id={`pg-${p.name}`}
									key={p.name}
									label={`${p.name}${p.required ? " *" : ""}`}
									onChange={(sent) =>
										setParamValues((prev) => ({ ...prev, [p.name]: sent }))
									}
									onResolvedLabelChange={(lbl) =>
										setLocationComments((prev) => {
											const next = { ...prev };
											if (lbl) {
												next[p.name] = lbl;
											} else {
												delete next[p.name];
											}
											return next;
										})
									}
									placeholder={p.example ?? "Place name or lat,lng"}
									value={paramValues[p.name] ?? ""}
								/>
							);
						}
						return (
							<div className="flex flex-col gap-1" key={p.name}>
								<label className="text-sm" htmlFor={`pg-${p.name}`}>
									{p.name}
									{p.required ? " *" : ""}
								</label>
								<input
									className="rounded border px-2 py-1 text-sm"
									id={`pg-${p.name}`}
									onChange={(ev) =>
										setParamValues((prev) => ({
											...prev,
											[p.name]: ev.target.value,
										}))
									}
									placeholder={p.example ?? ""}
									value={paramValues[p.name] ?? ""}
								/>
							</div>
						);
					})}
```

Replace the raw-key `<input ... placeholder="Raw API key (wh_...)" />` element with:

```tsx
					<ApiKeyComboboxField onChange={setAuthValue} value={authValue} />
```

- [ ] **Step 3: Typecheck the whole web app**

Run: `pnpm --filter web check-types`
Expected: no errors. In particular `orpcClient.apiExplorer.sendRequest` must accept the `managed`/`raw` union (it already does — see `packages/api/src/routers/domains/api-explorer.ts:336-340`).

- [ ] **Step 4: Run the full web test suite**

Run: `pnpm --filter web test`
Expected: PASS, including the pre-existing `api-explorer.test.tsx` and `sdk-snippet.test.ts`.

- [ ] **Step 5: Lint/format**

Run: `pnpm dlx ultracite fix apps/web/src/components/sdk-playground.tsx`
Expected: formatted, no errors.

- [ ] **Step 6: Manual smoke test**

Run: `pnpm --filter web dev`
Then in the browser at `/sdk-playground`:
1. Method = `routing.directions`. Confirm the API-key field is now a combobox; focusing it lists saved keys; selecting one fills the label.
2. Type `Brisbane` in `from`; confirm a candidate dropdown appears; pick one; confirm the field becomes a `lat,lng` value and the code panel shows `from: "...", // Brisbane QLD`.
3. Type a raw `lat,lng` in `to`; confirm no dropdown forces and the value passes through.
4. Click `Run` with a selected key; confirm a real routing result (not the `'from' must be a valid "lat,lng"` error).
5. Clear the key; confirm `Run` shows "Select a saved API key or paste a raw key first."

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/sdk-playground.tsx
git commit -m "feat(web): wire key combobox + place-name routing into the SDK playground"
```

---

## Self-Review

**Spec coverage:**
- Combobox (managed + raw) → Tasks 2, 3, 7. ✓
- Place-name → lat,lng picker with manual fallback → Tasks 4, 5, 7. ✓
- Interactive picker for ambiguity → Task 5 dropdown. ✓
- Session-authed `geocode.autocomplete` → Task 1. ✓
- Code panel shows resolved coords + place comment, never a secret → Task 6 + Task 7 (snippet keeps env-var key). ✓
- Reusable-but-routing-only scope → `LocationInput` is generic; only wired to `routing.directions` from/to in Task 7. ✓
- Edge cases (no keys, short query, geocode failure, valid-paste passthrough, null auth) → Tasks 3, 5, 7. ✓

**Type consistency:** `ApiKeyAuthValue` (Task 3) is consumed unchanged in Task 7. `GeocodeCandidate` (Task 1) shape matches `Candidate` (Task 5) and the fields read by `pick`/`coordValueFromCandidate`. `detectAuthInput`/`isValidLatLng`/`coordValueFromCandidate` signatures match their call sites.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; commands have expected output.
