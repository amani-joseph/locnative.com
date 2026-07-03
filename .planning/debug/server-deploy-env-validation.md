---
status: verifying
trigger: "Cloudflare Workers deploy of apps/server (worker locnative-server) fails at deploy-time startup validation with 'Invalid environment variables' (error 10021) thrown by packages/env/src/server.ts via @t3-oss/env-core createEnv."
created: 2026-07-03
updated: 2026-07-03
---

# Debug: server-deploy-env-validation

## Symptoms

- **Expected:** `pnpm run deploy` in apps/server (`wrangler deploy`) publishes the `locnative-server` Worker successfully.
- **Actual:** Deploy is rejected during Cloudflare's deploy-time startup validation. Cloudflare API error `code: 10021` (validation-errors). Worker global scope throws `Uncaught Error: Invalid environment variables` from `packages/env/src/server.ts:4` (createEnv) via `@t3-oss/env-core`.
- **Error message:**
  ```
  ✘ [ERROR] A request to the Cloudflare API (/accounts/.../workers/scripts/locnative-server) failed.
    Uncaught Error: Invalid environment variables
      at createEnv (@t3-oss/env-core) ... packages/env/src/server.ts:4:26  [code: 10021]
  ```
- **Timeline:** Surfaced during the first post-rebrand deploy of the renamed `locnative-server` Worker. The `wherabouts-server` predecessor deployed previously; the rename + current wrangler/CF startup-validation behavior exposed it.
- **Reproduction:** `cd apps/server && pnpm run deploy` (all bindings resolve; R2 buckets + queues already provisioned; all required secrets set on the Worker).

## Current Focus

- hypothesis: `serverEnv` (createEnv from @t3-oss/env-core) validates ALL fields eagerly at module/global scope. `apps/server/src/index.ts:13` imports it and `index.ts:41-45` reads `serverEnv.WEB_BASE_URL` at top level. During Cloudflare's deploy-time startup validation the Worker global scope runs WITHOUT secrets injected (secrets only present at request time), so the createEnv schema (DATABASE_URL, KEY_ENC_KEY, etc.) fails and the deploy is rejected.
- test: Make env validation lazy (defer to first access at request time) in `packages/env/src/server.ts`; move top-level `serverEnv`/`allowedOrigins` usage in `apps/server/src/index.ts` into request scope; check `apps/web` for the same pattern. Then re-deploy.
- expecting: `wrangler deploy` passes startup validation and publishes.
- next_action: confirm root cause in code, apply lazy-env fix + defer module-scope usage, typecheck/build, then hand back for re-deploy.

reasoning_checkpoint:
  hypothesis: "Eager createEnv at module load validates ALL schema fields (mostly secrets). During Cloudflare deploy-time startup validation the Worker global scope runs WITHOUT secrets (only wrangler `vars` BETTER_AUTH_URL + WEB_BASE_URL are present), so validation throws (error 10021). A lazy Proxy alone is insufficient: several module-scope accesses (auth betterAuth config reads BETTER_AUTH_SECRET/GITHUB_*, auth/db.ts + api/db.ts read DATABASE_URL, index.ts reads WEB_BASE_URL, billing.ts reads WEB_BASE_URL) each trigger full createEnv validation at global scope."
  confirming_evidence:
    - "wrangler.jsonc `vars` only exposes BETTER_AUTH_URL + WEB_BASE_URL; all other fields are secrets absent at startup validation."
    - "Error trace points at packages/env/src/server.ts:4 (the top-level createEnv call) during module evaluation."
    - "grep found module-scope serverEnv accesses reading secret fields: auth/index.ts:115/148/149 (betterAuth config), auth/db.ts:4 + api/db.ts:4 (createDb(DATABASE_URL) -> neon() throws on undefined)."
  falsification_test: "If, after deferring ALL module-scope serverEnv accesses to request/first-access time, `wrangler deploy` still fails at env validation, the hypothesis is wrong."
  fix_rationale: "Making serverEnv a lazy Proxy defers full createEnv to first property access; deferring every module-scope access (lazy Proxy for db + auth, request-scope for allowedOrigins/RETURN_BASE) ensures the first access happens at request time when secrets ARE injected. Addresses root cause (global-scope validation without secrets), not a symptom."
  blind_spots: "Proxy-wrapping drizzle db + better-auth instances could interact with internal `this`/getters; mitigated by binding function properties. Cannot run wrangler deploy here to fully confirm end-to-end."

