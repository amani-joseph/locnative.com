# Neon Cost Mitigation - 2026-08-10

Context:
- Neon dashboard on August 10, 2026 shows roughly `166.71 CU-hours` since August 1, 2026.
- The production project also shows roughly `168 GB` of storage.
- Log Native currently has no clients, so steady background compute should be close to zero outside deliberate testing and maintenance.

## Likely cost drivers

1. Public health checks waking the database.
   - Before this note, `GET /api/health` always ran `select 1` against Neon.
   - Any synthetic monitor, crawler, deploy smoke test, or uptime service hitting that route frequently can keep Neon compute active even when no one is using the product.

2. Very large address corpus.
   - `docs/data-sources.md` records the production `addresses` table at roughly `299.5M` rows and `153 GB` on June 15, 2026.
   - Even well-indexed queries can warm a large working set, and cold-cache misses are expensive.

3. Production sizing set for ingest-era load instead of idle-state load.
   - The repo notes compute was raised to `8-16 CU` during large US loads.
   - If that sizing remains in place for an otherwise idle project, background wakeups become much more expensive.

## Change made in this repo

`/api/health` is now app-only by default.

- `GET /api/health`
  - returns service health without touching Neon
  - safe for public uptime checks
- `GET /api/health?db=1`
  - performs the explicit database probe
  - use only for manual verification or low-frequency deeper checks

This keeps operational visibility while removing a common source of accidental compute churn.

## Immediate operational actions

1. Repoint synthetic monitoring to `GET /api/health` without `db=1`.
2. Audit any external uptime tools, load balancers, CI smoke tests, or status pages that currently probe the database every minute.
3. Lower Neon production compute to the smallest acceptable idle range.
   - For a no-client project, prefer the minimum floor that still handles occasional manual testing.
4. Review preview or child branches and delete anything not needed.
5. If the full global address corpus is not required right now, consider moving production to a smaller active dataset and keeping the full corpus in a cold archive branch or separate project.

## Medium-term cost strategy

1. Split the control-plane database from the search corpus.
   - Keep auth, teams, billing, projects, jobs, and webhooks in a small primary Neon database.
   - Move the giant `addresses` search corpus to a separate database or service with its own budget and scaling rules.
   - This prevents auth and dashboard traffic from waking a 150+ GB address store.

2. Treat the global address dataset as a staged asset, not always-on production state.
   - Keep only the countries needed for current GTM in the hot path.
   - Restore or promote the full dataset only when customer demand justifies it.

3. Continue cold-cache query hardening.
   - The current query layer already avoids some expensive fuzzy fallbacks on forward geocode.
   - Keep measuring any no-match or broad-prefix paths with `EXPLAIN (ANALYZE, BUFFERS)`.

## Quick verification

After deploying the health-route change:

1. Hit `/api/health` several times and confirm Neon compute does not wake.
2. Hit `/api/health?db=1` once and confirm the explicit DB probe still works.
3. Watch Neon activity over the next 24-48 hours.
   - If compute still rises while there is no product traffic, the remaining wake source is external monitoring, cron activity, or manual testing.
