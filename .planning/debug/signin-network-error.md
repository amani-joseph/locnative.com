---
status: awaiting_human_verify
trigger: "Sign-in fails with 'Network connection lost' HTTP 500 error in TanStack Start server handler"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Multiple local dev configuration gaps prevent the auth proxy from reaching the backend server
test: Server started on port 3003 after fixes, confirmed listening via lsof
expecting: Sign-in should now work when both web and server apps are running
next_action: Await human verification of sign-in flow

## Symptoms

expected: User submits sign-in form and is authenticated, redirected to dashboard
actual: HTTP 500 error with "Network connection lost" thrown from TanStack Start's createStartHandler.ts
errors: |
  Error: Network connection lost.
    at createStartHandler.ts:397:22
    at handleServerRoutes (createStartHandler.ts:896:15)
    at startRequestResolver (createStartHandler.ts:734:19)
    at Object.fetch (server.ts:16:14)
  cause: { remote: true, retryable: true }
  status: 500
reproduction: Try to sign in at localhost:3001
started: Currently happening in dev

## Eliminated

## Evidence

- timestamp: 2026-04-14T00:01:00Z
  checked: Port 3003 (server app)
  found: Nothing listening on port 3003
  implication: The proxy target is unreachable

- timestamp: 2026-04-14T00:02:00Z
  checked: apps/web/src/routes/api/auth/$.ts
  found: Catch-all route proxies all /api/auth/* requests to BETTER_AUTH_URL via proxyRequestToServer()
  implication: Auth requests are correctly routed through the proxy

- timestamp: 2026-04-14T00:03:00Z
  checked: apps/web/.env
  found: BETTER_AUTH_URL=http://localhost:3003, VITE_SERVER_URL=http://localhost:3003
  implication: Web app is configured to proxy to localhost:3003

- timestamp: 2026-04-14T00:04:00Z
  checked: apps/web/vite.config.ts
  found: Cloudflare vite plugin enabled - SSR runs in workerd environment
  implication: The fetch call in proxyRequestToServer runs inside workerd, not Node.js

- timestamp: 2026-04-14T00:05:00Z
  checked: apps/web/wrangler.jsonc vars
  found: BETTER_AUTH_URL set to production URL (https://locnative-server.mr-amanijoseph.workers.dev)
  implication: In workerd, process.env sees production vars from wrangler.jsonc, not .env values

- timestamp: 2026-04-14T00:06:00Z
  checked: apps/server/.dev.vars and apps/server/.env
  found: Neither file exists
  implication: Server app lacks local dev configuration (DATABASE_URL, BETTER_AUTH_SECRET)

- timestamp: 2026-04-14T00:07:00Z
  checked: apps/server/wrangler.jsonc
  found: No port config - wrangler dev defaults to 8787, not 3003
  implication: Port mismatch between what web app expects and what server listens on

- timestamp: 2026-04-14T00:08:00Z
  checked: .gitignore
  found: .dev.vars not gitignored
  implication: Secrets would be committed if .dev.vars files are staged

- timestamp: 2026-04-14T00:09:00Z
  checked: Server start after fixes
  found: workerd now listening on port 3003 (confirmed via lsof)
  implication: Fixes allow server to start on correct port

## Resolution

root_cause: |
  Three compounding local dev configuration gaps caused "Network connection lost":
  1. Server app (apps/server) was not running - no process on port 3003
  2. Server wrangler.jsonc had no port config - wrangler dev defaults to 8787, not 3003
  3. Server lacked .dev.vars for local secrets (DATABASE_URL, BETTER_AUTH_SECRET)
  4. Web app lacked .dev.vars - workerd SSR was using production URLs from wrangler.jsonc vars instead of localhost
fix: |
  1. Created apps/server/.dev.vars with local dev secrets (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WEB_BASE_URL)
  2. Created apps/web/.dev.vars with local dev overrides (BETTER_AUTH_URL, VITE_SERVER_URL, BETTER_AUTH_SECRET, WEB_BASE_URL)
  3. Added dev.port=3003 to apps/server/wrangler.jsonc so server listens on expected port
  4. Added .dev.vars to .gitignore to prevent committing secrets
verification: Server confirmed running on port 3003 after fixes. Awaiting human verification of sign-in flow.
files_changed:
  - apps/server/.dev.vars (created)
  - apps/web/.dev.vars (created)
  - apps/server/wrangler.jsonc (added dev.port=3003)
  - .gitignore (added .dev.vars)
