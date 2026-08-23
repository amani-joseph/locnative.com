# SDK Playground — API-key Select + place-name routing

**Date:** 2026-06-09
**Status:** Approved (design)
**Area:** `apps/web` (SDK Playground) + `packages/api` (geocode router)

## Summary

Two enhancements to the SDK Playground (`apps/web/src/components/sdk-playground.tsx`):

1. Replace the raw-API-key text input with a **combobox** that lists the user's
   saved API keys (resolved server-side via managed mode) while still accepting a
   pasted raw key.
2. Let the `routing.directions` `from`/`to` fields accept a **city / town /
   address** and resolve it to a `"lat,lng"` coordinate through an interactive
   autocomplete picker, with manual coordinate entry as a fallback.

A small backend addition (a session-authed `geocode.autocomplete` procedure)
supports the picker.

## Background / why

- The raw key field requires pasting a `wh_...` secret. Secrets are **hashed at
  rest** (`packages/api/src/routers/domains/api-keys-shared.ts`): the plaintext
  key is returned only once at creation, and `apiKeys.list()` exposes only a
  masked `displayLabel`. A Select therefore cannot populate the raw secret.
- The backend `apiExplorer.sendRequest` already supports
  `authMode: "managed"` + `managedKeyId` (a UUID), resolving the key server-side
  via an internal header — no secret needed
  (`packages/api/src/routers/domains/api-explorer.ts:336-419`). The combobox maps
  cleanly onto this existing mode.
- `routing.directions` `from`/`to` are `"lat,lng"` strings parsed by `parseLatLng`
  (`packages/api/src/routers/public/routing.ts:46-54`). Passing a place name
  currently fails with `'from' must be a valid "lat,lng" coordinate.` Forward
  geocoding (`addresses.geocode`) already returns coordinates by wrapping
  `autocompleteAddresses`, so the conversion has an existing primitive.

## Decisions (resolved with user)

| Question | Decision |
|---|---|
| API-key field shape | Single combobox: pick a saved key **or** type/paste a raw key |
| Geocode scope | Reusable component, wired to `routing.directions` `from`/`to` only (YAGNI on other fields) |
| Ambiguous matches | Interactive picker — user chooses from candidates |
| Geocode failure / no match | Field stays editable; user pastes `"lat,lng"` manually |
| Code panel display | Show the **resolved coordinate** that is actually sent, with a `// <place>` comment |

## Architecture

### Component 1 — `ApiKeyComboboxField`

**Purpose:** choose how the test request authenticates.
**Location:** `apps/web/src/components/sdk-playground/api-key-combobox.tsx` (new).

**Interface:**
```ts
type ApiKeyAuthValue =
  | { mode: "managed"; managedKeyId: string; label: string }
  | { mode: "raw"; rawApiKey: string };

interface ApiKeyComboboxFieldProps {
  value: ApiKeyAuthValue | null;
  onChange: (value: ApiKeyAuthValue | null) => void;
}
```

**Behavior:**
- On mount, loads keys via `orpcClient.apiKeys.list()` →
  `{ id, name, displayLabel, assignmentStatus }[]`.
- Typed text is matched two ways:
  - If it matches the raw-key shape `wh_<uuid>_<secret>` (reuse the backend's
    `RAW_KEY_FORMAT_RE` pattern, mirrored client-side), the value becomes
    `{ mode: "raw", rawApiKey }`.
  - Otherwise it filters the saved-key list by `name` / `displayLabel`.
- Selecting a saved key produces `{ mode: "managed", managedKeyId: id, label }`.
- Empty state (no saved keys): the control still accepts a pasted raw key and
  shows a hint linking to the API Keys page.

**Consumes:** `orpcClient.apiKeys.list`, the shared `Select`/combobox UI primitive.

### Component 2 — `LocationInput`

**Purpose:** resolve a place name to a `"lat,lng"` value, or pass through a
manually entered coordinate.
**Location:** `apps/web/src/components/sdk-playground/location-input.tsx` (new).

**Interface:**
```ts
interface LocationInputProps {
  id: string;
  label: string;
  placeholder?: string;
  /** The literal string sent to the API, e.g. "-27.47,153.03". */
  value: string;
  onChange: (sentValue: string) => void;
  /** Optional human label for the code-panel comment, e.g. "Brisbane QLD". */
  onResolvedLabelChange?: (label: string | null) => void;
}
```

**Behavior:**
- Renders a plain text input. Typing triggers a **debounced** (≈250 ms) call to
  `orpcClient.geocode.autocomplete({ q })` once `q.length >= 5`.
