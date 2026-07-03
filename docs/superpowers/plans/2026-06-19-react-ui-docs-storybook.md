# @locnative/react-ui Docs + Storybook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rich per-component Markdown documentation and a working Storybook to `packages/react-ui`, beyond the existing README prop tables.

**Architecture:** Storybook 9 with the `@storybook/react-vite` framework runs standalone inside the package. Stories use a *live* demo `LocnativeClient` configured from env vars (cross-origin, explicit base URL), degrading to a "not configured" banner when no key is present. Each of the 5 exported components gets a `docs/<name>.md` (full prose) and a `<name>.stories.tsx` (same prose in the autodocs description). JSDoc on the prop interfaces feeds Storybook's autodocs prop tables.

**Tech Stack:** TypeScript, React 19, Vite 7, Storybook ^9 (`@storybook/react-vite`, `@storybook/addon-a11y`), the existing `@locnative/sdk` client (supports a custom `baseUrl`), Vitest 1 (existing), pnpm workspace with version catalog.

## Global Constraints

- Package under work: `packages/react-ui` only. Do NOT touch `packages/vue-ui`, `apps/web`, or the existing `/components` route.
- Storybook dependencies pinned to `^9.0.0` (the line that supports React 19 + Vite 7). `@storybook/addon-essentials` does NOT exist on v9 — controls/actions/docs are built into core; do not add it.
- Components rely on plain CSS in `src/styles/globals.css` (no Tailwind compilation). Storybook loads styling solely via `import "../src/styles/globals.css"`.
- The SDK client is created with `createLocnativeClient({ apiKey, baseUrl })`. Use a **publishable** key only; never a secret server key.
- Demo client env vars: `VITE_DEMO_API_KEY` (string, may be empty) and `VITE_DEMO_API_BASE_URL` (absolute URL; default `https://api.locnative.com`).
- Exported components in scope (from `src/index.ts`): `AddressAutocomplete`, `AddressFormField`, `ForwardGeocodeInput`, `ReverseGeocodeInput`, `AddressFieldGroup`. Internal hooks are out of scope.
- Run `pnpm dlx ultracite fix` then `pnpm dlx ultracite check` on changed files before each commit (project standard).
- All package commands run via `pnpm --filter @locnative/react-ui <script>`.
- Full component prose appears in BOTH `docs/<name>.md` and the story's `parameters.docs.description.component`; keep them identical text.

---

### Task 1: Storybook scaffolding + env-driven demo client

Stand up Storybook so `pnpm --filter @locnative/react-ui storybook` boots, styling loads, and an env-driven demo client exists with a tested config resolver and a "not configured" banner decorator.

**Files:**
- Modify: `packages/react-ui/package.json` (devDependencies, scripts, `files`)
- Create: `packages/react-ui/.storybook/main.ts`
- Create: `packages/react-ui/.storybook/preview.tsx`
- Create: `packages/react-ui/.storybook/demo-client.ts`
- Create: `packages/react-ui/.storybook/demo-client.test.ts`
- Create: `packages/react-ui/.storybook/vite-env.d.ts`
- Modify: `packages/react-ui/vitest.config.ts` (include `.storybook` tests)

**Interfaces:**
- Produces:
  - `resolveDemoConfig(env: { VITE_DEMO_API_KEY?: string; VITE_DEMO_API_BASE_URL?: string }): { apiKey: string; baseUrl: string; configured: boolean }`
  - `createDemoClient(): LocnativeClient`
  - `isDemoConfigured: boolean`
  - Default export from `preview.tsx` registering the demo-config decorator and `autodocs` tag. Stories in later tasks rely on `createDemoClient` and `isDemoConfigured`.

- [ ] **Step 1: Write the failing test for the config resolver**

Create `packages/react-ui/.storybook/demo-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveDemoConfig } from "./demo-client";

describe("resolveDemoConfig", () => {
  it("marks configured when a key is present and keeps the given base URL", () => {
    const cfg = resolveDemoConfig({
      VITE_DEMO_API_KEY: "pk_test_123",
      VITE_DEMO_API_BASE_URL: "https://api.example.com",
    });
    expect(cfg).toEqual({
      apiKey: "pk_test_123",
      baseUrl: "https://api.example.com",
      configured: true,
    });
  });

  it("defaults the base URL and marks unconfigured when the key is missing", () => {
    const cfg = resolveDemoConfig({});
    expect(cfg).toEqual({
      apiKey: "",
      baseUrl: "https://api.locnative.com",
      configured: false,
    });
  });

  it("treats an empty-string key as unconfigured", () => {
    expect(resolveDemoConfig({ VITE_DEMO_API_KEY: "" }).configured).toBe(false);
  });
});
```

