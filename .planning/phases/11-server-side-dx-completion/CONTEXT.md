# Phase 11 Context — Server-side DX completion (API contract enforcement + Python SDK)

## Goal

Make the **server** honour the resilience contract the TypeScript SDK already speaks, then
mirror the proven namespaced surface in a **Python SDK** publishable to PyPI. The TS SDK
(`packages/sdk`) is the source of truth for the wire contract — it already *sends* idempotency
keys and *reads* `requestId`/`docUrl`/`fields`/`Retry-After`, but the server only emits half of
that today. This phase closes the gap on the server, then ports the surface to Python.

This is **contract-completion + distribution**, not new product surface. No new API endpoints.

## Current state (verified in code, 2026-06-11)

### Error envelope — partial
- `packages/api/src/api-response.ts` defines the canonical body: `{ error: { code, message } }`
  with `ApiErrorCode = "bad_request" | "internal_error" | "not_found" | "unauthorized"` and
  helpers `createApiErrorBody`, `jsonApiError`, `applyServerTiming`.
- `apps/server/src/index.ts` post-processes oRPC/OpenAPI responses through an
  `ORPC_TO_API_ERROR` map (oRPC code → `{ status, code }`) and re-serialises to
  `{ error: { code, message } }` with `cache-control: no-store`.
- **Missing vs the SDK's expectation:** no `request_id`, no `doc_url`, no `fields[]` in the body,
  and **no `X-Request-Id` response header** anywhere. The SDK's `LocnativeApiError` exposes
  `requestId`/`docUrl`/`fields` and tests already assert it reads `X-Request-Id` from headers —
  the server simply never sets them.
- The narrow `ApiErrorCode` union (4 codes) is **narrower** than the SDK's `LocnativeErrorCode`
  (`bad_request | conflict | forbidden | internal_error | not_found | rate_limited | timeout |
  unauthorized | unprocessable`). Zod validation errors are currently flattened into `message`
  with no structured `fields[]`.

### Rate-limit headers — absent
- No `RateLimit-*` or `Retry-After` headers are emitted anywhere. The SDK's resilience tests
  prove it *honours* `Retry-After` on `429` (`http-resilience.test.ts`), but the server never
  returns a `429` with that header, nor any rate-limit signalling on `2xx`.
- There is usage *accounting* (`usageMiddleware(endpointKey)` → `recordUsage` →
  `api_usage_daily` table in `packages/database/src/schema/api-keys.ts`) but it is **post-hoc
  daily counting, not a live limiter**. No per-key request budget is enforced.

### Idempotency — accepted but not enforced
- The SDK auto-generates and sends an `Idempotency-Key` header on every write (`POST`/`PUT`)
  and **reuses the same key across retries** (`http.ts`; asserted in `http-resilience.test.ts`).
- The server **ignores the header entirely**. A retried write (e.g. SDK retries a `503` on
  `POST /api/v1/zones`) will execute the mutation twice → duplicate rows. This is the most
  user-visible correctness gap.

### Auth / middleware layer (the integration points)
- `packages/api/src/routers/public-middleware.ts`:
  - `apiKeyAuth` — base oRPC middleware; validates `Authorization: Bearer`/`X-API-Key` (or the
    internal explorer-test path), puts `validatedApiKey: ValidatedApiKey` + `requestSource` on
    context, else throws `ORPCError("UNAUTHORIZED")`.
  - `usageMiddleware(endpointKey)` — runs the handler then records usage on success.
- Public routers compose: `baseBuilder.use(apiKeyAuth).use(usageMiddleware("...")).route(...)`.
  Every public endpoint already flows through these two middlewares — they are the natural seam
  for rate-limit headers and idempotency.
- `packages/api/src/context.ts` — oRPC `Context` carries `{ db, env, localFetch, req, session }`.
  `CloudflareEnv` currently types only queue/R2 bindings; **no KV / Durable Object binding
  exists yet**.

