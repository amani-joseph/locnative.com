# TypeScript SDK Completion — Design Spec

**Date:** 2026-06-07
**Status:** Approved (design), pending implementation plan
**Goal:** Extend `@locnative/sdk` from 4 addresses-only methods to **full coverage of all 18 public API endpoints**, organized as resource namespaces, hand-written (matching the existing dependency-free fetch client), with a real test suite. Stays private; no build/publish tooling in this slice.

---

## 1. Background & motivation

`packages/sdk` (`@locnative/sdk`, v0.1.0, private) is a clean, dependency-free,
runtime-agnostic fetch client, but only covers the **addresses** endpoints
(`autocomplete`, `nearby`, `reverse`, `getAddressById`). The public API has **18
endpoints** across addresses, geocoding/batch, zones, devices, webhooks, and the
newly added regions classification. A complete typed SDK is the most-cited gap vs
Radar/mappify after the regions work, and the cheapest high-leverage client effort
(builds directly on existing code).

This slice completes the **TypeScript server-side SDK only**. Other-language SDKs,
OpenAPI auto-generation, and mobile/on-device SDKs are separate future efforts.

## 2. Decisions (locked)

- **Hand-written**, extending the existing plain-`fetch` client (not OpenAPI-generated).
- **Resource namespaces** (`client.zones.create(...)`), Stripe/Radar-style.
- **Drop the current flat methods** entirely (unpublished v0.1.0, no real consumers) —
  no backward-compat aliases.
- **Tests included** (vitest, mock fetch). **Publish/build tooling deferred** (stays
  private, keeps exporting `./src/index.ts`).
- **Retries/backoff out of scope** for this slice (candidate for a later "harden" phase).

## 3. Existing pattern (preserved)

- `LocnativeClientConfig = { apiKey, baseUrl?, fetch?, headers? }` — runtime-agnostic.
- `createHeaders`: `accept: application/json`, `authorization: Bearer <apiKey>`,
  `x-locnative-sdk: js-ts/<sdkVersion> api/<apiVersion>`.
- `parseApiError`: maps `{ error: { code, message } }` → `LocnativeApiError`.
- Version consts in `types.ts` (`LOCNATIVE_API_VERSION`, `LOCNATIVE_SDK_VERSION`).

These are kept; the request helper and module layout are what change.

## 4. Core HTTP layer

New file `src/http.ts` holds the extracted + generalized core (config type,
`createHeaders`, `parseApiError`, and the request helper). The current helper is
GET-only:

```ts
// today
const request = async <T>(pathname, query?) => { ... fetch GET ... }
```

Generalize to support bodies and methods:

```ts
interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;                                  // may already include interpolated path params
  query?: Record<string, number | string | undefined>;
  body?: unknown;                                // JSON-serialized for non-GET
}
type Requester = <T>(opts: RequestOptions) => Promise<T>;
```

- GET: build query string via the existing `appendQueryValue` (skips `undefined`).
- POST/PUT/DELETE: `JSON.stringify(body)` with `content-type: application/json` when
  a body is present.
- Non-2xx → `parseApiError` → throw `LocnativeApiError` (unchanged behavior).
- 204/empty body → resolve `undefined` (for `delete`/`reactivate` style responses).

`createLocnativeClient` builds one `Requester` bound to config and passes it to each
resource factory.

## 5. Resource modules

One file per resource under `src/resources/`, each exporting a factory
`(request: Requester) => ({ ...methods })`, with its request/response **types
co-located** in the same file. Path params are interpolated by the method
(`/api/v1/zones/${id}`); query/body objects map 1:1 to the endpoint's params.

