# Code Review — Public API Endpoints

**Scope:** `packages/api/src/routers/public/*`, `routers/public-http.ts`, `routers/public-middleware.ts`, `routers/domains/{api-explorer,geocode}.ts`, `apps/web/src/lib/api-explorer-endpoints.ts`, `apps/web/src/components/api-explorer.tsx`
**Depth:** standard (per-file + cross-file)
**Method:** manual (GSD orchestration unavailable — `gsd-sdk` not installed; ad-hoc work, no numbered phase)
**Date:** 2026-06-07

---

## Critical

_None outstanding._

- **(RESOLVED this session)** `zones.contains` used bare `z.number()` for `lat`/`lng`. GET query params are strings and oRPC's OpenAPIHandler does not auto-coerce → every call returned HTTP 400. Fixed to `z.coerce.number()`. `packages/api/src/routers/public/zones.ts:227`.

---

## Warning

### W-1 — Webhook SSRF: arbitrary delivery URL, no scheme/IP validation `[security]`
`packages/api/src/routers/public/webhooks.ts:44` — `createWebhook` accepts any `z.string().url()` and the worker later POSTs zone-crossing payloads to it (`apps/server/src/queues/webhook-delivery.ts`). A caller can register `http://127.0.0.1`, `http://169.254.169.254/...`, or internal hostnames and turn the platform into an SSRF relay.
**Fix:** require `https://`, reject private/loopback/link-local/metadata ranges (resolve host, block RFC1918 + `169.254.0.0/16` + `::1`), optionally an allowlist of ports. Validate at create time and again before each delivery (DNS rebinding).

### W-2 — Non-constant-time comparison of the internal-auth secret `[security]`
`packages/api/src/routers/public-middleware.ts:25` — `authHeader !== serverEnv.BETTER_AUTH_SECRET`. When this header matches, `apiKeyAuth` authenticates via `validateApiKeyById(db, internalApiKeyId)` — i.e. it trusts a key **by id with no key secret**, gated solely on `BETTER_AUTH_SECRET`. A plain `!==` is not timing-safe for a secret comparison.
**Fix:** use a constant-time compare (`crypto.timingSafeEqual` on equal-length buffers). The trust chain (session auth → ownership check → secret header) is otherwise sound.

### W-3 — Lost webhook events on post-commit enqueue failure `[reliability]`
`packages/api/src/routers/public/devices.ts:139` — `pushDeviceLocation` commits the device-zone-state transaction (which advances `zone_ids`), then enqueues webhooks with `Promise.all`. If enqueue throws, the client gets a 500 but the state is already updated, so a retry re-detects **no** crossing → the entry/exit event is silently dropped.
**Fix:** transactional outbox (write pending deliveries inside the tx, drain async), or don't advance state until enqueue succeeds, or make enqueue failures non-fatal + reconcilable.

