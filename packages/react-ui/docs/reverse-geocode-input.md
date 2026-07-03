# ReverseGeocodeInput

## Summary

Resolves a `latitude`/`longitude` pair to the nearest address (reverse geocoding). No request is made until both coordinates are non-null.

## When to use / when not

**Use it when:**

- You have coordinates (e.g. from a GPS fix, map click, or device location) and need the human-readable address for display or storage.
- You want a lightweight read-only address display that reacts to changing coordinates.
- You need to react to the resolved address (e.g. prefill a form field, log the location label, show the nearest street address).

**Don't use it when:**

- You need the user to type and search interactively in a single input — use `AddressAutocomplete` instead (it handles debounce, suggestions, and selection in one component).
- You have a text query and want coordinates — use `ForwardGeocodeInput` instead.
- You need editable address fields — wire your own inputs to `useReverseGeocode` directly.

## Import & minimal example

```tsx
import { createLocnativeClient } from "@locnative/sdk";
import { ReverseGeocodeInput } from "@locnative/react-ui";

const client = createLocnativeClient({ apiKey: "..." });

function MyComponent() {
  const [coords, setCoords] = React.useState<{
    lat: number | null;
    lng: number | null;
  }>({ lat: null, lng: null });

  return (
    <ReverseGeocodeInput
      client={client}
      latitude={coords.lat}
      longitude={coords.lng}
      onResult={(r) => console.log(r.address, r.distance)}
    />
  );
}
```

## Worked examples

### 1. Show address when user clicks a map

```tsx
const [lat, setLat] = React.useState<number | null>(null);
const [lng, setLng] = React.useState<number | null>(null);
const [label, setLabel] = React.useState<string>("");

// Imagine mapInstance.on("click", ...) sets lat/lng
<ReverseGeocodeInput
  client={client}
  latitude={lat}
  longitude={lng}
  onResult={(r) => setLabel(r.address ?? "Unknown location")}
  placeholder="Click the map to resolve an address"
/>
<p>Selected: {label || "—"}</p>
```

### 2. Display distance alongside the resolved address

```tsx
const [distance, setDistance] = React.useState<number | null>(null);

<ReverseGeocodeInput
  client={client}
  latitude={-27.4698}
  longitude={153.0251}
  onResult={(r) => setDistance(r.distance)}
/>
{distance !== null && (
  <p>Distance from nearest address: {distance.toFixed(1)} m</p>
)}
```

### 3. Hold the request until both coordinates are available

Pass `null` for either coordinate to suppress the network request entirely. The component renders its placeholder until a valid pair arrives:

```tsx
<ReverseGeocodeInput
  client={client}
  latitude={gpsReady ? lat : null}
  longitude={gpsReady ? lng : null}
  onResult={handleResult}
  placeholder="Waiting for GPS fix…"
/>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `client` | `LocnativeClient` | **Required** | SDK client created with `createLocnativeClient`. |
| `latitude` | `number \| null` | **Required** | Latitude to reverse-geocode. `null` suppresses the request. |
| `longitude` | `number \| null` | **Required** | Longitude to reverse-geocode. `null` suppresses the request. |
| `onResult` | `(r: { address: string \| null; distance: number \| null }) => void` | — | Called whenever the resolved address changes. Both fields are `null` when no result is available. |
| `placeholder` | `string` | `"Address will appear here"` | Placeholder text for the read-only display input. |
| `id` | `string` | — | `id` forwarded to the input element. |
| `className` | `string` | — | Additional CSS class applied to the input element. |
| `disabled` | `boolean` | `false` | Disables the input. |

> **Null-coordinate handling:** No geocode request is made until **both** `latitude` and `longitude` are non-null. The component renders its placeholder while either coordinate is `null`.

## Accessibility

- The component renders a native `<input type="text" readOnly>` — screen readers announce it as a text field with the current value.
- Supply a visible `<label>` or `aria-label` / `aria-labelledby` targeting the `id` prop so assistive technologies identify the field.
- The `disabled` prop produces the standard disabled input state, which is communicated to screen readers automatically.
- Because the input is read-only, keyboard users cannot accidentally modify the displayed value.

## Recipes & edge cases

- **Both coordinates must be non-null:** If either `latitude` or `longitude` is `null`, no request is fired and the input shows the placeholder. Use this deliberately to gate the request on GPS availability or user interaction.
- **`onResult` on every render cycle:** `onResult` is called inside a `useEffect` that runs whenever the resolved data changes. If you pass an inline callback, wrap it in `useCallback` to avoid firing on every parent render.
- **All-null result:** When reverse geocoding returns no match, `onResult` is still called with `{ address: null, distance: null }`. Guard against nulls before using the values.
- **`address` is `formattedAddress` from the API:** The `address` field in `onResult` is the formatted address string from the nearest result (or `null` if unavailable). It is also what the read-only input displays.
- **`distance` is in metres:** The `distance` field reports how far the resolved address is from the supplied coordinates, in metres.
