# AddressFieldGroup

## Summary

A controlled group of structured inputs (street, suburb, state, postcode) for editing a full address. Provide `value` and `onChange`.

## When to use / when not

**Use it when:**

- You need the user to enter or confirm a full postal address split across discrete fields (street, suburb, state, postcode).
- You want to pre-fill address fields from an autocomplete selection and then let the user correct individual fields.
- You are building a checkout, registration, or profile form where a structured address is required for storage or validation.

**Don't use it when:**

- You only need the user to search for and select an address as a single value — use `AddressAutocomplete` or `AddressFormField` instead.
- You need reverse geocoding (coordinates → address display) — use `ReverseGeocodeInput` instead.
- You need forward geocoding (free text → coordinates) — use `ForwardGeocodeInput` instead.

## Import & minimal example

```tsx
import { useState } from "react";
import { createLocnativeClient } from "@locnative/sdk";
import {
  AddressFieldGroup,
  type AddressFieldGroupValue,
} from "@locnative/react-ui";

const client = createLocnativeClient({ apiKey: "..." });

const EMPTY: AddressFieldGroupValue = {
  street: "",
  suburb: "",
  state: "",
  postcode: "",
};

function MyForm() {
  const [address, setAddress] = useState<AddressFieldGroupValue>(EMPTY);

  return (
    <AddressFieldGroup
      client={client}
      value={address}
      onChange={setAddress}
    />
  );
}
```

## Worked examples

### 1. Pre-fill from autocomplete, then allow manual correction

`AddressFieldGroup` renders an `AddressAutocomplete` at the top of the group. Selecting a suggestion fills all four fields automatically. The user can then edit individual fields:

```tsx
const [address, setAddress] = useState<AddressFieldGroupValue>(EMPTY);

<AddressFieldGroup
  client={client}
  value={address}
  onChange={setAddress}
/>

<pre>{JSON.stringify(address, null, 2)}</pre>
```

### 2. Custom field labels (international / regional terminology)

Override any label to match your audience:

```tsx
<AddressFieldGroup
  client={client}
  value={address}
  onChange={setAddress}
  streetLabel="Street address"
  suburbLabel="City"
  stateLabel="Region"
  postcodeLabel="ZIP"
/>
```

### 3. Disable all fields while submitting

Pass `disabled` to prevent edits during async operations:

```tsx
const [submitting, setSubmitting] = useState(false);

<AddressFieldGroup
  client={client}
  value={address}
  onChange={setAddress}
  disabled={submitting}
/>
```

### 4. Persist only when all fields are filled

Gate your submit handler on completeness:

```tsx
const isComplete = Object.values(address).every((v) => v.trim().length > 0);

<button disabled={!isComplete} onClick={handleSubmit}>
  Save address
</button>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `client` | `LocnativeClient` | **Required** | SDK client created with `createLocnativeClient`. |
| `value` | `AddressFieldGroupValue` | **Required** | Controlled value for the field group. |
| `onChange` | `(value: AddressFieldGroupValue) => void` | **Required** | Change handler called with the updated value on any field edit. |
| `streetLabel` | `string` | `"Street Address"` | Override the street address field label. |
| `suburbLabel` | `string` | `"Suburb"` | Override the suburb field label. |
| `stateLabel` | `string` | `"State"` | Override the state field label. |
| `postcodeLabel` | `string` | `"Postcode"` | Override the postcode field label. |
| `disabled` | `boolean` | `false` | Disables all fields. |
| `className` | `string` | — | Additional CSS class applied to the root container. |

### AddressFieldGroupValue

```ts
interface AddressFieldGroupValue {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
}
```

## Accessibility

- Each field renders a native `<input>` with an explicit `<label>` wired via `htmlFor` — screen readers announce the field name correctly without additional markup.
- The embedded `AddressAutocomplete` at the top of the group provides its own accessible combobox behaviour; selecting a suggestion fills all four fields and moves focus back to the form flow.
- The `disabled` prop sets the HTML `disabled` attribute on every input, which is communicated to assistive technologies automatically.
- Field IDs are static (`field-street`, `field-suburb`, `field-state`, `field-postcode`). If you render multiple `AddressFieldGroup` instances on the same page, use a wrapping `<fieldset>` with a `<legend>` to distinguish them.

## Recipes & edge cases

- **Autocomplete fills all four fields:** When the user selects a suggestion from the embedded `AddressAutocomplete`, `onChange` is called once with all four fields populated from the matched address. The user can then edit individual fields as needed.
- **Uncontrolled initialisation:** Initialise `value` with the `EMPTY` constant (or your own empty object) rather than leaving fields undefined — all four keys must be strings for controlled inputs to behave correctly.
- **Validation:** The component does not validate field content. Apply your own validation logic in `onChange` or before form submission.
- **Layout:** The street field spans the full width; suburb, state, and postcode share a two-column grid. Apply `className` to the root container to constrain width or add spacing.
- **Multiple instances on one page:** Wrap each instance in a `<fieldset>` + `<legend>` so screen readers distinguish between shipping and billing address groups, as static field IDs are shared.
