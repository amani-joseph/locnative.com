# Usage-Based Billing (Stripe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge API clients pay-as-you-go ($1 per 1,000 requests, 10,000 free/month) by metering existing request tracking into Stripe Billing Meters, billed to a team or personal billing account.

**Architecture:** A new `billing_accounts` table unifies "team or personal user" into one Stripe customer. The existing `recordUsage()` path is extended to attribute usage to a billing account and enforce a free-tier gate. An hourly Cloudflare Cron Worker reports incremental usage deltas to Stripe meter events (idempotent via a ledger table). Stripe webhooks sync subscription/payment state back. A `billing` oRPC router + rebuilt `billing.tsx` expose usage, checkout, and the customer portal.

**Tech Stack:** TanStack Start (web), Cloudflare Workers + Hono + oRPC (`apps/server`), Postgres/Neon + Drizzle ORM, `stripe` Node SDK (Workers fetch + SubtleCrypto), Vitest, pnpm.

---

## Conventions & prerequisites (read once)

- **Package manager:** `pnpm` (v10). Run package scripts with `pnpm --filter <pkg> <script>`.
- **Run tests:** `pnpm --filter @locnative/api test` (Vitest, `*.test.ts` next to source).
- **Type check:** `pnpm --filter @locnative/api check-types`.
- **DB migrations:** edit schema in `packages/database/src/schema/`, export it from
  `packages/database/src/schema/index.ts` AND `packages/database/src/index.ts`, then
  `pnpm --filter @locnative/database db:generate` (creates an in-journal SQL file)
  and `pnpm --filter @locnative/database db:migrate`. **Never hand-write
  out-of-journal `.sql`.**
- **Neon `neon-http` has NO transactions** — `db.transaction()` throws. Every write
  below is an idempotent upsert (`onConflictDoUpdate` / `onConflictDoNothing`).
- **Stripe on Workers:** always construct the client via the factory in Task 6
  (`Stripe.createFetchHttpClient()`); verify webhooks with `constructEventAsync` +
  `Stripe.createSubtleCryptoProvider()`. Never use the default Node http client or the
  sync `constructEvent`.
- **Auth user id in oRPC:** `context.session.user.id` (see `dashboard.ts`).
- **Request sources:** `"production"` is billable; `"explorer_test"` is always free
  (constants exported from `packages/api/src/api-key-auth.ts`).
- **Commit after every task.** Branch: create `feat/usage-based-billing` off `master`
  before Task 1.

```bash
git checkout master && git pull && git checkout -b feat/usage-based-billing
```

