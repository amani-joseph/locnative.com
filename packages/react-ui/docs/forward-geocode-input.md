# ForwardGeocodeInput

## Summary

Resolves a free-text address string to coordinates (forward geocoding) as the `query` prop changes. Controlled: the parent owns `query` and receives geocode results via `onResult`. Renders a read-only display input showing the resolved `latitude, longitude` pair.

## When to use / when not

**Use it when:**

- You have a text query (from a search box, form field, or programmatic source) and need the corresponding coordinates without building your own geocode loop.
- You want a lightweight read-only coordinate display driven by an external input.
- You need to react to resolved coordinates (e.g. drop a map pin, store lat/lng alongside a form submission).

**Don't use it when:**

- You need the user to type and search interactively in a single input — use `AddressAutocomplete` instead (it handles debounce, suggestions, and selection in one component).
- You have coordinates and want the human-readable address — use `ReverseGeocodeInput` instead.
- You need editable lat/lng fields — wire your own inputs to `useForwardGeocode` directly.

## Import & minimal example

```tsx
import { createLocnativeClient } from "@locnative/sdk";
import { ForwardGeocodeInput } from "@locnative/react-ui";

const client = createLocnativeClient({ apiKey: "..." });

function MyComponent() {
  const [query, setQuery] = React.useState("");

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ForwardGeocodeInput
        client={client}
        query={query}
        onResult={(r) => console.log(r.latitude, r.longitude)}
      />
    </>
  );
}
```

## Worked examples

### 1. Store resolved coordinates on form submit

```tsx
const [query, setQuery] = React.useState("");
const [coords, setCoords] = React.useState<{
  lat: number | null;
  lng: number | null;
}>({ lat: null, lng: null });

<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter address" />
<ForwardGeocodeInput
  client={client}
  query={query}
  onResult={(r) => setCoords({ lat: r.latitude, lng: r.longitude })}
  placeholder="Resolved coordinates"
/>
```

### 2. Debounce the query to reduce API requests

The component fires a geocode request on every `query` change. If `query` comes from a fast-changing input (e.g. keystrokes), debounce before passing to `query`:

```tsx
// Replace with your preferred debounce hook (e.g. `use-debounce`).
import { useDebouncedValue } from "your-debounce-hook";

const [raw, setRaw] = React.useState("");
const debouncedQuery = useDebouncedValue(raw, 300);

<input value={raw} onChange={(e) => setRaw(e.target.value)} />
<ForwardGeocodeInput client={client} query={debouncedQuery} onResult={handleResult} />
```

### 3. Skip geocoding when query is empty

Pass `query={null}` (or an empty string) to suppress the network request entirely:

```tsx
<ForwardGeocodeInput client={client} query={query || null} onResult={handleResult} />
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `client` | `LocnativeClient` | **Required** | SDK client created with `createLocnativeClient`. |
| `query` | `string \| null` | **Required** | Address text to geocode. `null` or empty string skips the request. |
| `onResult` | `(r: { latitude: number \| null; longitude: number \| null; formattedAddress: string \| null }) => void` | — | Called whenever the resolved result changes. All fields are `null` when no result is available. |
| `placeholder` | `string` | `"Coordinates will appear here"` | Placeholder text for the read-only display input. |
| `id` | `string` | — | `id` forwarded to the input element. |
| `className` | `string` | — | Additional CSS class applied to the input element. |
| `disabled` | `boolean` | `false` | Disables the input. |

> **Controlled component:** `ForwardGeocodeInput` does not own `query`. Your component must supply and update it. The component only renders the resolved coordinate string; it does not accept user typing.

## Accessibility

- The component renders a native `<input type="text" readOnly>` — screen readers announce it as a text field with the current value.
- Supply a visible `<label>` or `aria-label` / `aria-labelledby` targeting the `id` prop so assistive technologies identify the field.
- The `disabled` prop produces the standard disabled input state, which is communicated to screen readers automatically.
- Because the input is read-only, keyboard users cannot accidentally modify the displayed value.

## Recipes & edge cases

- **`null` query = no request:** Pass `query={null}` to explicitly suppress geocoding (e.g. before the user has typed anything). An empty string `""` also produces no result.
- **Debouncing the query:** The component fires on every `query` change. Debounce upstream (e.g. 300 ms) if `query` comes from keystroke events to avoid excessive API calls.
- **`onResult` on every render cycle:** `onResult` is called inside a `useEffect` that runs whenever the resolved `data` changes. If you pass an inline callback, wrap it in `useCallback` to avoid firing on every parent render.
- **All-null result:** When the geocode fails or returns no match, `onResult` is still called with `{ latitude: null, longitude: null, formattedAddress: null }`. Guard against nulls before using the values.
- **Display format:** The component renders `"lat.toFixed(4), lng.toFixed(4)"` in the input. If you need raw numeric values, consume them from the `onResult` callback instead.