- [ ] **Step 2: Extend vitest include so the `.storybook` test is picked up**

Edit `packages/react-ui/vitest.config.ts` — change the `include` array to:

```ts
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      ".storybook/**/*.test.ts",
    ],
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @locnative/react-ui test`
Expected: FAIL — `Failed to resolve import "./demo-client"` / `resolveDemoConfig is not a function`.

- [ ] **Step 4: Implement the demo client**

Create `packages/react-ui/.storybook/demo-client.ts`:

```ts
import { createLocnativeClient } from "@locnative/sdk";
import type { LocnativeClient } from "@locnative/sdk";

const DEFAULT_BASE_URL = "https://api.locnative.com";

type DemoEnv = {
  VITE_DEMO_API_KEY?: string;
  VITE_DEMO_API_BASE_URL?: string;
};

export function resolveDemoConfig(env: DemoEnv): {
  apiKey: string;
  baseUrl: string;
  configured: boolean;
} {
  const apiKey = env.VITE_DEMO_API_KEY ?? "";
  const baseUrl = env.VITE_DEMO_API_BASE_URL ?? DEFAULT_BASE_URL;
  return { apiKey, baseUrl, configured: apiKey.length > 0 };
}

const config = resolveDemoConfig(import.meta.env as DemoEnv);

export const isDemoConfigured = config.configured;

export function createDemoClient(): LocnativeClient {
  return createLocnativeClient({
    apiKey: config.apiKey || "demo-key-not-configured",
    baseUrl: config.baseUrl,
  });
}
```

- [ ] **Step 5: Add Vite client types so `import.meta.env` typechecks**

Create `packages/react-ui/.storybook/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @locnative/react-ui test`
Expected: PASS (existing tests + the 3 new resolver tests).

- [ ] **Step 7: Add Storybook deps and scripts to package.json**

In `packages/react-ui/package.json`:
- Add to `files` array the entry `"docs"` (so it becomes `["dist", "docs", "README.md", "CHANGELOG.md"]`).
- Add scripts:

```json
    "storybook": "storybook dev -p 6006 --no-open",
    "build-storybook": "storybook build"
```

- Add to `devDependencies` (keep alphabetical where the file already is):

```json
    "@storybook/addon-a11y": "^9.0.0",
    "@storybook/react-vite": "^9.0.0",
    "storybook": "^9.0.0",
    "vite": "^7.0.2"
```

Then install: `pnpm install`

- [ ] **Step 8: Write the Storybook main config**

Create `packages/react-ui/.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
```

- [ ] **Step 9: Write the preview with the demo-config banner decorator**

Create `packages/react-ui/.storybook/preview.tsx`:

```tsx
import type { Decorator, Preview } from "@storybook/react-vite";
import { isDemoConfigured } from "./demo-client";
import "../src/styles/globals.css";

const withDemoBanner: Decorator = (Story) => {
  if (isDemoConfigured) {
    return <Story />;
  }
  return (
    <div>
      <p
        role="status"
        style={{
          background: "#fff7ed",
          border: "1px solid #fdba74",
          borderRadius: 6,
          color: "#9a3412",
          fontSize: 13,
          margin: "0 0 12px",
          padding: "8px 12px",
        }}
      >
        Demo API key not configured — set <code>VITE_DEMO_API_KEY</code> (and
        optionally <code>VITE_DEMO_API_BASE_URL</code>) to enable live results.
        Components still render; network calls will not return data.
      </p>
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withDemoBanner],
  tags: ["autodocs"],
  parameters: {
    controls: { expanded: true },
  },
};

export default preview;
```

- [ ] **Step 10: Verify Storybook builds**

Run: `pnpm --filter @locnative/react-ui build-storybook`
Expected: completes without error and writes `storybook-static/` (no stories yet is fine — it builds the docs shell). If it reports "no stories found", that is acceptable for this task.

- [ ] **Step 11: Run lint and commit**

```bash
pnpm dlx ultracite fix packages/react-ui/.storybook packages/react-ui/vitest.config.ts
pnpm dlx ultracite check packages/react-ui/.storybook packages/react-ui/vitest.config.ts
git add packages/react-ui/.storybook packages/react-ui/package.json packages/react-ui/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(react-ui): scaffold Storybook with env-driven demo client"
```

