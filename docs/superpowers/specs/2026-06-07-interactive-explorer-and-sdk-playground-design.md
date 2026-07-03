# Interactive API Explorer + SDK Playground — Design Spec

**Date:** 2026-06-07
**Status:** Approved (design), pending implementation plan
**Goal:** Turn the read-only API Explorer into a fully interactive console (run
create/update/delete + regions, not just GET), and add a dedicated **SDK Playground**
page — both powered by one shared, enhanced server-side proxy that keeps API keys
server-side.

---

## 1. Background & motivation

The web app today has an **API Explorer** (`apps/web/src/components/api-explorer.tsx`,
catalog `apps/web/src/lib/api-explorer-endpoints.ts`, backend proxy
`packages/api/src/routers/domains/api-explorer.ts`) that can only **execute GET
endpoints**. Its server proxy `apiExplorer.sendRequest` builds a URL from path+query
params and forwards with the user's managed/raw API key; non-GET endpoints are
"docs-only" (a copy-paste curl block) because the proxy cannot send a request body.

The completed **TypeScript SDK** (`@locnative/sdk`) now exposes all 18 endpoints as
namespaced methods (`client.zones.create(...)`), but nothing in the web app lets a user
*run* the SDK or the non-GET endpoints interactively. This is the gap this work closes.

Both features need the same capability — **a proxy that can send POST/PUT/DELETE with a
JSON body** — so they are built on one shared foundation.

## 2. Decisions (locked)

- **Playground execution model:** server-proxied, SDK-flavored. The UI presents and
  documents SDK method calls and shows the equivalent SDK code, but the **Run** action
  routes through the existing `apiExplorer.sendRequest` proxy (managed key stays
  server-side). NOT live-SDK-in-browser (no key in browser, no CORS, no browser bundle).
- **Packaging:** one combined plan, three internal stages (A: enhanced proxy →
  B: interactive Explorer → C: SDK Playground).
- **Playground placement:** a **separate `/sdk-playground` route** under `_protected`
  with its own sidebar entry.
- **Write operations:** **full CRUD including DELETE**, with a **confirmation step before
  any destructive (DELETE) call**. The proxy only ever uses the user's own
  project-scoped key, so a DELETE only affects their own data — consistent with what the
  existing zones/webhooks dashboards already permit.
- **No new API endpoints.** Only the existing public surface is exposed.

## 3. Dependencies & sequencing (important)

This feature builds on two branches currently open against `feat/pricing-page`:
- **SDK completion** (`worktree-sdk-completion`): the Playground generates namespaced
  SDK snippets (`client.zones.create(...)`) that only exist once the completed SDK lands.
- **Region classification** (`worktree-region-classification`): the `/api/v1/regions`
  endpoint and its Explorer catalog entry. The Explorer/Playground can list `regions`
  but a live **Run** only succeeds where `/api/v1/regions` is deployed.

**Recommendation:** execute/merge this feature **after** those two PRs merge into
`feat/pricing-page`. The plan's base branch should contain both. If executed earlier,
Stage B/C still build, but running `regions` and copying namespaced SDK snippets assume
those merges.

## 4. Architecture — the shared enhanced proxy (Stage A)

### 4.1 Current proxy (what changes)
`api-explorer.ts` holds a local `endpointMap: Map<ApiEndpointId, {id, method:"GET", path,
params:[{name, pathParam?}]}>` and a `buildUrl(endpoint, paramValues)` that interpolates
path params and appends query params. The `sendRequest` oRPC input is
`{ authMode, endpointId, managedKeyId?, paramValues: Record<string,string>, rawApiKey? }`
and always issues `method: endpoint.method` (GET) with no body.

### 4.2 Enhancements
- **Param classification:** extend each `endpointMap` param descriptor to mark whether a
  param is a path param, a query param, or a **body field**:
  `{ name, in: "path" | "query" | "body" }` (default `query` for back-compat with
  existing GET entries; existing `pathParam: true` maps to `in: "path"`).
- **Non-GET allowlist:** add the non-GET endpoints to `endpointMap` with their real
  method and body-field descriptors: `zones.create` (POST), `zones.update` (PUT),
  `zones.delete` (DELETE), `webhooks.create` (POST), `webhooks.delete` (DELETE),
  `devices.location.push` (POST), `geocode.batch.submit` (POST), and **`regions.classify`
  (GET)**. (`webhooks.reactivate` POST has no body — include it; it is path-only.)
- **Body assembly:** add an optional `bodyValues: Record<string, unknown>` (or a raw
  `body?: unknown` JSON string the client parses) to the `sendRequest` input. The proxy
  builds the JSON body from the body-field params, and for non-GET requests sends it with
  `content-type: application/json` — mirroring the SDK's `createRequester` exactly.
