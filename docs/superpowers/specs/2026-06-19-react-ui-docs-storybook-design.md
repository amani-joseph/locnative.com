# @locnative/react-ui — Per-Component Docs + Storybook

**Date:** 2026-06-19
**Status:** Approved design (pending spec review)
**Scope:** `packages/react-ui`

## Problem & context

`packages/react-ui` already ships a comprehensive `README.md` (install, quick start,
prop tables for all 5 exported components) and a `CHANGELOG.md`. Interactive demos also
already exist at `apps/web/src/routes/_protected/components.tsx` (850 lines), but they are
auth-gated, monolithic, and live in the web app rather than the package.

What is missing — and what this spec delivers — is **richer per-component documentation
co-located with the package** plus a **Storybook** instance for the package so each
component has standalone, interactive docs beyond the README's prop tables.

Exported surface (from `src/index.ts`), all in scope:
`AddressAutocomplete`, `AddressFormField`, `ForwardGeocodeInput`, `ReverseGeocodeInput`,
`AddressFieldGroup`, plus utilities `toAddressWithParsed` / `cn` and the exported types.
The internal hooks (`useForwardGeocode`, `useAddressGeolocation`) are not exported and are
out of scope.

## Decisions (locked with user)

1. **Story data source: live demo key.** Stories build a `LocnativeClient` that calls the
   real API, mirroring the `/components` route's `createDemoClient`.
2. **Prose: full narrative in both** `docs/*.md` and Storybook docs pages. Accepted
   maintenance cost: two copies kept deliberately in sync.

### Implication of "live demo key" in standalone Storybook

The `/components` `createDemoClient` works by calling the API **same-origin**: the web app
proxies `/api/v1/*` server-side, so the browser request never trips CORS. Storybook runs
standalone on its own dev server (default port 6006) with **no such proxy**, so it must
call the API cross-origin with an explicit base URL.

Therefore Storybook's demo client reads two env vars (Vite-style, exposed via Storybook):

- `VITE_DEMO_API_KEY` — the publishable demo key (origin-scoped publishable key, never a
  secret server key).
- `VITE_DEMO_API_BASE_URL` — absolute API origin, e.g. `https://api.locnative.com`.
  Falls back to `https://api.locnative.com` if unset.

```ts
// .storybook/demo-client.ts
import { createLocnativeClient } from "@locnative/sdk";

export const DEMO_API_KEY = import.meta.env.VITE_DEMO_API_KEY ?? "";
const BASE_URL =
  import.meta.env.VITE_DEMO_API_BASE_URL ?? "https://api.locnative.com";

export const isDemoConfigured = DEMO_API_KEY.length > 0;

export const createDemoClient = () =>
  createLocnativeClient({ apiKey: DEMO_API_KEY, baseUrl: BASE_URL });
```

**Cross-origin CORS risk:** because calls are now cross-origin, the API server's CORS
config must allow the API-key request header from the Storybook origin (this is the same
`allowHeaders` fix the demo previously needed). If CORS is not configured for the Storybook
origin, live stories will fail their network calls — but Storybook itself still renders.