---

### Task 2: JSDoc the exported prop interfaces

Add field-level JSDoc to every exported `*Props`/value interface so Storybook autodocs prop tables and IDE hovers are accurate. Comments only — no behavior change.

**Files:**
- Modify: `packages/react-ui/src/components/address-autocomplete.tsx` (interface `AddressAutocompleteProps`)
- Modify: `packages/react-ui/src/components/address-form-field.tsx` (interface `AddressFormFieldProps`)
- Modify: `packages/react-ui/src/components/forward-geocode-input.tsx` (interface `ForwardGeocodeInputProps`)
- Modify: `packages/react-ui/src/components/reverse-geocode-input.tsx` (interface `ReverseGeocodeInputProps`)
- Modify: `packages/react-ui/src/components/address-field-group.tsx` (interfaces `AddressFieldGroupProps`, `AddressFieldGroupValue`)

**Interfaces:**
- Consumes: nothing.
- Produces: documented prop interfaces (no signature changes). Later story tasks rely on the unchanged prop names/types.

- [ ] **Step 1: Document `AddressAutocompleteProps`**

In `packages/react-ui/src/components/address-autocomplete.tsx`, add a `/** ... */` comment above each field. Use the README prop descriptions as the source of truth. Example for the first fields (apply the same pattern to every field):

```ts
export interface AddressAutocompleteProps {
  /** Class applied to the root container. */
  className?: string;
  /** Required. SDK client created with `createLocnativeClient`. */
  client: LocnativeClient;
  /** Debounce in ms before querying the API. Default 200. */
  debounceMs?: number;
  /** Disable the input. */
  disabled?: boolean;
  /** Use the browser's geolocation to bias results by proximity. Default false. */
  enableGeolocation?: boolean;
  /** External error message to display. */
  error?: string;
  /** Override built-in UI strings (no results, retry, etc.). */
  i18nStrings?: Partial<AddressI18nStrings>;
  /** id forwarded to the input element. */
  id?: string;
  /** Maximum number of suggestions to show. Default 10. */
  maxSuggestions?: number;
  /** Minimum characters typed before searching. Default 3. */
  minCharsToSearch?: number;
  /** Called as the input text changes. */
  onQueryChange?: (query: string) => void;
  /** Called when a suggestion is selected. */
  onSelect?: (address: AddressWithParsed) => void;
  /** Input placeholder text. */
  placeholder?: string;
  /** Render a custom empty state. */
  renderEmpty?: () => ReactNode;
  /** Render a custom error state. */
  renderError?: (error: Error | null) => ReactNode;
  /** Render a custom loading state. */
  renderLoading?: () => ReactNode;
  /** Render a custom suggestion row. */
  renderSuggestion?: (address: AddressWithParsed, isActive: boolean) => ReactNode;
  /** Mark the input as required. */
  required?: boolean;
  /** Group a run of keystrokes into one billable search (see SDK `newSessionToken()`). */
  sessionToken?: string;
  /** Explicit latitude for proximity bias (instead of geolocation). */
  userLat?: number;
  /** Explicit longitude for proximity bias (instead of geolocation). */
  userLng?: number;
}
```

- [ ] **Step 2: Document the remaining interfaces**

Apply the same JSDoc treatment, sourcing descriptions from the README prop tables, to:
- `AddressFormFieldProps` (`label` required field label; `labelClassName`; `errorClassName`; plus it extends/forwards `AddressAutocomplete` props — document the field-specific ones).
- `ForwardGeocodeInputProps` (`client` required; `query: string | null`; `onResult`; `placeholder`; `id`; `className`; `disabled`).
- `ReverseGeocodeInputProps` (`client` required; `latitude: number | null`; `longitude: number | null`; `onResult`; `placeholder`; `id`; `className`; `disabled`).
- `AddressFieldGroupProps` (`client` required; `value` required; `onChange` required; `streetLabel`/`suburbLabel`/`stateLabel`/`postcodeLabel`; `disabled`; `className`) and `AddressFieldGroupValue` (each of `street`, `suburb`, `state`, `postcode`).

Open each file first to confirm exact field names before commenting.

- [ ] **Step 3: Verify the build and types are unaffected**

