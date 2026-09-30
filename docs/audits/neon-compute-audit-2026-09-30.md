# Neon Compute Audit, 2026-09-30

Read-only audit of Neon Postgres compute usage for Locnative. Brief: `docs/prompts/neon-compute-audit-prompt.md`.

**How the data was gathered**
- Neon control plane: `neonctl` (already authenticated as the org owner). Only list/get calls and GET-only `neonctl api` passthrough were used: projects, branches, endpoints, and the full operations log (4,668 ops, 2026-07-01 to 2026-09-30).
- Database: two batched read-only `psql` sessions against `ep-muddy-cake-a72eh7us` (direct host), run at 06:31 UTC on 2026-09-30 with `default_transaction_read_only=on` and `application_name=neon-compute-audit`. Only catalog, `pg_stat_*` and `pg_settings` SELECTs plus row counts on small billing/auth tables were run. That one wake cost about 0.6 CU-h.
- Cloudflare: `wrangler` read-only commands (`queues list/info`, `deployments list`, `secret list` for names only).
- Code: file:line citations below were checked against the working tree at `093c431`.
- Not available: the Neon MCP tools never loaded in this subagent session (ToolSearch found none). `neonctl` covers the same API. The Consumption History API returned *"It is included with Scale plans and above"*, so per-day CU-hours come from the operations log (start/suspend pairs), scaled to Neon's billed totals.

---

## 1. Summary

Locnative used **450 CU-hours of compute in September** (1 Sep to 30 Sep 06:30 UTC) with no real users. Almost all of it comes from two things acting together:

1. **The production compute has a floor of 8 CU (min 8 / max 16).** Every wake-up, even for one trivial query, is billed at 8 CU or more for about 4 to 5 minutes. The floor was raised for the US ingest in June/July and never lowered. `docs/operations/neon-cost-mitigation-2026-08-10.md` already recommended lowering it. *Confirmed.*
2. **The hourly Stripe meter cron wakes the database 24 times a day.** 696 of 747 wakes in September started at minute :00 to :02 of the hour. That is about **91% of active time, or about 409 CU-h**. The cron's first statement is an unconditional `SELECT` on `billing_accounts`, even though nothing billable has been recorded since 18 Sep. *Confirmed.*
3. **Dev and ad-hoc work runs straight on production.** Every local env file (`.env`, `apps/server/.env|.dev.vars`, `apps/web/.env|.dev.vars`) points at the production endpoint, so `wrangler dev`, Drizzle Studio, the Clivly CLI and verify/benchmark scripts all wake the 8 CU compute. This was about 9% of September (about 41 CU-h); August was much higher, with 21 to 26 Aug running 3 to 5 h/day of perf-audit work. *Confirmed.*
4. **Clivly Cloud sync trigger.** Clivly Cloud is configured in production to POST `/api/clivly/tick`, which introspects the Locnative DB through Drizzle. Its cadence is unknown. If it runs hourly at :00 it coalesces with the cron, so it cannot be told apart from Neon data alone. *Suspected.*

What is **not** a cause: logical replication (no publications or subscriptions; the compute suspends normally), idle or leaked connections, a self-looping Durable Object alarm, queue retry loops, `/api/health` (the DB probe is opt-in), and stale branches (the only other branch is archived).

Setting the floor to 0.25 CU alone cuts the current pattern to about 14 CU-h/month, **about 97% less**. Also gating the cron takes idle cost to roughly zero.

**Corrections to the brief:** the plan is **Launch** (`subscription_type: launch_v3`), not Scale. The database is **166 GB**, not 11 GB. `addresses` has **about 307.6M rows** (heap 51 GB plus indexes 115 GB), not 16.8M. The 11 GB / 16.8M figures date from April (`.planning/debug/neon-storage-limit-blocks-migration.md`).

---

## 2. Inventory

### Org `org-patient-leaf-57488846` (same Neon bill), September to date

| Project | Active time | CPU (CU-h) | Endpoint min/max CU | Notes |
|---|---|---|---|---|
| **locnative** `raspy-salad-37313917` | 201,496 s = **56.0 h** | 1,621,326 CU-s = **450.4 CU-h** | **8 / 16** | this audit |
| clivly.com_dev `shiny-field-36529591` | 2,022,419 s = **561.8 h** (80% of the month) | 274.8 | 0.25 / 8 | out of scope, same bill; almost always on |
| stacknpass.com_dev | 196.3 h | 53.2 | 0.25 / 8 | out of scope |
| mydeffo.com-web-dev | 54.0 h | 15.4 | 0.25 / 8 | out of scope |
| mydeffo.com-production-db | 42.9 h | 12.2 | 0.25 / 8 | out of scope |
| trhowaway, devellop.co | 0 | 0 | 0.25 / 8 | idle |

