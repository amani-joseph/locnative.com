# AddressFormField

## Summary

`AddressAutocomplete` wrapped with a `<label>` and error styling — a drop-in form field. Accepts every `AddressAutocomplete` prop plus `label`, `labelClassName`, and `errorClassName`.

## When to use / when not

**Use it when:**

- You need a labelled address-search field inside a form — this is the right default
  for checkout forms, shipping address capture, and any other form where the label and
  error text should be co-located with the input.
- You want required-field marking (`*`) and accessible error text (`role="alert"`,
  `aria-live="polite"`) without wiring them up yourself.
- You're already using `AddressAutocomplete` props and just want a label + error wrapper
  around them with no extra setup.

**Don't use it when:**

- You need the raw autocomplete without any label or error chrome — use
  `AddressAutocomplete` directly and bring your own `<label>`.
- You're editing an already-known, structured address (street/suburb/state/postcode) —
  use `AddressFieldGroup` instead.
- You only need to resolve free text to coordinates without a suggestion dropdown — use
  `ForwardGeocodeInput`.

## Import & minimal example

```tsx
import { createLocnativeClient } from "@locnative/sdk";
import { AddressFormField } from "@locnative/react-ui";
import "@locnative/react-ui/styles.css";

const client = createLocnativeClient({ apiKey: import.meta.env.VITE_LOCNATIVE_KEY });

export function Checkout() {
  return (
    <AddressFormField client={client} label="Delivery address" required onSelect={setAddress} />
  );
}
```

## Worked examples

### 1. Controlled selection state

Store the selected address from `onSelect`; surface it elsewhere in the form:

```tsx
function DeliveryAddress() {
  const [selected, setSelected] = useState<AddressWithParsed | null>(null);

  return (
    <div>
      <AddressFormField
        client={client}
        label="Delivery address"
        placeholder="Start typing…"
        onSelect={(address) => setSelected(address)}
        required
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

Wire `onSelect` to a TanStack Form field's `handleChange`, and pass the field's
validation error to `error`:

```tsx
import { useForm } from "@tanstack/react-form";

function CheckoutForm() {
  const form = useForm({
    defaultValues: { address: null as AddressWithParsed | null },
  });

  return (
    <form.Field name="address">
      {(field) => (
        <AddressFormField
          client={client}
          label="Shipping address"
          onSelect={(address) => field.handleChange(address)}
          error={field.state.meta.errors?.[0]}
          required
        />
      )}
    </form.Field>
  );
}
```

### 3. Custom label and error styles

Override label and error appearance via `labelClassName` and `errorClassName`:

```tsx
<AddressFormField
  client={client}
  label="Pickup location"
  labelClassName="text-lg font-semibold text-brand-900"
  errorClassName="font-medium"
  error={validationError}
  onSelect={setAddress}
/>
```

### 4. Geolocation / proximity bias

All `AddressAutocomplete` props are forwarded — including geolocation:

```tsx
<AddressFormField
  client={client}
  label="Delivery address"
  enableGeolocation
  onSelect={setAddress}
  required
/>
```

## Props

`AddressFormField` extends every prop from `AddressAutocomplete` (see
[AddressAutocomplete docs](./address-autocomplete.md)) and adds:

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | — | **Required.** Text content of the `<label>` element. |
| `labelClassName` | `string` | — | Additional class(es) applied to the `<label>` element. |
| `errorClassName` | `string` | — | Additional class(es) applied to the error text `<p>` element. |

All `AddressAutocomplete` props are forwarded unchanged. Key inherited props:

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
| `userLat` | `number` | — | Explicit latitude for proximity bias. |
| `userLng` | `number` | — | Explicit longitude for proximity bias. |
| `disabled` | `boolean` | — | Disable the input. |
| `required` | `boolean` | — | Mark the input as required (also renders `*` next to the label). |
| `error` | `string` | — | External error message; renders below the input with `role="alert"`. |
| `id` | `string` | `"locnative-field"` | Forwarded to the input element and linked to the label via `htmlFor`. |
| `className` | `string` | — | Class applied to the `AddressAutocomplete` root container. |

## Accessibility

- The component renders a `<label>` with `htmlFor` set to the same `id` as the
  underlying `AddressAutocomplete` input (default `"locnative-field"`). This
  association satisfies WCAG 2.1 SC 1.3.1 and ensures screen readers announce the
  label when the input is focused.
- Pass a custom `id` when you render multiple `AddressFormField` instances on the
  same page to keep `htmlFor`/`id` pairs unique.
- When `required` is `true`, a `*` character is rendered `aria-hidden="true"` (so it
  is not read by screen readers) alongside the visible label text; the `required`
  attribute is forwarded to the input so assistive technology announces it natively.
- When `error` is set, a `<p role="alert" aria-live="polite">` is rendered below the
  input. Screen readers will announce the error text without the user having to navigate
  to it. The `errorClassName` prop lets you style this element to match your design
  system.
- All keyboard navigation and ARIA combobox semantics are inherited from
  `AddressAutocomplete` — see the [AddressAutocomplete accessibility section](./address-autocomplete.md#accessibility).

## Recipes & edge cases

- **Multiple fields on one page:** Always supply a unique `id` (e.g. `id="billing-address"`,
  `id="shipping-address"`) when rendering more than one `AddressFormField` on the same
  page. Without it, both fields default to `id="locnative-field"`, which breaks the
  `htmlFor` association and is invalid HTML.
- **Passing `error` from form validation vs. API errors:** The `error` prop accepts an
  external string (e.g. from TanStack Form's `field.state.meta.errors`) and renders it
  below the input. API-level errors from the autocomplete itself surface inside the
  dropdown via `AddressAutocomplete`'s built-in error slot, not through this prop.
- **Debounce / min-chars tuning:** Inherits `AddressAutocomplete` defaults
  (`debounceMs={300}`, `minCharsToSearch={2}`). For high-traffic forms, raise both to
  reduce API call volume.
- **`sessionToken` for billing:** Pass `newSessionToken()` from the SDK as `sessionToken`
  to group a whole keystroke sequence into a single billable autocomplete session.
- **Clearing the field:** There is no imperative `clear()` API. If you need to clear
  the field programmatically (e.g. after form submit), unmount and remount the component
  or use a React `key` change.