Run: `pnpm --filter @locnative/react-ui build`
Expected: succeeds; `dist/index.d.ts` regenerated.

- [ ] **Step 4: Run lint and commit**

```bash
pnpm dlx ultracite fix packages/react-ui/src/components
pnpm dlx ultracite check packages/react-ui/src/components
git add packages/react-ui/src/components
git commit -m "docs(react-ui): add JSDoc to exported prop interfaces"
```

---

### Task 3: Docs scaffolding — index + README link

Create the `docs/` index and link it from the package README. Per-component pages are added in Tasks 4–8.

**Files:**
- Create: `packages/react-ui/docs/README.md`
- Modify: `packages/react-ui/README.md` (add a "Per-component documentation" section)

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/README.md` index that Tasks 4–8 add links/pages under.

- [ ] **Step 1: Create the docs index**

Create `packages/react-ui/docs/README.md`:

```markdown
# @locnative/react-ui — Component documentation

Detailed, per-component guides with worked examples, full prop tables,
accessibility notes, and recipes. For a quick overview and install steps, see
the [package README](../README.md).

These docs mirror the package's [Storybook](../README.md#interactive-docs-storybook),
where every component has interactive, live examples.

## Components

- [AddressAutocomplete](./address-autocomplete.md) — accessible, debounced address search.
- [AddressFormField](./address-form-field.md) — labelled form wrapper around the autocomplete.
- [ForwardGeocodeInput](./forward-geocode-input.md) — resolve free text to coordinates.
- [ReverseGeocodeInput](./reverse-geocode-input.md) — resolve coordinates to an address.
- [AddressFieldGroup](./address-field-group.md) — controlled street/suburb/state/postcode group.
```

- [ ] **Step 2: Link docs + Storybook from the README**

In `packages/react-ui/README.md`, add this section immediately before the `## Styling` section:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/react-ui/docs/README.md packages/react-ui/README.md
git commit -m "docs(react-ui): add docs index and link Storybook from README"
```

---

### Task 4: AddressAutocomplete — docs page + stories

Write the full prose doc and the Storybook stories for `AddressAutocomplete`. The prose in the `.md` and in the story `description.component` must be identical.

**Files:**
- Create: `packages/react-ui/docs/address-autocomplete.md`
- Create: `packages/react-ui/src/components/address-autocomplete.stories.tsx`

**Interfaces:**
- Consumes: `AddressAutocomplete`, `AddressAutocompleteProps` from `./address-autocomplete`; `createDemoClient` from `../../.storybook/demo-client`.
- Produces: stories under title `Components/AddressAutocomplete`.

- [ ] **Step 1: Write the docs page**

Create `packages/react-ui/docs/address-autocomplete.md` following the template (Summary; When to use / not; Import & minimal example; Worked examples — controlled value, TanStack Form wiring, geolocation/proximity, custom `renderSuggestion`; Props table copied from README + JSDoc; Accessibility — WAI-ARIA combobox role, `aria-activedescendant`, arrow/enter/escape keys, labelling guidance; Recipes & edge cases — `debounceMs`/`minCharsToSearch` tuning, `sessionToken` for billing, error/empty/loading slots). Minimal example to include verbatim:

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

- [ ] **Step 2: Write the stories**

Create `packages/react-ui/src/components/address-autocomplete.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoClient } from "../../.storybook/demo-client";
import { AddressAutocomplete } from "./address-autocomplete";

const client = createDemoClient();

const meta = {
  title: "Components/AddressAutocomplete",
  component: AddressAutocomplete,
  args: { client },
  parameters: {
    docs: {
      description: {
        // NOTE: keep identical to the Summary + guidance in docs/address-autocomplete.md
        component:
          "Accessible (WAI-ARIA combobox), debounced address search with keyboard navigation, proximity bias, session tokens, i18n strings, and customizable render slots. Provide a `client` created with `createLocnativeClient`.",
      },
    },
  },
} satisfies Meta<typeof AddressAutocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Start typing an address…" },
};

export const WithGeolocation: Story = {
  args: { enableGeolocation: true, placeholder: "Addresses near you…" },
};

export const TunedSearch: Story = {
  args: { minCharsToSearch: 4, debounceMs: 400, maxSuggestions: 5 },
};

export const DisabledAndError: Story = {
  args: { disabled: true, error: "Please enter a valid address" },
};