- **Method:** the proxy issues `endpoint.method` (now possibly POST/PUT/DELETE). Empty/204
  responses are handled (return no body). Auth (managed/raw key resolution), usage
  recording, and the internal-auth headers are **unchanged**.
- **Safety:** the proxy still only proxies endpoints in its own allowlist; bodies are
  built only from declared body-field names (no arbitrary passthrough).

### 4.3 Catalog alignment
`api-explorer-endpoints.ts` already carries `method` and `exampleBody` per endpoint. Add
the missing `regions.classify` catalog entry (if not already present from the regions
branch) and ensure every non-GET endpoint declares its body params with types/examples so
the UI can render inputs and the proxy can validate names.

## 5. Stage B — Interactive Explorer

Frontend `api-explorer.tsx`:
- Replace `const isExecutable = endpoint.method === "GET"` with "is this endpoint in the
  executable allowlist?" — now true for the added non-GET endpoints too.
- **Body inputs:** for non-GET endpoints, render form fields for each body param (seeded
  from `exampleBody`/param metadata). A JSON-aware field for structured bodies (e.g. zone
  `geometry`) — a textarea validated as JSON with the example prefilled.
- **Send:** pass `bodyValues` (and existing `paramValues`) to `sendRequest`; render the
  live response (status, duration, JSON) exactly as today.
- **Destructive confirm:** before sending a `DELETE`, show a confirmation dialog naming
  the operation and target (e.g. "Delete zone 7? This cannot be undone."). Only proceed on
  explicit confirm.
- `regions` appears in the Explorer's grouped endpoint list and is runnable.

## 6. Stage C — SDK Playground

New route `apps/web/src/routes/_protected/sdk-playground.tsx` + a sidebar nav entry.
Components live under `apps/web/src/components/sdk-playground/`.

- **Method picker:** the namespaced SDK surface (`client.addresses.autocomplete`,
  `client.zones.create`, …) derived from the same endpoint catalog (each catalog entry maps
  to one SDK method — add a `sdkMethod` field, e.g. `"zones.create"`, to the catalog or a
  small mapping module).
- **Inputs:** reuse the Explorer's param-form + body-field + key-selector components
  (extract them into shared components if currently inline) — do not duplicate.
- **Code panel:** render the equivalent SDK snippet for the selected method + current
  inputs, e.g.:
  ```ts
  import { createLocnativeClient } from "@locnative/sdk";
  const client = createLocnativeClient({ apiKey: process.env.LOCNATIVE_API_KEY! });
  const result = await client.zones.create({ name: "depot", geometry: {…} });
  ```
- **Run:** executes via the same Stage-A `sendRequest` proxy and shows the result, so the
  Playground "runs" the call without a browser SDK bundle. Same destructive-confirm gate as
  the Explorer.

## 7. Testing

- **Proxy (Stage A)** — vitest in `packages/api`, mirroring existing api tests:
  `buildUrl`/body-assembly builds the right method + path + query + JSON body for a GET, a
  POST-with-body, a PUT, and a DELETE; unknown body-field names are ignored; the allowlist
  rejects unlisted endpoints.
- **Frontend (Stages B/C)** — the web app uses Testing Library + jsdom. Component tests:
  body-field rendering for a non-GET endpoint; the DELETE confirmation gate blocks the call
  until confirmed; the Playground code panel renders the correct snippet for a chosen
  method; the method picker lists all namespaced methods.
- No live-server/E2E required — the proxy is exercised via its oRPC handler with a mocked
  fetch, consistent with the existing api-explorer test approach.

## 8. Out of scope (this plan)

- Live-SDK-in-browser execution; CORS changes; a browser build of the SDK.
- Publishing the SDK; retries/backoff.
- Any new/changed API endpoints.
- Python (or other language) playground tabs.
- Persisting playground history/saved requests.

## 9. Risks & notes

- **Destructive ops on real data:** mitigated by the confirm gate + own-project-key scope.
  Document clearly in the UI that calls hit live data.
- **Catalog/SDK/proxy drift:** three lists (frontend catalog, proxy allowlist, SDK methods)
  must stay in sync. The SDK already has an endpoint-coverage guard test; consider a similar
  guard asserting the proxy allowlist ⊇ the executable catalog entries.
- **Large structured bodies** (GeoJSON geometry): handle via a JSON textarea with example +
  client-side `JSON.parse` validation before sending; surface parse errors inline.
- **Dependency ordering** (see §3): base on a branch containing the SDK-completion and
  region-classification work, or accept that `regions` runs and namespaced snippets assume
  those merges.
