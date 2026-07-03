# TypeScript SDK Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@locnative/sdk` from 4 addresses-only methods to full coverage of all 18 public API endpoints (22 methods), organized as resource namespaces, with a vitest test suite.

**Architecture:** Hand-written, dependency-free `fetch` client. A single generalized `request` helper (method + query + JSON body) lives in `src/http.ts`; each API resource is a factory module under `src/resources/` with co-located types; `client.ts` composes the namespaces; `index.ts` is the public barrel. Tests inject a mock `fetch` and assert the request the SDK builds.

**Tech Stack:** TypeScript (ESM, `.ts` extension imports), vitest, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-07-typescript-sdk-completion-design.md`

**Working dir:** `/Users/mac/Developer/projects/locnative.com/.claude/worktrees/sdk-completion` (branch `worktree-sdk-completion`). Run all commands from there.

---

## Authoritative API sources (read these for exact input/response shapes)

The SDK types MIRROR these server handlers. When a task says "derive the response type from the handler," read the named file's `.handler(...)` return value and `.input(z.object({...}))` schema:

- Addresses: `packages/api/src/routers/public-http.ts` (autocomplete, nearby, reverse, byId) + `packages/api/src/routers/public/geocode.ts` (forward `geocode`, batch submit/poll/results)
- Zones: `packages/api/src/routers/public/zones.ts`
- Devices: `packages/api/src/routers/public/devices.ts`
- Webhooks: `packages/api/src/routers/public/webhooks.ts`
- Regions: `packages/api/src/routers/public/regions.ts`

Existing SDK to follow as the template: `packages/sdk/src/{client,types,errors,index}.ts`.

## Endpoint → method map (target surface)

| Namespace.method | HTTP | Path |
|---|---|---|
| `addresses.autocomplete(params)` | GET | `/api/v1/addresses/autocomplete` |
| `addresses.reverse(params)` | GET | `/api/v1/addresses/reverse` |
| `addresses.nearby(params)` | GET | `/api/v1/addresses/nearby` |
| `addresses.getById(id)` | GET | `/api/v1/addresses/{id}` |
| `geocode.forward(params)` | GET | `/api/v1/addresses/geocode` |
| `geocode.batch.submit(body)` | POST | `/api/v1/geocode/batch` |
| `geocode.batch.poll(jobId)` | GET | `/api/v1/geocode/batch/{jobId}` |
| `geocode.batch.results(jobId)` | GET | `/api/v1/geocode/batch/{jobId}/results` |
| `zones.create(body)` | POST | `/api/v1/zones` |
| `zones.list(params?)` | GET | `/api/v1/zones` |
| `zones.get(id)` | GET | `/api/v1/zones/{id}` |
| `zones.update(id, body)` | PUT | `/api/v1/zones/{id}` |
| `zones.delete(id)` | DELETE | `/api/v1/zones/{id}` |
| `zones.contains(params)` | GET | `/api/v1/zones/contains` |
| `zones.addresses(id, params?)` | GET | `/api/v1/zones/{id}/addresses` |
| `devices.pushLocation(deviceId, body)` | POST | `/api/v1/devices/{deviceId}/location` |
| `devices.zones(deviceId)` | GET | `/api/v1/devices/{deviceId}/zones` |
| `webhooks.create(body)` | POST | `/api/v1/webhooks` |
| `webhooks.list()` | GET | `/api/v1/webhooks` |
| `webhooks.delete(id)` | DELETE | `/api/v1/webhooks/{id}` |
| `webhooks.reactivate(id)` | POST | `/api/v1/webhooks/{id}/reactivate` |
| `regions.classify(params)` | GET | `/api/v1/regions` |

## File structure (target)

```
packages/sdk/src/
  http.ts                 # config type, createHeaders, parseApiError, createRequester
  errors.ts               # LocnativeApiError (unchanged)
  shared-types.ts         # config + error payload + version consts (moved from types.ts)
  resources/
    addresses.ts          # + addresses.test.ts
    geocode.ts            # + geocode.test.ts
    zones.ts              # + zones.test.ts
    devices.ts            # + devices.test.ts
    webhooks.ts           # + webhooks.test.ts
    regions.ts            # + regions.test.ts
  client.ts               # createLocnativeClient — composes namespaces
  client.test.ts          # cross-namespace + coverage test
  index.ts                # public barrel