export const CustomSuggestionRenderer: Story = {
  args: {
    renderSuggestion: (address, isActive) => (
      <span style={{ fontWeight: isActive ? 700 : 400 }}>
        📍 {address.formattedAddress}
      </span>
    ),
  },
};
```

- [ ] **Step 3: Verify the story compiles in Storybook**

Run: `pnpm --filter @locnative/react-ui build-storybook`
Expected: succeeds; output references `Components/AddressAutocomplete`.

- [ ] **Step 4: Lint and commit**

```bash
pnpm dlx ultracite fix packages/react-ui/docs/address-autocomplete.md packages/react-ui/src/components/address-autocomplete.stories.tsx
pnpm dlx ultracite check packages/react-ui/src/components/address-autocomplete.stories.tsx
git add packages/react-ui/docs/address-autocomplete.md packages/react-ui/src/components/address-autocomplete.stories.tsx
git commit -m "docs(react-ui): AddressAutocomplete guide + stories"
```

---

### Task 5: AddressFormField — docs page + stories

**Files:**
- Create: `packages/react-ui/docs/address-form-field.md`
- Create: `packages/react-ui/src/components/address-form-field.stories.tsx`

**Interfaces:**
- Consumes: `AddressFormField` from `./address-form-field`; `createDemoClient` from `../../.storybook/demo-client`.
- Produces: stories under title `Components/AddressFormField`.

- [ ] **Step 1: Write the docs page**

Create `packages/react-ui/docs/address-form-field.md` per the template. Emphasize it forwards every `AddressAutocomplete` prop plus `label` (required), `labelClassName`, `errorClassName`. Include a TanStack Form example. Minimal example verbatim:

```tsx
<AddressFormField client={client} label="Delivery address" required onSelect={setAddress} />
```

- [ ] **Step 2: Write the stories**

Create `packages/react-ui/src/components/address-form-field.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoClient } from "../../.storybook/demo-client";
import { AddressFormField } from "./address-form-field";

const client = createDemoClient();

const meta = {
  title: "Components/AddressFormField",
  component: AddressFormField,
  args: { client, label: "Delivery address" },
  parameters: {
    docs: {
      description: {
        component:
          "`AddressAutocomplete` wrapped with a `<label>` and error styling — a drop-in form field. Accepts every `AddressAutocomplete` prop plus `label`, `labelClassName`, and `errorClassName`.",
      },
    },
  },
} satisfies Meta<typeof AddressFormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Required: Story = {
  args: { required: true },
};

export const WithError: Story = {
  args: { error: "Address is required" },
};
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @locnative/react-ui build-storybook`
Expected: succeeds; references `Components/AddressFormField`.

- [ ] **Step 4: Lint and commit**

```bash
pnpm dlx ultracite fix packages/react-ui/docs/address-form-field.md packages/react-ui/src/components/address-form-field.stories.tsx
pnpm dlx ultracite check packages/react-ui/src/components/address-form-field.stories.tsx
git add packages/react-ui/docs/address-form-field.md packages/react-ui/src/components/address-form-field.stories.tsx
git commit -m "docs(react-ui): AddressFormField guide + stories"
```

---

### Task 6: ForwardGeocodeInput — docs page + stories

**Files:**
- Create: `packages/react-ui/docs/forward-geocode-input.md`
- Create: `packages/react-ui/src/components/forward-geocode-input.stories.tsx`

**Interfaces:**
- Consumes: `ForwardGeocodeInput` from `./forward-geocode-input`; `createDemoClient`.
- Produces: stories under title `Components/ForwardGeocodeInput`.

- [ ] **Step 1: Write the docs page**

Create `packages/react-ui/docs/forward-geocode-input.md` per the template. It resolves free-text addresses to coordinates as `query` changes. Document `query: string | null`, `onResult({ latitude, longitude, formattedAddress })`, `placeholder`, `id`, `className`, `disabled`. Note it is controlled — the parent owns `query`.

- [ ] **Step 2: Write the stories**

Create `packages/react-ui/src/components/forward-geocode-input.stories.tsx`. Because the component is controlled via `query`, use a render wrapper with local state:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { createDemoClient } from "../../.storybook/demo-client";
import { ForwardGeocodeInput } from "./forward-geocode-input";

const client = createDemoClient();

const meta = {
  title: "Components/ForwardGeocodeInput",
  component: ForwardGeocodeInput,
  parameters: {
    docs: {
      description: {
        component:
          "Resolves a free-text address to coordinates (forward geocoding) as the `query` changes. Controlled: the parent owns `query` and receives results via `onResult`.",
      },
    },
  },
} satisfies Meta<typeof ForwardGeocodeInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<string>("");
    return (
      <div>
        <ForwardGeocodeInput
          client={client}
          onResult={(r) => setResult(`${r.latitude}, ${r.longitude}`)}
          placeholder="Type an address to geocode…"
          query={query}
        />
        <input
          aria-label="query"
          onChange={(e) => setQuery(e.target.value)}
          style={{ display: "none" }}
          value={query}
        />
        <p>Result: {result || "—"}</p>
      </div>
    );
  },
};

export const Disabled: Story = {
  args: { client, disabled: true, query: "10 Downing Street" },
};
```

