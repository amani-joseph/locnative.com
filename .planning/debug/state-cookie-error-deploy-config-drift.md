---
status: awaiting_human_verify
trigger: "State cookie error on deployed locnative.com — BetterAuth OAuth state cookie missing on callback"
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:00:00Z
---

## Current Focus

hypothesis: Multiple layered config issues cause the state cookie to drop on the OAuth callback. Primary: NODE_ENV guard makes cookie attrs conditional, but the default (non-production) wrangler vars block omits NODE_ENV, so any deploy NOT using --env production gets sameSite=lax + no domain — which breaks cross-subdomain cookie delivery. Secondary: apps/server/.env has BETTER_AUTH_URL pointing at wrong port.
test: Audit all wrangler vars blocks and env files against mydeffo working config.
expecting: Top-level vars block in apps/server/wrangler.jsonc must also set NODE_ENV=production and the correct cookie-influencing vars so IS_PRODUCTION is always true in deployed Workers (Workers always run outside Node dev mode).
next_action: Fix apps/server/wrangler.jsonc top-level vars, fix apps/server/.env, remove BETTER_AUTH_URL from apps/web/wrangler.jsonc (it is irrelevant / misleading there), run ultracite fix.

## Symptoms

expected: OAuth sign-in completes without cookie errors on deployed app.
actual: "State cookie" error on deployed app — BetterAuth OAuth callback can't find/validate the state cookie.
errors: "State cookie" / INVALID_STATE / state_cookie_missing from BetterAuth social sign-in callback.
reproduction: Attempt GitHub OAuth sign-in on the deployed locnative.com app.
started: Persistent on deployed; issue unique to locnative (mydeffo doesn't have it).

## Side-by-Side Diff Table

| Dimension | locnative (broken) | mydeffo (working) |
|---|---|---|
| **Domain strategy** | Subdomain split: web=locnative.com, api=api.locnative.com | Subdomain split: web=mydeffo.com, api=api.mydeffo.com — identical strategy |
| **BetterAuth baseURL (server)** | `https://api.locnative.com` (server wrangler env.production) | `https://api.mydeffo.com` (server wrangler env.production) |
| **BetterAuth baseURL (web wrangler vars)** | `https://locnative.com` — WRONG: this var is unused by auth.ts but pollutes the env and is misleading | Not set in web wrangler — only VITE_SERVER_URL is set |
| **NODE_ENV in top-level wrangler vars** | MISSING from `apps/server/wrangler.jsonc` top-level vars | Not needed because mydeffo does NOT use IS_PRODUCTION guard — always sameSite=none |
| **NODE_ENV in env.production vars** | `NODE_ENV=production` present | `NODE_ENV` not needed (no guard) |
| **Cookie sameSite** | Conditional: `IS_PRODUCTION ? "none" : "lax"` — dangerous if NODE_ENV not set | Always `"none"` — no conditional |
| **Cookie secure** | Conditional: `IS_PRODUCTION` | Always `true` |
| **Cookie domain** | Conditional: only if IS_PRODUCTION AND AUTH_COOKIE_DOMAIN set | Conditional: only if AUTH_COOKIE_DOMAIN set (no NODE_ENV gate) |
| **AUTH_COOKIE_DOMAIN (server wrangler)** | `.locnative.com` in env.production only | `.mydeffo.com` in env.production only |
| **GitHub redirectURI** | `${BETTER_AUTH_URL}/api/auth/callback/github` = `https://api.locnative.com/api/auth/callback/github` | No explicit redirectURI — BetterAuth derives from baseURL automatically |
| **trustedOrigins** | `locnative.com`, `api.locnative.com`, `localhost:3001` | `mydeffo.com`, workers.dev fallback, `localhost:3001` |
| **Auth client baseURL** | Runtime check: localhost→port 3003, else VITE_SERVER_URL | Always VITE_SERVER_URL |
| **Auth client credentials** | `credentials: "include"` explicit | Not set (better-auth defaults handle it) |
| **apps/server/.env BETTER_AUTH_URL** | `http://localhost:3001` — WRONG port (server runs on 3003) | Correct |
| **apps/web/wrangler.jsonc BETTER_AUTH_URL** | `https://locnative.com` — this var is read by web Worker env but auth.ts runs on the API server, not web | Not present |
| **callbackURL in signIn.social** | `window.location.origin + "/dashboard"` = `https://locnative.com/dashboard` — correct | `toAbsoluteURL(callbackURL)` helper — same result |

## Eliminated

- hypothesis: callbackURL resolves to api.locnative.com instead of locnative.com
  evidence: login.tsx uses `window.location.origin` which is locnative.com (the web app origin) — correct
  timestamp: 2026-04-17

- hypothesis: GitHub OAuth redirectURI mismatch
  evidence: auth.ts explicitly sets redirectURI to `${BETTER_AUTH_URL}/api/auth/callback/github` using the SERVER's BETTER_AUTH_URL = https://api.locnative.com — path is /api/auth/callback/github which matches the mounted handler. This is correct assuming the GitHub OAuth App is configured with this same URI.
  timestamp: 2026-04-17

- hypothesis: CORS blocking callback
  evidence: apps/server/src/index.ts CORS allowedOrigins includes locnative.com and credentials:true — same pattern as mydeffo
  timestamp: 2026-04-17

## Evidence

- timestamp: 2026-04-17
  checked: packages/api/src/auth.ts IS_PRODUCTION guard
  found: `const IS_PRODUCTION = process.env.NODE_ENV === "production"` — cookie attrs are conditional on this flag
  implication: If NODE_ENV is not "production" at runtime, cookies get sameSite=lax and no domain — state cookie cannot be sent cross-subdomain on the callback

- timestamp: 2026-04-17
  checked: apps/server/wrangler.jsonc top-level vars
  found: NODE_ENV is absent from top-level vars; only present in env.production block
  implication: When deploying with `wrangler deploy` (no --env flag) or previewing, NODE_ENV is not set → IS_PRODUCTION=false → wrong cookie attrs

- timestamp: 2026-04-17
  checked: mydeffo packages/auth/src/index.ts cookie attrs
  found: Always `sameSite: "none", secure: true` — no NODE_ENV conditional
  implication: mydeffo sidesteps this entire class of failure by not gating on NODE_ENV

- timestamp: 2026-04-17
  checked: apps/server/.env BETTER_AUTH_URL
  found: `BETTER_AUTH_URL=http://localhost:3001` — dev server runs on port 3003 (apps/server/wrangler.jsonc dev.port=3003)
  implication: Local dev auth broken — all social sign-in redirectURIs point at wrong port

- timestamp: 2026-04-17
  checked: apps/web/wrangler.jsonc vars
  found: BETTER_AUTH_URL=https://locnative.com set on the web Worker — but auth.ts is server-side code, never runs in the web Worker
  implication: Misleading config that does nothing but can cause confusion; VITE_SERVER_URL is the correct var for the web layer

- timestamp: 2026-04-17
  checked: mydeffo apps/server/wrangler.jsonc
  found: No NODE_ENV var at all — mydeffo does not use IS_PRODUCTION guard so it doesn't need it
  implication: Confirms mydeffo's approach is simpler and safer: always use production cookie attrs on the server regardless of NODE_ENV

## Resolution

root_cause: |
  Three compounding issues:
  1. PRIMARY: `packages/api/src/auth.ts` gates cookie attributes (sameSite, secure, domain) on `NODE_ENV === "production"`. The top-level `vars` block in `apps/server/wrangler.jsonc` does NOT set NODE_ENV, so any wrangler deploy without `--env production` (or any preview) runs with IS_PRODUCTION=false → sameSite=lax + no domain → state cookie is lost cross-subdomain on the GitHub callback.
  2. SECONDARY: Even for production deploys, this is fragile. mydeffo avoids the problem entirely by unconditionally using sameSite=none on the server (Workers always serve HTTPS, so secure=true is always appropriate).
  3. LOCAL DEV: apps/server/.env has BETTER_AUTH_URL=http://localhost:3001 but the dev server port is 3003, breaking local OAuth.

fix: |
  1. Remove IS_PRODUCTION conditional from `packages/api/src/auth.ts` cookie attrs — always use sameSite=none, secure=true (same as mydeffo). Keep domain conditional on AUTH_COOKIE_DOMAIN env var.
  2. Fix `apps/server/.env` BETTER_AUTH_URL to http://localhost:3003.
  3. Remove BETTER_AUTH_URL from `apps/web/wrangler.jsonc` vars (it is unused and misleading).
  4. Add NODE_ENV=production to the top-level vars in `apps/server/wrangler.jsonc` as a safety net (in case any other code checks it).

verification: Pending human verification on deployed app.
files_changed:
  - packages/api/src/auth.ts
  - apps/server/.env
  - apps/server/wrangler.jsonc
  - apps/web/wrangler.jsonc