Locnative is about **56% of the org's roughly 806 CU-h** this month. clivly.com_dev is the second-largest line item, at about 34%.

### Locnative project settings
- Region `aws-ap-southeast-2`, PG 17.11, plan **Launch** (`launch_v3`). Billing period is 2026-09-01 to 2026-10-01.
- `default_endpoint_settings`: min 0.25, max 8, suspend 0 (default, 5 min). This default applies only to new endpoints.
- `enable_logical_replication: true`, so `wal_level=logical`. However, `pg_publication` and `pg_subscription` are empty and `pg_replication_slots` holds only Neon's internal physical slots (`wal_proposer_slot`, `wal_retention_slot`). The compute suspends about 5 min after each wake: 668 of 747 September wakes lasted under 6 minutes. **Replication does not block suspend.**
- IP allow: none (`allowed_ips: []`). `block_public_connections: false`. History retention 6 h. Maintenance window Tuesdays 15:00 to 16:00 UTC.

### Branches and endpoints

| Branch | State | Endpoint | Min/Max CU | Suspend | Pooler | Last active | Sep active |
|---|---|---|---|---|---|---|---|
| `production` br-sparkling-poetry-a77yt6kn (default) | ready, 166 GB | **ep-muddy-cake-a72eh7us** (r/w) | **8 / 16** | 0 (default 5 min) | via `-pooler` host | 2026-09-30 06:01 | 56.0 h / 450.4 CU-h |
| `smoke-iceland` br-sweet-forest-a77khf5x | **archived**, 14 GB | ep-little-fog-a75wrltt (r/w) | 0.25 / 8 | 0 | – | 2026-06-14 | 0 |

- **No read replicas.** Each endpoint has one compute (`group.size 1/1`, `allow_readable_secondaries: false`).
- Operations log, 1 Jul to 30 Sep: all compute ops are on `ep-muddy-cake`. There are 17 `apply_config` ops (07-07, 08-04, 08-31, 09-21, 09-28), which are config pushes; the API does not expose their contents. One archive/unarchive of the production timeline happened on 2026-07-21.

### Compute activity by month (from the operations log, start to suspend)

| Month | Wakes | Wakes at :00 to :02 (cron) | Other wakes | Total |
|---|---|---|---|---|
| Jul | 727 | 691 (65.2 h) | 36 (3.9 h) | 69.1 h |
| Aug | 850 | 725 (68.0 h) | 125 (18.5 h) | 86.4 h |
| Sep (to 30th 06:06) | 747 | 696 (66.3 h) | 51 (6.7 h) | 73.0 h |

- September wake start minutes: :00 → 592, :01 → 84, :02 → 20. Every other minute has 4 or fewer.
- Wakes are spread flat across UTC hours (29 to 40 per hour).
- September has exactly 24 wakes on most days. The exceptions are 09-06 (34), 09-07 (33) and 09-12 (28), which are the dev sessions that match the `api_usage_daily` spikes (365 and 239 requests).
- The start-to-suspend duration has a median of 334 s and a p90 of 359 s. That matches a query followed by the 5-minute idle timeout.
- The operations-log hours (73.0 h) exceed Neon's billed `active_time` (56.0 h), probably because startup and suspend overhead is not billed. Shares below use the log ratios applied to Neon's billed 450.4 CU-h. Billed CU-s ÷ active s = **8.05**, so the compute essentially always sat at its 8 CU floor.

### Environments

| Consumer | Points at | Evidence |
|---|---|---|
| Deployed `locnative-server` (API, cron, DO, queues) | secret `DATABASE_URL` (value not readable; assumed prod) | `wrangler secret list` |
| Deployed `locnative-web` (SSR, Clivly handler, `/api/health?db=1`) | secret `DATABASE_URL` | `wrangler secret list` |
| Root `.env` | **ep-muddy-cake-a72eh7us** (pooler) | local file |
| `apps/server/.env`, `apps/server/.dev.vars` (`wrangler dev`) | **ep-muddy-cake-a72eh7us** (pooler) | local file |
| `apps/web/.env`, `apps/web/.dev.vars` | **ep-muddy-cake-a72eh7us** (pooler) | local file |
| `apps/web/clivly.config.ts` (Clivly CLI) | loads `apps/web/.env`, `.dev.vars`, `../server/.env`, `../server/.dev.vars` → prod | `apps/web/clivly.config.ts:19-30` |
| `packages/database/.env`, `.env.production` | empty (0 bytes) | local file |
| Scripts (`scripts/*.mjs`, `import-gnaf.ts`, `intl/ingest.ts`) | `process.env.DATABASE_URL`, which is whatever the shell exports | e.g. `scripts/import-gnaf.ts:24` |

