---
status: awaiting_human_verify
trigger: "Deployed web app calls https://locnative-server.mr-amanijoseph.workers.dev instead of https://api.locnative.com"
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:10:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED — workers.dev URL baked into build via .env.production and wrangler.jsonc vars
test: read both files
expecting: fix applied, deploy needed to verify
next_action: await human verification after redeploy

## Symptoms

expected: Deployed web app API/RPC calls go to https://api.locnative.com
actual: Deployed web app calls https://locnative-server.mr-amanijoseph.workers.dev
errors: None — behavioral/config issue
reproduction: Open deployed web app, observe network tab — RPC requests hit workers.dev
started: Persistent/ongoing across deploys

## Eliminated

- hypothesis: URL hardcoded as literal string in orpc.ts source
  evidence: orpc.ts reads from import.meta.env.VITE_SERVER_URL — no literal workers.dev URL in source code
  timestamp: 2026-04-17T00:05:00Z

- hypothesis: wrangler.jsonc production env block already had correct URLs
  evidence: apps/web/wrangler.jsonc had no env.production block at all — only top-level vars with workers.dev URLs
  timestamp: 2026-04-17T00:07:00Z

## Evidence

- timestamp: 2026-04-17T00:04:00Z
  checked: apps/web/src/lib/orpc.ts
  found: getServerBaseUrl() reads import.meta.env.VITE_SERVER_URL at runtime in production
  implication: VITE_SERVER_URL env var controls the API base URL in the build

- timestamp: 2026-04-17T00:05:00Z
  checked: apps/web/.env.production
  found: VITE_SERVER_URL=https://locnative-server.mr-amanijoseph.workers.dev
  implication: Vite bakes this workers.dev URL into every production build

- timestamp: 2026-04-17T00:06:00Z
  checked: apps/web/wrangler.jsonc top-level vars
  found: VITE_SERVER_URL and BETTER_AUTH_URL both set to workers.dev URLs; no env.production block
  implication: Even wrangler deploy with --env production would inject workers.dev URL

- timestamp: 2026-04-17T00:07:00Z
  checked: apps/server/wrangler.jsonc
  found: env.production.vars has BETTER_AUTH_URL=https://api.locnative.com and routes with custom_domain=true for api.locnative.com
  implication: Server side is correctly configured — api.locnative.com is bound as custom domain. Only web app config was wrong.

## Resolution

root_cause: Two config locations both pointed VITE_SERVER_URL at workers.dev. (1) apps/web/.env.production had the wrong URL baked in — Vite picks this up at build time. (2) apps/web/wrangler.jsonc had no env.production override block, so the top-level workers.dev vars were used for all environments including production deploys.

fix: (1) Changed apps/web/.env.production VITE_SERVER_URL to https://api.locnative.com. (2) Added env.production block to apps/web/wrangler.jsonc with correct VITE_SERVER_URL, BETTER_AUTH_URL, and WEB_BASE_URL values, plus locnative.com custom_domain route entry.

verification: Deploy web app to production with wrangler deploy --env production (or CI pipeline). Open deployed app, open browser devtools Network tab, trigger any RPC call — confirm requests go to https://api.locnative.com/rpc not workers.dev.

files_changed:
  - apps/web/.env.production
  - apps/web/wrangler.jsonc