(Confirm the exact `onResult` payload field names by reading `forward-geocode-input.tsx` before finalizing.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @locnative/react-ui build-storybook`
Expected: succeeds; references `Components/ForwardGeocodeInput`.

- [ ] **Step 4: Lint and commit**

```bash
pnpm dlx ultracite fix packages/react-ui/docs/forward-geocode-input.md packages/react-ui/src/components/forward-geocode-input.stories.tsx
pnpm dlx ultracite check packages/react-ui/src/components/forward-geocode-input.stories.tsx
git add packages/react-ui/docs/forward-geocode-input.md packages/react-ui/src/components/forward-geocode-input.stories.tsx
git commit -m "docs(react-ui): ForwardGeocodeInput guide + stories"
```

---

### Task 7: ReverseGeocodeInput — docs page + stories

**Files:**
- Create: `packages/react-ui/docs/reverse-geocode-input.md`
- Create: `packages/react-ui/src/components/reverse-geocode-input.stories.tsx`

**Interfaces:**
- Consumes: `ReverseGeocodeInput` from `./reverse-geocode-input`; `createDemoClient`.
- Produces: stories under title `Components/ReverseGeocodeInput`.

- [ ] **Step 1: Write the docs page**

Create `packages/react-ui/docs/reverse-geocode-input.md` per the template. It resolves `latitude`/`longitude` to the nearest address. Document `latitude: number | null`, `longitude: number | null`, `onResult({ address, distance })`, `placeholder`, `id`, `className`, `disabled`. Note null-coordinate handling (no request until both are set).

- [ ] **Step 2: Write the stories**

Create `packages/react-ui/src/components/reverse-geocode-input.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoClient } from "../../.storybook/demo-client";
import { ReverseGeocodeInput } from "./reverse-geocode-input";

const client = createDemoClient();

const meta = {
  title: "Components/ReverseGeocodeInput",
  component: ReverseGeocodeInput,
  args: { client },
  parameters: {
    docs: {
      description: {
        component:
          "Resolves a `latitude`/`longitude` pair to the nearest address (reverse geocoding). No request is made until both coordinates are non-null.",
      },
    },
  },
} satisfies Meta<typeof ReverseGeocodeInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { latitude: -27.4698, longitude: 153.0251 },
};

export const NoCoordinates: Story = {
  args: { latitude: null, longitude: null },
};

export const Disabled: Story = {
  args: { disabled: true, latitude: -27.4698, longitude: 153.0251 },
};
```

(Confirm `onResult` payload field names by reading `reverse-geocode-input.tsx` before finalizing.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @locnative/react-ui build-storybook`
Expected: succeeds; references `Components/ReverseGeocodeInput`.

- [ ] **Step 4: Lint and commit**

```bash
pnpm dlx ultracite fix packages/react-ui/docs/reverse-geocode-input.md packages/react-ui/src/components/reverse-geocode-input.stories.tsx
pnpm dlx ultracite check packages/react-ui/src/components/reverse-geocode-input.stories.tsx
git add packages/react-ui/docs/reverse-geocode-input.md packages/react-ui/src/components/reverse-geocode-input.stories.tsx
git commit -m "docs(react-ui): ReverseGeocodeInput guide + stories"
```

---

### Task 8: AddressFieldGroup — docs page + stories

**Files:**
- Create: `packages/react-ui/docs/address-field-group.md`
- Create: `packages/react-ui/src/components/address-field-group.stories.tsx`

**Interfaces:**
- Consumes: `AddressFieldGroup`, `AddressFieldGroupValue` from `./address-field-group`; `createDemoClient`.
- Produces: stories under title `Components/AddressFieldGroup`.

