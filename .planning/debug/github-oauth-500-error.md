---
status: awaiting_human_verify
trigger: "POST to /api/auth/sign-in/social returns 500 Internal Server Error on deployed CF Worker after fixing Provider not found error"
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

hypothesis: The 500 is an unhandled exception inside Better Auth's handler (no try/catch in base.mjs). Most likely from generateGenericState writing a verification record to DB, or from crypto operations (setSignedCookie/symmetricEncrypt). The error-logging wrapper added to index.ts will capture the actual error.
test: Deploy error-logging change, trigger social sign-in, check CF Worker logs
expecting: Actual error message revealing root cause
next_action: Deploy and capture logs via wrangler tail

## Symptoms

expected: POST to /api/auth/sign-in/social should redirect to GitHub OAuth
actual: 500 Internal Server Error
errors: POST https://locnative-server.mr-amanijoseph.workers.dev/api/auth/sign-in/social 500 (Internal Server Error)
reproduction: Click "Sign in with GitHub" on deployed app
started: After fixing previous "Provider not found" error - code now committed with socialProviders.github, CF secrets set

## Eliminated

- hypothesis: socialProviders.github not configured
  evidence: Code committed at a00e79f with socialProviders.github config
  timestamp: prior session

- hypothesis: CF secrets GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET not set
  evidence: User confirmed they set the secrets
  timestamp: prior session

## Evidence

- timestamp: 2026-04-16T00:01:00Z
  checked: Better Auth sign-in/social handler source code (dist/api/routes/sign-in.mjs)
  found: Social sign-in flow is (1) generateState -> writes verification to DB, (2) createAuthorizationURL -> builds GitHub redirect. No idToken provided by client, so always goes through the redirect flow.
  implication: The 500 happens in either generateState (DB/crypto) or createAuthorizationURL

- timestamp: 2026-04-16T00:02:00Z
  checked: Better Auth base handler (dist/auth/base.mjs line 49)
  found: No try/catch around handler(request) — exceptions bubble up unhandled to Hono
  implication: The 500 is an unhandled exception, not a Better Auth APIError. Added try/catch logging wrapper in server index.ts.

- timestamp: 2026-04-16T00:03:00Z
  checked: Better Auth state.mjs and state generation flow
  found: Default storeStateStrategy uses DB (verification table). Better Auth patches missing transaction support. generateGenericState creates verification record + sets signed cookie.
  implication: Could fail on DB write (verification table missing/schema mismatch) or crypto (setSignedCookie HMAC)

- timestamp: 2026-04-16T00:04:00Z
  checked: Migration files for verification table
  found: verification table created in migration 0005_busy_felicia_hardy.sql. Schema matches Better Auth expectations.
  implication: Table should exist if migrations were applied

- timestamp: 2026-04-16T00:05:00Z
  checked: Environment configuration flow
  found: serverEnv validates GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET as required (min 1). If worker boots, these values are present. CORS and trustedOrigins both include the web app origin.
  implication: Env vars are not the issue — worker boots successfully

## Resolution

root_cause:
fix:
verification:
files_changed: []
