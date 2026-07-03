---
phase: 08-teams-creation-email-invitations-resend-and-auto-generated-per-member-api-keys-scoped-to-the-team
plan: "01"
subsystem: database
tags: [drizzle, postgres, teams, schema, migration, env]

requires: []
provides:
  - "teams, teamMembers, teamInvitations Drizzle pgTable definitions with types"
  - "projects.teamId nullable FK to teams.id (cascade)"
  - "apiKeys.teamId nullable FK, secretCiphertext, secretIv nullable columns"
  - "Migration SQL: packages/database/migrations/0001_teams.sql"
  - "serverEnv validates RESEND_API_KEY, EMAIL_FROM, KEY_ENC_KEY"
affects:
  - "08-02: backfill + NOT NULL tightening reads these schemas"
  - "08-03 through 08-07: all plans import from teams schema barrel"

tech-stack:
  added: []
  patterns:
    - "Nullable-first additive column strategy: add nullable, backfill in next plan, then NOT NULL"
    - "Mirror auth.ts text PK style for userId/invitedBy in team tables (not uuid)"

key-files:
  created:
    - packages/database/src/schema/teams.ts
    - packages/database/migrations/0001_teams.sql
    - packages/database/drizzle/0009_cooing_eternals.sql
  modified:
    - packages/database/src/schema/index.ts
    - packages/database/src/schema/projects.ts
    - packages/database/src/schema/api-keys.ts
    - packages/env/src/server.ts

key-decisions:
  - "userId/invitedBy in team tables typed as text (not uuid) to match users.id text PK in auth.ts"
  - "Migration output in drizzle/0009_cooing_eternals.sql (drizzle-kit canonical) copied to migrations/0001_teams.sql (plan canonical)"
  - "uq_projects_user_slug kept intact alongside new uq_projects_team_slug — Plan 02 drops the old index after backfill"

patterns-established:
  - "Nullable FK addition: teamId added nullable in Plan 01, NOT NULL enforced in Plan 02 after backfill"

requirements-completed: []

duration: ~7min
completed: "2026-04-18"
---

# Phase 08 Plan 01: Teams Schema Foundation Summary

**Drizzle schema for teams/teamMembers/teamInvitations tables, additive nullable teamId + encrypted-secret columns on projects and apiKeys, SQL migration, and Resend/encryption env var validation**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-18T01:00:00Z
- **Completed:** 2026-04-18T01:06:04Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Created `packages/database/src/schema/teams.ts` with three Drizzle pgTable definitions (teams, teamMembers, teamInvitations) and all six exported types
- Extended projects and apiKeys schemas with nullable teamId FK and secret ciphertext/IV columns; preserved old `uq_projects_user_slug` index for Plan 02 to drop after backfill
- Generated migration SQL (drizzle/0009_cooing_eternals.sql) and placed canonical copy at migrations/0001_teams.sql; added RESEND_API_KEY, EMAIL_FROM, KEY_ENC_KEY to serverEnv

## Task Commits

1. **Task 1: Create teams/teamMembers/teamInvitations schema and export from barrel** - `190810f` (feat)
2. **Task 2: Extend projects + apiKeys schemas with teamId and encrypted-secret columns** - `236b1a8` (feat)
3. **Task 3: Generate migration SQL and add env vars** - `dbfe7e6` (feat)

## Files Created/Modified

- `packages/database/src/schema/teams.ts` - Three pgTable definitions + six type exports
- `packages/database/src/schema/index.ts` - Barrel updated with teams/teamMembers/teamInvitations exports
- `packages/database/src/schema/projects.ts` - Added teamId nullable FK + uq_projects_team_slug unique index
- `packages/database/src/schema/api-keys.ts` - Added teamId nullable FK, secretCiphertext, secretIv columns
- `packages/database/migrations/0001_teams.sql` - Plan-canonical migration SQL
- `packages/database/drizzle/0009_cooing_eternals.sql` - Drizzle-kit generated migration
- `packages/env/src/server.ts` - Added RESEND_API_KEY, EMAIL_FROM, KEY_ENC_KEY validators

## Decisions Made

- **text vs uuid for userId/invitedBy in team tables:** The plan spec showed `uuid(...)` for these columns, but `users.id` in `auth.ts` is `text("id")` (BetterAuth convention). Used `text` to match the actual FK target and avoid a Drizzle type mismatch. (Rule 1 auto-fix)
- **Migration file naming:** drizzle-kit generated `0009_cooing_eternals.sql` in `drizzle/`. Copied to `migrations/0001_teams.sql` per plan artifact spec without renaming the canonical drizzle-kit file (preserves drizzle migration journal integrity).
- **KEY_ENC_KEY multi-line format:** Biome formatting split the `z.string().regex(...)` chain across lines — content is correct, plan's single-line grep pattern does not match but the validator is present and correct.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used text (not uuid) for userId/invitedBy in teamMembers and teamInvitations**
- **Found during:** Task 1 (reading auth.ts before writing teams.ts)
- **Issue:** Plan spec said `uuid("user_id").references(() => users.id)` but users.id is `text("id")` in auth.ts — Drizzle requires matching column types for FK references
- **Fix:** Declared `userId` and `invitedBy` as `text(...)` instead of `uuid(...)` in both teamMembers and teamInvitations
- **Files modified:** packages/database/src/schema/teams.ts
- **Verification:** drizzle-kit generate succeeded without FK type errors; migration SQL shows `text NOT NULL` for those columns
- **Committed in:** 190810f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type correctness)
**Impact on plan:** Necessary for correct FK referencing. No scope creep.

## Issues Encountered

- `pnpm -C packages/database` syntax caused "package not found" error — resolved by running drizzle-kit from the package directory directly with `cd packages/database && pnpm drizzle-kit generate`

## User Setup Required

Add these three env vars to your `.env` (and production secrets) before Plan 02 runs the migration:

```
RESEND_API_KEY=re_...          # From resend.com dashboard
EMAIL_FROM=hello@yourdomain.com # Verified sender in Resend
KEY_ENC_KEY=<64 hex chars>      # Generate: openssl rand -hex 32
```

## Next Phase Readiness

- Plan 02 (backfill + NOT NULL tightening) can proceed: schemas + migration SQL are ready to apply
- All downstream plans (03-07) can import `{ teams, teamMembers, teamInvitations }` from `@locnative/database/schema`
- Env vars are declared; plans using `serverEnv.RESEND_API_KEY` etc. will typecheck once values are provided

---
*Phase: 08-teams-creation-email-invitations-resend-and-auto-generated-per-member-api-keys-scoped-to-the-team*
*Completed: 2026-04-18*
