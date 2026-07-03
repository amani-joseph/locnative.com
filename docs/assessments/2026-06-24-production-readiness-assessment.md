# Locnative.com — Production Readiness & Quality Assessment

**Date:** 2026-06-24
**Reviewer perspective:** Senior staff full-stack / product engineer
**Scope:** Full monorepo — `apps/web` (TanStack Start on CF Workers), `apps/server` (CF Worker API, oRPC + Hono), `apps/mcp`, `packages/{api,auth,database,env,ui,react-ui,vue-ui,sdk}`
**Method:** Direct code reading + ran the `packages/api` test suite (158/158 pass). Findings cite `file:line`.

---

## Executive summary

This is a **well-architected, genuinely impressive codebase** for its stage: clean monorepo boundaries, parameterized SQL everywhere, real 2FA + audit logging + account deletion, a thoughtful SSRF guard, PBKDF2 API-key hashing with `timingSafeEqual`, and solid env validation. The engineering judgment in the comments (workerd `waitUntil`, KNN geography operators, cross-runtime crypto) is senior-level.

The gaps that block a confident public launch are **operational and abuse-related, not structural**: there is no application-layer rate limiting on the paid API, no error tracking/alerting, the auth rate-limiter is effectively a no-op on Workers, and signup has no email verification. None are large fixes; most are Small–Medium.

| Score | /10 |
|---|---|
| **Production Readiness** | **5.5** |
| **Architecture Quality** | **8.0** |
| **Developer Experience** | **7.0** |
| **Overall Launch Readiness** | **6.0** |

---

## 1. Critical Issues (must fix before production)

### C1. No application-layer rate limiting on the public API
**Problem.** `packages/api/src/routers/public-middleware.ts:62-128` (`apiKeyAuth`) only checks a free-tier `blocked` boolean. Any key that is *not* blocked (every paid key, and every free key still under quota) can issue **unbounded concurrent requests**. There is no per-key/per-IP request-rate ceiling anywhere in the request path (`apps/server/src/index.ts:300-351`).
**Impact.** A single key can saturate Neon Postgres with the expensive tiered geocode/autocomplete queries (`packages/database/src/queries/autocomplete.ts`, ~600 lines of trigram/levenshtein/dmetaphone scans), degrading every tenant and exploding DB cost. This is both a DoS and a runaway-cost vector.
**Why it matters.** Public, key-authenticated geo APIs are the canonical abuse target. Cost and availability are tied directly to request volume.
**Fix.** Add a sliding-window limiter keyed by `apiKeyId` (and a coarser per-IP one for unauthenticated 401 floods). Use Cloudflare's [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) or extend the existing `UsageMeter` Durable Object (already per-account, single-threaded). Return `429` with `Retry-After`.
**Effort:** Medium.

### C2. No error tracking / alerting / observability beyond raw logs
**Problem.** Grep for `sentry|posthog|opentelemetry|datadog` across `apps/` + `packages/` returns **zero** wiring. Error handling is `console.error` only (`apps/server/src/index.ts:103,129,137`, `public-middleware.ts:176`). CF `observability.logs` is on, but there is no aggregation, grouping, or alerting.
**Impact.** Production incidents are invisible until a user reports them. No on-call signal, no regression detection, no error budget.
**Why it matters.** "Manual wrangler deploys, no CI/CD, prod can run stale code" (project memory) + no error tracking means failures can persist silently for days.
**Fix.** Wire Sentry (the Sentry MCP/plugin is already in the toolchain) into both Workers (`apps/server`, `apps/web`) and the browser bundle. Add at least one alert on 5xx rate and on `[usage]`/`[stripe]` error logs.
**Effort:** Small–Medium.

### C3. BetterAuth rate limiter is effectively a no-op on Workers
**Problem.** `packages/auth/src/index.ts:216-227` enables `rateLimit` but specifies **no `storage`**. BetterAuth defaults to in-memory storage, which on Cloudflare Workers is **per-isolate and ephemeral** — counters reset constantly and don't share across isolates.
**Impact.** Brute-force / credential-stuffing / TOTP-guessing protection (including the `verify-totp` custom rule) is unreliable and largely bypassable.
**Why it matters.** This is the auth surface — the one place rate limiting must actually hold.
**Fix.** Set `rateLimit.storage: "database"` (BetterAuth supports a DB store via the Drizzle adapter) or a KV/DO-backed secondary storage.
**Effort:** Small.

