# Usage-Based Billing (Pay-As-You-Go) with Stripe — Design

**Date:** 2026-06-11
**Status:** Approved (design); pending implementation plan
**Branch context:** `fix/apikey-auth-and-proximity-perf` (will be implemented on its own branch/phase)

## Goal

Charge API clients on a **pure pay-as-you-go** basis for the number of API requests
they make, so Locnative can start accepting paying customers. Track requests per
user, per project, and per organization (team), and bill the responsible billing
account through Stripe.

## Locked decisions

| Decision | Value |
| --- | --- |
| Pricing model | Pure usage-based (pay-as-you-go), **no caps** ("unmetered") |
| Billing owner | **Team/org**, or the **user** when usage has no team |
| Free tier | **10,000 requests / month**, then a card is required |
| Rate | **$1.00 per 1,000 requests** ($0.001/request) |
| Over free + no card | Request **rejected** (HTTP 402) |
| Card on file | Unlimited, metered usage, never blocked |
| Stripe integration | **Approach A** — Stripe Billing Meters + scheduled batch reporting |

## What already exists (do not rebuild)

- **Request tracking is live.** `recordUsage()` in `packages/api/src/api-key-auth.ts`
  upserts into the `api_usage_daily` table on every authenticated request, keyed by
  `apiKeyId`, `userId`, `projectId`, `endpoint`, `requestSource`, `usageDate`
  (`requestCount` incremented per `(apiKeyId, usageDate, endpoint, requestSource)`).
  Called from `packages/api/src/routers/public-middleware.ts`.
- **Aggregation exists.** `packages/api/src/routers/domains/dashboard.ts` already
  reads `api_usage_daily` for analytics.
- **Entities exist.** `users` (`auth.ts`); `projects` (own a `userId`, optional
  `teamId`); `teams` + `teamMembers` (roles `owner`/`admin`/`member`) +
  `teamInvitations`; `api_keys` (linked to `userId`, optional `projectId`, optional
  `teamId`).
- **Request-source split exists.** `REQUEST_SOURCE_PRODUCTION` vs
  `REQUEST_SOURCE_EXPLORER_TEST` — explorer/test traffic must remain free.

## What does NOT exist (the work)

- No `stripe` dependency anywhere.
- No billing-account → Stripe-customer mapping, no plans/subscription state.
- No metering to Stripe, no webhooks, no quota enforcement.
- `apps/web/src/routes/_protected/billing.tsx` is 100% hardcoded mock data
  (Free/Pro/Enterprise plans + fake invoices) and must be rebuilt.

## Constraints carried from the codebase

- **Stack:** TanStack Start web app; Cloudflare Workers (`apps/server`) API on
  Hono + oRPC; Postgres (Neon) via Drizzle ORM.
- **Neon `neon-http` has no transactions** (`db.transaction()` throws). All billing
  writes MUST be idempotent upserts — no `FOR UPDATE`, no multi-statement atomicity.
- **Workers runtime:** crypto via WebCrypto; bound `fetch` carefully (see prior
  "Illegal invocation" issue); use `wrangler` cron triggers for scheduled work.
- **Drizzle migrations:** single consolidated baseline; never hand-write
  out-of-journal `.sql`. Generate via the normal Drizzle flow.

---

## Architecture

### 1. Core abstraction — the Billing Account

A new table unifies "team OR personal user" into one billable entity. The Stripe
customer, card, subscription, usage gate, and meter all hang off it.

```
billing_accounts
  id                       uuid pk default random
  owner_type               text  'team' | 'user'        notNull
  team_id                  uuid  null  fk teams(id) on delete cascade   ─ exactly
  user_id                  text  null  fk users(id) on delete cascade   ─ one set
  stripe_customer_id       text  null  unique
  stripe_subscription_id   text  null
  status                   text  'free'|'active'|'past_due'|'canceled'  default 'free'
  has_payment_method       boolean default false
  free_allotment           integer default 10000
  current_period_start     timestamptz
  current_period_requests  integer default 0    ─ cached month-to-date counter
  blocked                  boolean default false ─ cached gate: over free && no card
  created_at               timestamptz default now()
  updated_at               timestamptz default now()

  unique (team_id)         -- one billing account per team
  unique (user_id)         -- one billing account per user
  index  (stripe_customer_id)
```

Invariant: exactly one of `team_id` / `user_id` is non-null (enforced in app code;
optionally a CHECK constraint).

**Resolution helper** `resolveBillingAccount(db, validatedKey)`:
- If `key.teamId` is set → the team's billing account.
- Else → the user's billing account (`key.userId`).
- Lazily create the account row on first use (idempotent upsert on the unique key).

### 2. Tracking changes (extend, don't replace)

- Add `billing_account_id uuid` (fk `billing_accounts`, indexed) to `api_usage_daily`.
  Populate it in `recordUsage()` via `resolveBillingAccount` so the cron can sum per
  billing account without re-deriving team membership.
- New ledger table for idempotent Stripe reporting:

```
billing_meter_reports
  id                 uuid pk
  billing_account_id uuid  fk billing_accounts on delete cascade
  usage_date         date  notNull
  reported_count     integer notNull default 0   ─ running total already sent to Stripe
  updated_at         timestamptz default now()
  unique (billing_account_id, usage_date)
```

### 3. Enforcement (hot path — API-key middleware)

In the request path (`public-middleware.ts` / `api-key-auth.ts`), after key
validation, do one indexed lookup of the billing account, then:

1. If `requestSource === 'explorer_test'` → **bypass gate and metering** (free).
2. If `account.blocked` → reject **HTTP 402 Payment Required**, body
   `{ error: { code: "payment_required", message: "Free tier exhausted — add a payment method to continue." } }`.