- Shows a dropdown of candidates: `formattedAddress` (or locality) + a small
  `state · postcode` line.
- Selecting a candidate sets `value` to `` `${latitude},${longitude}` `` and emits
  the candidate's display label via `onResolvedLabelChange`.
- If the typed text is already a valid `"lat,lng"` (matches a client mirror of
  `parseLatLng`), it is accepted verbatim and no suggestion is forced; the
  resolved label is cleared.
- On geocode error / zero results, the dropdown shows "No matches — paste
  lat,lng" and the field stays editable.

**Consumes:** `orpcClient.geocode.autocomplete` (new), the shared dropdown/popover
UI primitive.

### Backend — `geocode.autocomplete` procedure

**Location:** `packages/api/src/routers/domains/geocode.ts` (extend
`geocodeRouter`).

```ts
autocomplete: protectedProcedure
  .input(z.object({
    q: z.string().min(5),
    limit: z.number().int().min(1).max(10).default(5),
  }))
  .handler(async ({ context, input }) => {
    const { results } = await autocompleteAddresses(context.db, input.q, {
      limit: input.limit,
    });
    return {
      results: results.map((r) => ({
        id: r.id,
        formattedAddress: r.formattedAddress,
        locality: r.locality,
        state: r.state,
        postcode: r.postcode,
        latitude: r.latitude,
        longitude: r.longitude,
      })),
    };
  });
```

- **Session-authed** (`protectedProcedure`) so the picker works before the user
  has selected an API key (no chicken-and-egg).
- `q` min length 5 mirrors the public geocoder; shorter town names won't suggest
  and rely on the manual fallback.
- No project scoping required — this is read-only address lookup over GNAF.

### Playground wiring (`sdk-playground.tsx`)

- Replace `rawApiKey` state with `authValue: ApiKeyAuthValue | null`.
- `run()` sends `authMode` + (`managedKeyId` | `rawApiKey`) based on `authValue`;
  blocks with a hint if `authValue` is null.
- For the `routing.directions` endpoint specifically, render the `from`/`to`
  params with `LocationInput` instead of the generic text input. All other params
  keep the existing generic input. Detection: endpoint id `routing.directions`
  and param name in `{ "from", "to" }`.
- The SDK snippet (`buildSdkSnippet`) continues to use
  `process.env.LOCNATIVE_API_KEY` for the key, and renders the resolved
  coordinate for `from`/`to` with a trailing `// <resolved label>` comment when a
  label is available.

## Data flow

1. User picks a saved key → `authValue = { mode: "managed", managedKeyId }`.
2. User types "Brisbane" in `from` → debounced `geocode.autocomplete` → candidate
   list → user selects → `from` value becomes `"-27.47,153.03"`, label `Brisbane
   QLD`.
3. `Run` → `apiExplorer.sendRequest({ authMode: "managed", managedKeyId,
   endpointId: "routing.directions", paramValues: { from: "-27.47,153.03", to: ... } })`.
4. Backend resolves the managed key, calls the public routing endpoint, returns
   the route.

## Edge cases

- **Raw secret unrecoverable** → managed mode by id; no secret handled client-side.
- **Multiple / ambiguous matches** → interactive picker; user chooses.
- **Geocode failure / no result** → field stays editable; paste `"lat,lng"`.
- **Query shorter than 5 chars** → no suggestions; manual fallback.
- **No saved API keys** → paste raw still works; hint links to API Keys page.
- **Both managed and raw somehow present** → `authValue` is a discriminated union,
  so only one mode can be active at a time.
- **Secret leakage** → code panel never renders a real or managed secret; only the
  env-var placeholder.
- **Pasted coordinate that is already valid** → accepted verbatim, no geocoding.

## Testing

- **Unit (backend):** `geocode.autocomplete` returns coordinate-bearing
  candidates and respects `limit`; requires a session.
- **Unit (frontend):** combobox mode detection (raw-shape string → raw; otherwise
  filter saved keys); `LocationInput` selection produces `"lat,lng"`; valid pasted
  coordinate passes through without a network call.
- **Snippet:** `buildSdkSnippet` renders the resolved coordinate plus `// <place>`
  comment for `routing.directions`.

## Out of scope (YAGNI)

- Applying `LocationInput` to other coordinate fields (reverse, nearby) — deferred
  until requested; the component is built reusable so this is a later wiring task.
- Reverse-geocoding the resolved coordinate back to a label (we already have the
  candidate's label from autocomplete).
- Persisting the last-used API key across sessions.
