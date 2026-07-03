# Changelog

All notable changes to `@locnative/sdk` are documented here. This project adheres
to [Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/) format.

## [0.4.3] - 2026-06-18

### Fixed

- `User-Agent` header now reports the SDK's real version. `LOCNATIVE_SDK_VERSION` had
  drifted (pinned at `0.4.1`) while the package version advanced; it now tracks the
  release. The dist smoke check derives the expected version from `package.json` so it
  cannot drift again.

## [0.4.2] - 2026-06-16

### Added

- `addresses.autocomplete` now accepts `lat`/`lng` for proximity boosting (sent to the API as `lat`/`lon`) and a `sessionToken` to group a run of keystrokes into one billable search
- `newSessionToken()` helper for generating per-search session tokens
- Type guards `isLocnativeApiError`, `isRateLimitError`, and `isClientError`
- Geo helpers `getLatLng`, `toLngLat`, and `distanceMeters` (haversine)

## [0.4.1] - 2026-06-15

### Changed

- Added MIT `LICENSE` and license metadata.

## [0.4.0] - 2026-06-15

### Added

- `GeocodeAddress` now includes `streetName`, `streetNumber`, `streetType` structured fields matching `AddressSuggestion`
- Added `logger` option to `LocnativeClientConfig` — called after every request with method, path, status, durationMs, and requestId
- Added `zones.paginate()` async generator for cursor-free iteration over all zones (yields `ZoneRecord[]` per page)
- Exported `WebhookEntryPayload`, `WebhookExitPayload`, and `WebhookEventPayload` discriminated union for typing inbound webhook POST bodies

### Fixed

- `logger` now fires on error responses (4xx/5xx) as well as successful ones

## [0.2.0] - 2026-06-08

First publishable release. Renamed from the internal `@locnative/sdk`.

### Added

- **Full API coverage** — 22 methods across six resource namespaces
  (`addresses`, `geocode`, `zones`, `devices`, `webhooks`, `regions`),
  replacing the previous addresses-only surface.
- **Automatic retries** for transient failures (`408/425/429/5xx`, network errors,
  timeouts) with exponential backoff + full jitter; honours `Retry-After`.
- **Per-request timeouts** (`timeoutMs`, default 30s) and `AbortSignal` support.
- **Idempotent writes** — `POST`/`PUT` calls auto-attach an `Idempotency-Key`;
  override via per-call `options.idempotencyKey`.
- **Per-request `options`** on every method (`timeoutMs`, `maxRetries`, `signal`,
  `idempotencyKey`, `headers`).
- **Richer errors** — `LocnativeApiError` now exposes `requestId`, `docUrl`, and
  `fields` (forward-compatible with the API's expanded error envelope).
- **Published build** — dual ESM + CJS with bundled `.d.ts`, verified by
  `publint` and `are-the-types-wrong`.

### Changed

- Package renamed `@locnative/sdk` → **`@locnative/sdk`** (npm scopes cannot
  contain a dot). No backward-compat alias — the prior version was unpublished.
- Client surface is now resource-namespaced (`client.zones.create(...)`), replacing
  the earlier flat methods.

[0.4.0]: https://github.com/amani-joseph/locnative.com/releases/tag/sdk-v0.4.0
[0.2.0]: https://github.com/amani-joseph/locnative.com/releases/tag/sdk-v0.2.0