3. Otherwise serve normally. After serving, increment
   `current_period_requests`. If it crosses `free_allotment` **and**
   `!has_payment_method` → set `blocked = true`.

Accounts with `has_payment_method = true` (status `active`) are never blocked.
This adds one cheap upsert beyond the existing `recordUsage` write. No per-request
Stripe calls, no full-table count on the hot path.

### 4. Stripe layer

**Bootstrap (one-time, idempotent setup script, committed):**
- `stripe.billing.meters.create({ display_name, event_name: "api_request", default_aggregation: { formula: "sum" } })`.
- `stripe.prices.create({ currency: "usd", recurring: { interval: "month", usage_type: "metered", meter: <meterId> }, unit_amount_decimal: "0.1", ... })`
  — 0.1¢ per request = $1.00 / 1,000 requests.
- Persist meter event name + price ID in env/config.

**Webhook** `POST /api/stripe/webhook` (Hono route in `apps/server`, raw body via
`context.req.raw`, mandatory signature verification with `STRIPE_WEBHOOK_SECRET`):
- `checkout.session.completed`, `customer.subscription.created|updated` →
  set `stripe_subscription_id`, `status = 'active'`, `has_payment_method = true`,
  `blocked = false`.
- `payment_method.attached` / `customer.updated` → `has_payment_method = true`.
- `invoice.payment_failed` → `status = 'past_due'`.
- `invoice.paid` → `status = 'active'`.
- `customer.subscription.deleted` → `status = 'canceled'` (gate reverts to free
  behaviour — blocked once free allotment exhausted).

**Cron Worker** (`wrangler [triggers] crons`, hourly) — `reportUsageToStripe`:
- For each billing account with a `stripe_subscription_id`, for each `usage_date`
  with new activity: `delta = sum(api_usage_daily.requestCount) − ledger.reported_count`.
- If `delta > 0`: `stripe.billing.meterEvents.create({ event_name, payload: { value: delta, stripe_customer_id }, identifier })`
  with an `identifier` for dedup; on success upsert `ledger.reported_count` to the
  new live total.
- Failures are self-healing: next run recomputes the delta from the ledger watermark.
- A daily job resets `current_period_requests = 0` and advances
  `current_period_start` at the UTC month boundary.

> Period model: **UTC calendar month** for the free-allotment counter (simple,
> predictable). Stripe's own subscription period governs the actual invoice; meter
> events are summed by Stripe within its billing cycle. (Considered aligning the
> free counter to each subscription's cycle — rejected for MVP as unnecessary
> complexity.)

### 5. oRPC billing router (`packages/api/src/routers/domains/billing.ts`, protected)

- `getAccount` — billing account status + MTD requests + estimated cost for the
  active context (personal or selected team).
- `createCheckoutSession` — ensure Stripe customer for the account, return a Stripe
  Checkout URL (`mode: "subscription"`, the metered price).
- `createPortalSession` — Stripe Billing Portal URL (manage card, view invoices).
- `getUsageSummary` — reuse `dashboard.ts` aggregation; breakdown by project/endpoint
  + estimated cost.

### 6. Frontend — rebuild `billing.tsx`

Replace all mock data with live data:
- Usage gauge (MTD requests) + estimated cost this period.
- Account status: **Free** vs **card on file (active)**; `past_due` warning.
- **Add payment method** → `createCheckoutSession`; **Manage billing** → `createPortalSession`.
- Usage breakdown by project/endpoint.
- Billing-context switcher (personal vs each team the user belongs to).
- Surface the offer plainly: "10,000 requests/mo free, then $1.00 per 1,000."

### 7. Config / env (add to `packages/env`)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_METER_EVENT_NAME`,
`STRIPE_PRICE_ID`, `FREE_TIER_REQUESTS` (default 10000), checkout success/cancel URLs,
billing-portal return URL.

## Error handling & edge cases

- **Stripe outage** never blocks API serving (metering is async via cron; gate reads
  only local cached state).
- **Cron idempotency** via the `billing_meter_reports` ledger + meter-event `identifier`.
- **No transactions (Neon):** every write is an idempotent upsert; the ledger uses
  last-written-wins on the live total.
- **Webhook security:** signature verification is mandatory; reject unsigned/invalid.
- **Explorer/test traffic** (`explorer_test`) is always free — never gated, never metered.
- **Personal → team transition:** attribution follows the API key's `teamId` going
  forward; historical usage stays on whichever account recorded it.
- **Account auto-provisioning:** billing accounts are created lazily on first request
  or first billing-page visit, idempotently.

## Testing strategy

- **Unit:** `resolveBillingAccount`; gate / `blocked` decision; cron delta math;
  webhook handlers against Stripe fixture payloads; period-reset logic.
- **Integration:** Stripe **test mode** + Stripe CLI for webhook delivery; Stripe
  **test clock** for period rollover; checkout → webhook → `status=active` flow;
  meter-event reporting produces correct summed usage.
- Keep explorer/test bypass covered so we never bill test traffic.

## Suggested implementation phasing (for the plan)

1. **Schema & resolution** — `billing_accounts`, `billing_meter_reports`,
   `billing_account_id` on `api_usage_daily`; backfill; `resolveBillingAccount`; env.
2. **Stripe onboarding** — `stripe` dep, bootstrap script, customer + Checkout +
   Portal, webhook route + status/card sync.
3. **Enforcement** — free-allotment gate + `current_period_requests` counter +
   `blocked` flag + monthly reset.
4. **Metering** — cron Worker + ledger delta reporting to Stripe meter.
5. **UI & summary** — rebuild `billing.tsx`; `billing` oRPC router with usage summary.

Each phase is independently shippable; phases 3 and 4 can proceed in parallel once
phase 1 lands.
