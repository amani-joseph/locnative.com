# Changelog

All notable changes to `@locnative/react` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/) format.

## [0.2.1] - 2026-06-18

### Changed

- Maintenance republish. No functional or API changes; hooks and peer requirements
  (`react >=18`, `@locnative/sdk >=0.4.2`) are unchanged from 0.2.0.

## [0.2.0] - 2026-06-16

### Added

- `useAutocomplete` now accepts proximity (`lat`/`lng`) and a `sessionToken`,
  forwarded to the SDK, plus `minLength`, an opt-in `sessionStorage` `cache`
  (with `ttlMs`), and `keepPreviousData`.
- `useAutocomplete` result gained `status` (`idle | loading | success | empty |
  error`), `rateLimited`, and `reset()`.
- `useCombobox` — headless WAI-ARIA combobox helpers (`getInputProps`,
  `getListboxProps`, `getItemProps`) with keyboard navigation (↑/↓/Home/End/
  Enter/Esc, wrapping) and full ARIA wiring. Exposes the pure `comboboxReducer`,
  `keyToAction`, and `buildInputProps`/`buildListboxProps`/`buildItemProps`.
- Routing hooks `useDirections`, `useMatrix`, and `useIsochrone` for the routing
  endpoints.

### Changed

- **`useAutocomplete` no longer fires a request until the trimmed query reaches
  `minLength` (default `2`).** Previously a single character triggered a
  request; the API rejects `q` shorter than 2 characters, so those calls always
  failed. Consumers that relied on 1-character queries should pass
  `minLength: 1` to restore the old behaviour (note the API will still reject
  it). Set `minLength` explicitly if you need a different threshold.
- When a new search starts, stale results are now cleared unless
  `keepPreviousData` is set (the flag now governs the loading transition, not
  just error/idle states).