**There is no dev branch. Every local workflow runs on production at 8 CU.** There is no `.github/` directory and no Neon integration or branch-per-PR in the repo. Cloudflare deployments show `Source: Unknown (deployment)`, which means manual `wrangler deploy`, not Workers Builds.

---

## 3. Findings, ranked by estimated cost impact

### F1. Production compute floor is 8 CU (min 8 / max 16). Confirmed. Multiplier on everything.
- **Where:** Neon endpoint `ep-muddy-cake-a72eh7us`, `autoscaling_limit_min_cu: 8, autoscaling_limit_max_cu: 16`. The history is in `docs/data-sources.md:11` ("compute raised to 8–16 CU during the US giants"). It was flagged but not actioned in `docs/operations/neon-cost-mitigation-2026-08-10.md:19`.
- **Evidence:** endpoint GET. September CPU ÷ active time = 1,621,326 / 201,496 = **8.05 CU on average**, so the compute never ran below its floor.
- **Mechanism:** oversizing. Each wake bills at least about 4.4 min × 8 CU ≈ **0.59 CU-h**, compared with about 0.018 CU-h at 0.25 CU (32× less).
- **Share:** it multiplies every other finding. At a 0.25 floor, September's 56 active hours would have cost about 14 CU-h instead of 450. Removable cost ≈ **436 CU-h/month (about 97%)**.

### F2. Hourly Stripe meter cron wakes compute 24 times a day. Confirmed. About 91% of active time, about 409 CU-h in September.
- **Where:** `apps/server/wrangler.jsonc` `"triggers": { "crons": ["0 * * * *"] }` (added in 89e77d6, 2026-06-12). `apps/server/src/index.ts:693-702` `scheduled()` → `ctx.waitUntil(reportUsageToStripe(db))`. In `packages/api/src/billing/meter-reporting.ts:60-65`, the unconditional `SELECT id, stripe_customer_id FROM billing_accounts` runs on every tick. For each account with a Stripe customer, two more SELECTs follow (`:73-86`, `:88-99`), and an upsert (`:119-132`) runs only when there is a delta.
- **Evidence:** 696 of 747 September wakes began at :00 to :02, and so did 691 of 727 in July and 725 of 850 in August. A typical day has exactly 24 wakes. The DB holds 8 `billing_accounts`, 20 `billing_meter_reports` rows (last updated 2026-09-18 09:00) and no `api_usage_daily` rows after 2026-09-18. For 12 days the cron has woken compute hourly and found nothing to report.
- **Mechanism:** a wake every 60 min with a 5-min timeout means compute is up about 4.4 to 5.5 min of every hour (about 8% duty cycle) at 8 CU.
- **Arithmetic:** 450.4 CU-h × (66.3 h / 73.0 h) ≈ **409 CU-h in September**, or 409 / 696 ≈ **0.59 CU-h per tick**. Projected: 720 ticks/month × 0.59 ≈ **423 CU-h/month** at 8 CU, or about **13 CU-h/month** at 0.25 CU.
- **Caveat:** anything else that fires at :00 coalesces into the same wake (see F4). Even so, the cron is sufficient on its own to cause every hourly wake.

### F3. Local dev, scripts and tools run against the production branch. Confirmed. About 9% of September (about 41 CU-h); about 21% of August.
- **Where:** all five populated env files point at `ep-muddy-cake-a72eh7us` (table above). `apps/web/clivly.config.ts:19-30` loads the server env files. The scripts in `scripts/` (`verify-*.mjs`, `benchmark-production-api.mjs`, `spike-pooled-driver.mjs`, `import-gnaf.ts`) read `DATABASE_URL`.
- **Evidence:** non-cron wakes numbered 36 (Jul), 125 (Aug, 18.5 h) and 51 (Sep, 6.7 h). The heaviest days, 21 to 26 Aug at 3 to 5 active h/day, line up with the perf-audit commits (49e0ede, 913d79b) and a manual `ANALYZE addresses` (`last_analyze` 2026-08-27 00:42). 09-06 and 09-07 show 365 and 239 recorded API requests and 10 to 11 extra wakes each.
- **Mechanism:** extra wakes and longer sessions, all at the 8 CU floor. Heavy statements on the 51 GB heap / 115 GB index `addresses` table (ANALYZE, seq scans, index builds) can push toward the 16 CU max. `addresses` shows **560 cumulative seq scans reading 9.58 billion tuples** since stats began, which is how index builds and analysis look.
- **Arithmetic:** September is 450.4 × (6.7 / 73.0) ≈ **41 CU-h**. August's non-cron share is 18.5 / 86.4 = 21%. August CPU is not available on Launch; assuming the same 8 CU floor, it was about 21% of about 530 CU-h, or about 110 CU-h.

