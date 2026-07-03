# @locnative/vue-ui

Vue 3 components and helpers for the [Locnative](https://locnative.com) location API —
address autocomplete, forward/reverse geocoding inputs, and structured address form fields.
Built on [`@locnative/sdk`](https://www.npmjs.com/package/@locnative/sdk), styled with
Tailwind, and shipped with a prebuilt stylesheet so you can drop them in without any build
setup. This is the Vue counterpart to [`@locnative/react-ui`](../react-ui/README.md).

> **Coverage:** Authoritative Australian addresses (G-NAF). International coverage
> (US, parts of the EU, and more) is in **beta** and rolling out — availability may
> vary by deployment.

## Status

> **Available (v0.3.0).** All five Vue 3 SFC components — `AddressAutocomplete`,
> `AddressFormField`, `AddressFieldGroup`, `ForwardGeocodeInput`, `ReverseGeocodeInput` —
> plus the backing composables (`useAutocomplete`, `useForwardGeocode`,
> `useReverseGeocode`, `useAddressGeolocation`, `useCombobox`) are implemented and
> exported. They mirror the [`@locnative/react-ui`](../react-ui/README.md) API, surfacing
> callbacks as Vue `@`-events.

## Requirements

- Vue **3.0+** (peer dependency)
- A Locnative API key (`wh_...`)

## Installation

```bash
# npm
npm install @locnative/vue-ui @locnative/sdk

# pnpm
pnpm add @locnative/vue-ui @locnative/sdk

# yarn
yarn add @locnative/vue-ui @locnative/sdk
```

Peer dependencies: `vue` (>=3.0.0) and `@locnative/sdk` (>=0.5.0).

Import the stylesheet once, near your app root:

```ts
import "@locnative/vue-ui/styles.css";
```

## Exports

Components, composables, shared utilities, and types are all exported from the package
root:

```ts
import {
  // Components
  AddressAutocomplete,
  AddressFormField,
  AddressFieldGroup,
  ForwardGeocodeInput,
  ReverseGeocodeInput,
  // Composables (headless logic, bring your own markup)
  useAutocomplete,
  useForwardGeocode,
  useReverseGeocode,
  useAddressGeolocation,
  useCombobox,
  // Utilities + types
  toAddressWithParsed,
  cn,
  type AddressWithParsed,
  type AddressFieldGroupValue,
  type AddressI18nStrings,
  type AddressSuggestionInput,
} from "@locnative/vue-ui";
```

- **`toAddressWithParsed(suggestion)`** — maps a raw SDK `AddressSuggestion` into the
  flattened [`AddressWithParsed`](#types) shape the components use (`formattedAddress`,
  `latitude`, `longitude`, plus parsed `streetAddress` / `suburb` / `state` / `postcode` /
  `country`).
- **`cn(...classes)`** — the `clsx` + `tailwind-merge` class combiner used internally for
  composing Tailwind classes without conflicts.

### Types

| Type | Description |
|---|---|
| `AddressWithParsed` | Flattened address: `id`, `formattedAddress`, `latitude`, `longitude`, `streetAddress`, `suburb`, `state`, `postcode`, `country`. |
| `AddressI18nStrings` | Overridable UI strings: `noResults`, `enterManually`, `errorRetry`, `geolocationError`. |
| `AddressSuggestionInput` | Re-export of the SDK's `AddressSuggestion` (the input to `toAddressWithParsed`). |

## Quick start

Each component takes a `client` created with the SDK. Create it once and share it.

```vue
<script setup lang="ts">
import { createLocnativeClient } from "@locnative/sdk";
import { AddressAutocomplete } from "@locnative/vue-ui";
import "@locnative/vue-ui/styles.css";

const client = createLocnativeClient({ apiKey: import.meta.env.VITE_LOCNATIVE_KEY });

function onSelect(address) {
  console.log(address.formattedAddress, address.latitude, address.longitude);
}
</script>

<template>
  <AddressAutocomplete
    :client="client"
    placeholder="Start typing an address…"
    @select="onSelect"
  />
</template>
```

> **Note:** Use a **publishable** key scoped to your origin for browser use. Never ship a
> secret server key to the client.

## Components

- **`AddressAutocomplete`** — debounced address search with an accessible (WAI-ARIA
  combobox) suggestion list, keyboard navigation, optional geolocation proximity bias, and
  slot-based custom rendering. Emits `select` (an `AddressWithParsed`) and `queryChange`.
- **`AddressFormField`** — `AddressAutocomplete` wrapped with a label and error styling for
  drop-in form use. Emits `select`.
- **`ForwardGeocodeInput`** — resolves free-text address input to coordinates. Emits
  `result` (`{ latitude, longitude, formattedAddress }`).
- **`ReverseGeocodeInput`** — resolves `latitude`/`longitude` to the nearest address. Emits
  `result` (`{ address, distance }`).
- **`AddressFieldGroup`** — a controlled group of structured inputs (street, suburb, state,
  postcode) for editing a full address. Takes a `value` and emits `change`
  (`AddressFieldGroupValue`).

Props mirror the [`@locnative/react-ui`](../react-ui/README.md) components (props as Vue
props; React callbacks surfaced as `@`-events). Custom render-prop slots on
`AddressAutocomplete` are exposed as named slots: `suggestion`, `loading`, `error`,
`empty`.

### Composables

When you want the logic without the markup, the components are built on headless
composables you can use directly:

- **`useAutocomplete(client, options)`** — owns the `query` ref; debounces input, aborts
  stale requests, and exposes reactive `results`, `status`, `error`, and `setQuery`.
- **`useForwardGeocode(client, query)`** — reactive forward geocoding from a query source.
- **`useReverseGeocode(client, coords)`** — reactive reverse geocoding from a coords source.
- **`useAddressGeolocation(enabled)`** — one-shot browser geolocation for proximity bias.
- **`useCombobox(options)`** — the headless WAI-ARIA combobox keyboard state machine.

## Development

```bash
pnpm --filter @locnative/vue-ui build   # vite build + prebuilt styles.css
pnpm --filter @locnative/vue-ui dev     # build in watch mode
pnpm --filter @locnative/vue-ui test    # vitest
```

## Styling

The package ships a prebuilt `styles.css` (import it once, as shown above). Components use
neutral design tokens and accept `class` for overrides.

## TypeScript

Ships dual ESM + CJS builds with bundled type declarations. All exports are fully typed.

## License

UNLICENSED — © Locnative. See the repository for usage terms.
