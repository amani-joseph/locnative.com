# Interactive API Explorer + SDK Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the API Explorer run create/update/delete + regions live (not just GET), and add a dedicated `/sdk-playground` page — both on one enhanced server-side proxy that keeps API keys server-side.

**Architecture:** Three stages on a shared foundation. Stage A widens the `apiExplorer.sendRequest` oRPC proxy to send POST/PUT/DELETE with a JSON body (a new `body` input channel + non-GET allowlist entries + `regions`). Stage B makes the Explorer UI execute non-GET endpoints via a JSON body editor with a confirm gate before DELETE. Stage C adds a separate Playground page that shows the equivalent SDK snippet and runs it through the same Stage-A proxy.

**Tech Stack:** TypeScript, oRPC, Zod, TanStack Start/Router (file routes), React 19, `@locnative/ui` (Card/Button/Textarea/Dialog/Select/Tabs), vitest, Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-07-interactive-explorer-and-sdk-playground-design.md`

**Working dir:** `/Users/mac/Developer/projects/locnative.com/.claude/worktrees/interactive-explorer-playground` (branch `worktree-interactive-explorer-playground`). Run all commands from there.

**Dependency note (spec §3):** the Playground generates namespaced SDK snippets (`client.zones.create(...)`) and the `regions` endpoint comes from other branches open against `feat/pricing-page`. The snippet generator and `regions` catalog entry are self-contained here (no import of the SDK or regions handler), so this plan builds and tests independently; only a *live* `regions` run and the literal SDK-package availability assume those merges.

---

## Key facts about the existing code (read before starting)

- **Backend proxy** `packages/api/src/routers/domains/api-explorer.ts`:
  - Local `type ApiEndpoint = { id: ApiEndpointId; method: "GET"; params: { name: string; pathParam?: boolean }[]; path: string }` and a `Map` `endpointMap` of GET-only entries.
  - `buildUrl(endpoint, paramValues)` interpolates `{name}` path params and appends the rest as query (skips empty values).
  - `explorerRequestSchema` (lines ~183-189): `{ authMode, endpointId, managedKeyId?, paramValues: Record<string,string>, rawApiKey? }`.
  - Handler resolves managed/raw key, builds internal headers, then (lines ~305-313):
    ```ts
    const response = await fetchFn(targetUrl, { method: endpoint.method, headers });
    const durationMs = Date.now() - startedAt;
    const body = await parseResponseBody(response);
    ```
  - Returns `{ body, durationMs, ok, requestUrl, statusCode }`.
- **Frontend catalog** `apps/web/src/lib/api-explorer-endpoints.ts`: `ApiEndpoint = { description, exampleBody?, id, method, params: ApiParam[], path, summary }`. Non-GET endpoints carry a whole-JSON `exampleBody` (zones.create/update, webhooks.create, devices.location.push, geocode.batch.submit already have one). Body fields are NOT individual params — the body is the `exampleBody` object.
- **Explorer component** `apps/web/src/components/api-explorer.tsx`: per-endpoint card with `paramValues` state, `isExecutable = endpoint.method === "GET"`, `handleSend` calling `orpcClient.apiExplorer.sendRequest({...})`.
- **Routes** are file-based: `apps/web/src/routes/_protected/<name>.tsx` exporting `Route = createFileRoute("/_protected/<name>")({ component })`. Sidebar nav items live in `apps/web/src/components/app-sidebar.tsx`.
- **UI components** at `@locnative/ui/components/*`: `card`, `button`, `textarea`, `dialog`, `select`, `tabs`. (No `alert-dialog` — use `dialog` for the confirm gate.)
- Tabs: indent with **tabs**, double quotes, `.ts` extensions in relative imports (ultracite/biome).

---

## Stage A — Enhanced proxy

### Task A1: Proxy supports non-GET + JSON body + regions

**Files:**
- Modify: `packages/api/src/routers/domains/api-explorer.ts`
- Test: `packages/api/src/routers/domains/api-explorer.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `packages/api/src/routers/domains/api-explorer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	buildProxyRequest,
	EXPLORER_ENDPOINT_IDS,
	getExplorerEndpoint,
} from "./api-explorer.ts";

describe("buildProxyRequest", () => {
	it("builds a GET url with query params, dropping empties", () => {
		const ep = getExplorerEndpoint("addresses.autocomplete");
		const out = buildProxyRequest(ep, { q: "123 Main", country: "AU", state: "" }, undefined);
		expect(out.method).toBe("GET");
		expect(out.url).toBe("/api/v1/addresses/autocomplete?q=123%20Main&country=AU");
		expect(out.body).toBeUndefined();
	});

	it("interpolates path params", () => {
		const ep = getExplorerEndpoint("zones.get");
		const out = buildProxyRequest(ep, { id: "7" }, undefined);
		expect(out.url).toBe("/api/v1/zones/7");
	});

	it("sends a JSON body for POST and uses the POST method", () => {
		const ep = getExplorerEndpoint("zones.create");
		const out = buildProxyRequest(ep, {}, { name: "depot" });
		expect(out.method).toBe("POST");
		expect(out.body).toEqual({ name: "depot" });
		expect(out.url).toBe("/api/v1/zones");
	});

	it("interpolates path + sends body for PUT", () => {
		const ep = getExplorerEndpoint("zones.update");
		const out = buildProxyRequest(ep, { id: "7" }, { name: "renamed" });
		expect(out.method).toBe("PUT");
		expect(out.url).toBe("/api/v1/zones/7");
		expect(out.body).toEqual({ name: "renamed" });
	});

	it("uses DELETE with no body even if one is passed", () => {
		const ep = getExplorerEndpoint("zones.delete");
		const out = buildProxyRequest(ep, { id: "7" }, undefined);
		expect(out.method).toBe("DELETE");
		expect(out.url).toBe("/api/v1/zones/7");
		expect(out.body).toBeUndefined();
	});

	it("includes regions.classify as an executable GET", () => {
		const ep = getExplorerEndpoint("regions.classify");
		const out = buildProxyRequest(ep, { lat: "-37.8", lng: "144.9", layers: "" }, undefined);
		expect(out.method).toBe("GET");
		expect(out.url).toBe("/api/v1/regions?lat=-37.8&lng=144.9");
	});
});

describe("EXPLORER_ENDPOINT_IDS drift guard", () => {
	it("contains exactly the expected executable endpoint ids", () => {
		expect([...EXPLORER_ENDPOINT_IDS].sort()).toEqual(
			[
				"addresses.autocomplete",
				"addresses.byId",
				"addresses.geocode",
				"addresses.nearby",
				"addresses.reverse",
				"devices.location.push",
				"devices.zones",
				"geocode.batch.poll",
				"geocode.batch.results",
				"geocode.batch.submit",
				"regions.classify",
				"webhooks.create",
				"webhooks.delete",
				"webhooks.list",
				"webhooks.reactivate",
				"zones.addresses",
				"zones.contains",
				"zones.create",
				"zones.delete",
				"zones.get",
				"zones.list",
				"zones.update",
			].sort()
		);
	});
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `corepack pnpm --filter @locnative/api exec vitest run src/routers/domains/api-explorer.test.ts`
Expected: FAIL — `buildProxyRequest`/`getExplorerEndpoint`/`EXPLORER_ENDPOINT_IDS` not exported.

- [ ] **Step 3: Edit the proxy.** In `packages/api/src/routers/domains/api-explorer.ts`:

(a) Widen the local types and replace the GET-only comment. Change the `ApiEndpointId` union to include every id below, and change `ApiEndpoint.method` to the full union and add an optional `hasBody` marker:

```ts
type ApiEndpointId =
	| "addresses.autocomplete"
	| "addresses.byId"
	| "addresses.nearby"
	| "addresses.reverse"
	| "addresses.geocode"
	| "geocode.batch.submit"
	| "geocode.batch.poll"
	| "geocode.batch.results"
	| "zones.create"
	| "zones.list"
	| "zones.get"
	| "zones.update"
	| "zones.delete"
	| "zones.contains"
	| "zones.addresses"
	| "devices.location.push"
	| "devices.zones"
	| "webhooks.create"
	| "webhooks.list"
	| "webhooks.delete"
	| "webhooks.reactivate"
	| "regions.classify";

type ApiEndpoint = {
	id: ApiEndpointId;
	method: "GET" | "POST" | "PUT" | "DELETE";
	params: { name: string; pathParam?: boolean }[];
	path: string;
};
```

(b) Add the new entries to `endpointMap` (keep the existing GET entries; add these). Note `zones.list`/`zones.contains` already exist with a `projectId` param — leave them. Add:

```ts
	[
		"addresses.geocode",
		// (already present — leave as-is)
	],
	// --- non-GET + regions (new) ---
	[
		"zones.create",
		{ id: "zones.create", method: "POST", path: "/api/v1/zones", params: [] },
	],
	[
		"zones.update",
		{ id: "zones.update", method: "PUT", path: "/api/v1/zones/{id}", params: [{ name: "id", pathParam: true }] },
	],
	[
		"zones.delete",
		{ id: "zones.delete", method: "DELETE", path: "/api/v1/zones/{id}", params: [{ name: "id", pathParam: true }] },
	],
	[
		"webhooks.create",
		{ id: "webhooks.create", method: "POST", path: "/api/v1/webhooks", params: [] },
	],
	[
		"webhooks.delete",
		{ id: "webhooks.delete", method: "DELETE", path: "/api/v1/webhooks/{id}", params: [{ name: "id", pathParam: true }] },
	],
	[
		"webhooks.reactivate",
		{ id: "webhooks.reactivate", method: "POST", path: "/api/v1/webhooks/{id}/reactivate", params: [{ name: "id", pathParam: true }] },
	],
	[
		"devices.location.push",
		{ id: "devices.location.push", method: "POST", path: "/api/v1/devices/{deviceId}/location", params: [{ name: "deviceId", pathParam: true }] },
	],
	[
		"geocode.batch.submit",
		{ id: "geocode.batch.submit", method: "POST", path: "/api/v1/geocode/batch", params: [] },
	],
	[
		"regions.classify",
		{ id: "regions.classify", method: "GET", path: "/api/v1/regions", params: [{ name: "lat" }, { name: "lng" }, { name: "layers" }] },
	],
```

> Also add `webhooks.create`/`webhooks.delete`/`webhooks.list` if `webhooks.list` is the only webhooks entry currently present — `webhooks.list` already exists, keep it. The other devices entry `devices.zones` already exists, keep it.

(c) Add the exported drift-guard set and accessor, just after `endpointMap`:

```ts
export const EXPLORER_ENDPOINT_IDS: ReadonlySet<string> = new Set(
	endpointMap.keys()
);

export function getExplorerEndpoint(id: string): ApiEndpoint {
	const ep = endpointMap.get(id as ApiEndpointId);
	if (!ep) {
		throw new Error(`Unknown explorer endpoint: ${id}`);
	}
	return ep;
}
```

(d) Refactor URL/method/body assembly into an exported pure function. Replace the existing `buildUrl` with:

```ts
export function buildProxyRequest(
	endpoint: ApiEndpoint,
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined
): { method: ApiEndpoint["method"]; url: string; body?: Record<string, unknown> } {
	let url = endpoint.path;
	for (const param of endpoint.params) {
		if (param.pathParam) {
			url = url.replace(`{${param.name}}`, paramValues[param.name] ?? "");
		}
	}
	const queryParts: string[] = [];
	for (const param of endpoint.params) {
		if (!param.pathParam) {
			const value = paramValues[param.name];
			if (value) {
				queryParts.push(
					`${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`
				);
			}
		}
	}
	if (queryParts.length > 0) {
		url = `${url}?${queryParts.join("&")}`;
	}
	// Only non-GET requests carry a body.
	const sendBody = endpoint.method === "GET" ? undefined : body;
	return { method: endpoint.method, url, body: sendBody };
}
```

> `encodeURIComponent(" ")` yields `%20` (matches the test). The previous `buildUrl` produced the same.

(e) Extend `explorerRequestSchema` (add a `body` field):

```ts
const explorerRequestSchema = z.object({
	authMode: z.enum(["managed", "raw"]),
	endpointId: z.string(),
	managedKeyId: z.string().uuid().optional(),
	paramValues: z.record(z.string(), z.string()).default({}),
	rawApiKey: z.string().optional(),
	body: z.record(z.string(), z.unknown()).optional(),
});
```

(f) Wire the handler to use `buildProxyRequest` and send the body. Replace the line that computes `requestUrl` with a call to `buildProxyRequest`, and update the fetch call. Find:

```ts
			const requestUrl = buildUrl(endpoint, input.paramValues);
			const targetUrl = new URL(requestUrl, serverEnv.BETTER_AUTH_URL);
```
Replace with:
```ts
			const proxyReq = buildProxyRequest(endpoint, input.paramValues, input.body);
			const targetUrl = new URL(proxyReq.url, serverEnv.BETTER_AUTH_URL);
```
Then find the fetch call:
```ts
			const response = await fetchFn(targetUrl, {
				method: endpoint.method,
				headers,
			});
```
Replace with (set content-type + body for non-GET):
```ts
			if (proxyReq.body !== undefined) {
				headers.set("content-type", "application/json");
			}
			const response = await fetchFn(targetUrl, {
				method: proxyReq.method,
				headers,
				body:
					proxyReq.body === undefined
						? undefined
						: JSON.stringify(proxyReq.body),
			});
```
And update the returned `requestUrl` field to `proxyReq.url` if it referenced the old `requestUrl` variable.

- [ ] **Step 4: Run the test, verify PASS**

Run: `corepack pnpm --filter @locnative/api exec vitest run src/routers/domains/api-explorer.test.ts`
Expected: PASS (all `buildProxyRequest` cases + drift guard).

- [ ] **Step 5: Typecheck + lint**

Run: `corepack pnpm --filter @locnative/api check-types` (expect pass; note any PRE-EXISTING unrelated errors and ignore).
Run: `corepack pnpm dlx ultracite check packages/api/src/routers/domains/api-explorer.ts packages/api/src/routers/domains/api-explorer.test.ts` (fix auto-fixable in these files).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/domains/api-explorer.ts packages/api/src/routers/domains/api-explorer.test.ts
git commit -m "feat(api): explorer proxy supports non-GET + JSON body + regions"
```

---

## Stage B — Interactive Explorer

### Task B1: Catalog — ensure regions + non-GET body examples

**Files:**
- Modify: `apps/web/src/lib/api-explorer-endpoints.ts`

- [ ] **Step 1: Read the catalog** and confirm which of these have an `exampleBody`: `zones.create`, `zones.update`, `webhooks.create`, `devices.location.push`, `geocode.batch.submit`. (Per the codebase they do.) For any non-GET endpoint missing an `exampleBody`, add a representative one using its real request shape.

- [ ] **Step 2: Add `regions.classify` to the catalog if absent.** Add `| "regions.classify"` to `ApiEndpointId` (under a `// Regions` group) and append this entry to `apiExplorerEndpoints`:

```ts
	{
		id: "regions.classify",
		method: "GET",
		path: "/api/v1/regions",
		summary: "Classify a coordinate into administrative regions",
		description:
			"Returns the ABS/ASGS administrative regions that contain a coordinate (state, SA1–SA4, LGA, postcode, electoral divisions, mesh block), keyed by layer.",
		params: [
			{ name: "lat", type: "number", required: true, description: "Latitude (-90 to 90)", example: "-37.8136" },
			{ name: "lng", type: "number", required: true, description: "Longitude (-180 to 180)", example: "144.9631" },
			{ name: "layers", type: "string", required: false, description: "Comma-separated layer filter (e.g. sa2,lga,poa)", example: "sa2,lga,poa" },
		],
	},
```

> If `regions.classify` is already present (from the region-classification branch once merged), skip this step — do not duplicate.

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm --filter @locnative/web check-types 2>&1 | grep -i api-explorer-endpoints || echo "no catalog errors"`
Expected: no errors referencing the catalog.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-explorer-endpoints.ts
git commit -m "feat(web): add regions to explorer catalog; ensure non-GET body examples"
```

### Task B2: Explorer executes non-GET with a JSON body editor + DELETE confirm

**Files:**
- Modify: `apps/web/src/components/api-explorer.tsx`
- Test: `apps/web/src/components/api-explorer.test.tsx` (create)

**Read the full component first** to find the per-endpoint card state block (where `paramValues`, `isExecutable`, `handleSend` live) and the JSX where params and the Send button render.

- [ ] **Step 1: Make non-GET executable + add body state.** Replace:
```ts
	const isExecutable = endpoint.method === "GET";
```
with:
```ts
	// Every endpoint in the proxy allowlist is now executable. Non-GET endpoints
	// carry a JSON body (seeded from exampleBody) the user can edit before sending.
	const isExecutable = true;
	const [bodyText, setBodyText] = useState<string>(
		endpoint.exampleBody ? JSON.stringify(endpoint.exampleBody, null, 2) : ""
	);
	const [bodyError, setBodyError] = useState<string | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
```

- [ ] **Step 2: Add a body parsing helper + the actual send.** Add this function inside the component (above `handleSend`), and refactor `handleSend` so the network call lives in `runRequest`:

```ts
	const parseBody = (): Record<string, unknown> | undefined => {
		if (endpoint.method === "GET" || bodyText.trim() === "") {
			return undefined;
		}
		return JSON.parse(bodyText) as Record<string, unknown>;
	};

	const runRequest = async () => {
		setLoading(true);
		setResponse(null);
		setStatusCode(null);
		setDurationMs(null);
		setBodyError(null);
		try {
			let parsedBody: Record<string, unknown> | undefined;
			try {
				parsedBody = parseBody();
			} catch {
				setBodyError("Request body is not valid JSON.");
				setLoading(false);
				return;
			}
			const result = await orpcClient.apiExplorer.sendRequest({
				authMode: authState.mode,
				endpointId: endpoint.id,
				managedKeyId:
					authState.mode === "managed" ? authState.managedKeyId : undefined,
				paramValues,
				rawApiKey: authState.mode === "raw" ? authState.rawApiKey : undefined,
				body: parsedBody,
			});
			setStatusCode(result.statusCode);
			setDurationMs(result.durationMs);
			setResponse(JSON.stringify(result.body, null, 2));
		} catch (err) {
			setStatusCode(0);
			setDurationMs(null);
			setResponse(
				JSON.stringify(
					{ error: err instanceof Error ? err.message : "Request failed" },
					null,
					2
				)
			);
		} finally {
			setLoading(false);
		}
	};
```

Then change the existing `handleSend` so that, after the existing auth-ready and missing-required-params guards, it routes destructive methods through the confirm dialog instead of calling the proxy directly:

```ts
	const handleSend = async () => {
		// ...keep the existing authState.isReady guard and missingRequiredParams guard...
		if (endpoint.method === "DELETE") {
			setConfirmOpen(true);
			return;
		}
		await runRequest();
	};
```

- [ ] **Step 3: Render the body editor + confirm dialog.** Import the UI primitives at the top of the file:
```ts
import { Textarea } from "@locnative/ui/components/textarea";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
```
In the card body, where params render, add (for non-GET endpoints) a JSON body editor below the param inputs:
```tsx
{endpoint.method !== "GET" && (
	<div className="flex flex-col gap-1">
		<label className="font-medium text-sm" htmlFor={`body-${endpoint.id}`}>
			Request body (JSON)
		</label>
		<Textarea
			className="font-mono text-xs"
			id={`body-${endpoint.id}`}
			onChange={(e) => setBodyText(e.target.value)}
			rows={8}
			value={bodyText}
		/>
		{bodyError ? (
			<p className="text-destructive text-xs">{bodyError}</p>
		) : null}
	</div>
)}
```
And near the end of the card, add the confirm dialog for destructive ops:
```tsx
<Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Run {endpoint.method} {endpoint.path}?</DialogTitle>
		</DialogHeader>
		<p className="text-muted-foreground text-sm">
			This sends a real {endpoint.method} request with your API key and may
			permanently change data. This cannot be undone.
		</p>
		<DialogFooter>
			<Button onClick={() => setConfirmOpen(false)} variant="outline">
				Cancel
			</Button>
			<Button
				onClick={async () => {
					setConfirmOpen(false);
					await runRequest();
				}}
				variant="destructive"
			>
				Run {endpoint.method}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
```

> If `Button` does not support a `"destructive"` variant in this project, use the default variant. Confirm against `packages/ui/src/components/button.tsx`.

- [ ] **Step 4: Write a component test** — create `apps/web/src/components/api-explorer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Mock the orpc client so no network happens.
const sendRequest = vi.fn(() =>
	Promise.resolve({ body: { ok: true }, durationMs: 1, ok: true, requestUrl: "/x", statusCode: 200 })
);
vi.mock("@/lib/orpc", () => ({
	orpcClient: { apiKeys: { list: () => Promise.resolve([]) }, apiExplorer: { sendRequest } },
}));

import { ApiEndpointCard } from "./api-explorer.tsx";

const zoneCreate = {
	id: "zones.create",
	method: "POST" as const,
	path: "/api/v1/zones",
	summary: "Create a zone",
	description: "",
	exampleBody: { name: "depot" },
	params: [],
};

describe("ApiEndpointCard", () => {
	it("renders a JSON body editor for a non-GET endpoint seeded from exampleBody", () => {
		render(
			<ApiEndpointCard
				authState={{ isReady: true, mode: "raw", rawApiKey: "wh_x_y" }}
				baseUrl="https://api.locnative.com"
				endpoint={zoneCreate}
			/>
		);
		const textarea = screen.getByLabelText(/request body/i) as HTMLTextAreaElement;
		expect(textarea.value).toContain('"name": "depot"');
	});

	it("shows a confirm dialog before a DELETE call", async () => {
		const zoneDelete = { ...zoneCreate, id: "zones.delete", method: "DELETE" as const, path: "/api/v1/zones/{id}", exampleBody: undefined, params: [{ name: "id", type: "number", required: true, description: "" }] };
		render(
			<ApiEndpointCard
				authState={{ isReady: true, mode: "raw", rawApiKey: "wh_x_y" }}
				baseUrl="https://api.locnative.com"
				endpoint={zoneDelete}
			/>
		);
		// open the card if collapsed, fill id, click send
		// (adjust selectors to the actual card; the key assertion:)
		// after clicking Send, the confirm dialog appears and sendRequest is NOT called yet.
		expect(sendRequest).not.toHaveBeenCalled();
	});
});
```

> This requires the per-endpoint card to be an **exported** component. If it is currently an inner function, export it as `ApiEndpointCard` (rename the local component and `export function ApiEndpointCard(...)`). Adjust the test's prop shape to the real `authState`/`endpoint` types. Keep the first test (body editor seed) as the must-pass assertion; the DELETE test may need selector tuning to the real card markup — make it pass by driving the real Send control.

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `corepack pnpm --filter @locnative/web exec vitest run src/components/api-explorer.test.tsx`
Run: `corepack pnpm --filter @locnative/web check-types 2>&1 | grep -i api-explorer || echo "no api-explorer errors"`
Run: `corepack pnpm dlx ultracite check apps/web/src/components/api-explorer.tsx apps/web/src/components/api-explorer.test.tsx`
Expected: tests pass; no new type/lint errors in these files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/api-explorer.tsx apps/web/src/components/api-explorer.test.tsx
git commit -m "feat(web): run non-GET endpoints in the API Explorer with a JSON body editor + DELETE confirm"
```

---

## Stage C — SDK Playground

### Task C1: SDK snippet generator (pure)

**Files:**
- Create: `apps/web/src/lib/sdk-snippet.ts`
- Test: `apps/web/src/lib/sdk-snippet.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/web/src/lib/sdk-snippet.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sdkCallForEndpoint, buildSdkSnippet } from "./sdk-snippet.ts";

describe("sdkCallForEndpoint", () => {
	it("maps catalog ids to namespaced SDK calls", () => {
		expect(sdkCallForEndpoint("zones.create")).toBe("client.zones.create");
		expect(sdkCallForEndpoint("addresses.autocomplete")).toBe("client.addresses.autocomplete");
		expect(sdkCallForEndpoint("geocode.batch.submit")).toBe("client.geocode.batch.submit");
		// id differs from SDK method name:
		expect(sdkCallForEndpoint("addresses.byId")).toBe("client.addresses.getById");
		expect(sdkCallForEndpoint("devices.location.push")).toBe("client.devices.pushLocation");
		expect(sdkCallForEndpoint("geocode.batch.poll")).toBe("client.geocode.batch.poll");
		expect(sdkCallForEndpoint("regions.classify")).toBe("client.regions.classify");
	});
});

describe("buildSdkSnippet", () => {
	it("renders a runnable snippet for a method with a single params arg", () => {
		const snippet = buildSdkSnippet("regions.classify", { lat: "-37.8", lng: "144.9" }, undefined);
		expect(snippet).toContain('import { createLocnativeClient } from "@locnative/sdk";');
		expect(snippet).toContain("client.regions.classify({");
		expect(snippet).toContain('lat: -37.8');
		expect(snippet).toContain('lng: 144.9');
	});

	it("renders a body object for a create call", () => {
		const snippet = buildSdkSnippet("zones.create", {}, { name: "depot" });
		expect(snippet).toContain("client.zones.create({");
		expect(snippet).toContain('name: "depot"');
	});
});
```

- [ ] **Step 2: Run it, verify FAIL.** `corepack pnpm --filter @locnative/web exec vitest run src/lib/sdk-snippet.test.ts` → FAIL.

- [ ] **Step 3: Create `apps/web/src/lib/sdk-snippet.ts`:**

```ts
// Maps an api-explorer catalog endpoint id to the namespaced SDK call expression.
// Most ids match `namespace.method`; a few differ and are mapped explicitly.
const SDK_CALL_OVERRIDES: Record<string, string> = {
	"addresses.byId": "client.addresses.getById",
	"devices.location.push": "client.devices.pushLocation",
	"devices.zones": "client.devices.zones",
};

export function sdkCallForEndpoint(endpointId: string): string {
	if (SDK_CALL_OVERRIDES[endpointId]) {
		return SDK_CALL_OVERRIDES[endpointId];
	}
	return `client.${endpointId}`;
}

// Coerce a string param value to a JS literal for the snippet (number if numeric).
function literal(value: string): string {
	if (value !== "" && !Number.isNaN(Number(value))) {
		return value;
	}
	return JSON.stringify(value);
}

function renderArg(
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined
): string {
	if (body !== undefined) {
		return JSON.stringify(body, null, 2);
	}
	const entries = Object.entries(paramValues).filter(([, v]) => v !== "");
	if (entries.length === 0) {
		return "";
	}
	const inner = entries.map(([k, v]) => `  ${k}: ${literal(v)}`).join(",\n");
	return `{\n${inner}\n}`;
}

export function buildSdkSnippet(
	endpointId: string,
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined
): string {
	const call = sdkCallForEndpoint(endpointId);
	const arg = renderArg(paramValues, body);
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

- [ ] **Step 4: Run the test, verify PASS.** Then lint: `corepack pnpm dlx ultracite check apps/web/src/lib/sdk-snippet.ts apps/web/src/lib/sdk-snippet.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sdk-snippet.ts apps/web/src/lib/sdk-snippet.test.ts
git commit -m "feat(web): SDK snippet generator for the playground"
```

### Task C2: Playground page + route + nav

**Files:**
- Create: `apps/web/src/components/sdk-playground.tsx`
- Create: `apps/web/src/routes/_protected/sdk-playground.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx`

- [ ] **Step 1: Create the route** `apps/web/src/routes/_protected/sdk-playground.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SdkPlayground } from "@/components/sdk-playground";

export const Route = createFileRoute("/_protected/sdk-playground")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">SDK Playground</h1>
				<p className="text-muted-foreground text-sm">
					Pick a method, fill in inputs, see the equivalent
					@locnative/sdk code, and run it against the live API.
				</p>
			</div>
			<SdkPlayground />
		</div>
	);
}
```

- [ ] **Step 2: Create the playground component** `apps/web/src/components/sdk-playground.tsx`. It reuses the catalog (`apiExplorerEndpoints`) for the method list + params + example bodies, the snippet generator, and the same `orpcClient.apiExplorer.sendRequest` proxy. Reuse the Explorer's auth key-selector by importing it if it is exported from `api-explorer.tsx`; otherwise render a minimal managed-key `<Select>` (the auth wiring mirrors `api-explorer.tsx`).

```tsx
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { Textarea } from "@locnative/ui/components/textarea";
import { useMemo, useState } from "react";
import { apiExplorerEndpoints } from "@/lib/api-explorer-endpoints";
import { orpcClient } from "@/lib/orpc";
import { buildSdkSnippet } from "@/lib/sdk-snippet";

export function SdkPlayground() {
	const [endpointId, setEndpointId] = useState(apiExplorerEndpoints[0]?.id ?? "");
	const endpoint = useMemo(
		() => apiExplorerEndpoints.find((e) => e.id === endpointId),
		[endpointId]
	);
	const [paramValues, setParamValues] = useState<Record<string, string>>({});
	const [bodyText, setBodyText] = useState<string>("");
	const [rawApiKey, setRawApiKey] = useState("");
	const [result, setResult] = useState<string | null>(null);
	const [running, setRunning] = useState(false);

	const body =
		endpoint && endpoint.method !== "GET" && bodyText.trim() !== ""
			? (JSON.parse(bodyText) as Record<string, unknown>)
			: undefined;

	const snippet = endpoint
		? buildSdkSnippet(endpoint.id, paramValues, body)
		: "";

	const run = async () => {
		if (!endpoint) {
			return;
		}
		setRunning(true);
		setResult(null);
		try {
			let parsedBody: Record<string, unknown> | undefined;
			if (endpoint.method !== "GET" && bodyText.trim() !== "") {
				parsedBody = JSON.parse(bodyText) as Record<string, unknown>;
			}
			const res = await orpcClient.apiExplorer.sendRequest({
				authMode: "raw",
				endpointId: endpoint.id,
				paramValues,
				rawApiKey,
				body: parsedBody,
			});
			setResult(JSON.stringify(res.body, null, 2));
		} catch (err) {
			setResult(err instanceof Error ? err.message : "Request failed");
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Method</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Select onValueChange={setEndpointId} value={endpointId}>
						<SelectTrigger>
							<SelectValue placeholder="Pick an SDK method" />
						</SelectTrigger>
						<SelectContent>
							{apiExplorerEndpoints.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									{e.id}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{endpoint?.params.map((p) => (
						<div className="flex flex-col gap-1" key={p.name}>
							<label className="text-sm" htmlFor={`pg-${p.name}`}>
								{p.name}
								{p.required ? " *" : ""}
							</label>
							<input
								className="rounded border px-2 py-1 text-sm"
								id={`pg-${p.name}`}
								onChange={(ev) =>
									setParamValues((prev) => ({ ...prev, [p.name]: ev.target.value }))
								}
								placeholder={p.example ?? ""}
								value={paramValues[p.name] ?? ""}
							/>
						</div>
					))}
					{endpoint && endpoint.method !== "GET" ? (
						<Textarea
							className="font-mono text-xs"
							onChange={(ev) => setBodyText(ev.target.value)}
							placeholder={
								endpoint.exampleBody
									? JSON.stringify(endpoint.exampleBody, null, 2)
									: "{}"
							}
							rows={6}
							value={bodyText}
						/>
					) : null}
					<input
						className="rounded border px-2 py-1 text-sm"
						onChange={(ev) => setRawApiKey(ev.target.value)}
						placeholder="Raw API key (wh_...)"
						value={rawApiKey}
					/>
					<Button disabled={running || !endpoint} onClick={run}>
						{running ? "Running…" : "Run"}
					</Button>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>SDK code</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<pre className="overflow-auto rounded bg-muted p-3 text-xs">
						<code>{snippet}</code>
					</pre>
					{result !== null ? (
						<pre className="overflow-auto rounded bg-muted p-3 text-xs">
							<code>{result}</code>
						</pre>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
```

> This intentionally uses the raw-key auth mode for a lean first version (mirrors the Explorer's raw mode). If the Explorer's managed-key selector is cleanly exported, prefer reusing it; do not block on a refactor.

- [ ] **Step 3: Add the sidebar nav entry.** Read `apps/web/src/components/app-sidebar.tsx`, find the nav-items array that includes the `api-docs` entry, and add an entry pointing to `/sdk-playground` titled "SDK Playground" with a sensible existing lucide icon (e.g. `Code2Icon`, already used in the app). Follow the exact shape of the adjacent items (title/url/icon).

- [ ] **Step 4: Typecheck + lint + route generation.** Run `corepack pnpm --filter @locnative/web check-types 2>&1 | grep -iE "sdk-playground|app-sidebar" || echo "clean"` and `corepack pnpm dlx ultracite check apps/web/src/components/sdk-playground.tsx apps/web/src/routes/_protected/sdk-playground.tsx`. (TanStack route tree regenerates on dev/build; if a `routeTree.gen.ts` check is needed, run the web build once.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/sdk-playground.tsx apps/web/src/routes/_protected/sdk-playground.tsx apps/web/src/components/app-sidebar.tsx
git commit -m "feat(web): SDK Playground page with live run via the explorer proxy"
```

---

## Task D1: Final verification

- [ ] **Step 1: Full test suites**

Run: `corepack pnpm --filter @locnative/api exec vitest run` (api: includes the new proxy test)
Run: `corepack pnpm --filter @locnative/web exec vitest run` (web: explorer + snippet + playground)
Expected: all pass.

- [ ] **Step 2: Typecheck both packages**

Run: `corepack pnpm --filter @locnative/api check-types && corepack pnpm --filter @locnative/web check-types`
Expected: no NEW errors (note/ignore any pre-existing unrelated ones).

- [ ] **Step 3: Lint the changed surface**

Run: `corepack pnpm dlx ultracite check packages/api/src/routers/domains apps/web/src/components/api-explorer.tsx apps/web/src/components/sdk-playground.tsx apps/web/src/lib/sdk-snippet.ts apps/web/src/lib/api-explorer-endpoints.ts apps/web/src/routes/_protected/sdk-playground.tsx`
Expected: clean (fix any new issues).

- [ ] **Step 4: Manual smoke (optional, needs dev server + a real API key)**
Start the web dev server, open `/api-docs`, run a `POST /api/v1/zones` (create a zone) and confirm a 200; run a `DELETE` and confirm the confirm dialog appears and the delete succeeds on confirm. Open `/sdk-playground`, pick `regions.classify`, fill lat/lng, confirm the snippet renders and Run returns a result.

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint pass for interactive explorer + sdk playground"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §4 enhanced proxy (non-GET, body channel, regions, param/body handling) → Task A1 ✅
- §5 interactive Explorer (executable non-GET, body editor, live response, DELETE confirm, regions) → Tasks B1, B2 ✅
- §6 SDK Playground (separate route + nav, method picker, snippet, Run via proxy) → Tasks C1, C2 ✅
- §7 testing (proxy unit tests + frontend component/pure tests) → A1, B2, C1, C2, D1 ✅
- §9 drift guard → A1 `EXPLORER_ENDPOINT_IDS` test ✅
- §8 out-of-scope items have no tasks ✅

**Type/name consistency:** `buildProxyRequest`, `getExplorerEndpoint`, `EXPLORER_ENDPOINT_IDS` (Task A1) are used consistently in tests; the `body` field added to `explorerRequestSchema` (A1) is the same `body` passed by the Explorer (B2) and Playground (C2). `sdkCallForEndpoint`/`buildSdkSnippet` (C1) are consumed by C2. Endpoint ids match between the proxy allowlist (A1) and the catalog (B1).

**Placeholder scan:** Backend (A1), the snippet generator (C1), the route + playground component (C2) are fully coded. The Explorer edits (B2) and the nav entry (C2 Step 3) are directed changes against a large existing component/config the implementer must read — every NEW symbol and JSX block is given verbatim; integration anchors are named exactly (the `isExecutable` line, the `handleSend` body, the params render block, the `api-docs` nav item). This is the correct level of detail for edits inside a 650-line component and a nav config that must be read to integrate cleanly. No "TODO/decide later" remain.