### F4. Clivly Cloud sync trigger calls `/api/clivly/tick`, which introspects the Locnative DB. Suspected, cadence unknown.
- **Where:** `apps/web/src/routes/api/clivly/tick.ts:4-9` → `clivly.createClivlyHandler()`. `apps/web/clivly.config.ts` builds the SDK with `schema: discoverFromDrizzle(schema)` and `introspector: drizzleIntrospector(db)` over the full `@locnative/database` namespace, including `addresses`, and sets `syncTrigger.path: "/api/clivly/tick"`. The production `locnative-web` has secrets `CLIVLY_SYNC_TRIGGER_URL`, `CLIVLY_SYNC_TRIGGER_SECRET` and `CLIVLY_API_KEY` set, so the trigger is live.
- **Evidence:** there are no distinct off-hour periodic wakes (only 51 in September, clustered on dev days). Either the trigger is infrequent, or it fires near :00 and hides inside the cron wakes. Whether the sync reads large tables (e.g. `count(*)` over `addresses`) is unknown.
- **Mechanism:** a possible extra wake and working-set load. **Not separable** from F2 without Worker logs.
- **Verify:** check the Clivly Cloud schedule, or run `wrangler tail locnative-web --search clivly` across an hour boundary.

### F5. UsageMeter Durable Object flush. Confirmed not a loop; negligible now.
- **Where:** `apps/server/src/usage-meter.ts:19` sets `FLUSH_INTERVAL_MS = 10_000`. `armFlush()` (`:141-145`) is only called from `fetch()` (`:106`). `alarm()` (`:147-176`) writes `UPDATE billing_accounts … RETURNING` and **does not re-arm itself**.
- **Instances:** one per billing owner, `usageMeterName()` = `team:<id>` or `user:<id>` (`packages/api/src/billing/usage-meter-client.ts:25-27, 34`). There are at most 8 in total (8 `billing_accounts`).
- **Mechanism:** each burst of production API traffic causes one extra write about 10 s later, which usually lands inside a wake already caused by that traffic. There is no idle-time cost. The flush writes even when the counter has not changed (`:155-167`), but it only fires after a request.
- **Share:** about 0.

### F6. Queue consumers. Confirmed bounded; negligible.
- **Where:** `apps/server/src/index.ts:674-690` acks every message after processing. `apps/server/src/queues/batch-geocode.ts:84-93` marks the job failed and rethrows ("let CF Queue retry / DLQ"), which gives the default 3 retries. No DLQ is configured in `wrangler.jsonc`, so a poison message is dropped after the retries rather than looping. `apps/server/src/queues/webhook-delivery.ts:21,135` caps delivery at `MAX_ATTEMPTS = 3` inside one invocation and never throws (`Promise.allSettled`, `:87`).
- **Evidence:** all 11 `batch_geocode_jobs` are `completed`; the last was 2026-06-14.
- **Side note:** the legacy queues `wherabouts-batch-geocode` and `wherabouts-webhook-delivery` still list `locnative-server` as consumer with 0 producers. This is harmless but stale.

### F7. SSR session lookup on every page view. Confirmed code path; low cost pre-launch.
- **Where:** `apps/web/src/routes/__root.tsx:38-40, 97-107`. The root `beforeLoad` calls `fetchSession()` → `getSession()` (`apps/web/src/lib/auth-server.ts:109-130`), which forwards to the API's `/api/auth/get-session` with `cache: "no-store"`. BetterAuth has no `session.cookieCache` configured (none in `packages/auth/src/index.ts`).
- **Mechanism:** every SSR page view **with a session cookie** costs a `session` + `user` lookup. Without a cookie, BetterAuth returns null without querying, so anonymous visitors and crawlers do not hit the DB (this is library behaviour and was not traced). There is only 1 live session in the DB, so today this is just the developer's own browsing.
- **Share:** under 1%. It becomes significant after launch.