### C4. No email verification on signup
**Problem.** `packages/auth/src/index.ts:121-141` enables email+password with `minPasswordLength: 8` but **no `requireEmailVerification`**. Every new user auto-provisions a Personal team (`:253-279`) and receives the 15k free-request allotment (`BILLING_FREE_ALLOTMENT`).
**Impact.** Unlimited unverified/disposable-email signups, each granting fresh free quota → spam accounts + a free-tier farming / cost vector that compounds with C1/C5.
**Fix.** Require email verification before issuing API keys (or before the free allotment activates). Add disposable-domain filtering if abuse appears.
**Effort:** Small–Medium.

### C5. Free-tier gate is eventually-consistent (TOCTOU overshoot) and silently disabled without Stripe
**Problem.** The quota check `peek`s in `apiKeyAuth` (`public-middleware.ts:104-112`) but the matching `increment` runs in `usageMiddleware` **after the handler, inside `waitUntil`** (`:158-183`). The code comment claims "exact under concurrency," but peek and increment are split across two middlewares with the handler between them and the write deferred past the response. Under burst concurrency, many requests pass the peek before any increment lands. Separately, `STRIPE_*` is `optional` in `packages/env/src/server.ts`; with Stripe unset, billing/metering no-ops and `blocked` is never set → **unlimited free usage**.
**Impact.** Free tier can be materially overshot; a misconfigured prod (no Stripe secrets) silently disables all monetization and quota enforcement.
**Fix.** Make the DO meter do an atomic check-and-increment (reserve-then-commit) in one call instead of peek-then-defer. Add a startup assertion that `STRIPE_*` is present in production, or an explicit `BILLING_ENABLED` flag so "off" is intentional, not accidental.
**Effort:** Medium.

---

## 2. High-Priority Improvements

### H1. Queue consumer lacks per-message isolation and a dead-letter queue
`apps/server/src/index.ts:417-434`: the `queue()` loop `await`s each handler and only then `ack()`s; an exception escapes the loop, so later messages in the batch are neither processed nor acked, and `wrangler.jsonc` defines **no `max_retries`/`dead_letter_queue`** for either consumer. A poison message can retry indefinitely.
**Fix.** Wrap each message in try/catch (ack on success, `retry()` on transient failure), and configure a DLQ + `max_retries`. **Effort:** Medium.

### H2. PBKDF2 (100k iterations) + a DB round-trip on every API request
`packages/api/src/api-key-auth.ts:108-160` runs `deriveApiKeyHash` (PBKDF2-SHA256 × 100,000) and a `SELECT` for **every** authenticated request, with no cache. For a high-RPS geocoding API this is meaningful CPU + latency + DB load on the hot path.
**Fix.** Cache validated key → `ValidatedApiKey` with a short TTL in the `UsageMeter` DO or an in-isolate LRU (keyed by a fast hash of the token). Keep PBKDF2 only on cache miss. **Effort:** Medium.

### H3. No integration/E2E coverage for the most complex code
158 unit tests pass, but they are mock/pure-logic tests. The tiered search (`packages/database/src/queries/autocomplete.ts`, `structured-search.ts`) — the riskiest, most-changed code (multiple prior prod hangs in project memory) — has **no DB-backed integration tests**, and there is no end-to-end test of the auth→dashboard→API-key→geocode happy path.
**Fix.** Add Postgres-backed integration tests (testcontainers or a Neon branch) for the geocode tiers, and a small Playwright smoke for sign-in + key creation + a live API call. **Effort:** Large.

### H4. No CI/CD pipeline
Per project memory, prod is deployed manually via `wrangler` with no gate, so prod can run stale/uncommitted code. There is no automated typecheck/test/deploy.
**Fix.** GitHub Actions: `turbo check-types` + `turbo test` on PR; deploy on merge to `master` with required status checks. **Effort:** Medium.

---

## 3. Medium-Priority Improvements

