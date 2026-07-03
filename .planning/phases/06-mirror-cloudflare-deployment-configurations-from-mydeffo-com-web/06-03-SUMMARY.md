---
phase: 06-mirror-cloudflare-deployment-configurations-from-mydeffo-com-web
plan: 03
subsystem: auth
tags: [better-auth, cookies, cross-subdomain, cloudflare]

requires:
  - phase: 06-01
    provides: AUTH_COOKIE_DOMAIN env var in serverEnv schema
  - phase: 06-02
    provides: wrangler.jsonc with AUTH_COOKIE_DOMAIN in production vars
provides:
  - BetterAuth config with configurable cookie domain for cross-subdomain auth
affects: [deployment, auth]

tech-stack:
  added: []
  patterns: [conditional-cookie-domain-via-env-var, defaultCookieAttributes-spread-pattern]

key-files:
  created: []
  modified: [packages/api/src/auth.ts]

key-decisions:
  - "Replaced crossSubDomainCookies with defaultCookieAttributes for explicit cookie control"
  - "Used spread pattern for conditional domain to avoid undefined domain attribute"

patterns-established:
  - "Cookie domain config: use serverEnv.AUTH_COOKIE_DOMAIN with conditional spread in defaultCookieAttributes"

requirements-completed: [CFDP-05]

duration: 4min
completed: 2026-04-17
---

# Phase 06 Plan 03: Auth Cookie Domain Summary

**Configurable cookie domain via AUTH_COOKIE_DOMAIN env var using BetterAuth defaultCookieAttributes spread pattern**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-17T01:13:37Z
- **Completed:** 2026-04-17T01:17:44Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added configurable cookie domain to BetterAuth config via AUTH_COOKIE_DOMAIN env var
- Replaced hardcoded crossSubDomainCookies with explicit defaultCookieAttributes for better control
- Verified TypeScript compilation and code style compliance

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AUTH_COOKIE_DOMAIN support to BetterAuth config** - `006555d` (feat)
2. **Task 2: Verify full build succeeds** - no commit (verification-only task)

## Files Created/Modified
- `packages/api/src/auth.ts` - Added conditional cookie domain from AUTH_COOKIE_DOMAIN env var using defaultCookieAttributes spread pattern

## Decisions Made
- Replaced `crossSubDomainCookies` API with `defaultCookieAttributes` -- provides explicit control over sameSite, secure, httpOnly, and domain attributes
- Used conditional object spread `...(serverEnv.AUTH_COOKIE_DOMAIN ? { domain: ... } : {})` to avoid setting undefined domain attribute
- Removed unused `isProduction` variable that was only used by the old crossSubDomainCookies logic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused isProduction variable**
- **Found during:** Task 1
- **Issue:** After replacing crossSubDomainCookies with defaultCookieAttributes, the isProduction variable became dead code
- **Fix:** Removed the variable declaration
- **Files modified:** packages/api/src/auth.ts
- **Verification:** ultracite check passed with no issues
- **Committed in:** 006555d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/dead code)
**Impact on plan:** Necessary cleanup to avoid dead code. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in api-explorer.ts (`cache` property on `RequestInit`) -- unrelated to this plan, not addressed

## Known Stubs
None -- all functionality is fully wired.

## User Setup Required
None - AUTH_COOKIE_DOMAIN env var was already added to serverEnv (Plan 01) and wrangler.jsonc (Plan 02).

## Next Phase Readiness
- Auth cookie domain configuration complete
- Production deployment will use AUTH_COOKIE_DOMAIN=.locnative.com for cross-subdomain cookie sharing
- Local dev continues to work without the env var set

---
*Phase: 06-mirror-cloudflare-deployment-configurations-from-mydeffo-com-web*
*Completed: 2026-04-17*