### F8. Public API and health endpoints. Confirmed; no idle wake source.
- `packages/api/src/routers/public-middleware.ts:84-97`: a request with **no** API key is rejected before any DB call. Any bearer token string, including garbage, triggers `validateApiKey` against the DB. `api_keys` shows 100,746 seq scans and 0 index scans, so key lookup is a seq scan. That is trivial at 40 rows, but it means a bot sending fake keys wakes compute.
- `apps/web/src/routes/api/health.ts:7-22`: the DB probe runs only with `?db=1` (the change from 2026-08-10).
- `apps/server/src/index.ts:668`: `GET /` returns JSON with no DB call. `/tiles/*` is served from R2.
- There is no off-hour periodic wake pattern, so no uptime monitor is hitting a DB-backed route.

### F9. Driver and connections. Confirmed clean.
- The only runtime `neon()` construction is `packages/database/src/client.ts:6-9` (neon-http). `packages/api/src/db.ts:22-28`, `packages/auth/src/db.ts`, `apps/web/src/lib/db.ts:5-14` and `apps/web/clivly.config.ts` all go through `createDb`.
- Only the scripts bypass it: `scripts/spike-pooled-driver.mjs:2,6` (`Pool`) and `scripts/import-gnaf.ts:294,322` (shells out to `psql`). They are dev-only (see F3).
- `pg_stat_activity` at 06:31 showed only Neon system backends (vm-monitor, compute_ctl, pg_cron launcher, TimescaleDB launcher) and the audit session. There were no app, GUI or idle-in-transaction sessions, and `idle_in_transaction_session_timeout` is 5 min. The `pg_cron` launcher targets the `postgres` DB (`cron.database_name=postgres`), and the extension is not installed in `neondb`. The 5-minute suspend pattern rules out a cron job keeping compute awake.

### F10. Query-weight visibility is missing. Confirmed gap.
- `pg_stat_statements` is **not installed** (`relation "pg_stat_statements" does not exist`). Installed extensions: fuzzystrmatch, pg_trgm, plpgsql, postgis.
- Frequent and expensive queries therefore cannot be ranked. The table-level stats that do exist are cumulative with no `stats_reset`:
  - `addresses`: 560 seq scans / 9.58B tuples, 156k index scans.
  - `api_keys`: 100,746 seq scans.
  - `session`: 8,949 seq scans.
  - `api_usage_daily`: 5,027 seq scans.

---

## 4. Remediation plan (nothing changed; each needs your approval)

| # | Change | Expected savings | Risk | Priority |
|---|---|---|---|---|
| R1 | Set `ep-muddy-cake` autoscaling to **min 0.25, max 4** (or max 8) until launch | about 97% of the current bill: about 436 of 450 CU-h/month | Cold-cache latency on the 166 GB corpus is higher for the first queries after a wake. That is acceptable pre-launch; raise the floor at launch. | **Now** |
| R2 | Stop the hourly cron from touching Postgres when there is nothing to report. **(a)** Have the usage write path (or the DO `alarm()`) set a KV / DO-storage "dirty since last report" flag, and have `scheduled()` return before any DB call when it is unset. **(b)** Alternatively, run every 6 h or daily; Stripe meter events accept back-dated usage within the meter's allowed window, so confirm that window before choosing. | (a) all 720 idle ticks/month, which is about 423 CU-h at 8 CU or about 13 CU-h at 0.25 CU. (b) daily is 30 ticks, about 18 CU-h at 8 CU or 0.6 at 0.25. | Low. Keep a daily unconditional reconciliation run so no usage is missed. | **Now** (b is a one-line cron change); **before launch** for (a) |
| R3 | Create a `dev` child branch (0.25 / 2 CU, 5-min suspend) and repoint `.env`, `apps/server/.env|.dev.vars` and `apps/web/.env|.dev.vars` to it. Run benchmarks and ANALYZE-style work only on purpose against prod. | about 41 CU-h in Sep, about 110 CU-h in Aug; also removes prod-safety risk | A child branch shares storage copy-on-write; heavy writes on dev add storage. Keep it short-lived or reset it from the parent. | **Now** |
| R4 | Confirm the Clivly sync cadence. Point its introspector at an explicit table allow-list that excludes `addresses`, and/or disable `CLIVLY_SYNC_TRIGGER_URL` in prod until launch. | unknown, 0 to 100% of a wake per tick | Low | **Before launch** |
| R5 | Add `session.cookieCache` (e.g. 5 min) to BetterAuth, and skip SSR `getSession` on public marketing routes | small now; scales with traffic after launch | Low. Revocation lag equals the cache TTL. | **Before launch** |
| R6 | Index `api_keys` on the key hash / prefix and reject malformed keys before the DB call | negligible now; stops junk-key wakes | Low | Before launch |
| R7 | Only write in the DO flush when `currentPeriodRequests` changed since the last flush | negligible | Low | Later |
| R8 | Delete archived branch `smoke-iceland` | storage only, no compute | None if unused | Later |
| R9 | Remove the stale `wherabouts-*` queue consumer bindings | none (hygiene) | None | Later |
| R10 | Consider splitting the control-plane DB (auth/billing, small) from the `addresses` corpus, per `neon-cost-mitigation-2026-08-10.md` | Control-plane wakes run on a tiny compute; the corpus compute wakes only for geocoding | Medium: cross-DB joins and migrations | Later |