**Graceful degradation:** when `isDemoConfigured` is false, a Storybook decorator renders a
small "Demo API key not configured — set `VITE_DEMO_API_KEY` to enable live results" banner
above each component. The component still mounts (it just won't return results), so docs and
autodocs remain fully usable offline / in CI.

## Deliverables

### 1. Per-component Markdown docs — `packages/react-ui/docs/`

One file per exported component plus an index:

- `docs/README.md` — index linking to each component doc + a short "how these docs relate to
  Storybook" note.
- `docs/address-autocomplete.md`
- `docs/address-form-field.md`
- `docs/forward-geocode-input.md`
- `docs/reverse-geocode-input.md`
- `docs/address-field-group.md`

Each component doc follows a fixed template:

1. **Summary** — one-paragraph purpose.
2. **When to use / when not to** — guidance vs. sibling components.
3. **Import & minimal example.**
4. **Worked examples** — 2–4 realistic snippets (e.g. controlled usage, TanStack Form
   wiring, geolocation/proximity bias, custom `render*` slots where applicable).
5. **Props** — full table (mirrors README but is the canonical, fuller version).
6. **Accessibility** — concrete notes (WAI-ARIA combobox roles, keyboard nav, labelling).
7. **Recipes & edge cases** — debounce/min-chars tuning, error/empty/loading states,
   session tokens for billing, null-coordinate handling, etc.

The main `README.md` gains a "Per-component documentation" section linking into `docs/`.
The `files` field in `package.json` is extended so `docs/` ships in the npm tarball.

### 2. JSDoc on prop interfaces — `src/components/*.tsx`

Add JSDoc doc comments to every field of the exported `*Props` interfaces
(`AddressAutocompleteProps`, `AddressFormFieldProps`, `ForwardGeocodeInputProps`,
`ReverseGeocodeInputProps`, `AddressFieldGroupProps`, `AddressFieldGroupValue`). This makes
Storybook autodocs prop tables and ArgTypes accurate, and improves IDE hovers. No behavior
changes — comments only.

### 3. Storybook — `packages/react-ui/.storybook/` + `src/components/*.stories.tsx`

- **Builder:** `@storybook/react-vite` (Storybook 8.x — React 19 compatible). Isolated from
  the web app's TanStack-Start/Workers Vite config; the package gets its own minimal Vite
  resolution via the Storybook react-vite preset.
- **Config files:**
  - `.storybook/main.ts` — stories glob `../src/**/*.stories.@(ts|tsx)`, addons
    `@storybook/addon-essentials` (controls, actions, docs/autodocs) + `@storybook/addon-a11y`
    (the library's selling point is accessibility, so a11y checks belong in its Storybook).
  - `.storybook/preview.ts` — imports the package stylesheet
    (`import "../src/styles/globals.css"`), sets `tags: ["autodocs"]`, registers the global
    demo-config decorator (banner when key absent).
  - `.storybook/demo-client.ts` — as above.
- **Stories:** one `*.stories.tsx` per component, each with:
  - A `Meta` whose `parameters.docs.description.component` carries the **full prose** for
    that component (the in-Storybook copy of the narrative).
  - A `Default` story plus prop-variation stories: e.g. `AddressAutocomplete` →
    `Default`, `WithGeolocation`, `CustomMinChars`, `CustomSuggestionRenderer`,
    `DisabledAndError`; geocode inputs → `Default`, `Disabled`; `AddressFieldGroup` →
    `Default`, `CustomLabels`. Interactive stories use the live demo client; static-state
    stories (error/disabled/custom-render) need no network.
  - `argTypes` refined where autodocs inference is insufficient.
- **Scripts** added to `package.json`:
  - `"storybook": "storybook dev -p 6006"`
  - `"build-storybook": "storybook build"`
- **Dev dependencies** added: `storybook`, `@storybook/react-vite`,
  `@storybook/addon-essentials`, `@storybook/addon-a11y` (pinned to a compatible 8.x line),
  and `vite` if not already resolvable in the package.

## Out of scope (YAGNI)

- No Storybook hosting/deployment (Chromatic, Pages, Workers) — local + `build-storybook` only.
- No visual-regression testing.
- No changes to the existing `/components` route.
- No Vue (`packages/vue-ui`) — separate effort.
- No new runtime/SDK features; docs, comments, and Storybook config only.

## Testing & verification

- `pnpm --filter @locnative/react-ui build` still succeeds (tsup unaffected by stories/docs).
- `pnpm --filter @locnative/react-ui storybook` boots; every component renders; autodocs
  pages populate; a11y addon reports no critical violations on default stories.
- `build-storybook` produces a static build without errors.
- With `VITE_DEMO_API_KEY` set, interactive stories return live results; without it, the
  config banner shows and Storybook still loads.
- `pnpm dlx ultracite check` passes on new/edited files; existing `vitest` suite unaffected.
- Markdown docs: links resolve, examples compile against the real exported API.

## Risks

- **CORS for cross-origin live calls** — primary risk; mitigated by the config banner so
  Storybook never hard-fails, and documented as a server-side `allowHeaders` requirement.
- **Storybook 8 ↔ React 19 / Vite version alignment** — pin to a known-compatible 8.x
  release; verify against the repo's catalog React/Vite versions during execution.
- **Prose drift across docs/*.md and Storybook** — accepted; mitigate by using the same
  source text in both during the same task.
