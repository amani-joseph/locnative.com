import type { Database } from "@locnative/database";
import {
	apiUsageDaily,
	billingAccounts,
	billingMeterReports,
} from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getStripeClient } from "./stripe.ts";

export interface LiveUsage {
	liveCount: number;
	usageDate: string;
}
export interface MeterDelta {
	delta: number;
	liveCount: number;
	usageDate: string;
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

const PRODUCTION = "production";

/** Report each account's recent usage deltas to Stripe meter events. */
export async function reportUsageToStripe(
	db: Database,
	now = new Date()
): Promise<void> {
	const dates = recentUsageDates(now);
	const stripe = getStripeClient();
	const eventName = serverEnv.STRIPE_METER_EVENT_NAME;

	const accounts = await db
		.select({
			id: billingAccounts.id,
			stripeCustomerId: billingAccounts.stripeCustomerId,
		})
		.from(billingAccounts);

	for (const account of accounts) {
		const customerId = account.stripeCustomerId;
		if (!customerId) {
			continue;
		}

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

		const reported = new Map(
			reportedRows.map((r) => [r.usageDate, r.reportedCount])
		);
		const deltas = computeMeterDeltas(live, reported);

		for (const d of deltas) {
			await stripe.billing.meterEvents.create(
				{
					event_name: eventName,
					payload: {
						value: String(d.delta),
						stripe_customer_id: customerId,
					},
					identifier: `${account.id}:${d.usageDate}:${d.liveCount}`,
				},
				{ idempotencyKey: `${account.id}:${d.usageDate}:${d.liveCount}` }
			);

			await db
				.insert(billingMeterReports)
				.values({
					billingAccountId: account.id,
					usageDate: d.usageDate,
					reportedCount: d.liveCount,
				})
				.onConflictDoUpdate({
					target: [
						billingMeterReports.billingAccountId,
						billingMeterReports.usageDate,
					],
					set: { reportedCount: d.liveCount, updatedAt: new Date() },
				});
		}
	}
}