- **M1. Team auto-creation is not transactional.** `auth/src/index.ts:253-279` inserts `teams` then `teamMembers` separately; neon-http has no transactions (project memory). A failure between the two orphans a team. Add an idempotent reconciler/backfill. *Small.*
- **M2. Weak password policy.** `minPasswordLength: 8`, no breach/zxcvbn check server-side even though `@zxcvbn-ts` is already bundled in `packages/ui`. Enforce a strength/breach check at signup. *Small.*
- **M3. DNS-rebinding SSRF residual risk** is honestly documented in `shared/webhook-url.ts` but unmitigated (Workers can't pin egress IP). Document the accepted risk and consider an egress allowlist/proxy for webhook delivery. *Small–Medium.*
- **M4. `api_usage_daily` write amplification.** `recordUsage` (`api-key-auth.ts:246-268`) does an `INSERT … ON CONFLICT` per request in addition to the billing counter. At scale this is a write-heavy hot path on Neon. Consider DO-buffered aggregation flushed on an interval. *Medium.*
- **M5. Type-safety drift.** 98 `any`/`as any`, 87 `TODO/FIXME/HACK`, 26 `console.*` across source. The CF-binding `any`s in `context.ts` are defensible; the rest should be triaged. *Small, ongoing.*

---

## 4. Low-Priority Improvements

- **L1.** Committed worktrees under `.claude/worktrees/*` (each with its own `node_modules`) bloat the tree and confuse `find`/search. Confirm they're git-ignored and prune. *Small.*
- **L2.** Loose dev typing: `@types/node` is split (`^20` vs `^25` in `packages/ui`) — the same dual-version class that broke server typecheck before (kept in check by `pnpm.overrides`; don't drop it). *Small.*
- **L3.** Numerous root-level planning `.md`/`.html` artifacts (plan.md, NEON_SETUP_RESEARCH.md, product-overview.html, "Locnative.com footer requirement/") clutter the repo root. Move to `docs/`. *Small.*

---

## 5. Technical Debt & Refactoring Opportunities

- `packages/api/src/routers/domains/teams.ts` (17.7 KB) and `routers/public/routing.ts` (17.7 KB) are large; extract role-policy and OSRM-mapping helpers respectively.
- `apps/web/src/components` is flat and large; group by feature (batch/, settings/, analytics/ already exist — extend the pattern).
- `autocomplete.ts` mixes parsing, clause-building, and tier orchestration; splitting the tier strategy from query construction would make the high-risk path far more testable (ties to H3).

---

## 6. Security Findings

**Strong:** parameterized SQL throughout (no `sql.raw` concatenation found); PBKDF2 + `timingSafeEqual` for keys (`api-key-auth.ts`); constant-time internal-auth comparison (`public-middleware.ts:38-48`); SSRF guard with metadata/RFC1918/IPv6 coverage; 2FA + per-route auth rate rules; security audit log with IP/UA; httpOnly + SameSite cookie handling per environment; CORS correctly split (API key endpoints `origin:*, credentials:false`; cookie endpoints origin-allowlisted).

**Gaps:** C3 (auth limiter no-op), C4 (no email verification), C1 (no API rate limit), M3 (DNS rebinding). Also confirm the internal-auth path (`x-locnative-internal-auth` = `BETTER_AUTH_SECRET`) can never be set by an external origin — it relies on the `/api/v1/*` CORS/proxy boundary; add a defense-in-depth check that the header is only honored on the internal service binding.

---

## 7. Performance Findings

- **Hot-path PBKDF2 + DB lookup per request** (H2) — highest-leverage win.
- **Per-request `api_usage_daily` upsert** (M4) — write amplification.
- **Tiered geocode** runs sequential trigram→levenshtein→dmetaphone passes; ensure short-circuit on early hits and that GIN/trigram + the geography KNN index are present (prior hangs were index-related per memory). Add latency budgets/Server-Timing assertions in tests.
- Positive: `waitUntil` correctly defers usage writes; KNN `<->` geography operator used for nearby/reverse; tiles served from R2.

---

## 8. UX / UI Findings

- **Strong a11y foundation:** `skip-link`, `live-announcer`, `use-reduced-motion`, theme switching (light/dark/system) all present and tested.
- Could not deep-audit every flow in this pass; recommend a dedicated UX/a11y review of: error/empty/loading states consistency across dashboard routes, form validation messaging parity between UI and direct-API (the projects router already hardened this — verify others), and mobile layout of the API explorer and batch tables.
- Billing UX caveat (project memory): "Add payment method" works in prod but no-ops on localhost — confirm resolved before launch since it gates C5.

---

## Recommended pre-launch order

1. **C2** error tracking (you're flying blind without it) → **C3** auth limiter → **C4** email verification (all Small).
2. **C1** API rate limiting + **C5** atomic quota (Medium) — the abuse/cost core.
3. **H1** queue DLQ, **H4** CI/CD (Medium).
4. **H2/H3/M4** performance + integration tests as fast-follows.

The architecture is launch-grade; the operational safety net is not yet. Closing C1–C5 + H1/H4 moves Overall Launch Readiness from ~6.0 to ~8.5.
