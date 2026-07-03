# AddressAutocomplete

## Summary

Accessible (WAI-ARIA combobox), debounced address search with keyboard navigation, proximity bias, session tokens, i18n strings, and customizable render slots. Provide a `client` created with `createLocnativeClient`.

## When to use / when not

**Use it when:**

- You need a freeform "start typing an address" search box backed by the Locnative
  autocomplete API (checkout forms, shipping address capture, location search).
- You want built-in keyboard navigation (arrow keys, enter, escape) and ARIA semantics
  without wiring up a combobox yourself.
- You want to bias results toward the user's location (geolocation or explicit lat/lng).

**Don't use it when:**

- You need a labelled form field with built-in error styling — use `AddressFormField`,
  which wraps this component with a `<label>` and error text.
- You're editing an already-known, structured address (street/suburb/state/postcode) —
  use `AddressFieldGroup` instead.
- You only need to resolve free text to coordinates without a suggestion dropdown — use
  `ForwardGeocodeInput`.

## Import & minimal example

```tsx
import { createLocnativeClient } from "@locnative/sdk";
import { AddressAutocomplete } from "@locnative/react-ui";
import "@locnative/react-ui/styles.css";

const client = createLocnativeClient({ apiKey: import.meta.env.VITE_LOCNATIVE_KEY });

export function Checkout() {
  return (
    <AddressAutocomplete
      client={client}
      placeholder="Start typing an address…"
      onSelect={(address) => console.log(address.formattedAddress)}
    />
  );
}
```

## Worked examples

### 1. Controlled selection state

`AddressAutocomplete` manages its own input text internally; there is no `value` prop.
To keep the *selected* address as state in your component, store it from `onSelect` and
track the raw query text (if you need it) via `onQueryChange`:

```tsx
function DeliveryAddress() {
  const [selected, setSelected] = useState<AddressWithParsed | null>(null);
  const [query, setQuery] = useState("");

  return (
    <div>
      <AddressAutocomplete
        client={client}
        onQueryChange={setQuery}
        onSelect={(address) => setSelected(address)}
        placeholder="Delivery address"
      />
      {selected && (
        <p>
          Selected: {selected.streetAddress}, {selected.suburb} {selected.state}{" "}
          {selected.postcode}
        </p>
      )}
    </div>
  );
}
```

### 2. TanStack Form wiring

Wire `onSelect` to a TanStack Form field's `setValue`, and surface field validation
errors via the `error` prop:

```tsx
import { useForm } from "@tanstack/react-form";

function AddressFormExample() {
  const form = useForm({
    defaultValues: { address: null as AddressWithParsed | null },
  });

  return (
    <form.Field name="address">
      {(field) => (
        <AddressAutocomplete
          client={client}
          placeholder="Shipping address"
          onSelect={(address) => field.handleChange(address)}
          error={field.state.meta.errors?.[0]}
          required
        />
      )}
    </form.Field>
  );
}
```

### 3. Geolocation / proximity bias

Enable browser geolocation to bias suggestions toward the user's current position, or
pass explicit coordinates (e.g. from a previously selected map pin) instead:

```tsx
// Browser geolocation
<AddressAutocomplete client={client} enableGeolocation onSelect={setAddress} />

// Explicit proximity (e.g. a map center), skips the geolocation prompt
<AddressAutocomplete
  client={client}
  userLat={-33.8688}
  userLng={151.2093}
  onSelect={setAddress}
/>
```

`userLat`/`userLng` take precedence over `enableGeolocation` when both are provided.

### 4. Custom suggestion renderer

Replace the default street/suburb row with your own markup. `renderSuggestion` receives
the parsed `AddressWithParsed` result and whether it's the currently keyboard-active row:

```tsx
<AddressAutocomplete
  client={client}
  onSelect={setAddress}
  renderSuggestion={(address, isActive) => (
    <span style={{ fontWeight: isActive ? 700 : 400 }}>
      📍 {address.formattedAddress}
    </span>
  )}
/>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `client` | `LocnativeClient` | — | **Required.** SDK client created with `createLocnativeClient`. |
| `onSelect` | `(address: AddressWithParsed) => void` | — | Called when a suggestion is selected. |
| `onQueryChange` | `(query: string) => void` | — | Called as the input text changes. |
| `placeholder` | `string` | — | Input placeholder text. |
| `debounceMs` | `number` | `300` | Debounce in ms before querying the API. |
| `minCharsToSearch` | `number` | `2` | Minimum characters typed before searching. |
| `maxSuggestions` | `number` | `5` | Maximum number of suggestions to show. |
| `enableGeolocation` | `boolean` | `false` | Use the browser's geolocation to bias results by proximity. |
| `userLat` | `number` | — | Explicit latitude for proximity bias (instead of geolocation). |
| `userLng` | `number` | — | Explicit longitude for proximity bias (instead of geolocation). |
| `sessionToken` | `string` | — | Group a run of keystrokes into one billable search (see SDK `newSessionToken()`). |
| `disabled` | `boolean` | — | Disable the input. |
| `required` | `boolean` | — | Mark the input as required. |
| `error` | `string` | — | External error message to display. |
| `id` | `string` | `"locnative-autocomplete"` | id forwarded to the input element. |
| `className` | `string` | — | Class applied to the root container. |
| `i18nStrings` | `Partial<AddressI18nStrings>` | — | Override built-in UI strings (no results, retry, etc.). |
| `renderSuggestion` | `(address: AddressWithParsed, isActive: boolean) => ReactNode` | — | Render a custom suggestion row. |
| `renderEmpty` | `() => ReactNode` | — | Render a custom empty state. |
| `renderLoading` | `() => ReactNode` | — | Render a custom loading state. |
| `renderError` | `(error: Error \| null) => ReactNode` | — | Render a custom error state. |

## Accessibility

- The input and suggestion list implement the WAI-ARIA 1.2 **combobox** pattern: the
  input has `role="combobox"` semantics (via the `useCombobox` hook), is associated with
  a listbox via `aria-controls`, and exposes `aria-expanded` for open/closed state.
- The currently keyboard-highlighted suggestion is tracked with `aria-activedescendant`
  on the input, and `aria-selected` on the active `<li>` — this drives the `isActive`
  flag passed to `renderSuggestion`.
- **Keyboard support:** Arrow Down/Up move the active suggestion, Enter selects the
  active suggestion (calling `onSelect` and clearing the query), and Escape closes the
  dropdown.
- The component does **not** render its own `<label>`. When using `AddressAutocomplete`
  directly, pair it with a `<label htmlFor={id}>` (matching the `id` prop, default
  `"locnative-autocomplete"`), or use `AddressFormField`, which does this for you.
- Loading, error, and empty states are announced as plain list items inside the same
  listbox region so screen readers traversing the list encounter them in context.

## Recipes & edge cases

- **Tuning `debounceMs` / `minCharsToSearch`:** The defaults (`debounceMs={300}`,
  `minCharsToSearch={2}`) suit most forms. For high-traffic search-as-you-type UIs where
  API cost matters, raise `debounceMs` (e.g. `400`) and `minCharsToSearch` (e.g. `4`) to
  reduce request volume — see the `TunedSearch` Storybook story.
- **`sessionToken` for billing:** Each keystroke debounce fires a billable autocomplete
  request. Generate a session token once per "search session" (e.g. when the user
  focuses the field) with the SDK's `newSessionToken()` and pass it as `sessionToken` so
  the API can group the whole keystroke sequence into a single billable session instead
  of billing per request.
- **Error / empty / loading slots:** Use `renderError`, `renderEmpty`, and `renderLoading`
  to match your app's design system instead of the built-in text rows. `renderError`
  receives the underlying `Error` (or `null` if the error came from the external `error`
  prop rather than the API call) so you can render API-specific messaging.
- **External vs. API errors:** The `error` prop (e.g. from form validation) and API
  request failures both surface through the same error slot — the external `error`
  prop takes precedence when both are present.
- **Geolocation denial:** If `enableGeolocation` is set and the user denies the browser
  permission prompt, results simply fall back to unbiased search; there's no separate
  error state for this today, so don't rely on `i18nStrings.geolocationError` being
  surfaced automatically by this component.