- [ ] **Step 1: Write the docs page**

Create `packages/react-ui/docs/address-field-group.md` per the template. A controlled group of street/suburb/state/postcode inputs. Document `value: AddressFieldGroupValue` (required), `onChange` (required), label overrides (`streetLabel`/`suburbLabel`/`stateLabel`/`postcodeLabel`), `disabled`, `className`. Show a controlled example with `useState`.

- [ ] **Step 2: Write the stories**

Create `packages/react-ui/src/components/address-field-group.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  AddressFieldGroup,
  type AddressFieldGroupValue,
} from "./address-field-group";
import { createDemoClient } from "../../.storybook/demo-client";

const client = createDemoClient();

const EMPTY: AddressFieldGroupValue = {
  street: "",
  suburb: "",
  state: "",
  postcode: "",
};

const meta = {
  title: "Components/AddressFieldGroup",
  component: AddressFieldGroup,
  parameters: {
    docs: {
      description: {
        component:
          "A controlled group of structured inputs (street, suburb, state, postcode) for editing a full address. Provide `value` and `onChange`.",
      },
    },
  },
} satisfies Meta<typeof AddressFieldGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<AddressFieldGroupValue>(EMPTY);
    return <AddressFieldGroup client={client} onChange={setValue} value={value} />;
  },
};

export const CustomLabels: Story = {
  render: () => {
    const [value, setValue] = useState<AddressFieldGroupValue>(EMPTY);
    return (
      <AddressFieldGroup
        client={client}
        onChange={setValue}
        postcodeLabel="ZIP"
        stateLabel="Region"
        streetLabel="Street address"
        suburbLabel="City"
        value={value}
      />
    );
  },
};
```

(Confirm `AddressFieldGroupValue` field names by reading `address-field-group.tsx` before finalizing.)

- [ ] **Step 3: Verify the full Storybook builds with all components**

Run: `pnpm --filter @locnative/react-ui build-storybook`
Expected: succeeds; output references all 5 `Components/*` titles.

- [ ] **Step 4: Lint and commit**

```bash
pnpm dlx ultracite fix packages/react-ui/docs/address-field-group.md packages/react-ui/src/components/address-field-group.stories.tsx
pnpm dlx ultracite check packages/react-ui/src/components/address-field-group.stories.tsx
git add packages/react-ui/docs/address-field-group.md packages/react-ui/src/components/address-field-group.stories.tsx
git commit -m "docs(react-ui): AddressFieldGroup guide + stories"
```

---

### Task 9: Final verification

Confirm the package still builds/tests cleanly and the docs cross-links resolve.

**Files:** none (verification only).

- [ ] **Step 1: Build the package**

Run: `pnpm --filter @locnative/react-ui build`
Expected: succeeds; `dist/` regenerated.

- [ ] **Step 2: Run the test suite**

Run: `pnpm --filter @locnative/react-ui test`
Expected: PASS (existing component/util tests + the demo-client resolver tests).

- [ ] **Step 3: Build Storybook**

Run: `pnpm --filter @locnative/react-ui build-storybook`
Expected: succeeds; all 5 component story groups present.

- [ ] **Step 4: Manual spot check (optional, with a key)**

Run: `VITE_DEMO_API_KEY=<publishable-key> pnpm --filter @locnative/react-ui storybook`
Expected: Storybook opens on :6006; typing in `AddressAutocomplete` returns live suggestions; with no key, the configuration banner shows.

- [ ] **Step 5: Verify docs links resolve**

Manually confirm each link in `packages/react-ui/docs/README.md` points to an existing file and the README "Per-component documentation" / "Interactive docs" links resolve.

- [ ] **Step 6: Final lint sweep**

```bash
pnpm dlx ultracite check packages/react-ui
```
Expected: no errors.

---

## Notes for the implementer

- **Read before you write.** Story tasks instruct confirming `onResult` payload shapes and `AddressFieldGroupValue` field names against the component source — do this; the README/spec descriptions are a guide, the source is truth.
- **CORS caveat (live key).** Because Storybook calls the API cross-origin, live results require the API server's CORS config to allow the API-key request header from the Storybook origin. If results don't return despite a valid key, this is the likely cause — it's a server-side config matter, not a story bug. Stories still render regardless.
- **Prose parity.** When you write a component's `.md`, paste the Summary/guidance text into that component's story `description.component` so both copies match (the "full prose in both" decision).
