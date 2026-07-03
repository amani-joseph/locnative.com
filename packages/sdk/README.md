# @locnative/sdk

Official TypeScript SDK for the [Locnative](https://locnative.com) location API —
geocoding, geofencing zones, device tracking, routing, and webhooks over
authoritative open address data.

> **Coverage:** International — authoritative open address datasets including
> Australia (G‑NAF), the United States, Canada, and parts of Europe. Per-country
> depth and freshness vary by source; routing coverage is currently Australia only.

- **Dependency-free** and runtime-agnostic (Node, edge, browser) — built on `fetch`.
- **Fully typed**, resource-namespaced surface (`client.zones.create(...)`).
- **Resilient by default**: automatic retries with backoff, per-request timeouts,
  `AbortSignal` support, and idempotent writes.

**[Interactive API Explorer →](https://api.locnative.com/api/v1/openapi.json)**
_(Paste the URL into [Swagger UI](https://editor.swagger.io) or [Hoppscotch](https://hoppscotch.io) to explore all endpoints interactively.)_

## Install

```sh
npm install @locnative/sdk
# or: pnpm add @locnative/sdk · yarn add @locnative/sdk
```

Requires Node.js 18+ (or any runtime with a global `fetch`).

## Quickstart (60 seconds)

```ts
import { createLocnativeClient } from "@locnative/sdk";

const client = createLocnativeClient({
  apiKey: process.env.LOCNATIVE_API_KEY!,
});

// Classify a coordinate into official ABS/ASGS regions
const regions = await client.regions.classify({
  lat: -37.8136,
  lng: 144.9631,
});

// Autocomplete an address
const { results } = await client.addresses.autocomplete({ q: "123 collins st" });

// Create a geofence zone
const zone = await client.zones.create({
  name: "Melbourne CBD depot",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [144.95, -37.82],
        [144.97, -37.82],
        [144.97, -37.8],
        [144.95, -37.8],
        [144.95, -37.82],
      ],
    ],
  },
});
```

## Resources

| Namespace | Methods |
|---|---|
| `client.addresses` | `autocomplete`, `getById`, `nearby`, `reverse` |
| `client.geocode` | `forward`, `batch.submit`, `batch.poll`, `batch.results` |
| `client.zones` | `create`, `list`, `get`, `update`, `delete`, `contains`, `addresses` |
| `client.devices` | `pushLocation`, `zones` |
| `client.webhooks` | `create`, `list`, `delete`, `reactivate` |
| `client.regions` | `classify` |
| `client.routing` | `directions`, `matrix`, `isochrone` |

## Configuration

```ts
const client = createLocnativeClient({
  apiKey: "wh_...",          // required
  baseUrl: "https://api.locnative.com", // optional override
  maxRetries: 2,              // optional, default 2
  timeoutMs: 30_000,          // optional, default 30s
  fetch: customFetch,         // optional fetch implementation
  headers: { "x-app": "..." } // optional default headers
});
```

| Option | Default | Description |
|---|---|---|
| `apiKey` | — | Your Locnative API key (`wh_...`). Required. |
| `baseUrl` | `https://api.locnative.com` | API origin override. |
| `maxRetries` | `2` | Automatic retries for transient failures (429/5xx/network/timeout). |
| `timeoutMs` | `30000` | Per-request timeout. |
| `fetch` | `globalThis.fetch` | Custom `fetch` implementation. |
| `headers` | — | Default headers added to every request. |

### Per-request options

Every method accepts an optional trailing `options` argument to override the client
defaults for a single call:

```ts
await client.addresses.autocomplete(
  { q: "123 collins st" },
  { timeoutMs: 5000, signal: AbortSignal.timeout(5000) }
);

// Writes auto-attach an Idempotency-Key; supply your own to dedupe explicitly:
await client.zones.create(zoneBody, { idempotencyKey: "order-42" });
```

## Resilience

- **Retries** transient failures (HTTP `408/425/429/500/502/503/504`, network errors,
  and timeouts) up to `maxRetries`, using exponential backoff with full jitter
  (200 ms base, 5 s cap). A `Retry-After` response header is honoured when present.
- **Idempotent writes**: `POST`/`PUT` calls automatically send an `Idempotency-Key`
  header so retries are safe. Pass `options.idempotencyKey` to control it.
- **Timeouts & cancellation**: each request times out after `timeoutMs`; pass
  `options.signal` to cancel a call yourself.

## Error handling

Failed requests reject with a `LocnativeApiError`:

```ts
import { LocnativeApiError } from "@locnative/sdk";

try {
  await client.zones.get(999);
} catch (err) {
  if (err instanceof LocnativeApiError) {
    err.status;     // HTTP status (e.g. 404)
    err.code;       // machine code (e.g. "not_found")
    err.message;    // human-readable message
    err.requestId;  // correlation id for support, if provided
    err.docUrl;     // link to error docs, if provided
    err.fields;     // field-level validation detail, if provided
  }
}
```

## Rate Limits

| Plan       | Requests / minute | Requests / month |
|------------|-------------------|-----------------|
| Free       | 60                | 10,000          |
| Starter    | 300               | 100,000         |
| Pro        | 1,000             | 1,000,000       |
| Enterprise | Custom            | Custom          |

When you exceed the rate limit, the API returns `429 Too Many Requests` with error code `rate_limited`. The `Retry-After` response header contains the number of seconds to wait.

```ts
import { LocnativeApiError } from "@locnative/sdk";

try {
  const result = await client.geocode.forward({ q: "Sydney Opera House" });
} catch (e) {
  if (e instanceof LocnativeApiError && e.code === "rate_limited") {
    const retryAfter = e.response?.headers.get("retry-after");
    console.log(`Rate limited. Retry after ${retryAfter}s`);
  }
}
```

## Migrating from Google Places API

| Google Places                                    | Locnative equivalent                               |
|--------------------------------------------------|-----------------------------------------------------|
| `PlacesService.findPlaceFromQuery()`             | `client.geocode.forward({ q })`                     |
| `AutocompleteService.getPlacePredictions()`      | `client.addresses.autocomplete({ q })`              |
| `Geocoder.geocode({ location })`                 | `client.addresses.reverse({ lat, lng })`            |
| `places.nearbySearch()`                          | `client.addresses.nearby({ lat, lng, radius })`     |

**Key differences:**

- **Authoritative data:** Locnative builds on official open address sources per country — e.g. G-NAF (Australia's address register maintained by PSMA Australia, matching Australia Post/ABS records), Overture, and OpenAddresses elsewhere — rather than crowdsourced points.
- **Structured components:** Every address includes `streetNumber`, `streetName`, `streetType`, `locality`, `state`, `postcode` as first-class fields — no parsing needed. (Some fields, e.g. `state`, are empty for countries that don't use them.)
- **No session tokens:** Autocomplete billing is per-call. No session token complexity.
- **Unique identifiers:** Each address has a stable `id`; Australian addresses also carry a `gnafPid` (G-NAF Persistent Identifier) for cross-system referencing.

## License

MIT — © Locnative.