### Cloudflare runtime (`apps/server/wrangler.jsonc`)
- Bindings today: queues (`BATCH_GEOCODE_QUEUE`, `WEBHOOK_DELIVERY_QUEUE`), R2
  (`GEOCODE_RESULTS`, `MAP_TILES`). **No KV namespace, no Durable Object.** `nodejs_compat` on,
  custom domain `api.locnative.com`.
- DB is Neon Postgres via Drizzle. **GOTCHA (memory):** the `neon-http` driver has **no
  transactions** — `db.transaction()` throws. Any dedupe store on Postgres must use idempotent
  upserts (`INSERT ... ON CONFLICT`) keyed on the idempotency key, **never** `SELECT ... FOR
  UPDATE`.

## Client-expected contract (extracted from `packages/sdk`)

The server must converge on exactly this — these are not aspirations, they are already shipped
in the published TS client and covered by tests.

| Signal | Where the SDK reads/sends it | Server obligation |
|---|---|---|
| Error body | `{ error: { code, message, request_id?, doc_url?, fields? } }` (`shared-types.ts` `LocnativeApiErrorPayload`) | Emit all five keys; `fields[]` = `{ path, message }[]` on validation errors |
| `code` union | `LocnativeErrorCode` (9 codes incl. `conflict`, `forbidden`, `rate_limited`, `timeout`, `unprocessable`) | Widen `ApiErrorCode` + `ORPC_TO_API_ERROR` to cover them |
| `request_id` | body `request_id` **and** `X-Request-Id` header (SDK prefers body, falls back to header) | Generate one id per request; set header on **every** response (success + error); echo in error body |
| `doc_url` | `LocnativeApiError.docUrl` | Per-code docs link, e.g. `https://docs.locnative.com/errors/{code}` |
| `Retry-After` | honoured on `429` before retry (`http.ts`) | Set on `429` (and optionally `503`) as integer seconds |
| `RateLimit-*` | not parsed by SDK yet, but part of the success criteria & expected by raw HTTP users | Emit IETF draft headers on responses |
| `Idempotency-Key` | auto-sent on writes, **stable across retries** | Dedupe: same key + same route → replay the original outcome, do not re-execute |
| Retryable statuses | `408, 425, 429, 500, 502, 503, 504` (`RETRYABLE_STATUSES`) | Ensure transient failures use these; permanent errors use `4xx` non-retryable |

### TS resource surface the Python SDK must mirror (`packages/sdk/src/resources/*`)
- `geocode.forward(params)`, `geocode.batch.submit/poll/results`
- `addresses` — autocomplete/suggestions (GET)
- `routing.directions(params)`
- `zones` — `create/get/list/update/delete/contains/addresses`
- `regions.classify(params)`
- `devices.pushLocation(deviceId, body)`, `devices.zones(deviceId)`
- `webhooks.create/list/delete/reactivate`
- Client config: `apiKey`, `baseUrl` (default `https://api.locnative.com`), `timeoutMs`
  (30s), `maxRetries` (2). Backoff: base 200ms, cap 5s, full-jitter. Per-call `CallOptions`:
  `headers`, `idempotencyKey`, `maxRetries`, `timeoutMs`, `signal`. Header `x-locnative-sdk:
  py/<ver> api/v1`. Typed error `LocnativeApiError(code, message, status, request_id, doc_url,
  fields)`.

## Decisions (locked 2026-06-11)

