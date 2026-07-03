# @locnative/react-ui

Production-ready, accessible React components for the [Locnative](https://locnative.com)
location API — address autocomplete, forward/reverse geocoding inputs, and structured
address form fields. Built on [`@locnative/sdk`](https://www.npmjs.com/package/@locnative/sdk),
styled with Tailwind, and shipped with a prebuilt stylesheet so you can drop them in
without any build setup.

> **Coverage:** International — authoritative open address datasets including
> Australia (G-NAF), the United States, Canada, and parts of Europe. Per-country
> depth and freshness vary by source.

## Requirements

- React **19+** and React DOM 19+ (peer dependencies)
- A Locnative API key (`wh_...`)

## Installation

```bash
# npm
npm install @locnative/react-ui @locnative/sdk @locnative/react

# pnpm
pnpm add @locnative/react-ui @locnative/sdk @locnative/react

# yarn
yarn add @locnative/react-ui @locnative/sdk @locnative/react
```

Peer dependencies: `react` & `react-dom` (>=19), `@locnative/sdk` (>=0.4.2), and
`@locnative/react` (>=0.2.0).

Import the stylesheet once, near your app root:

```ts
import "@locnative/react-ui/styles.css";
```

## Quick start

Every component takes a `client` created with the SDK. Create it once and share it.

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
      onSelect={(address) => console.log(address.formattedAddress, address.latitude, address.longitude)}
    />
  );
}
```

> **Note:** Use a **publishable** key scoped to your origin for browser use. Never ship a
> secret server key to the client.

## Components

### `AddressAutocomplete`

Debounced address search with a fully accessible (WAI-ARIA combobox) suggestion list,
keyboard navigation, and customizable rendering.

```tsx
<AddressAutocomplete
  client={client}
  onSelect={(address) => setAddress(address)}
  minCharsToSearch={4}
  debounceMs={250}
  maxSuggestions={8}
  enableGeolocation
/>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `client` | `LocnativeClient` | — | **Required.** SDK client. |
| `onSelect` | `(address: AddressWithParsed) => void` | — | Called when a suggestion is chosen. |
| `onQueryChange` | `(query: string) => void` | — | Called as the input text changes. |
| `placeholder` | `string` | — | Input placeholder. |
| `debounceMs` | `number` | `300` | Debounce before querying the API. |
| `minCharsToSearch` | `number` | `2` | Minimum characters before searching. |
| `maxSuggestions` | `number` | `5` | Max suggestions to show. |
| `enableGeolocation` | `boolean` | `false` | Use the browser's location to bias results (proximity). |
| `userLat` / `userLng` | `number` | — | Explicit proximity bias instead of geolocation. |
| `sessionToken` | `string` | — | Group a run of keystrokes into one billable search (see `newSessionToken()` in the SDK). |
| `disabled` / `required` | `boolean` | `false` | Standard input states. |
| `error` | `string` | — | External error message to display. |
| `id` / `className` | `string` | — | Pass-through for the input. |
| `i18nStrings` | `Partial<AddressI18nStrings>` | — | Override built-in labels/strings. |
| `renderSuggestion` | `(address, isActive) => ReactNode` | — | Custom suggestion row. |
| `renderEmpty` / `renderLoading` / `renderError` | `() => ReactNode` | — | Custom empty/loading/error states. |

### `AddressFormField`

`AddressAutocomplete` wrapped with a `<label>` and error styling — drop-in for forms.
Accepts every `AddressAutocomplete` prop plus:

| Prop | Type | Description |
|---|---|---|
| `label` | `string` | **Required.** Field label. |
| `labelClassName` | `string` | Class for the label element. |
| `errorClassName` | `string` | Class for the error text. |

```tsx
<AddressFormField client={client} label="Delivery address" required onSelect={setAddress} />
```

### `ForwardGeocodeInput`

Resolves a free-text address to coordinates as `query` changes (forward geocoding).

| Prop | Type | Description |
|---|---|---|
| `client` | `LocnativeClient` | **Required.** SDK client. |
| `query` | `string \| null` | Address text to geocode. |
| `onResult` | `(r: { latitude, longitude, formattedAddress }) => void` | Geocode result callback. |
| `placeholder` / `id` / `className` | `string` | Pass-through. |
| `disabled` | `boolean` | Disabled state. |

### `ReverseGeocodeInput`

Resolves `latitude`/`longitude` to the nearest address (reverse geocoding).

| Prop | Type | Description |
|---|---|---|
| `client` | `LocnativeClient` | **Required.** SDK client. |
| `latitude` / `longitude` | `number \| null` | Coordinates to reverse-geocode. |
| `onResult` | `(r: { address, distance }) => void` | Result callback. |
| `placeholder` / `id` / `className` | `string` | Pass-through. |
| `disabled` | `boolean` | Disabled state. |

### `AddressFieldGroup`

A controlled group of structured inputs (street, suburb, state, postcode) for editing a
full address.

| Prop | Type | Description |
|---|---|---|
| `client` | `LocnativeClient` | **Required.** SDK client. |
| `value` | `AddressFieldGroupValue` | **Required.** Controlled value. |
| `onChange` | `(value: AddressFieldGroupValue) => void` | **Required.** Change handler. |
| `streetLabel` / `suburbLabel` / `stateLabel` / `postcodeLabel` | `string` | Override field labels. |
| `disabled` / `className` | — | Standard states. |

## Utilities & types

- `toAddressWithParsed(suggestion)` — map a raw SDK `AddressSuggestion` to the
  `AddressWithParsed` shape used by these components.
- `cn(...classes)` — the `clsx` + `tailwind-merge` class combiner used internally.
- Exported types: `AddressWithParsed`, `AddressI18nStrings`, `AddressValidateFn`,
  `AddressSuggestionInput`, and each component's `*Props`.

## Per-component documentation

Full per-component guides — multiple examples, accessibility notes, and recipes —
live in [`docs/`](./docs/README.md).

## Interactive docs (Storybook)

This package ships a Storybook with live, interactive examples of every component.

```bash
pnpm --filter @locnative/react-ui storybook
```

Live stories call the real API. Set `VITE_DEMO_API_KEY` (a publishable,
origin-scoped key) and optionally `VITE_DEMO_API_BASE_URL` (default
`https://api.locnative.com`) to enable results; without a key, components still
render with a configuration banner.

## Styling

The package ships a prebuilt `styles.css` (import it once, as shown above). Components use
neutral design tokens and accept `className` for overrides; you can also fully replace
suggestion/empty/loading/error rendering via the `render*` props on `AddressAutocomplete`.

## TypeScript

Ships dual ESM + CJS builds with bundled type declarations. All props and callback
payloads are fully typed.

## License

MIT — © Locnative.
</content>