### Stripe dashboard setup (manual, do before Task 6 testing)
1. Create a Stripe account (test mode) and copy the **secret key** (`sk_test_...`).
2. The Meter + Price are created by the bootstrap script in Task 9 (don't hand-create).
3. After deploying the webhook (Task 10), add a webhook endpoint in the Stripe
   dashboard pointing at `https://api.locnative.com/api/stripe/webhook`, subscribe to:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `payment_method.attached`, `invoice.paid`, `invoice.payment_failed`. Copy the
   **signing secret** (`whsec_...`).

---

# Phase 1 — Schema & billing-account resolution

## Task 1: Billing schema tables

**Files:**
- Create: `packages/database/src/schema/billing.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// packages/database/src/schema/billing.ts
import {
	boolean,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { teams } from "./teams.ts";

export const billingAccounts = pgTable(
	"billing_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		/** "team" | "user" — exactly one of teamId / userId is set */
		ownerType: text("owner_type").notNull(),
		teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
		userId: text("user_id"),
		stripeCustomerId: text("stripe_customer_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		/** "free" | "active" | "past_due" | "canceled" */
		status: text("status").notNull().default("free"),
		hasPaymentMethod: boolean("has_payment_method").notNull().default(false),
		freeAllotment: integer("free_allotment").notNull().default(10_000),
		currentPeriodStart: date("current_period_start", { mode: "string" }),
		currentPeriodRequests: integer("current_period_requests")
			.notNull()
			.default(0),
		blocked: boolean("blocked").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("uq_billing_accounts_team").on(table.teamId),
		uniqueIndex("uq_billing_accounts_user").on(table.userId),
		uniqueIndex("uq_billing_accounts_stripe_customer").on(
			table.stripeCustomerId
		),
	]
);

export const billingMeterReports = pgTable(
	"billing_meter_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		billingAccountId: uuid("billing_account_id")
			.notNull()
			.references(() => billingAccounts.id, { onDelete: "cascade" }),
		usageDate: date("usage_date", { mode: "string" }).notNull(),
		/** Running total already reported to Stripe for this (account, date) */
		reportedCount: integer("reported_count").notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("uq_billing_meter_reports_account_date").on(
			table.billingAccountId,
			table.usageDate
		),
		index("idx_billing_meter_reports_account").on(table.billingAccountId),
	]
);

export type BillingAccount = typeof billingAccounts.$inferSelect;
export type NewBillingAccount = typeof billingAccounts.$inferInsert;
export type BillingMeterReport = typeof billingMeterReports.$inferSelect;
export type NewBillingMeterReport = typeof billingMeterReports.$inferInsert;
```

- [ ] **Step 2: Export from `schema/index.ts`** — append:

```typescript
export type {
	BillingAccount,
	BillingMeterReport,
	NewBillingAccount,
	NewBillingMeterReport,
} from "./billing.ts";
export { billingAccounts, billingMeterReports } from "./billing.ts";
```

- [ ] **Step 3: Export from `packages/database/src/index.ts`** — add `billingAccounts`,
`billingMeterReports` to the value export block and the four types to the type export block
(mirror how `apiUsageDaily` / `ApiUsageDaily` are listed).

- [ ] **Step 4: Generate & apply migration**

Run:
```bash
pnpm --filter @locnative/database db:generate
pnpm --filter @locnative/database db:migrate
```
Expected: a new SQL file appears under `packages/database/drizzle/`, migrate prints applied.

- [ ] **Step 5: Commit**

```bash
git add packages/database
git commit -m "feat(billing): add billing_accounts and billing_meter_reports schema"
```

---

## Task 2: Add `billing_account_id` to `api_usage_daily`

**Files:**
- Modify: `packages/database/src/schema/api-keys.ts` (the `apiUsageDaily` table)

- [ ] **Step 1: Add the column + index** — inside the `apiUsageDaily` `pgTable` columns,
add after `projectId`:

```typescript
		billingAccountId: uuid("billing_account_id"),
```
and add to the table's index array:
```typescript
		index("idx_api_usage_daily_billing_account").on(table.billingAccountId),
```
(Keep it a plain nullable `uuid` without an FK to avoid a cross-file circular import;
referential integrity is enforced in app code. Import `uuid` is already present.)

- [ ] **Step 2: Generate & apply migration**

Run:
```bash
pnpm --filter @locnative/database db:generate
pnpm --filter @locnative/database db:migrate
```
Expected: new SQL adds `billing_account_id` column + index.

- [ ] **Step 3: Commit**

```bash
git add packages/database
git commit -m "feat(billing): attribute api_usage_daily rows to a billing account"
```

---

## Task 3: `resolveBillingAccount` helper (pure logic + DB upsert)

**Files:**
- Create: `packages/api/src/billing/account.ts`
- Test: `packages/api/src/billing/account.test.ts`

- [ ] **Step 1: Write the failing test** (pure helpers only — no DB)

```typescript
// packages/api/src/billing/account.test.ts
import { describe, expect, it } from "vitest";
import { billingOwnerFromKey, isInNewUtcMonth } from "./account.ts";

describe("billingOwnerFromKey", () => {
	it("uses team when the key has a teamId", () => {
		expect(
			billingOwnerFromKey({ teamId: "team-1", userId: "user-1" })
		).toEqual({ ownerType: "team", teamId: "team-1", userId: null });
	});

	it("falls back to user when no teamId", () => {
		expect(
			billingOwnerFromKey({ teamId: null, userId: "user-1" })
		).toEqual({ ownerType: "user", teamId: null, userId: "user-1" });
	});
});

describe("isInNewUtcMonth", () => {
	it("returns true when periodStart is null", () => {
		expect(isInNewUtcMonth(null, new Date("2026-06-11T00:00:00Z"))).toBe(true);
	});

	it("returns true when the month changed", () => {
		expect(isInNewUtcMonth("2026-05-31", new Date("2026-06-01T00:00:00Z"))).toBe(
			true
		);
	});

	it("returns false within the same month", () => {
		expect(isInNewUtcMonth("2026-06-01", new Date("2026-06-30T23:59:59Z"))).toBe(
			false
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @locnative/api test account`
Expected: FAIL — `Cannot find module './account.ts'`.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/api/src/billing/account.ts
import type { Database } from "@locnative/database";
import { billingAccounts } from "@locnative/database";
import type { BillingAccount } from "@locnative/database";
import { eq } from "drizzle-orm";

export interface BillingOwner {
	ownerType: "team" | "user";
	teamId: string | null;
	userId: string | null;
}

/** Decide which entity owns the bill for a validated API key. */
export function billingOwnerFromKey(key: {
	teamId: string | null;
	userId: string;
}): BillingOwner {
	if (key.teamId) {
		return { ownerType: "team", teamId: key.teamId, userId: null };
	}
	return { ownerType: "user", teamId: null, userId: key.userId };
}

/** First-of-UTC-month string for a date, e.g. "2026-06-01". */
export function utcMonthStart(now: Date): string {
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	return `${y}-${m}-01`;
}

/** True if `now` is in a later UTC month than `periodStart` (or no period yet). */
export function isInNewUtcMonth(periodStart: string | null, now: Date): boolean {
	if (!periodStart) {
		return true;
	}
	return utcMonthStart(now) > periodStart.slice(0, 7) + "-01";
}

/** Compute whether an account should be blocked from production traffic. */
export function computeBlocked(account: {
	currentPeriodRequests: number;
	freeAllotment: number;
	hasPaymentMethod: boolean;
}): boolean {
	if (account.hasPaymentMethod) {
		return false;
	}
	return account.currentPeriodRequests >= account.freeAllotment;
}

/**
 * Idempotently fetch or create the billing account for an owner.
 * Neon has no transactions, so we insert-on-conflict-do-nothing then select.
 */
export async function getOrCreateBillingAccount(
	db: Database,
	owner: BillingOwner
): Promise<BillingAccount> {
	const whereOwner = owner.teamId
		? eq(billingAccounts.teamId, owner.teamId)
		: eq(billingAccounts.userId, owner.userId as string);

	await db
		.insert(billingAccounts)
		.values({
			ownerType: owner.ownerType,
			teamId: owner.teamId,
			userId: owner.userId,
			currentPeriodStart: utcMonthStart(new Date()),
		})
		.onConflictDoNothing();

	const [row] = await db
		.select()
		.from(billingAccounts)
		.where(whereOwner)
		.limit(1);

	if (!row) {
		throw new Error("Failed to resolve billing account after upsert");
	}
	return row;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @locnative/api test account`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/billing/account.ts packages/api/src/billing/account.test.ts
git commit -m "feat(billing): billing-account resolution + free-tier gate helpers"
```

---

## Task 4: Return `teamId` from API-key validation

**Files:**
- Modify: `packages/api/src/api-key-auth.ts`

- [ ] **Step 1: Extend the `ValidatedApiKey` interface**

```typescript
export interface ValidatedApiKey {
	apiKeyId: string;
	projectId: string | null;
	userId: string;
	teamId: string | null;
}
```

- [ ] **Step 2: Include `teamId` in both return paths**

In `validateApiKey`, the final return becomes:
```typescript
	return {
		apiKeyId: keyId,
		projectId: row.projectId,
		userId: row.userId,
		teamId: row.teamId,
	};
```
In `validateApiKeyById`, add `teamId: apiKeys.teamId` to the `.select({...})` projection
and return `teamId: row.teamId` alongside the existing fields.

- [ ] **Step 3: Type check**

Run: `pnpm --filter @locnative/api check-types`
Expected: PASS (no other code reads a fixed shape that breaks).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/api-key-auth.ts
git commit -m "feat(billing): expose teamId from validated API keys"
```

---

## Task 5: Attribute usage to a billing account in `recordUsage`

**Files:**
- Modify: `packages/api/src/api-key-auth.ts` (the `recordUsage` function)

- [ ] **Step 1: Update `recordUsage` to resolve and store `billingAccountId`**

Replace the body of `recordUsage` with:

```typescript
export async function recordUsage(
	db: Database,
	input: {
		apiKeyId: string;
		projectId?: string | null;
		userId: string;
		teamId?: string | null;
		endpoint: string;
		requestSource?: string;
	}
): Promise<void> {
	const usageDate = todayUtcDateString();
	const owner = billingOwnerFromKey({
		teamId: input.teamId ?? null,
		userId: input.userId,
	});
	const account = await getOrCreateBillingAccount(db, owner);

	await db
		.insert(apiUsageDaily)
		.values({
			apiKeyId: input.apiKeyId,
			projectId: input.projectId ?? null,
			billingAccountId: account.id,
			userId: input.userId,
			usageDate,
			endpoint: input.endpoint,
			requestSource: input.requestSource ?? REQUEST_SOURCE_PRODUCTION,
			requestCount: 1,
		})
		.onConflictDoUpdate({
			target: [
				apiUsageDaily.apiKeyId,
				apiUsageDaily.usageDate,
				apiUsageDaily.endpoint,
				apiUsageDaily.requestSource,
			],
			set: {
				requestCount: sql`${apiUsageDaily.requestCount} + 1`,
			},
		});
}
```

- [ ] **Step 2: Add the import** at the top of `api-key-auth.ts`:

```typescript
import { billingOwnerFromKey, getOrCreateBillingAccount } from "./billing/account.ts";
```

- [ ] **Step 3: Pass `teamId` from the usage middleware**

In `packages/api/src/routers/public-middleware.ts`, the `usageMiddleware` reads
`ctx.validatedApiKey`. Add `teamId` to the `recordUsage` call:
```typescript
			recordUsage(ctx.db, {
				apiKeyId: ctx.validatedApiKey.apiKeyId,
				projectId: ctx.validatedApiKey.projectId,
				userId: ctx.validatedApiKey.userId,
				teamId: ctx.validatedApiKey.teamId,
				endpoint: endpointKey,
				requestSource: ctx.requestSource,
			}).catch((err: unknown) => {
```

- [ ] **Step 4: Type check**

Run: `pnpm --filter @locnative/api check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/api-key-auth.ts packages/api/src/routers/public-middleware.ts
git commit -m "feat(billing): attribute recorded usage to billing accounts"
```

---

# Phase 2 — Stripe onboarding (customer, checkout, portal, webhooks)

## Task 6: Stripe env config + client factory

**Files:**
- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/package.json` (add `stripe`), `packages/api/package.json` (add `stripe`)
- Create: `packages/api/src/billing/stripe.ts`

- [ ] **Step 1: Add env vars** in `packages/env/src/server.ts` inside the `server: {...}`
block:

```typescript
		STRIPE_SECRET_KEY: z.string().min(1),
		STRIPE_WEBHOOK_SECRET: z.string().min(1),
		STRIPE_PRICE_ID: z.string().min(1),
		STRIPE_METER_EVENT_NAME: z.string().min(1).default("api_request"),
		BILLING_FREE_ALLOTMENT: z.coerce.number().int().positive().default(10_000),
```
and add each to the `runtimeEnv` block:
```typescript
		STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
		STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
		STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
		STRIPE_METER_EVENT_NAME: process.env.STRIPE_METER_EVENT_NAME,
		BILLING_FREE_ALLOTMENT: process.env.BILLING_FREE_ALLOTMENT,
```

- [ ] **Step 2: Install the SDK**

```bash
pnpm --filter @locnative/api add stripe
pnpm --filter locnative-server add stripe
```

- [ ] **Step 3: Create the Workers-safe client factory**

```typescript
// packages/api/src/billing/stripe.ts
import { serverEnv } from "@locnative/env/server";
import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Stripe client configured for the Cloudflare Workers runtime: the fetch HTTP
 * client (workerd has no Node http) and no implicit Node crypto. Reused across
 * invocations within an isolate.
 */
export function getStripeClient(): Stripe {
	if (cached) {
		return cached;
	}
	cached = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
		httpClient: Stripe.createFetchHttpClient(),
	});
	return cached;
}

/** Shared SubtleCrypto provider for async webhook signature verification. */
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();
```

- [ ] **Step 4: Type check**

Run: `pnpm --filter @locnative/api check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/env packages/api apps/server/package.json pnpm-lock.yaml
git commit -m "feat(billing): add Stripe env config and Workers client factory"
```

---

## Task 7: Webhook event handler (pure-ish, DB-syncing)

**Files:**
- Create: `packages/api/src/billing/stripe-sync.ts`
- Test: `packages/api/src/billing/stripe-sync.test.ts`

- [ ] **Step 1: Write the failing test** (tests the state-mapping function, no Stripe/DB)

```typescript
// packages/api/src/billing/stripe-sync.test.ts
import { describe, expect, it } from "vitest";
import { accountUpdateForEvent } from "./stripe-sync.ts";

describe("accountUpdateForEvent", () => {
	it("activates on checkout.session.completed", () => {
		expect(
			accountUpdateForEvent("checkout.session.completed", { subscription: "sub_1" })
		).toEqual({
			status: "active",
			hasPaymentMethod: true,
			blocked: false,
			stripeSubscriptionId: "sub_1",
		});
	});

	it("marks past_due on invoice.payment_failed", () => {
		expect(accountUpdateForEvent("invoice.payment_failed", {})).toEqual({
			status: "past_due",
		});
	});

	it("reverts to free on subscription deletion", () => {
		expect(accountUpdateForEvent("customer.subscription.deleted", {})).toEqual({
			status: "canceled",
			hasPaymentMethod: false,
			stripeSubscriptionId: null,
		});
	});

	it("returns null for irrelevant events", () => {
		expect(accountUpdateForEvent("charge.refunded", {})).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @locnative/api test stripe-sync`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/api/src/billing/stripe-sync.ts
import type { Database } from "@locnative/database";
import { billingAccounts } from "@locnative/database";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export interface AccountUpdate {
	status?: "free" | "active" | "past_due" | "canceled";
	hasPaymentMethod?: boolean;
	blocked?: boolean;
	stripeSubscriptionId?: string | null;
}

/** Map a Stripe event type to the billing-account fields it should change. */
export function accountUpdateForEvent(
	type: string,
	data: { subscription?: string | null }
): AccountUpdate | null {
	switch (type) {
		case "checkout.session.completed":
		case "customer.subscription.created":
		case "customer.subscription.updated":
			return {
				status: "active",
				hasPaymentMethod: true,
				blocked: false,
				stripeSubscriptionId: data.subscription ?? undefined,
			};
		case "payment_method.attached":
			return { hasPaymentMethod: true, blocked: false };
		case "invoice.paid":
			return { status: "active" };
		case "invoice.payment_failed":
			return { status: "past_due" };
		case "customer.subscription.deleted":
			return {
				status: "canceled",
				hasPaymentMethod: false,
				stripeSubscriptionId: null,
			};
		default:
			return null;
	}
}

/** Pull the Stripe customer id off any supported event object. */
export function customerIdFromEvent(event: Stripe.Event): string | null {
	const obj = event.data.object as { customer?: string | null };
	return typeof obj.customer === "string" ? obj.customer : null;
}

/** Pull a subscription id off the event object when present. */
export function subscriptionIdFromEvent(event: Stripe.Event): string | null {
	const obj = event.data.object as {
		subscription?: string | null;
		id?: string;
		object?: string;
	};
	if (typeof obj.subscription === "string") {
		return obj.subscription;
	}
	if (obj.object === "subscription" && typeof obj.id === "string") {
		return obj.id;
	}
	return null;
}

/** Apply a verified Stripe event to the matching billing account. */
export async function applyStripeEvent(
	db: Database,
	event: Stripe.Event
): Promise<void> {
	const update = accountUpdateForEvent(event.type, {
		subscription: subscriptionIdFromEvent(event),
	});
	if (!update) {
		return;
	}
	const customerId = customerIdFromEvent(event);
	if (!customerId) {
		return;
	}
	await db
		.update(billingAccounts)
		.set({ ...update, updatedAt: new Date() })
		.where(eq(billingAccounts.stripeCustomerId, customerId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @locnative/api test stripe-sync`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/billing/stripe-sync.ts packages/api/src/billing/stripe-sync.test.ts
git commit -m "feat(billing): map Stripe webhook events to account state"
```

---

## Task 8: Customer + Checkout + Portal service functions

**Files:**
- Create: `packages/api/src/billing/customer.ts`

- [ ] **Step 1: Implement the service functions** (no test — thin Stripe wrappers; covered
by integration in Task 19's manual flow)

```typescript
// packages/api/src/billing/customer.ts
import type { Database } from "@locnative/database";
import { billingAccounts } from "@locnative/database";
import type { BillingAccount } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { eq } from "drizzle-orm";
import { getStripeClient } from "./stripe.ts";

/** Ensure the billing account has a Stripe customer; create + persist if missing. */
export async function ensureStripeCustomer(
	db: Database,
	account: BillingAccount,
	opts: { email?: string; label: string }
): Promise<string> {
	if (account.stripeCustomerId) {
		return account.stripeCustomerId;
	}
	const stripe = getStripeClient();
	const customer = await stripe.customers.create({
		email: opts.email,
		name: opts.label,
		metadata: {
			billing_account_id: account.id,
			owner_type: account.ownerType,
			team_id: account.teamId ?? "",
			user_id: account.userId ?? "",
		},
	});
	await db
		.update(billingAccounts)
		.set({ stripeCustomerId: customer.id, updatedAt: new Date() })
		.where(eq(billingAccounts.id, account.id));
	return customer.id;
}

/** Create a Checkout Session to subscribe the customer to the metered price. */
export async function createCheckoutUrl(
	customerId: string,
	returnBaseUrl: string
): Promise<string> {
	const stripe = getStripeClient();
	const session = await stripe.checkout.sessions.create({
		mode: "subscription",
		customer: customerId,
		line_items: [{ price: serverEnv.STRIPE_PRICE_ID }],
		success_url: `${returnBaseUrl}/billing?checkout=success`,
		cancel_url: `${returnBaseUrl}/billing?checkout=cancel`,
	});
	if (!session.url) {
		throw new Error("Stripe did not return a checkout URL");
	}
	return session.url;
}

/** Create a Billing Portal session for managing card + invoices. */
export async function createPortalUrl(
	customerId: string,
	returnBaseUrl: string
): Promise<string> {
	const stripe = getStripeClient();
	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: `${returnBaseUrl}/billing`,
	});
	return session.url;
}
```

- [ ] **Step 2: Type check**

Run: `pnpm --filter @locnative/api check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/billing/customer.ts
git commit -m "feat(billing): Stripe customer, checkout, and portal helpers"
```

---

## Task 9: Stripe bootstrap script (create Meter + Price)

**Files:**
- Create: `packages/api/src/billing/bootstrap-stripe.ts`
- Modify: `packages/api/package.json` (add a script)

- [ ] **Step 1: Write the one-shot script**

```typescript
// packages/api/src/billing/bootstrap-stripe.ts
// Run once per Stripe environment: `pnpm --filter @locnative/api billing:bootstrap`
// Prints the meter id, price id, and event name to put in env.
import { serverEnv } from "@locnative/env/server";
import { getStripeClient } from "./stripe.ts";

async function main(): Promise<void> {
	const stripe = getStripeClient();
	const eventName = serverEnv.STRIPE_METER_EVENT_NAME;

	const meter = await stripe.billing.meters.create({
		display_name: "API requests",
		event_name: eventName,
		default_aggregation: { formula: "sum" },
	});

	const price = await stripe.prices.create({
		currency: "usd",
		// $1.00 per 1,000 requests = 0.1 cents per request.
		unit_amount_decimal: "0.1",
		recurring: { interval: "month", usage_type: "metered", meter: meter.id },
		product_data: { name: "Locnative API usage" },
	});

	process.stdout.write(
		`STRIPE_METER_EVENT_NAME=${eventName}\nSTRIPE_PRICE_ID=${price.id}\nMETER_ID=${meter.id}\n`
	);
}

main().catch((err) => {
	process.stderr.write(`bootstrap failed: ${String(err)}\n`);
	process.exit(1);
});
```

- [ ] **Step 2: Add the script** to `packages/api/package.json` `scripts`:

```json
		"billing:bootstrap": "tsx src/billing/bootstrap-stripe.ts"
```
Add `tsx` if missing: `pnpm --filter @locnative/api add -D tsx`.

- [ ] **Step 3: Run it against Stripe test mode**

Set `STRIPE_SECRET_KEY`, `STRIPE_METER_EVENT_NAME=api_request`, and a placeholder
`STRIPE_PRICE_ID=price_placeholder` in your `.env`, then:
```bash
pnpm --filter @locnative/api billing:bootstrap
```
Expected: prints `STRIPE_PRICE_ID=price_...` and `METER_ID=mtr_...`. Put the real
`STRIPE_PRICE_ID` into your env / Worker secrets.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/billing/bootstrap-stripe.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat(billing): Stripe meter + metered price bootstrap script"
```

---

## Task 10: Webhook route in the server Worker

**Files:**
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Add imports** near the other `@locnative/api` imports:

```typescript
import { applyStripeEvent, db, getStripeClient, stripeCryptoProvider } from "@locnative/api";
import { serverEnv } from "@locnative/env/server";
```
(`db` is already exported from `@locnative/api`; `serverEnv` may already be imported —
do not duplicate. Add the new symbols to the existing import where possible.)

Then re-export the billing functions from the api barrel so the server can import them —
in `packages/api/src/index.ts` append:
```typescript
export { applyStripeEvent } from "./billing/stripe-sync.ts";
export { getStripeClient, stripeCryptoProvider } from "./billing/stripe.ts";
```

- [ ] **Step 2: Register the route** — add this BEFORE the catch-all `app.use("/*", ...)`
and before any auth middleware that would consume the body (place it next to the
`/api/auth/*` handler):

```typescript
app.post("/api/stripe/webhook", async (context) => {
	const signature = context.req.header("stripe-signature");
	if (!signature) {
		return context.json({ error: "missing signature" }, 400);
	}
	const payload = await context.req.text();
	let event: import("stripe").Stripe.Event;
	try {
		event = await getStripeClient().webhooks.constructEventAsync(
			payload,
			signature,
			serverEnv.STRIPE_WEBHOOK_SECRET,
			undefined,
			stripeCryptoProvider
		);
	} catch (err) {
		console.error("[stripe] signature verification failed:", err);
		return context.json({ error: "invalid signature" }, 400);
	}

	try {
		await applyStripeEvent(db, event);
	} catch (err) {
		console.error("[stripe] event handling failed:", err);
		return context.json({ error: "handler error" }, 500);
	}
	return context.json({ received: true });
});
```

- [ ] **Step 3: Type check both packages**

Run:
```bash
pnpm --filter @locnative/api check-types
pnpm --filter locnative-server exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 4: Test locally with Stripe CLI** (manual)

```bash
pnpm --filter locnative-server dev   # starts Worker on :3003
stripe listen --forward-to localhost:3003/api/stripe/webhook
stripe trigger checkout.session.completed
```
Expected: Worker logs the event and returns 200; no signature errors.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/index.ts packages/api/src/index.ts
git commit -m "feat(billing): Stripe webhook endpoint with signature verification"
```

---

# Phase 3 — Free-tier enforcement

## Task 11: Period-aware usage counter

**Files:**
- Modify: `packages/api/src/billing/account.ts`
- Test: `packages/api/src/billing/account.test.ts`

- [ ] **Step 1: Add a failing test for the increment-decision helper**

Append to `account.test.ts`:
```typescript
import { nextCounterState } from "./account.ts";

describe("nextCounterState", () => {
	const now = new Date("2026-06-15T00:00:00Z");

	it("resets the counter when entering a new month", () => {
		expect(
			nextCounterState(
				{ currentPeriodStart: "2026-05-01", currentPeriodRequests: 9000, freeAllotment: 10_000, hasPaymentMethod: false },
				now
			)
		).toEqual({ currentPeriodStart: "2026-06-01", currentPeriodRequests: 1, blocked: false });
	});

	it("increments within the month and blocks at the free limit", () => {
		expect(
			nextCounterState(
				{ currentPeriodStart: "2026-06-01", currentPeriodRequests: 9999, freeAllotment: 10_000, hasPaymentMethod: false },
				now
			)
		).toEqual({ currentPeriodStart: "2026-06-01", currentPeriodRequests: 10_000, blocked: true });
	});

	it("never blocks when a card is on file", () => {
		expect(
			nextCounterState(
				{ currentPeriodStart: "2026-06-01", currentPeriodRequests: 999_999, freeAllotment: 10_000, hasPaymentMethod: true },
				now
			).blocked
		).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @locnative/api test account`
Expected: FAIL — `nextCounterState` not exported.

- [ ] **Step 3: Implement `nextCounterState`** in `account.ts`:

```typescript
export interface CounterState {
	currentPeriodStart: string;
	currentPeriodRequests: number;
	blocked: boolean;
}

/** Compute the new counter row after one production request. */
export function nextCounterState(
	account: {
		currentPeriodStart: string | null;
		currentPeriodRequests: number;
		freeAllotment: number;
		hasPaymentMethod: boolean;
	},
	now: Date
): CounterState {
	const newMonth = isInNewUtcMonth(account.currentPeriodStart, now);
	const requests = newMonth ? 1 : account.currentPeriodRequests + 1;
	const start = newMonth ? utcMonthStart(now) : (account.currentPeriodStart as string);
	return {
		currentPeriodStart: start,
		currentPeriodRequests: requests,
		blocked: computeBlocked({
			currentPeriodRequests: requests,
			freeAllotment: account.freeAllotment,
			hasPaymentMethod: account.hasPaymentMethod,
		}),
	};
}
```

- [ ] **Step 4: Add the DB-applying function** in `account.ts`:

```typescript
import { sql } from "drizzle-orm";
// (merge with existing drizzle-orm import: `import { eq, sql } from "drizzle-orm";`)

/** Increment a billing account's monthly counter, resetting on month rollover. */
export async function incrementBillingUsage(
	db: Database,
	account: BillingAccount,
	now = new Date()
): Promise<void> {
	const next = nextCounterState(account, now);
	await db
		.update(billingAccounts)
		.set({
			currentPeriodStart: next.currentPeriodStart,
			currentPeriodRequests: next.currentPeriodRequests,
			blocked: next.blocked,
			updatedAt: now,
		})
		.where(eq(billingAccounts.id, account.id));
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @locnative/api test account`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/billing/account.ts packages/api/src/billing/account.test.ts
git commit -m "feat(billing): monthly usage counter with rollover and blocking"
```

---

## Task 12: Wire the counter into `recordUsage` (production only)

**Files:**
- Modify: `packages/api/src/api-key-auth.ts` (`recordUsage`)

- [ ] **Step 1: Increment the counter for production traffic**

In `recordUsage`, after `getOrCreateBillingAccount` and the `apiUsageDaily` upsert, add:

```typescript
	const source = input.requestSource ?? REQUEST_SOURCE_PRODUCTION;
	if (source === REQUEST_SOURCE_PRODUCTION) {
		await incrementBillingUsage(db, account);
	}
```
Update the import:
```typescript
import {
	billingOwnerFromKey,
	getOrCreateBillingAccount,
	incrementBillingUsage,
} from "./billing/account.ts";
```

- [ ] **Step 2: Type check**

Run: `pnpm --filter @locnative/api check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/api-key-auth.ts
git commit -m "feat(billing): count production requests against the free allotment"
```

---

## Task 13: Reject blocked accounts at the gate (402)

**Files:**
- Modify: `packages/api/src/routers/public-middleware.ts` (`apiKeyAuth`)
- Modify: `apps/server/src/index.ts` (error-code map)

- [ ] **Step 1: Add the gate in `apiKeyAuth`** — after `authResult` is confirmed valid and
before `return next({...})`, insert:

```typescript
	const requestSource = trustedRequestSource ?? REQUEST_SOURCE_PRODUCTION;
	if (requestSource === REQUEST_SOURCE_PRODUCTION) {
		const owner = billingOwnerFromKey({
			teamId: authResult.teamId,
			userId: authResult.userId,
		});
		const account = await getOrCreateBillingAccount(context.db, owner);
		if (account.blocked) {
			throw new ORPCError("PAYMENT_REQUIRED", {
				message:
					"Free tier exhausted. Add a payment method in your billing settings to continue.",
			});
		}
	}
```
Add the import at the top of `public-middleware.ts`:
```typescript
import { billingOwnerFromKey, getOrCreateBillingAccount } from "../billing/account.ts";
```
(The existing `return next({...})` already sets `requestSource`; reuse the local variable
to avoid recomputing — replace `requestSource: trustedRequestSource ?? REQUEST_SOURCE_PRODUCTION`
with `requestSource`.)

- [ ] **Step 2: Map `PAYMENT_REQUIRED` → HTTP 402** in `apps/server/src/index.ts`, in the
`ORPC_TO_API_ERROR` record add:

```typescript
	PAYMENT_REQUIRED: { status: 402, code: "payment_required" },
```

- [ ] **Step 3: Type check**

Run:
```bash
pnpm --filter @locnative/api check-types
pnpm --filter locnative-server exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

With the local server running, create a billing account row with `blocked = true` (via
`db:studio` or SQL), then call a public endpoint with that account's key:
```bash
# expect HTTP 402 with {"error":{"code":"payment_required",...}}
```
Reset `blocked = false` and confirm the request succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/public-middleware.ts apps/server/src/index.ts
git commit -m "feat(billing): reject over-free-tier requests without a card (HTTP 402)"
```

---

# Phase 4 — Metering cron → Stripe

## Task 14: Delta computation (pure)

**Files:**
- Create: `packages/api/src/billing/meter-reporting.ts`
- Test: `packages/api/src/billing/meter-reporting.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/api/src/billing/meter-reporting.test.ts
import { describe, expect, it } from "vitest";
import { computeMeterDeltas, recentUsageDates } from "./meter-reporting.ts";

describe("computeMeterDeltas", () => {
	it("emits positive deltas vs the reported ledger", () => {
		const deltas = computeMeterDeltas(
			[
				{ usageDate: "2026-06-10", liveCount: 500 },
				{ usageDate: "2026-06-11", liveCount: 1200 },
			],
			new Map([["2026-06-10", 500]]) // 06-10 already fully reported
		);
		expect(deltas).toEqual([
			{ usageDate: "2026-06-11", delta: 1200, liveCount: 1200 },
		]);
	});

	it("skips dates where live <= reported", () => {
		expect(
			computeMeterDeltas([{ usageDate: "2026-06-11", liveCount: 100 }], new Map([["2026-06-11", 100]]))
		).toEqual([]);
	});
});

describe("recentUsageDates", () => {
	it("returns today and the prior day in UTC", () => {
		expect(recentUsageDates(new Date("2026-06-11T01:00:00Z"))).toEqual([
			"2026-06-10",
			"2026-06-11",
		]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @locnative/api test meter-reporting`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helpers**

```typescript
// packages/api/src/billing/meter-reporting.ts
import type { Database } from "@locnative/database";
import { apiUsageDaily, billingAccounts, billingMeterReports } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getStripeClient } from "./stripe.ts";

const PRODUCTION = "production";

export interface LiveUsage {
	usageDate: string;
	liveCount: number;
}
export interface MeterDelta {
	usageDate: string;
	delta: number;
	liveCount: number;
}

/** UTC date string N days before `now` (0 = today). */
function utcDateMinus(now: Date, days: number): string {
	const d = new Date(now);
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

/** The window of dates the cron re-checks each run (today + yesterday UTC). */
export function recentUsageDates(now = new Date()): string[] {
	return [utcDateMinus(now, 1), utcDateMinus(now, 0)];
}

/** Diff live per-date totals against the reported ledger; emit positive deltas. */
export function computeMeterDeltas(
	live: LiveUsage[],
	reported: Map<string, number>
): MeterDelta[] {
	const out: MeterDelta[] = [];
	for (const row of live) {
		const already = reported.get(row.usageDate) ?? 0;
		const delta = row.liveCount - already;
		if (delta > 0) {
			out.push({ usageDate: row.usageDate, delta, liveCount: row.liveCount });
		}
	}
	return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @locnative/api test meter-reporting`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/billing/meter-reporting.ts packages/api/src/billing/meter-reporting.test.ts
git commit -m "feat(billing): meter delta computation against the report ledger"
```

---

## Task 15: Reporting orchestration (DB + Stripe)

**Files:**
- Modify: `packages/api/src/billing/meter-reporting.ts`
- Modify: `packages/api/src/index.ts` (export `reportUsageToStripe`)

- [ ] **Step 1: Add the orchestration function** to `meter-reporting.ts`:

```typescript
/** Report each account's recent usage deltas to Stripe meter events. */
export async function reportUsageToStripe(db: Database, now = new Date()): Promise<void> {
	const dates = recentUsageDates(now);
	const stripe = getStripeClient();
	const eventName = serverEnv.STRIPE_METER_EVENT_NAME;

	// Accounts that can be billed (have a Stripe customer).
	const accounts = await db
		.select({ id: billingAccounts.id, stripeCustomerId: billingAccounts.stripeCustomerId })
		.from(billingAccounts)
		.where(isNotNull(billingAccounts.stripeCustomerId));

	for (const account of accounts) {
		const customerId = account.stripeCustomerId as string;

		const live = await db
			.select({
				usageDate: apiUsageDaily.usageDate,
				liveCount: sql<number>`coalesce(sum(${apiUsageDaily.requestCount}), 0)::int`,
			})
			.from(apiUsageDaily)
			.where(
				and(
					eq(apiUsageDaily.billingAccountId, account.id),
					eq(apiUsageDaily.requestSource, PRODUCTION),
					inArray(apiUsageDaily.usageDate, dates)
				)
			)
			.groupBy(apiUsageDaily.usageDate);

		const reportedRows = await db
			.select({
				usageDate: billingMeterReports.usageDate,
				reportedCount: billingMeterReports.reportedCount,
			})
			.from(billingMeterReports)
			.where(
				and(
					eq(billingMeterReports.billingAccountId, account.id),
					inArray(billingMeterReports.usageDate, dates)
				)
			);

		const reported = new Map(reportedRows.map((r) => [r.usageDate, r.reportedCount]));
		const deltas = computeMeterDeltas(live, reported);

		for (const d of deltas) {
			await stripe.billing.meterEvents.create(
				{
					event_name: eventName,
					payload: { value: String(d.delta), stripe_customer_id: customerId },
					identifier: `${account.id}:${d.usageDate}:${d.liveCount}`,
				},
				{ idempotencyKey: `${account.id}:${d.usageDate}:${d.liveCount}` }
			);

			// Advance the ledger only after Stripe accepted the event.
			await db
				.insert(billingMeterReports)
				.values({
					billingAccountId: account.id,
					usageDate: d.usageDate,
					reportedCount: d.liveCount,
				})
				.onConflictDoUpdate({
					target: [billingMeterReports.billingAccountId, billingMeterReports.usageDate],
					set: { reportedCount: d.liveCount, updatedAt: new Date() },
				});
		}
	}
}
```

- [ ] **Step 2: Export from the api barrel** — append to `packages/api/src/index.ts`:

```typescript
export { reportUsageToStripe } from "./billing/meter-reporting.ts";
```

- [ ] **Step 3: Type check**

Run: `pnpm --filter @locnative/api check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/billing/meter-reporting.ts packages/api/src/index.ts
git commit -m "feat(billing): report usage deltas to Stripe meter events idempotently"
```

---

## Task 16: Cron trigger + scheduled handler

**Files:**
- Modify: `apps/server/wrangler.jsonc`
- Modify: `apps/server/src/index.ts` (default export)

- [ ] **Step 1: Add the cron trigger** to `apps/server/wrangler.jsonc` (top level, sibling
of `queues`):

```jsonc
	"triggers": {
		"crons": ["0 * * * *"]
	},
```

- [ ] **Step 2: Add the `scheduled` handler** to the default export in
`apps/server/src/index.ts`. Add `reportUsageToStripe` to the `@locnative/api` import,
then:

```typescript
export default {
	fetch: app.fetch,
	async scheduled(
		_event: { cron: string; scheduledTime: number },
		_env: unknown,
		ctx: { waitUntil(p: Promise<unknown>): void }
	): Promise<void> {
		ctx.waitUntil(
			reportUsageToStripe(db).catch((err: unknown) => {
				console.error("[cron] reportUsageToStripe failed:", err);
			})
		);
	},
	async queue(
		// ...existing queue handler unchanged...
	): Promise<void> {
		// ...unchanged...
	},
};
```
(Keep the existing `queue` handler body exactly as-is; only add the `scheduled` method and
ensure `db` and `reportUsageToStripe` are imported from `@locnative/api`.)

- [ ] **Step 3: Type check**

Run: `pnpm --filter locnative-server exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Test the scheduled handler locally**

```bash
pnpm --filter locnative-server dev
# in another shell:
curl "http://localhost:3003/__scheduled?cron=0+*+*+*+*"
```
Expected: Worker logs a cron run with no errors (no accounts with customers yet → no-op).

- [ ] **Step 5: Commit**

```bash
git add apps/server/wrangler.jsonc apps/server/src/index.ts
git commit -m "feat(billing): hourly cron to report usage to Stripe"
```

---

# Phase 5 — Billing router + UI

## Task 17: `billing` oRPC router

**Files:**
- Create: `packages/api/src/routers/domains/billing.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Implement the router**

```typescript
// packages/api/src/routers/domains/billing.ts
import {
	apiUsageDaily,
	billingAccounts,
	teamMembers,
	teams,
} from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { and, eq, gte, sql, sum } from "drizzle-orm";
import { z } from "zod";
import {
	getOrCreateBillingAccount,
	type BillingOwner,
} from "../../billing/account.ts";
import { createCheckoutUrl, createPortalUrl, ensureStripeCustomer } from "../../billing/customer.ts";
import { protectedProcedure } from "../../procedures.ts";

const PRODUCTION = "production";
const RETURN_BASE = serverEnv.WEB_BASE_URL;

const contextInput = z.object({ teamId: z.string().uuid().nullable() });

async function ownerForContext(
	db: Parameters<typeof getOrCreateBillingAccount>[0],
	userId: string,
	teamId: string | null
): Promise<BillingOwner> {
	if (!teamId) {
		return { ownerType: "user", teamId: null, userId };
	}
	// Authorize: the user must be a member of the team they bill for.
	const [member] = await db
		.select({ id: teamMembers.id })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
		.limit(1);
	if (!member) {
		throw new Error("Not a member of this team");
	}
	return { ownerType: "team", teamId, userId: null };
}

function monthStartStr(now: Date): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export const billingRouter = {
	/** Personal + each team the user belongs to (for the billing-context switcher). */
	listContexts: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const memberTeams = await context.db
			.select({ id: teams.id, name: teams.name })
			.from(teamMembers)
			.innerJoin(teams, eq(teams.id, teamMembers.teamId))
			.where(eq(teamMembers.userId, userId));
		return {
			personal: { teamId: null as string | null, label: "Personal" },
			teams: memberTeams.map((t) => ({ teamId: t.id, label: t.name })),
		};
	}),

	getAccount: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			return {
				status: account.status,
				hasPaymentMethod: account.hasPaymentMethod,
				freeAllotment: account.freeAllotment,
				currentPeriodRequests: account.currentPeriodRequests,
				blocked: account.blocked,
			};
		}),

	getUsageSummary: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			const monthStart = monthStartStr(new Date());

			const [totalRow] = await context.db
				.select({ total: sum(apiUsageDaily.requestCount) })
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.billingAccountId, account.id),
						eq(apiUsageDaily.requestSource, PRODUCTION),
						gte(apiUsageDaily.usageDate, monthStart)
					)
				);

			const byEndpoint = await context.db
				.select({
					endpoint: apiUsageDaily.endpoint,
					count: sum(apiUsageDaily.requestCount),
				})
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.billingAccountId, account.id),
						eq(apiUsageDaily.requestSource, PRODUCTION),
						gte(apiUsageDaily.usageDate, monthStart)
					)
				)
				.groupBy(apiUsageDaily.endpoint)
				.orderBy(sql`sum(${apiUsageDaily.requestCount}) desc`);

			const total = Number(totalRow?.total ?? 0);
			const billable = Math.max(0, total - account.freeAllotment);
			return {
				totalRequests: total,
				freeAllotment: account.freeAllotment,
				billableRequests: billable,
				// $1.00 / 1,000 requests, in cents.
				estimatedCents: Math.round((billable / 1000) * 100),
				byEndpoint: byEndpoint.map((r) => ({
					endpoint: r.endpoint,
					count: Number(r.count ?? 0),
				})),
			};
		}),

	createCheckoutSession: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			const customerId = await ensureStripeCustomer(context.db, account, {
				email: context.session.user.email,
				label: owner.teamId ? `Team ${owner.teamId}` : context.session.user.email,
			});
			return { url: await createCheckoutUrl(customerId, RETURN_BASE) };
		}),

	createPortalSession: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			const customerId = await ensureStripeCustomer(context.db, account, {
				email: context.session.user.email,
				label: owner.teamId ? `Team ${owner.teamId}` : context.session.user.email,
			});
			return { url: await createPortalUrl(customerId, RETURN_BASE) };
		}),
};
```

- [ ] **Step 2: Register the router** in `packages/api/src/routers/index.ts`: add the import
`import { billingRouter } from "./domains/billing.ts";` and add `billing: billingRouter,`
to the `appRouter` object.

- [ ] **Step 3: Type check**

Run: `pnpm --filter @locnative/api check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/domains/billing.ts packages/api/src/routers/index.ts
git commit -m "feat(billing): billing oRPC router (account, usage, checkout, portal)"
```

---

## Task 18: Rebuild `billing.tsx` with live data

**Files:**
- Modify: `apps/web/src/routes/_protected/billing.tsx`

- [ ] **Step 1: Replace the file** with a data-driven version (follows the `orpcClient` +
`useState`/`useEffect` pattern from `api-keys.tsx`):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Progress } from "@locnative/ui/components/progress";
import { CreditCardIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/billing")({
	component: RouteComponent,
});

type Account = Awaited<ReturnType<typeof orpcClient.billing.getAccount>>;
type Summary = Awaited<ReturnType<typeof orpcClient.billing.getUsageSummary>>;

function RouteComponent() {
	const [teamId, setTeamId] = useState<string | null>(null);
	const [account, setAccount] = useState<Account | null>(null);
	const [summary, setSummary] = useState<Summary | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const [acc, sum] = await Promise.all([
			orpcClient.billing.getAccount({ teamId }),
			orpcClient.billing.getUsageSummary({ teamId }),
		]);
		setAccount(acc);
		setSummary(sum);
	}, [teamId]);

	useEffect(() => {
		load();
	}, [load]);

	const startCheckout = useCallback(async () => {
		setBusy(true);
		try {
			const { url } = await orpcClient.billing.createCheckoutSession({ teamId });
			window.location.href = url;
		} finally {
			setBusy(false);
		}
	}, [teamId]);

	const openPortal = useCallback(async () => {
		setBusy(true);
		try {
			const { url } = await orpcClient.billing.createPortalSession({ teamId });
			window.location.href = url;
		} finally {
			setBusy(false);
		}
	}, [teamId]);

	const usedPct = account
		? Math.min(100, Math.round((account.currentPeriodRequests / account.freeAllotment) * 100))
		: 0;
	const estimate = summary ? (summary.estimatedCents / 100).toFixed(2) : "0.00";

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Billing</h1>
				<p className="text-muted-foreground text-sm">
					Pay-as-you-go — 10,000 requests/month free, then $1.00 per 1,000 requests.
				</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Current usage</CardTitle>
							<CardDescription>
								{account?.hasPaymentMethod
									? "Card on file — usage billed monthly"
									: "Free tier"}
							</CardDescription>
						</div>
						<Badge className="gap-1">
							<SparklesIcon className="size-3" />
							{account?.status ?? "free"}
						</Badge>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Requests this month</span>
							<span className="font-medium">
								{account?.currentPeriodRequests ?? 0} / {account?.freeAllotment ?? 0} free
							</span>
						</div>
						<Progress className="h-2" value={usedPct} />
					</div>
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Estimated cost this month</span>
						<span className="font-medium">${estimate}</span>
					</div>
					{account?.blocked ? (
						<p className="text-destructive text-sm">
							Free tier exhausted. Add a payment method to resume API access.
						</p>
					) : null}
					<div className="flex gap-2">
						{account?.hasPaymentMethod ? (
							<Button disabled={busy} onClick={openPortal} variant="outline">
								<CreditCardIcon className="size-4" /> Manage billing
							</Button>
						) : (
							<Button disabled={busy} onClick={startCheckout}>
								<CreditCardIcon className="size-4" /> Add payment method
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{summary && summary.byEndpoint.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Usage by endpoint</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{summary.byEndpoint.map((row) => (
							<div className="flex items-center justify-between text-sm" key={row.endpoint}>
								<span className="text-muted-foreground">{row.endpoint}</span>
								<span className="font-medium">{row.count}</span>
							</div>
						))}
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
```
(If multiple teams should be selectable, wire `orpcClient.billing.listContexts()` into a
`Select` that calls `setTeamId`; the `teamId` state already drives every query. Keep this
optional for the first pass — personal billing works with `teamId = null`.)