## Evidence

- timestamp: 2026-07-03 — `wrangler secret list` shows all required secrets set on `locnative-server` (BETTER_AUTH_SECRET, DATABASE_URL, EMAIL_FROM, GITHUB_CLIENT_ID/SECRET, KEY_ENC_KEY, OSRM_AUTH_TOKEN, OSRM_BASE_URL, RESEND_API_KEY, STRIPE_*). No required secret missing.
- timestamp: 2026-07-03 — `apps/server/wrangler.jsonc` has `compatibility_flags: [nodejs_compat, nodejs_compat_populate_process_env]`, `compatibility_date: 2026-04-14`. Config is correct; not a nodejs_compat regression.
- timestamp: 2026-07-03 — `apps/server/src/index.ts:13` `import { serverEnv } from "@locnative/env/server"`; `index.ts:41-45` `const allowedOrigins = new Set([ serverEnv.WEB_BASE_URL.replace(...), ... ])` — confirmed module/global-scope access.
- timestamp: 2026-07-03 — R2 buckets (locnative-geocode-results, locnative-tiles) auto-provisioned; queues (locnative-batch-geocode, locnative-webhook-delivery) created manually. Deploy advanced past all binding provisioning before failing at env validation.

## Eliminated

- hypothesis: Missing/unset Worker secrets — ELIMINATED: `wrangler secret list` confirms all required secrets present.
- hypothesis: `nodejs_compat` / process.env population regression in rebranded wrangler.jsonc — ELIMINATED: both flags present, compat date current.

## Resolution

- root_cause: CONFIRMED. `serverEnv` (@t3-oss/env-core `createEnv`) validated ALL schema fields eagerly at module load, and multiple modules read `serverEnv.*` at global/module scope (auth `betterAuth()` config reading BETTER_AUTH_SECRET/GITHUB_*; auth/db.ts + api/db.ts `createDb(serverEnv.DATABASE_URL)` → `neon()` throws on undefined; apps/server index.ts `allowedOrigins`; billing.ts `RETURN_BASE`). During Cloudflare's deploy-time startup validation the Worker global scope executes WITHOUT secrets injected (only wrangler `vars` BETTER_AUTH_URL + WEB_BASE_URL present), so validation throws "Invalid environment variables" (CF error 10021) and the deploy is rejected.
- fix: Defer ALL env access to request/first-access time. (1) `packages/env/src/server.ts`: wrap `createEnv` in `buildServerEnv()` and export `serverEnv` as a lazy Proxy (validates on first property access, caches). (2) `packages/auth/src/db.ts` + `packages/api/src/db.ts`: export `db` as a lazy Proxy that runs `createDb(serverEnv.DATABASE_URL)` on first use (binds function props). (3) `packages/auth/src/index.ts`: move trustedOrigins/isLocalhostAuth/cookieDomain + `betterAuth({...})` into `buildAuth()`; export `auth` as a lazy Proxy. (4) `apps/server/src/index.ts`: build `allowedOrigins` lazily inside `isAllowedOrigin` instead of at module scope. (5) `packages/api/src/routers/domains/billing.ts`: remove module-scope `RETURN_BASE`, read `serverEnv.WEB_BASE_URL` inside the request handlers. All Proxies preserve the existing `serverEnv.X` / `db.X` / `auth.X` consumer APIs, so no other call sites changed.
- verification: `pnpm --filter @locnative/server check-types` PASSES; `pnpm --filter @locnative/api check-types` PASSES. Web app tsc shows only 5 pre-existing, unrelated errors (children props, `cloudflare:workers` module, geometry undefined) — none touch serverEnv/auth/db. Consumer-facing types unchanged. END-TO-END re-deploy (`wrangler deploy`) is handled by the ORCHESTRATOR and still pending confirmation.
- files_changed: [packages/env/src/server.ts, packages/auth/src/db.ts, packages/api/src/db.ts, packages/auth/src/index.ts, apps/server/src/index.ts, packages/api/src/routers/domains/billing.ts]
