# Task: Audit Neon Postgres compute usage for Locnative

## Context

Locnative (locnative.com) is a geocoding / address-autocomplete API. It has **not launched and has no real users**, yet Neon compute usage (CU-hours) is very high. Find every source of compute consumption, explain which ones drive cost, and propose fixes.

**This is a read-only audit. Investigate and report first; change nothing without my approval.**

### What we already know (confirm each point, don't take it on trust)

- **Neon project:** Scale plan, region `ap-southeast-2`, database `neondb`, primary endpoint `ep-muddy-cake-a72eh7us`. About 11 GB of data, most of it one table (`addresses`, about 16.8M rows, PostGIS geometry, plus trigram/prefix indexes for autocomplete).
- **Driver:** every runtime path uses `@neondatabase/serverless` `neon()` with `drizzle-orm/neon-http`, which is stateless HTTP with no pg Pool. See `packages/database/src/client.ts`. Classic pool-min / idle-connection leaks are therefore **unlikely** in app code. Check that nothing bypasses this. The suspects are **how often** and **how heavily** things query, not held connections.
- **DB entry points** (all read `DATABASE_URL`):
  - `packages/api/src/db.ts`, `packages/auth/src/db.ts` (BetterAuth on Drizzle): lazy Proxy clients
  - `apps/web/src/lib/db.ts`: TanStack Start web app, Worker `locnative-web` (`apps/web/wrangler.toml`)
  - `apps/server`: API Worker `locnative-server` (`apps/server/wrangler.jsonc`)
- **Known background work in `apps/server`:**
  - **Cron `0 * * * *`**: `scheduled()` in `apps/server/src/index.ts` calls `reportUsageToStripe` (`packages/api/src/billing/meter-reporting.ts`), which queries `billing_accounts`, `api_usage_daily` and `billing_meter_reports` **every hour, even with zero users**. This alone wakes compute 24×/day. Work out how much active time it causes given the endpoint's suspend timeout.
  - **Durable Object `UsageMeter`** (`apps/server/src/usage-meter.ts`): an alarm every `FLUSH_INTERVAL_MS = 10_000` writes to `billing_accounts`. Check whether the alarm re-arms only on traffic or can loop on its own, and how many DO instances exist.
  - **Queue consumers:** `locnative-batch-geocode` and `locnative-webhook-delivery`. Check for retry loops or stuck or poison messages that keep re-running DB work.
- **Heavy one-off / dev scripts** that may have run against the prod branch: `packages/database/scripts/ingest-asgs.ts`, the `import-gnaf.ts`, `benchmark-production-api.mjs`, `verify-*.mjs` and `spike-pooled-driver.mjs` scripts, and `packages/database/src/backfill-default-projects.ts`. Big ingests and index builds on a 16.8M-row table can pin compute at max CU for hours. Correlate them with usage spikes.
- There is **no `.github/workflows`** directory. Confirm whether CI or preview deploys touch Neon anywhere else (Cloudflare Workers Builds, Neon GitHub/Vercel integrations, branch-per-PR).
- Prior analysis lives in `docs/audits/`, `docs/assessments/` and `.planning/`. Skim it for earlier Neon findings (e.g. `docs/assessments/2026-06-24-production-readiness-assessment.md`) so you don't redo work.

## How Neon bills (use this to size each finding)

- Compute cost = active time × CU size. The endpoint suspends only after the configured inactivity timeout (default 5 min) with no queries.
- Each wake-up costs at least the suspend timeout. A job every N minutes where N ≤ timeout keeps compute on 24/7.
- Every branch can have its own endpoint, billed independently. Read replicas count too.
- The autoscaling **min** CU is the cost floor while active. A disabled or very long suspend timeout means always-on.
- A heavy query (seq scan on `addresses`, index build, `ANALYZE`, `VACUUM`) can push autoscaling to **max** CU.

## Scope

1. **Neon configuration.** Cover every project, branch and endpoint (including replicas): CU min/max, suspend timeout, current state, and active time per endpoint over the billing period. Include stale dev/test/restore branches that still have compute, logical replication (it blocks suspend), and IP allow / pooler settings.
2. **Wake-up sources.** For everything above, give its frequency and estimated active-time contribution. Also check external callers: uptime monitors, Sentry cron monitors, Cloudflare health checks, bots or crawlers hitting DB-backed routes, and SSR routes that do a BetterAuth session lookup on every page view. Check the public geocode/autocomplete endpoints for unauthenticated traffic.
3. **Query weight.** Use `pg_stat_statements` for the most frequent and most expensive queries, and look for fixed-interval patterns that reveal a poller. Flag any query that seq-scans `addresses` or otherwise forces a high CU.
4. **Connections.** Check `pg_stat_activity` for application_name and client address, long-lived or idle-in-transaction sessions, and anything outside the Workers. This covers DB GUIs, Drizzle Studio, psql sessions, and local `.env` files pointing at the prod branch.
5. **Environments.** Map which environment (local dev, `wrangler dev`, deployed Workers, scripts) points at which branch. Flag any non-production workload running on the main branch.

## Access

- The Neon MCP server is configured but **needs OAuth authorisation** (via `/mcp`) before you can use it. If it or the Neon console/API isn't available, stop and tell me exactly what access you need. Don't guess the config.
- You can read Cloudflare cron, queue and DO metrics with `wrangler`, and only if it's already authenticated.

## Rules

- **Read-only.** Don't change Neon settings, branches, endpoints, Worker config, cron schedules or code. Only run `SELECT`s against `pg_stat_*` / catalog views: no DDL, no `pg_stat_statements_reset()`, no `VACUUM` or `ANALYZE`.
- Never print connection strings, passwords or API keys. Redact hostnames beyond the endpoint ID.
- Label every finding **Confirmed** (with evidence: query output, metric, file:line) or **Suspected**.
- Follow the repo's GSD workflow and context-mode routing rules in `CLAUDE.md`.

## Deliverable

Write the report to `docs/audits/neon-compute-audit-<YYYY-MM-DD>.md`:

1. **Summary**: the top causes, in plain language.
2. **Inventory**: projects, branches and endpoints with their settings and active time.
3. **Findings, ranked by estimated cost impact.** For each one, give what it is, where it lives (file:line, service or setting), the evidence, the mechanism (whether it keeps compute awake or makes it oversized), and its estimated share of CU-hours.
4. **Remediation plan.** For each finding, give the change, expected savings, risk and priority (now / before launch / later). Examples to evaluate, not assume:
   - make the Stripe meter cron skip DB work when there are no billable accounts, or run it less often
   - gate the DO flush on actual deltas
   - move dev work to a separate branch with a low max CU
   - set the suspend timeout and max CU for pre-launch
5. **Pre-launch baseline config**: suspend timeout, min/max CU, branch lifecycle policy, cron cadence, and dev/prod branch separation.
6. **Monitoring**: how to catch a regression. Cover Neon usage alerts or consumption API checks, branch cleanup, and a guard against jobs polling faster than the suspend timeout.
7. **Open questions** for me.