| Decision | Choice | Rationale |
|---|---|---|
| Request-id source | Generate `crypto.randomUUID()` in `apps/server` if no inbound `X-Request-Id`/`cf-ray`; thread through context | One id per request, on every response. No new dependency. |
| Error-body assembly | Single chokepoint in `apps/server/src/index.ts` response post-processor + widen `api-response.ts` | All public errors already funnel through here; one place to add `request_id`/`doc_url`/`fields`. |
| `fields[]` source | Map oRPC/Zod `BAD_REQUEST` issues → `{ path, message }[]` | SDK type is `{ path, message }`. |
| Rate-limit store | **Cloudflare KV** (new binding `RATE_LIMIT`), fixed-window counter per `apiKeyId` | KV is eventually-consistent but adequate for a coarse per-key budget; no DO cost/complexity. DO upgrade noted as open question if strict limits needed. |
| Rate-limit header spec | IETF `draft-ietf-httpapi-ratelimit-headers` (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) + `Retry-After` on 429 | Matches the success criterion and what Stripe/GitHub-class clients expect. |
| Idempotency store | **Postgres dedupe table** `idempotency_keys` via idempotent upsert (`ON CONFLICT DO NOTHING`), keyed `(api_key_id, idempotency_key)` | Survives Worker restarts; reuses existing Neon DB; **no transactions needed** — first writer wins the `INSERT`, losers replay the stored response. |
| Idempotency scope | Writes only (`POST`/`PUT`/`DELETE` with a body), 24h TTL | Matches SDK `WRITE_METHODS`; bounded storage. |
| Python HTTP lib | **httpx** (sync client; `httpx.Client`) | Mature, typed, connection pooling, easy retry/transport hooks; mirrors `fetch` semantics. |
| Python packaging | **hatchling** backend + `pyproject.toml`, `src/` layout, `py.typed`, built with `python -m build`, published via **`twine`** (Trusted Publishing/OIDC noted as follow-up) | Matches the Phase 9 "manual-first, CI later" precedent. |
| Python version floor | 3.9+ | Broad coverage; `httpx` + typing features available. |

## Open questions (flag at execution)

1. **Rate-limit budget numbers** — per-key requests/window and window length are a product
   decision (tie to plan tier?). Plan ships the mechanism with a sane default + env override;
   exact numbers need owner sign-off.
2. **KV eventual consistency** — a burst across colos can briefly exceed the limit. Acceptable
   for v1 (coarse abuse guard). If strict limits are later required, upgrade the store to a
   Durable Object (sketched in 11-02, not built).
3. **Idempotency response replay fidelity** — do we store the full original response body+status
   to replay byte-for-byte, or just block re-execution and return `409 conflict`? Decision in
   11-03: **store status+body, replay it** (true idempotency, matches Stripe). Confirm storage
   size cap.
4. **PyPI project name & org** — `locnative` on PyPI must be reserved; needs a human checkpoint
   (mirrors the Phase 9 npm-org prerequisite). Publishing is irreversible per version.
5. **`docs.locnative.com/errors/*` pages** — the `doc_url` links should resolve. Page authoring
   is out of scope; plan emits the URLs and tracks doc stubs as a follow-up.

## Phase 9 dependency

Phase 9 proved the **publish flow** end-to-end for the TS SDK (license decision → build/lint/
smoke gates → manual `npm publish` → external install verification). Phase 11's Python publish
plan (11-04) **mirrors that exact ritual** on PyPI: proprietary `LICENSE`, build/lint/smoke
gates, manual `twine upload`, external `pip install` verification, human checkpoint before the
irreversible publish. Do not start 11-04's publish step until 11-01..03 land and the TS publish
precedent is confirmed green.

## Key files

- `packages/api/src/api-response.ts` — envelope helpers + `ApiErrorCode` union (widen)
- `apps/server/src/index.ts` — response post-processor, `ORPC_TO_API_ERROR`, request-id, headers
- `packages/api/src/routers/public-middleware.ts` — `apiKeyAuth`, `usageMiddleware`; seam for
  rate-limit + idempotency middlewares
- `packages/api/src/context.ts` + `apps/server/wrangler.jsonc` — add `RATE_LIMIT` KV binding
- `packages/database/src/schema/api-keys.ts` — sibling for new `idempotency_keys` table
- `packages/sdk/src/resources/*`, `client.ts`, `http.ts`, `shared-types.ts` — Python port source
- `packages/sdk-python/` — new package (mirrors `packages/sdk` layout)
