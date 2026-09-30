---
quick_id: 260930-dbw
mode: quick
created: 2026-09-30
---

# Quick Task 260930-dbw: Reduce pre-launch Neon wakes

Follow-up to `docs/audits/neon-compute-audit-2026-09-30.md`: the four "now" items.
Migrations are written but **not** run against prod.

## Findings that reshaped scope (verified in code)

- **Malformed keys (R6):** `validateApiKey` already rejects anything not matching
  `wh_<uuid>_<secret>` before the DB. The audit's "any bearer string wakes the DB"
  is wrong. Remaining gap: the secret segment is `(.+)`. Every key ever issued
  uses `randomBytes(24).toString("base64url")`, which is exactly 32 base64url chars,
  so the pattern can be tightened.
- **Clivly (R4):** a tick reads only the mapped `users`/`teams` rows (cursor on
  `updatedAt`). `discoverFromDrizzle(schema)` is metadata only, and `sampleSelect` probes
  only mapped tables, so `addresses` is never read. The cost is the wake itself.
  The cadence is configured in Clivly Cloud and can't be seen from the repo.

## Tasks

### T1: Tighten API key format check
- files: `packages/api/src/api-key-auth.ts`, `packages/api/src/api-key-auth.test.ts`
- action: change the secret group in `API_KEY_TOKEN_RE` to `[A-Za-z0-9_-]{32}`. Add a
  test showing malformed or wrong-length tokens return null without touching the db,
  using a db stub that throws.
- verify: `pnpm --filter @locnative/api test`
- done: the tests pass, and a real generated key still matches.

### T2: UsageMeter flush skips unchanged writes (and stops losing increments)
- files: `packages/api/src/billing/meter-core.ts` (+ test), `apps/server/src/usage-meter.ts`
- action: store a `lastFlushed` snapshot `{currentPeriodRequests, currentPeriodStart, blocked}`
  and skip the Postgres UPDATE when nothing changed. After the DB round trip, re-read storage
  before `put`, so increments that land during the flush aren't overwritten by the stale copy.
- verify: unit test for the pure `flushNeeded` helper, plus a typecheck of the server.

### T3: Clivly kill switch + pg_stat_statements migration
- files: `apps/web/src/routes/api/clivly/tick.ts`, `packages/database/drizzle/0022_enable_pg_stat_statements.sql`
- action: `CLIVLY_SYNC_PAUSED=true` makes the tick return 204 before any Clivly or DB work.
  It is opt-in, so behaviour is unchanged until the secret is set. Add a manual migration
  (same convention as 0018 to 0021, outside the journal) with
  `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`.
- verify: typecheck web; the SQL file exists; it is not applied.