---

## 5. Pre-launch baseline config

- **Production endpoint:** min **0.25 CU**, max **4 CU**. Use 8 only while ingesting or index-building, then revert the same day.
- **Suspend timeout:** 5 min (default). The Launch plan does not offer custom timeouts below the default, and there is no reason to lengthen it.
- **Dev:** a `dev` child branch, 0.25 / 2 CU, 5-min suspend. Local env files point here. Reset it from `production` when schemas diverge.
- **Branch lifecycle:** set `expires_at` on every ad-hoc or smoke branch (for example 7 days), and delete archived branches older than 30 days.
- **Cron cadence:** no cron may touch Postgres more often than every 6 h unless it first checks a non-DB dirty flag. Ideally the meter reporter runs daily plus on-demand when flagged.
- **Separation:** only deployed Workers use the prod URL. Keep the prod `DATABASE_URL` in `wrangler secret` only, not in local files, and pass it explicitly (`DATABASE_URL=… node script`) for deliberate prod scripts.
- **Logical replication:** leave it on only if a consumer is planned. It does not block suspend today, but no subscriber exists.

## 6. Monitoring

1. **Weekly `neonctl` check:** a small read-only script (or scheduled agent) that runs `neonctl projects list --org-id … -o json`. It should alert if Locnative `cpu_used_sec` ÷ elapsed period hours exceeds a threshold (for example 0.5 CU-h per hour pre-launch). It should also compare `cpu_used_sec / active_time`, where anything above 1 means the floor was raised again.
2. **Wake-cadence guard:** pull `/projects/{id}/operations` and count `start_compute` per day. More than 6 per day pre-launch, or a repeated fixed minute-of-hour pattern, means a poller.
3. **Code guard:** a unit test or lint that fails if `apps/*/wrangler.*` declares a cron more frequent than `0 */6 * * *` without an allow-list comment.
4. **Neon console:** set usage/spend alerts on the org, which is billed together with clivly.com_dev and stacknpass.com_dev.
5. **Query visibility:** with approval, `CREATE EXTENSION pg_stat_statements` on `neondb`. Neon resets it on compute restart, so snapshot it during active sessions. Also enable `track_io_timing`.
6. **Branch hygiene:** a monthly `neonctl branches list` review of branches with no `expires_at`.

## 7. Open questions

1. Was the 8 / 16 CU floor intentionally kept for autocomplete latency, for example after the 2026-08-26 perf audit? If so, what p95 target justifies it pre-launch?
2. How often does Clivly Cloud call `/api/clivly/tick`, and which tables does its sync read? Should Locnative prod be connected to Clivly before launch at all?
3. Is the 307.6M-row / 166 GB `addresses` corpus (28 countries plus the US) needed in the hot database pre-launch, or can non-GTM countries move to an archive branch or project? This is mainly storage cost, but it also drives cold-cache CU spikes.
4. Stripe meter back-dating window: can reporting safely go daily?
5. clivly.com_dev was active 80% of the month (562 h, 275 CU-h) on the same Neon bill. Do you want it audited separately?
6. The brief says "Scale plan", but the API reports `launch_v3`. Was an upgrade expected? Scale adds the Consumption API and configurable suspend timeouts.
7. Four paired `apply_config` events (07-07, 08-04, 08-31, 09-21) and one on 09-28 hit the prod endpoint. Were any of them manual CU changes? The API does not show the payload.