```

`types.ts` is removed; its config/error/version exports move to `shared-types.ts`, and its resource types move into the matching `resources/*.ts`.

---

## Task 1: Generalized HTTP core (`http.ts` + `shared-types.ts`)

**Files:**
- Create: `packages/sdk/src/shared-types.ts`
- Create: `packages/sdk/src/http.ts`
- Test: `packages/sdk/src/http.test.ts`

- [ ] **Step 1: Create `shared-types.ts`** (moved from `types.ts`):

```ts
export const LOCNATIVE_API_VERSION = "v1" as const;
export const LOCNATIVE_SDK_VERSION = "0.2.0-preview" as const;

export interface LocnativeApiErrorPayload {
	error: {
		code: "bad_request" | "internal_error" | "not_found" | "unauthorized";
		message: string;
	};
}

export interface LocnativeClientConfig {
	apiKey: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	headers?: Record<string, string>;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions {
	method: HttpMethod;
	path: string;
	query?: Record<string, number | string | undefined>;
	body?: unknown;
}

export type Requester = <T>(opts: RequestOptions) => Promise<T>;
```

- [ ] **Step 2: Write the failing test** — create `packages/sdk/src/http.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LocnativeApiError } from "./errors.ts";
import { createRequester } from "./http.ts";

interface Captured {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
}

function mockFetch(
	status: number,
	jsonBody: unknown
): { fetch: typeof fetch; captured: Captured[] } {
	const captured: Captured[] = [];
	const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((v, k) => {
			headers[k] = v;
		});
		captured.push({
			url: String(input),
			method: init?.method ?? "GET",
			headers,
			body: (init?.body as string | undefined) ?? null,
		});
		return new Response(JSON.stringify(jsonBody), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
	return { fetch: fetchImpl, captured };
}

describe("createRequester", () => {
	it("builds a GET with query params and auth + sdk headers", async () => {
		const { fetch, captured } = mockFetch(200, { ok: true });
		const request = createRequester({ apiKey: "wh_test", fetch });
		await request({
			method: "GET",
			path: "/api/v1/addresses/autocomplete",
			query: { q: "123 Main", limit: 5, country: undefined },
		});
		expect(captured).toHaveLength(1);
		const c = captured[0];
		expect(c.method).toBe("GET");
		expect(c.url).toBe(
			"https://api.locnative.com/api/v1/addresses/autocomplete?q=123+Main&limit=5"
		);
		expect(c.headers.authorization).toBe("Bearer wh_test");
		expect(c.headers["x-locnative-sdk"]).toContain("js-ts/");
		expect(c.body).toBeNull();
	});

	it("serializes a JSON body for POST with content-type", async () => {
		const { fetch, captured } = mockFetch(200, { id: 1 });
		const request = createRequester({ apiKey: "wh_test", fetch });
		await request({
			method: "POST",
			path: "/api/v1/zones",
			body: { name: "depot" },
		});
		const c = captured[0];
		expect(c.method).toBe("POST");
		expect(c.headers["content-type"]).toBe("application/json");
		expect(c.body).toBe('{"name":"depot"}');
	});

	it("resolves undefined for a 204 empty response", async () => {
		const fetchImpl = (async () =>
			new Response(null, { status: 204 })) as typeof fetch;
		const request = createRequester({ apiKey: "wh_test", fetch: fetchImpl });
		const result = await request({ method: "DELETE", path: "/api/v1/zones/1" });
		expect(result).toBeUndefined();
	});

	it("throws LocnativeApiError on a non-2xx body", async () => {
		const { fetch } = mockFetch(404, {
			error: { code: "not_found", message: "Zone not found." },
		});
		const request = createRequester({ apiKey: "wh_test", fetch });
		await expect(
			request({ method: "GET", path: "/api/v1/zones/999" })
		).rejects.toMatchObject({
			name: "LocnativeApiError",
			status: 404,
			code: "not_found",
		});
		await expect(
			request({ method: "GET", path: "/api/v1/zones/999" })
		).rejects.toBeInstanceOf(LocnativeApiError);
	});
});
```

- [ ] **Step 3: Run the test, verify it FAILS**

Run: `corepack pnpm --filter @locnative/sdk exec vitest run src/http.test.ts`
Expected: FAIL — `createRequester` does not exist.

- [ ] **Step 4: Create `packages/sdk/src/http.ts`:**

```ts
import { LocnativeApiError } from "./errors.ts";
import {
	type RequestOptions,
	type Requester,
	LOCNATIVE_API_VERSION,
	LOCNATIVE_SDK_VERSION,
	type LocnativeApiErrorPayload,
	type LocnativeClientConfig,
} from "./shared-types.ts";

const DEFAULT_BASE_URL = "https://api.locnative.com";

const createHeaders = (config: LocnativeClientConfig): Headers => {
	const headers = new Headers(config.headers);
	headers.set("accept", "application/json");
	headers.set("authorization", `Bearer ${config.apiKey}`);
	headers.set(
		"x-locnative-sdk",
		`js-ts/${LOCNATIVE_SDK_VERSION} api/${LOCNATIVE_API_VERSION}`
	);
	return headers;
};

const parseApiError = async (
	response: Response
): Promise<LocnativeApiError> => {
	let payload: LocnativeApiErrorPayload | null = null;
	try {
		payload = (await response.json()) as LocnativeApiErrorPayload;
	} catch {
		payload = null;
	}
	const message =
		payload?.error.message ??
		`Locnative request failed with status ${response.status}`;
	return new LocnativeApiError({
		status: response.status,
		message,
		code: payload?.error.code ?? "unknown_error",
		payload,
	});
};

export const createRequester = (config: LocnativeClientConfig): Requester => {
	const fetchImpl = config.fetch ?? globalThis.fetch;
	if (!fetchImpl) {
		throw new Error(
			"A fetch implementation is required to create the SDK client."
		);
	}
	const baseUrl = new URL(config.baseUrl ?? DEFAULT_BASE_URL);
	const headers = createHeaders(config);

	return async <T>(opts: RequestOptions): Promise<T> => {
		const url = new URL(opts.path, baseUrl);
		if (opts.query) {
			for (const [key, value] of Object.entries(opts.query)) {
				if (value !== undefined) {
					url.searchParams.set(key, String(value));
				}
			}
		}
		const requestHeaders = new Headers(headers);
		const hasBody = opts.body !== undefined;
		if (hasBody) {
			requestHeaders.set("content-type", "application/json");
		}
		const response = await fetchImpl(url, {
			method: opts.method,
			headers: requestHeaders,
			body: hasBody ? JSON.stringify(opts.body) : undefined,
		});
		if (!response.ok) {
			throw await parseApiError(response);
		}
		if (response.status === 204) {
			return undefined as T;
		}
		const text = await response.text();
		return (text ? JSON.parse(text) : undefined) as T;
	};
};
```

- [ ] **Step 5: Run the test, verify it PASSES**

Run: `corepack pnpm --filter @locnative/sdk exec vitest run src/http.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/shared-types.ts packages/sdk/src/http.ts packages/sdk/src/http.test.ts
git commit -m "feat(sdk): generalized request helper with method + body support"
```

---

## Task 2: Addresses resource (`resources/addresses.ts`)

This MOVES the existing 4 address methods into a namespace factory and co-locates their types (which already exist in `types.ts`).

**Files:**
- Create: `packages/sdk/src/resources/addresses.ts`
- Test: `packages/sdk/src/resources/addresses.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/sdk/src/resources/addresses.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAddresses } from "./addresses.ts";

function fakeRequest() {
	const calls: unknown[] = [];
	const request = vi.fn(async (opts: unknown) => {
		calls.push(opts);
		return {} as never;
	});
	return { request, calls };
}

describe("addresses resource", () => {
	it("autocomplete issues a GET with q/country/state/limit", async () => {
		const { request } = fakeRequest();
		const addresses = createAddresses(request as never);
		await addresses.autocomplete({ q: "123 Main", limit: 5 });
		expect(request).toHaveBeenCalledWith({
			method: "GET",
			path: "/api/v1/addresses/autocomplete",
			query: { q: "123 Main", country: undefined, state: undefined, limit: 5 },
		});
	});

	it("getById interpolates the id into the path", async () => {
		const { request } = fakeRequest();
		const addresses = createAddresses(request as never);
		await addresses.getById(42);
		expect(request).toHaveBeenCalledWith({
			method: "GET",
			path: "/api/v1/addresses/42",
		});
	});

	it("reverse and nearby issue GETs with coordinates", async () => {
		const { request } = fakeRequest();
		const addresses = createAddresses(request as never);
		await addresses.reverse({ lat: -37.8, lng: 144.9 });
		await addresses.nearby({ lat: -37.8, lng: 144.9, radius: 500 });
		expect(request).toHaveBeenNthCalledWith(1, {
			method: "GET",
			path: "/api/v1/addresses/reverse",
			query: { lat: -37.8, lng: 144.9 },
		});
		expect(request).toHaveBeenNthCalledWith(2, {
			method: "GET",
			path: "/api/v1/addresses/nearby",
			query: {
				lat: -37.8,
				lng: 144.9,
				radius: 500,
				limit: undefined,
				country: undefined,
			},
		});
	});
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `corepack pnpm --filter @locnative/sdk exec vitest run src/resources/addresses.test.ts`
Expected: FAIL — `createAddresses` does not exist.

- [ ] **Step 3: Create `packages/sdk/src/resources/addresses.ts`.**

Copy the `AddressSuggestion`, `AddressRecord`, `NearbyAddress`, `ReverseGeocodeAddress`, `AutocompleteParams`, `NearbyParams`, `ReverseParams`, `AutocompleteResponse`, `NearbyResponse`, `ReverseResponse` interfaces VERBATIM from the current `packages/sdk/src/types.ts` into this file (they are already correct). Then add the factory:

```ts
import type { Requester } from "../shared-types.ts";

// (paste the address interfaces from types.ts here, unchanged)

export interface AddressesResource {
	autocomplete(params: AutocompleteParams): Promise<AutocompleteResponse>;
	getById(id: number): Promise<AddressRecord>;
	nearby(params: NearbyParams): Promise<NearbyResponse>;
	reverse(params: ReverseParams): Promise<ReverseResponse>;
}

export const createAddresses = (request: Requester): AddressesResource => ({
	autocomplete: (params) =>
		request<AutocompleteResponse>({
			method: "GET",
			path: "/api/v1/addresses/autocomplete",
			query: {
				q: params.q,
				country: params.country,
				state: params.state,
				limit: params.limit,
			},
		}),
	getById: (id) =>
		request<AddressRecord>({
			method: "GET",
			path: `/api/v1/addresses/${id}`,
		}),
	nearby: (params) =>
		request<NearbyResponse>({
			method: "GET",
			path: "/api/v1/addresses/nearby",
			query: {
				lat: params.lat,
				lng: params.lng,
				radius: params.radius,
				limit: params.limit,
				country: params.country,
			},
		}),
	reverse: (params) =>
		request<ReverseResponse>({
			method: "GET",
			path: "/api/v1/addresses/reverse",
			query: { lat: params.lat, lng: params.lng },
		}),
});
```

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `corepack pnpm --filter @locnative/sdk exec vitest run src/resources/addresses.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/resources/addresses.ts packages/sdk/src/resources/addresses.test.ts
git commit -m "feat(sdk): addresses resource namespace"
```

---

## Tasks 3–7: Remaining resources (same recipe)

Each of Tasks 3–7 follows the EXACT pattern of Task 2:
1. Write `resources/<name>.test.ts` first — assert each method calls `request` with the exact `{ method, path, query?, body? }` (use the `fakeRequest` helper from Task 2's test, copied into each test file).
2. Run it, verify FAIL.
3. Create `resources/<name>.ts`: a `createX(request: Requester)` factory whose methods call `request<ResponseType>({...})` per the endpoint map. **Read the authoritative handler file** (listed at the top of this plan) to write the request/response interfaces — mirror the handler's `.input` schema (request params/body) and its `.handler` return value (response type). Follow `addresses.ts` as the template for style (co-located interfaces, factory shape).
4. Run it, verify PASS.
5. Commit `feat(sdk): <name> resource namespace`.

Per-resource specifics:

### Task 3: `geocode` (read `packages/api/src/routers/public/geocode.ts`)
Methods + wiring:
```ts
forward(params)        -> { method:"GET",  path:"/api/v1/addresses/geocode", query:{ q, structured, street, locality, state, postcode, country } }
batch.submit(body)     -> { method:"POST", path:"/api/v1/geocode/batch", body }
batch.poll(jobId)      -> { method:"GET",  path:`/api/v1/geocode/batch/${jobId}` }
batch.results(jobId)   -> { method:"GET",  path:`/api/v1/geocode/batch/${jobId}/results` }
```
`geocode.batch` is a nested object: `createGeocode` returns `{ forward, batch: { submit, poll, results } }`. The `forward` param type mirrors the `geocodeInput` discriminated union in the handler (unstructured `q` OR structured `street`/`locality`/...); model it as one interface with all-optional fields plus required-on-one-of documented via JSDoc. The `batch.submit` body type and the job/result response types come from the handler's `.input`/`.handler`. Test asserts: `forward` GET with the query, `batch.submit` POST with body, `batch.poll`/`batch.results` GET with interpolated `jobId`.

### Task 4: `zones` (read `packages/api/src/routers/public/zones.ts`)
The `ZoneRecord` / `ZoneWithGeometry` interfaces already exist in the current `types.ts` — move them into `resources/zones.ts`. Methods + wiring:
```ts
create(body)            -> { method:"POST",   path:"/api/v1/zones", body }
list(params?)           -> { method:"GET",    path:"/api/v1/zones", query:{ page: params?.page, limit: params?.limit } }
get(id)                 -> { method:"GET",    path:`/api/v1/zones/${id}` }
update(id, body)        -> { method:"PUT",    path:`/api/v1/zones/${id}`, body }
delete(id)              -> { method:"DELETE", path:`/api/v1/zones/${id}` }
contains(params)        -> { method:"GET",    path:"/api/v1/zones/contains", query:{ lat: params.lat, lng: params.lng } }
addresses(id, params?)  -> { method:"GET",    path:`/api/v1/zones/${id}/addresses`, query:{ page: params?.page, limit: params?.limit } }
```
The `geometry` field in create/update is a GeoJSON Polygon — type it as `{ type: "Polygon"; coordinates: number[][][] }`. Response types: `create`/`get`/`update` return `ZoneRecord`; `list` returns `{ zones: ZoneRecord[]; count: number; ... }`; `delete` returns `{ success: true }`; `contains` returns `{ zones: ZoneRecord[]; count: number; query: { lat; lng } }`; `addresses` returns the paginated address list — mirror the handler. `delete` is a reserved word as a bare identifier but is valid as an object method name; keep it `delete`.

### Task 5: `devices` (read `packages/api/src/routers/public/devices.ts`)
```ts
pushLocation(deviceId, body) -> { method:"POST", path:`/api/v1/devices/${deviceId}/location`, body }
zones(deviceId)              -> { method:"GET",  path:`/api/v1/devices/${deviceId}/zones` }
```
The `pushLocation` body type (lat/lng/timestamp/etc.) and both response types come from the handler's `.input`/`.handler`.

### Task 6: `webhooks` (read `packages/api/src/routers/public/webhooks.ts`)
```ts
create(body)      -> { method:"POST",   path:"/api/v1/webhooks", body }
list()            -> { method:"GET",    path:"/api/v1/webhooks" }
delete(id)        -> { method:"DELETE", path:`/api/v1/webhooks/${id}` }
reactivate(id)    -> { method:"POST",   path:`/api/v1/webhooks/${id}/reactivate` }
```
`reactivate` has no body — call `request` without a `body` key (POST with empty body is fine; the handler takes only the path param). The `create` body type (url, events, ...) and response types come from the handler.

### Task 7: `regions` (read `packages/api/src/routers/public/regions.ts`)
```ts
classify(params) -> { method:"GET", path:"/api/v1/regions", query:{ lat: params.lat, lng: params.lng, layers: params.layers } }
```
Types (the handler returns exactly this):
```ts
export interface RegionsClassifyParams { lat: number; lng: number; layers?: string; }
export interface RegionMatch { code: string; name: string; }
export interface RegionsClassifyResponse {
	query: { lat: number; lng: number };
	regions: Record<string, RegionMatch>;
}
```

---

## Task 8: Client assembly, barrel, and docs reference

**Files:**
- Rewrite: `packages/sdk/src/client.ts`
- Rewrite: `packages/sdk/src/index.ts`
- Delete: `packages/sdk/src/types.ts`
- Modify: `apps/web/src/components/docs-page.tsx`

- [ ] **Step 1: Rewrite `packages/sdk/src/client.ts`:**

```ts
import { createAddresses, type AddressesResource } from "./resources/addresses.ts";
import { createDevices, type DevicesResource } from "./resources/devices.ts";
import { createGeocode, type GeocodeResource } from "./resources/geocode.ts";
import { createRegions, type RegionsResource } from "./resources/regions.ts";
import { createWebhooks, type WebhooksResource } from "./resources/webhooks.ts";
import { createZones, type ZonesResource } from "./resources/zones.ts";
import { createRequester } from "./http.ts";
import type { LocnativeClientConfig } from "./shared-types.ts";

export interface LocnativeClient {
	addresses: AddressesResource;
	geocode: GeocodeResource;
	zones: ZonesResource;
	devices: DevicesResource;
	webhooks: WebhooksResource;
	regions: RegionsResource;
}

export const createLocnativeClient = (
	config: LocnativeClientConfig
): LocnativeClient => {
	const request = createRequester(config);
	return {
		addresses: createAddresses(request),
		geocode: createGeocode(request),
		zones: createZones(request),
		devices: createDevices(request),
		webhooks: createWebhooks(request),
		regions: createRegions(request),
	};
};
```

(If a resource's exported interface name differs from `XResource`, use the actual exported name — confirm against the files from Tasks 2–7.)

- [ ] **Step 2: Rewrite `packages/sdk/src/index.ts`** to re-export the client, error, version consts, config/error-payload types, and every resource's public types:

```ts
export { createLocnativeClient, type LocnativeClient } from "./client.ts";
export { LocnativeApiError } from "./errors.ts";
export {
	LOCNATIVE_API_VERSION,
	LOCNATIVE_SDK_VERSION,
	type LocnativeApiErrorPayload,
	type LocnativeClientConfig,
} from "./shared-types.ts";
export * from "./resources/addresses.ts";
export * from "./resources/geocode.ts";
export * from "./resources/zones.ts";
export * from "./resources/devices.ts";
export * from "./resources/webhooks.ts";
export * from "./resources/regions.ts";
```

- [ ] **Step 3: Delete the old `types.ts`**

```bash
git rm packages/sdk/src/types.ts
```

- [ ] **Step 4: Update the docs reference.** In `apps/web/src/components/docs-page.tsx`, find the SDK usage example(s) that import/use `@locnative/sdk` (e.g. `client.autocomplete(...)`) and update them to the namespaced API (`client.addresses.autocomplete(...)`). Read the surrounding example to keep the existing format.

- [ ] **Step 5: Type-check the SDK**

Run: `corepack pnpm --filter @locnative/sdk check-types`
Expected: PASS (no errors). Fix any import-name mismatches between `client.ts`/`index.ts` and the resource files.

- [ ] **Step 6: Type-check the web app** (the docs edit)

Run: `corepack pnpm --filter @locnative/web check-types 2>&1 | grep -i docs-page || echo "no docs-page errors"`
Expected: no errors referencing `docs-page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/client.ts packages/sdk/src/index.ts apps/web/src/components/docs-page.tsx
git commit -m "feat(sdk): compose resource namespaces into the client"
```

---

## Task 9: Coverage test + final verification

**Files:**
- Create: `packages/sdk/src/client.test.ts`

- [ ] **Step 1: Write the coverage test** — `packages/sdk/src/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLocnativeClient } from "./client.ts";

const EXPECTED_PATHS = [
	["GET", "/api/v1/addresses/autocomplete"],
	["GET", "/api/v1/addresses/reverse"],
	["GET", "/api/v1/addresses/nearby"],
	["GET", "/api/v1/addresses/1"],
	["GET", "/api/v1/addresses/geocode"],
	["POST", "/api/v1/geocode/batch"],
	["GET", "/api/v1/geocode/batch/job_1"],
	["GET", "/api/v1/geocode/batch/job_1/results"],
	["POST", "/api/v1/zones"],
	["GET", "/api/v1/zones"],
	["GET", "/api/v1/zones/1"],
	["PUT", "/api/v1/zones/1"],
	["DELETE", "/api/v1/zones/1"],
	["GET", "/api/v1/zones/contains"],
	["GET", "/api/v1/zones/1/addresses"],
	["POST", "/api/v1/devices/dev_1/location"],
	["GET", "/api/v1/devices/dev_1/zones"],
	["POST", "/api/v1/webhooks"],
	["GET", "/api/v1/webhooks"],
	["DELETE", "/api/v1/webhooks/1"],
	["POST", "/api/v1/webhooks/1/reactivate"],
	["GET", "/api/v1/regions"],
] as const;

describe("client coverage", () => {
	it("every public endpoint is reachable via a namespaced method", async () => {
		const seen = new Set<string>();
		const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
			const u = new URL(String(input));
			seen.add(`${init?.method ?? "GET"} ${u.pathname}`);
			return new Response("{}", {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;
		const c = createLocnativeClient({ apiKey: "wh_test", fetch: fetchImpl });

		// One call per method (args are placeholders; we only assert the request line).
		await c.addresses.autocomplete({ q: "x" });
		await c.addresses.reverse({ lat: 0, lng: 0 });
		await c.addresses.nearby({ lat: 0, lng: 0 });
		await c.addresses.getById(1);
		await c.geocode.forward({ q: "x" } as never);
		await c.geocode.batch.submit({} as never);
		await c.geocode.batch.poll("job_1");
		await c.geocode.batch.results("job_1");
		await c.zones.create({} as never);
		await c.zones.list();
		await c.zones.get(1);
		await c.zones.update(1, {} as never);
		await c.zones.delete(1);
		await c.zones.contains({ lat: 0, lng: 0 });
		await c.zones.addresses(1);
		await c.devices.pushLocation("dev_1", {} as never);
		await c.devices.zones("dev_1");
		await c.webhooks.create({} as never);
		await c.webhooks.list();
		await c.webhooks.delete(1);
		await c.webhooks.reactivate(1);
		await c.regions.classify({ lat: 0, lng: 0 });

		for (const [method, path] of EXPECTED_PATHS) {
			expect(seen).toContain(`${method} ${path}`);
		}
	});
});
```

- [ ] **Step 2: Run the coverage test**

Run: `corepack pnpm --filter @locnative/sdk exec vitest run src/client.test.ts`
Expected: PASS. If a path is missing, the corresponding method/wiring is wrong — fix the resource file.

- [ ] **Step 3: Run the full SDK suite + typecheck + lint**

Run:
```bash
corepack pnpm --filter @locnative/sdk exec vitest run
corepack pnpm --filter @locnative/sdk check-types
corepack pnpm dlx ultracite check packages/sdk/src
```
Expected: all green. Fix any lint issues in the SDK files (e.g. `useConsistentTypeDefinitions` → use `interface`; `useawait` is satisfied since methods return the promise directly without `async`).

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/client.test.ts
git commit -m "test(sdk): endpoint coverage guard"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §2 hand-written, namespaces, drop flat methods, tests, defer publish, retries out → Tasks 1–9 (no build/publish/retry tasks) ✅
- §4 generalized request helper (method + body, 204 handling) → Task 1 ✅
- §5 one file per resource, co-located types, all 22 methods → Tasks 2–7 ✅
- §6 client assembly + index barrel → Task 8 ✅
- §7 per-resource mock-fetch tests + coverage test → each resource task + Task 9 ✅
- §8 version bump (`0.2.0-preview` in Task 1) + docs-page update (Task 8) ✅
- §9 out-of-scope items have no tasks ✅

**Type consistency:** `Requester`/`RequestOptions`/`LocnativeClientConfig` defined in Task 1 are used identically in Tasks 2–8. Resource factory naming `createX` + interface `XResource` is consistent across Tasks 2–8 (Task 8 notes "use the actual exported name" as a guard). `LocnativeClient` is redefined in `client.ts` (Task 8) and the old one in `types.ts` is deleted (Task 8 Step 3).

**Placeholder scan:** Tasks 1, 2, 8, 9 contain full code. Tasks 3–7 intentionally delegate request/response TYPE bodies to the authoritative handler files (named explicitly) with `addresses.ts` as the worked template and exact request-wiring given for every method — this is correct for an SDK that mirrors a live API (hand-copying server types into the plan would risk drift). Regions (Task 7) types are given in full since they were just authored. No "TODO/TBD" or undefined-symbol references remain.
