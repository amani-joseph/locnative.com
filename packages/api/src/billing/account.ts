import type { BillingAccount, Database } from "@locnative/database";
import { billingAccounts } from "@locnative/database";
import { eq, sql } from "drizzle-orm";

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
export function isInNewUtcMonth(
	periodStart: string | null,
	now: Date
): boolean {
	if (!periodStart) {
		return true;
	}
	return utcMonthStart(now) > `${periodStart.slice(0, 7)}-01`;
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
	const reset = periodResetPatch(row, new Date());
	if (reset) {
		await db
			.update(billingAccounts)
			.set({ ...reset, updatedAt: new Date() })
			.where(eq(billingAccounts.id, row.id));
		return { ...row, ...reset };
	}
	return row;
}

/**
 * If the account's stored period is an earlier UTC month than `now`, returns the
 * patch that resets the monthly counter (and clears the free-tier block); else null.
 */
export function periodResetPatch(
	account: { currentPeriodStart: string | null },
	now: Date
): {
	currentPeriodStart: string;
	currentPeriodRequests: number;
	blocked: boolean;
} | null {
	if (!isInNewUtcMonth(account.currentPeriodStart, now)) {
		return null;
	}
	return {
		currentPeriodStart: utcMonthStart(now),
		currentPeriodRequests: 0,
		blocked: false,
	};
}

export interface CounterState {
	blocked: boolean;
	currentPeriodRequests: number;
	currentPeriodStart: string;
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
	const start = newMonth
		? utcMonthStart(now)
		: (account.currentPeriodStart as string);
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

/**
 * Atomically increment a billing account's monthly counter, resetting on month
 * rollover and recomputing the free-tier `blocked` gate — all in a single SQL
 * UPDATE.
 *
 * This replaces a read-modify-write (read counter in JS, write value+1) that
 * lost updates under concurrency: N simultaneous requests all read the same
 * value V and each wrote V+1, so the counter advanced by 1 instead of N and the
 * 10k free cap was never reliably enforced. neon-http has no transactions, but a
 * single UPDATE evaluates against the row's own up-to-date columns and is atomic
 * on its own, so the count is correct no matter how many requests race.
 *
 * `nextCounterState` retains the equivalent pure logic for unit testing.
 */
export async function incrementBillingUsage(
	db: Database,
	accountId: string,
	now = new Date()
): Promise<void> {
	const monthStart = utcMonthStart(now);
	// CASE references to current_period_start read the OLD (pre-update) value, so
	// the rollover check and the increment stay consistent within the statement.
	const nextRequests = sql`CASE
		WHEN current_period_start IS NULL OR current_period_start < ${monthStart}
		THEN 1
		ELSE current_period_requests + 1
	END`;
	await db.execute(sql`
		UPDATE billing_accounts
		SET
			current_period_requests = ${nextRequests},
			current_period_start = ${monthStart},
			blocked = (NOT has_payment_method) AND (${nextRequests}) >= free_allotment,
			updated_at = now()
		WHERE id = ${accountId}
	`);
}