| File | Methods → endpoint |
|------|--------------------|
| `addresses.ts` | `autocomplete` → GET `/addresses/autocomplete`; `reverse` → GET `/addresses/reverse`; `nearby` → GET `/addresses/nearby`; `getById(id)` → GET `/addresses/{id}` |
| `geocode.ts` | `forward` → GET `/addresses/geocode`; `batch.submit` → POST `/geocode/batch`; `batch.poll(jobId)` → GET `/geocode/batch/{jobId}`; `batch.results(jobId)` → GET `/geocode/batch/{jobId}/results` |
| `zones.ts` | `create` → POST `/zones`; `list` → GET `/zones` (page,limit); `get(id)` → GET `/zones/{id}`; `update(id,...)` → PUT `/zones/{id}`; `delete(id)` → DELETE `/zones/{id}`; `contains` → GET `/zones/contains`; `addresses(id,...)` → GET `/zones/{id}/addresses` (page,limit) |
| `devices.ts` | `pushLocation(deviceId,...)` → POST `/devices/{deviceId}/location`; `zones(deviceId)` → GET `/devices/{deviceId}/zones` |
| `webhooks.ts` | `create` → POST `/webhooks`; `list` → GET `/webhooks`; `delete(id)` → DELETE `/webhooks/{id}`; `reactivate(id)` → POST `/webhooks/{id}/reactivate` |
| `regions.ts` | `classify` → GET `/api/v1/regions` (lat,lng,layers?) |

All paths are prefixed `/api/v1/...` (the table abbreviates). Total: 22 methods.

**Type source of truth:** the oRPC handler return shapes in `packages/api/src/routers`.
Types are hand-written to mirror those; a coverage test (§7) guards against drift.

## 6. Client assembly

`src/client.ts` composes the namespaces:

```ts
export const createLocnativeClient = (config): LocnativeClient => {
  const request = createRequester(config);   // from http.ts
  return {
    addresses: createAddresses(request),
    geocode:   createGeocode(request),
    zones:     createZones(request),
    devices:   createDevices(request),
    webhooks:  createWebhooks(request),
    regions:   createRegions(request),
  };
};
```

`LocnativeClient` becomes an interface of the six namespace interfaces. `src/index.ts`
remains the package's public barrel, re-exporting `createLocnativeClient`,
`LocnativeApiError`, the version consts, and all public request/response types.
`errors.ts` is unchanged.

Usage:
```ts
const client = createLocnativeClient({ apiKey: "wh_..." });
await client.regions.classify({ lat: -37.8136, lng: 144.9631 });
await client.zones.create({ name: "depot", geometry: {...} });
```

## 7. Testing (vitest)

- **Per-resource tests** (`src/resources/*.test.ts`): inject a mock `fetch` via
  `config.fetch` that captures the `Request` (method, URL, headers, body) and returns
  a canned `Response`. Assert each method builds the correct request and parses the
  response. Include at least one error case asserting a non-2xx body becomes a
  `LocnativeApiError` with the right `code`/`message`.
- **Coverage test** (`src/coverage.test.ts`): a hard-coded list of all 18 endpoint
  paths; assert every one is exercised by a client method (e.g. by walking the mock
  client and collecting requested URLs). Fails if a future endpoint is added without
  an SDK method — the anti-drift guard.
- Tests must not require a live server or env vars (pure mock fetch).

## 8. Loose ends

- Update the SDK usage examples in `apps/web/src/components/docs-page.tsx` (the only
  internal reference) to the new namespaced API.
- Bump `LOCNATIVE_SDK_VERSION` to reflect the expanded surface (e.g. `0.2.0-preview`).

## 9. Out of scope (this slice)

- npm build/publish tooling (dist JS + `.d.ts`, package `exports`/`types`/`files`,
  README, release workflow).
- Retries / backoff / rate-limit handling.
- Async-iterator auto-pagination (methods expose `page`/`limit` only).
- OpenAPI auto-generation; other-language SDKs; mobile/on-device SDKs.

## 10. Risks & notes

- **Type drift:** hand-written types can lag the API. Mitigated by the coverage test
  and by keeping types co-located per resource. A future OpenAPI-generation phase can
  replace hand-typing if drift becomes painful.
- **POST/body support is new** to the request helper — the zones/devices/webhooks/batch
  methods are the first non-GET calls; tests must cover body serialization + content-type.
- **docs-page.tsx** also edited by the open regions PR; a trivial merge may be needed
  when both land (different regions of the file).
