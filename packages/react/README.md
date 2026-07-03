# @locnative/react

React hooks for the [Locnative](https://locnative.com) location API — address autocomplete, reverse geocoding, and geofence detection with built-in debouncing, cancellation, and loading/error state.

[![npm](https://img.shields.io/npm/v/@locnative/react)](https://www.npmjs.com/package/@locnative/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Requirements

| Peer dependency    | Version  |
|--------------------|----------|
| `react`            | `>= 18`  |
| `@locnative/sdk`  | `>= 0.4.1` |

---

## Installation

```bash
# npm
npm install @locnative/react @locnative/sdk

# pnpm
pnpm add @locnative/react @locnative/sdk

# yarn
yarn add @locnative/react @locnative/sdk
```

---

## Quick start

All hooks accept a `LocnativeClient` instance as their first argument. Create one with your publishable API key from the [Locnative dashboard](https://locnative.com/dashboard).

```ts
import { createLocnativeClient } from "@locnative/sdk";

const client = createLocnativeClient({
  apiKey: "pk_live_...", // publishable key — safe in browser
});
```

> Use a **publishable key** (`pk_live_…`) in browser code. Secret keys must stay server-side only.

> **Keep a stable client reference.** Create the client once — at module scope or
> with `useMemo` — and reuse it. The hooks list `client` in their effect
> dependencies, so passing a freshly-created client on every render restarts the
> request (and debounce) each render.
>
> ```tsx
> const client = useMemo(() => createLocnativeClient({ apiKey }), [apiKey]);
> ```

---

## Hooks

### `useAutocomplete`

Type-ahead address search with automatic debouncing and in-flight request cancellation.

```tsx
import { useAutocomplete } from "@locnative/react";

function AddressSearch({ client }) {
  const { query, setQuery, results, loading, error } = useAutocomplete(client, {
    debounceMs: 300, // default — waits 300ms after last keystroke
    limit: 5,        // max results to return
    country: "AU",   // optional ISO 3166-1 alpha-2 country filter
    state: "QLD",    // optional state/region filter
  });

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing an address..."
      />
      {loading && <p>Searching…</p>}
      {error && <p>Error: {error.message}</p>}
      <ul>
        {results.map((r) => (
          <li key={r.id}>{r.formattedAddress}</li>
        ))}
      </ul>
    </div>
  );
}
```

#### Signature

```ts
function useAutocomplete(
  client: LocnativeClient,
  options?: UseAutocompleteOptions
): UseAutocompleteResult
```

#### `UseAutocompleteOptions`

| Option             | Type                            | Default | Description                                          |
|--------------------|---------------------------------|---------|------------------------------------------------------|
| `debounceMs`       | `number`                        | `300`   | Milliseconds to wait after last keystroke            |
| `minLength`        | `number`                        | `2`     | Minimum trimmed query length before a request fires (the API requires `q` ≥ 2) |
| `limit`            | `number`                        | —       | Maximum number of suggestions to return              |
| `country`          | `string`                        | —       | ISO 3166-1 alpha-2 country code filter (e.g. `"AU"`) |
| `state`            | `string`                        | —       | State or region name filter                          |
| `lat` / `lng`      | `number`                        | —       | Bias results toward a coordinate (proximity)         |
| `sessionToken`     | `string`                        | —       | Groups a run of keystrokes into one billable search (see `newSessionToken()`) |
| `keepPreviousData` | `boolean`                       | `false` | Keep previous results visible while the next search loads (avoids dropdown flicker) |
| `cache`            | `{ storage; ttlMs?: number }`   | —       | Opt-in client cache, e.g. `{ storage: sessionStorage, ttlMs: 60_000 }` |

#### `UseAutocompleteResult`

| Field         | Type                   | Description                                       |
|---------------|------------------------|---------------------------------------------------|
| `query`       | `string`               | Current search string                             |
| `setQuery`    | `(q: string) => void`  | Stable setter — safe to pass directly to `onChange` |
| `results`     | `AddressSuggestion[]`  | Matching address suggestions                      |
| `status`      | `"idle" \| "loading" \| "success" \| "empty" \| "error"` | Coarse state machine for rendering |
| `loading`     | `boolean`              | `true` while a request is in flight               |
| `rateLimited` | `boolean`              | `true` when the last request was rejected with HTTP 429 |
| `error`       | `Error \| null`        | Last error, or `null`                             |
| `reset`       | `() => void`           | Clear the query, results, and any in-flight request |

**Behaviour notes:**
- Queries shorter than `minLength` (default 2) never fire a request.
- Empty or whitespace-only query immediately clears results without firing a request.
- Each new keystroke cancels the previous pending request via `AbortController`.
- `setQuery` is memoised with `useCallback` — it will not cause unnecessary re-renders.

---

### `useCombobox`

Headless [WAI-ARIA combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
helpers for an accessible autocomplete dropdown — keyboard navigation
(↑/↓/Home/End/Enter/Esc, with wrapping) and ARIA wiring. Bring your own markup;
pair it with `useAutocomplete`.

```tsx
import { useAutocomplete, useCombobox } from "@locnative/react";

function AddressCombobox({ client }) {
  const { query, setQuery, results } = useAutocomplete(client);
  const { getInputProps, getListboxProps, getItemProps, activeIndex } =
    useCombobox({
      id: "address",
      count: results.length,
      onSelect: (i) => setQuery(results[i]?.formattedAddress ?? ""),
    });

  return (
    <>
      <input
        {...getInputProps()}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul {...getListboxProps()}>
        {results.map((r, i) => (
          <li key={r.id} {...getItemProps(i)} data-active={i === activeIndex}>
            {r.formattedAddress}
          </li>
        ))}
      </ul>
    </>
  );
}
```

`getInputProps()` / `getListboxProps()` / `getItemProps(index)` return the
`role`, `aria-*`, and event handlers for each element. The pure building blocks
(`comboboxReducer`, `keyToAction`, `buildInputProps`/`buildListboxProps`/`buildItemProps`)
are also exported for advanced use.

---

### `useReverseGeocode`

Resolves a latitude/longitude coordinate to the nearest address. Pass `null` to reset.

```tsx
import { useReverseGeocode } from "@locnative/react";

function NearestAddress({ client, userLocation }) {
  // userLocation: { lat: number; lng: number } | null
  const { address, distance, loading, error } = useReverseGeocode(client, userLocation);

  if (loading) return <p>Locating…</p>;
  if (error)   return <p>Error: {error.message}</p>;
  if (!address) return <p>No location set</p>;

  return (
    <div>
      <p>{address.formattedAddress}</p>
      <p>{distance != null ? `${distance.toFixed(0)}m away` : ""}</p>
    </div>
  );
}
```

#### Signature

```ts
function useReverseGeocode(
  client: LocnativeClient,
  coords: LatLng | null
): UseReverseGeocodeResult
```

#### `LatLng`

```ts
interface LatLng {
  lat: number;
  lng: number;
}
```

#### `UseReverseGeocodeResult`

| Field      | Type                          | Description                                  |
|------------|-------------------------------|----------------------------------------------|
| `address`  | `ReverseGeocodeAddress \| null` | Nearest address, or `null` if not yet resolved |
| `distance` | `number \| null`              | Distance in metres from `coords` to `address` |
| `loading`  | `boolean`                     | `true` while a request is in flight          |
| `error`    | `Error \| null`               | Last error, or `null`                        |

**Behaviour notes:**
- Passing `null` as `coords` immediately resets `address` and `distance` to `null` without firing a request.
- The effect re-runs only when `coords.lat` or `coords.lng` changes — passing a new object reference with the same values does **not** re-fetch.
- In-flight requests are cancelled on unmount or when `coords` changes.

---

### `useZoneContains`

Returns all geofence zones that contain a given coordinate. Useful for entry/exit detection, location-gating, and proximity-based UI.

```tsx
import { useZoneContains } from "@locnative/react";

function ZoneStatus({ client, userLocation }) {
  const { zones, loading, error } = useZoneContains(client, userLocation);

  if (loading) return <p>Checking zones…</p>;
  if (error)   return <p>Error: {error.message}</p>;

  return (
    <div>
      {zones.length === 0 ? (
        <p>Not inside any zone</p>
      ) : (
        <ul>
          {zones.map((z) => (
            <li key={z.id}>{z.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

#### Signature

```ts
function useZoneContains(
  client: LocnativeClient,
  coords: LatLng | null
): UseZoneContainsResult
```

#### `UseZoneContainsResult`

| Field     | Type              | Description                              |
|-----------|-------------------|------------------------------------------|
| `zones`   | `ZoneRecord[]`    | Zones that contain `coords`              |
| `loading` | `boolean`         | `true` while a request is in flight      |
| `error`   | `Error \| null`   | Last error, or `null`                    |

**Behaviour notes:**
- Passing `null` as `coords` immediately clears `zones` without firing a request.
- Same coordinate-stability semantics as `useReverseGeocode` — object identity is ignored, only `lat`/`lng` values matter.
- In-flight requests are cancelled on unmount or when `coords` changes.

---

### Routing hooks — `useDirections` / `useMatrix` / `useIsochrone`

Fetch routing results that re-run when their params change and abort the previous
request. Pass `null` params to stay idle. Each returns `{ data, loading, error }`.

```tsx
import { useDirections } from "@locnative/react";

function Route({ client }) {
  const { data, loading, error } = useDirections(client, {
    from: "-33.865,151.209",
    to: "-33.8,151.0",
    profile: "driving", // "driving" | "walking" | "cycling"
  });

  if (loading) return <p>Routing…</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <p>{data ? `${data.distance_m} m, ${data.duration_s} s` : null}</p>;
}
```

- `useMatrix(client, { sources, destinations, profile? } | null)` — duration/distance matrix.
- `useIsochrone(client, { origin, durationSeconds | distanceMeters, profile? } | null)` — reachability polygon.

---

## Using the browser Geolocation API

A common pattern — combine the browser's `navigator.geolocation` with these hooks:

```tsx
import { useState, useEffect } from "react";
import { useReverseGeocode, useZoneContains, type LatLng } from "@locnative/react";

function LocationAwareComponent({ client }) {
  const [coords, setCoords] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      console.error,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const { address } = useReverseGeocode(client, coords);
  const { zones }   = useZoneContains(client, coords);

  return (
    <div>
      <p>Address: {address?.formattedAddress ?? "Locating…"}</p>
      <p>Zones: {zones.map((z) => z.name).join(", ") || "None"}</p>
    </div>
  );
}
```

---

## TypeScript

All hooks and their option/result types are exported:

```ts
import type {
  LatLng,
  UseAutocompleteOptions,
  UseAutocompleteResult,
  UseReverseGeocodeResult,
  UseZoneContainsResult,
} from "@locnative/react";
```

The package ships with bundled type declarations (`.d.ts` and `.d.cts`) for both ESM and CJS consumers.

---

## Bundle formats

| Format | Entry                   | Use case              |
|--------|-------------------------|-----------------------|
| ESM    | `dist/index.js`         | Bundlers (Vite, Next) |
| CJS    | `dist/index.cjs`        | Node / Jest           |

---

## License

[MIT](./LICENSE) © Joseph Amani