- [ ] **Step 2: Type check the web app**

Run: `pnpm --filter web exec tsc --noEmit` (or the web package's `check-types` script).
Expected: PASS — the `billing` router types flow through `AppRouter`.

- [ ] **Step 3: Lint/format**

Run: `pnpm dlx ultracite fix apps/web/src/routes/_protected/billing.tsx`
Expected: no remaining errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_protected/billing.tsx
git commit -m "feat(billing): live billing page (usage, checkout, portal)"
```

---

## Task 19: End-to-end verification (manual, Stripe test mode)

**Files:** none (verification only)

- [ ] **Step 1: Full self-serve flow**

1. Start web + server locally; `stripe listen --forward-to localhost:3003/api/stripe/webhook`.
2. Log in, open `/billing` → shows Free, 0 used.
3. Click **Add payment method** → complete Stripe Checkout with test card `4242 4242 4242 4242`.
4. Confirm the webhook fires; reload `/billing` → status `active`, "Card on file".
5. In `db:studio`, confirm the billing account has `stripe_customer_id`,
   `stripe_subscription_id`, `has_payment_method = true`, `blocked = false`.

- [ ] **Step 2: Free-tier gate**

1. Create a billing account without a card; set `current_period_requests` ≥ `free_allotment`
   and `blocked = true`.
2. Call a public `/api/v1/*` endpoint with that account's key → expect HTTP **402**.
3. Add a card (repeat Step 1) → the same call now succeeds.

- [ ] **Step 3: Metering**

1. Make several production API calls under a carded account.
2. Trigger the cron: `curl "http://localhost:3003/__scheduled?cron=0+*+*+*+*"`.
3. In the Stripe dashboard (Billing → Meters) confirm the usage event count matches; run the
   cron again and confirm **no double counting** (ledger idempotency).

- [ ] **Step 4: Record results** — note pass/fail for each step in the PR description.

---

## Self-review (completed during planning)

- **Spec coverage:** billing_accounts + meter ledger + `billing_account_id` (Tasks 1–2);
  resolution/gate helpers (Task 3); team-id propagation + attribution (Tasks 4–5); Stripe
  env/client/webhook/checkout/portal/bootstrap (Tasks 6–10); free-tier enforcement +402
  (Tasks 11–13); cron meter reporting + ledger (Tasks 14–16); billing router + UI + usage
  summary (Tasks 17–18); E2E verification incl. explorer/test-free behaviour (Task 19).
  All design sections map to tasks.
- **Type consistency:** `BillingOwner`, `getOrCreateBillingAccount`, `billingOwnerFromKey`,
  `incrementBillingUsage`, `nextCounterState`, `computeBlocked`, `reportUsageToStripe`,
  `applyStripeEvent`, `getStripeClient`, `ensureStripeCustomer` are defined once and reused
  with matching signatures across tasks. `ValidatedApiKey.teamId` added in Task 4 is consumed
  in Tasks 5, 13.
- **No placeholders:** every code step contains complete code; commands include expected
  output.
- **Notable refinement vs spec:** monthly counter reset is **lazy** (computed in
  `nextCounterState` on each increment) rather than a separate daily cron — same behaviour,
  fewer moving parts. The hourly cron is reporting-only.
```