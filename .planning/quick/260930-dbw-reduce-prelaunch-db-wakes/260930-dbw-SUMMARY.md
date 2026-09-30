---
quick_id: 260930-dbw
status: complete
date: 2026-09-30
commits: [8fb000a, 2016336, a0d925e]
---

# 260930-dbw: Reduce pre-launch Neon wakes — Summary

GSD tooling was unavailable (`gsd-sdk` not on PATH; `gsd-tools.cjs` fails on a
missing `~/.claude/sdk/shared/model-catalog.json`), so the quick workflow was
followed by hand: plan, atomic commits, summary, STATE row.

## Done

| Task | Commit | Result |
|---|---|---|
| T1 API key format | 8fb000a | Secret segment must be exactly 32 base64url chars (the only format ever issued). New `api-key-auth.test.ts` proves malformed tokens never reach the DB. |
| T2 UsageMeter flush | 2016336 | `flushSnapshot` / `flushNeeded` in `meter-core.ts`; the alarm skips the UPDATE when the counter, period and gate are unchanged. **Bug fix:** the alarm re-reads storage after the UPDATE, so increments arriving mid-flush are no longer overwritten. |
| T3 Clivly + stats | a0d925e | `CLIVLY_SYNC_PAUSED=true` makes `/api/clivly/tick` return 204 with no DB work (opt-in). `drizzle/0022_enable_pg_stat_statements.sql` (manual, **not applied**). |

## Verification
- `packages/api`: 23 files, 170 tests pass.
- `apps/server` tsc: clean. `apps/web` tsc: 5 pre-existing errors, none in `tick.ts`.
- Biome is clean on every touched file.

## Corrections to the 2026-09-30 audit
- R6: tokens were already format-checked before the DB. Only `wh_<uuid>_<anything>` got
  through, and no `api_keys` index was needed (the lookup is by primary key).
- R4: Clivly never reads `addresses`. Ticks sync only the mapped `users`/`teams` rows
  via an `updatedAt` cursor, so the cost is the wake itself.

## Follow-ups for the user
- Decide whether to `wrangler secret put CLIVLY_SYNC_PAUSED` (value `true`) on `locnative-web`.
  With the daily cron, any Clivly wakes now show up as off-hour starts in the Neon operations log.
- Apply 0022 on the `dev` branch first, then prod deliberately.
- Trade-off: while the DO skips flushes, it no longer refreshes card and allotment data
  for unchanged, unblocked accounts. The blocked path still re-reads them.
- Not addressed: every peek from a blocked account runs `refreshLimits` (a DB read).