### W-4 — Batch-geocode logic duplicated with divergence `[maintainability]`
`packages/api/src/routers/public/geocode.ts` (API-key auth) and `routers/domains/geocode.ts` (session auth) implement submit/poll/results twice and have already drifted (public `batchPoll` returns `downloadUrl`, domains doesn't; results JSON cast differs). Two copies will keep diverging.
**Fix:** extract shared submit/poll/results query + R2 logic into `shared/batch-geocode.ts`; keep only auth/context differences in each router.

---

## Info

- **I-1 — DRY:** `requireProjectId()` is copy-pasted in `public/zones.ts:34`, `public/devices.ts:24`, `public/webhooks.ts:20`. Extract to `shared/`.
- **I-2 — Type safety:** every handler does `context as typeof context & { validatedApiKey: ValidatedApiKey }`. The `apiKeyAuth` middleware adds this to context but the type isn't propagated. Type the middleware's `next({ context })` output so handlers receive a typed context and the casts disappear.
- **I-3 — Lint debt in `public/geocode.ts`** (lines ~147–264): `noExplicitAny` on CF Queue/R2 bindings, `noNonNullAssertion` on `job!`, and two unused `biome-ignore` suppressions. Type the CF env bindings (`Queue`, `R2Bucket`) once in a shared `env.d.ts` to remove the `any`s and assertions.
- **I-4 — Pagination metadata:** `zoneList`/`zoneAddresses` return only the current page's `count`; no total or `hasMore`. Consumers can't tell when to stop.
- **I-5 — Enumeration:** `addresses/{id}` (`public-http.ts:220`) exposes the full address table by sequential integer id with no scoping. Acceptable for public G-NAF reference data, but worth a conscious decision (and rate limiting).
- **I-6 — OpenAPI drift (root cause class):** `apps/web/src/lib/openapi.ts` is a hand-maintained spec separate from the oRPC route definitions, and the explorer catalog was a third hand-maintained list. The catalog drift fixed this session (bogus `projectId`, wrong example ids, `offset` vs `page`) is symptomatic. Generate the OpenAPI doc + explorer catalog from the router (`@orpc/openapi` can emit the spec) to make drift impossible.

---

## Resolved (follow-up fixes)
- **W-1 Webhook SSRF — FIXED.** Added pure `validateWebhookUrl` SSRF guard (`packages/api/src/shared/webhook-url.ts`, 10 unit tests). Enforced at create time (`webhooks.ts` — requires `https` + blocks private/loopback/link-local/metadata/IPv4-mapped) and re-checked at delivery time (`apps/server/.../webhook-delivery.ts` — defense-in-depth for legacy rows / rebinding). Exported from `@locnative/api`.
- **W-2 Timing-safe secret compare — FIXED.** `public-middleware.ts` now uses `crypto.timingSafeEqual` (with length guard) for the internal-auth header instead of `!==`.

- **W-3 Device-location reliability — FIXED (was worse than reported: endpoint was 100% broken).** Investigation found `pushDeviceLocation` used `db.transaction()`, which **throws** on the `neon-http` driver ("No transactions support") — so every call failed, not just the lost-event edge case. Also, the public `/api/v1/*` handler never threaded CF `env` into context and `CloudflareEnv` omitted `WEBHOOK_DELIVERY_QUEUE`, so webhook enqueue could never fire. Fixes: (a) thread env (incl. `WEBHOOK_DELIVERY_QUEUE`) into the public + RPC context (`apps/server/src/index.ts`, `packages/api/src/context.ts`); (b) rewrote the handler off the transaction to single-statement reads + an idempotent `onConflictDoUpdate` upsert, **enqueuing webhooks before advancing persisted state** so an enqueue failure re-detects the crossing next push (at-least-once; consumers are HMAC-signed/idempotent). `packages/api/src/routers/public/devices.ts`.
- **W-4 Batch-geocode duplication — FIXED.** Extracted create/get/results/list into `packages/api/src/shared/batch-geocode.ts`; `public/geocode.ts` (API-key auth) and `domains/geocode.ts` (session auth) now call it, keeping only auth + response shaping. Removes the drift.

## Resolved this session
- `zones.contains` query-param coercion (was Critical — 100% failure).
- Explorer catalog drift: removed bogus required `projectId`, fixed numeric/UUID example ids, `offset`→`page` (`api-explorer-endpoints.ts`).
- Docs-only POST/PUT/DELETE endpoints no longer error — render curl via shared `buildApiExplorerCurl` instead of an erroring Send button.
- Removed invalid `cache: "no-store"` from the explorer proxy fetch (`domains/api-explorer.ts`) — typecheck error.
- `geocode.test.ts` env isolation — extracted pure `buildGeocodeQuery` to env-free `geocode-query.ts` (suite now runs: 27/27 green).

## Verification status
- API typecheck: clean · Web typecheck: clean · API tests: 27/27 · No new lint errors introduced.
