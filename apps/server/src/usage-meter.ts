/// <reference types="@cloudflare/workers-types" />

import {
	type BillingOwner,
	computeBlocked,
	getOrCreateBillingAccount,
	utcMonthStart,
} from "@locnative/api/billing/account";
import {
	increment as incrementMeter,
	type MeterState,
	peek as peekMeter,
} from "@locnative/api/billing/meter-core";
import { db } from "@locnative/api/db";
import { billingAccounts } from "@locnative/database";
import { eq } from "drizzle-orm";

const STORAGE_KEY = "meter";
const FLUSH_INTERVAL_MS = 10_000;

interface StoredMeter extends MeterState {
	billingAccountId: string;
	owner: BillingOwner;
	seeded: true;
}

interface MeterResponse {
	billingAccountId: string;
	blocked: boolean;
	currentPeriodRequests: number;
}

/**
 * Per-billing-account real-time usage meter. One Durable Object instance per
 * owner (see usageMeterName) gives a single-threaded serialization point, so
 * the request counter is exact under any concurrency without DB transactions.
 *
 * The DO is the source of truth for the live counter; a periodic alarm mirrors
 * it back to `billing_accounts` so the dashboard and the Stripe meter-reporting
 * cron (which read Postgres) stay current. Card status / allotment remain owned
 * by Postgres (updated via Stripe webhooks) and are refreshed into the DO on
 * flush and on the blocked path.
 */
export class UsageMeter implements DurableObject {
	private readonly storage: DurableObjectStorage;

	constructor(state: DurableObjectState) {
		this.storage = state.storage;
	}

	private async seedFromDb(owner: BillingOwner): Promise<StoredMeter> {
		const account = await getOrCreateBillingAccount(db, owner);
		const stored: StoredMeter = {
			billingAccountId: account.id,
			owner,
			currentPeriodStart:
				account.currentPeriodStart ?? utcMonthStart(new Date()),
			currentPeriodRequests: account.currentPeriodRequests,
			freeAllotment: account.freeAllotment,
			hasPaymentMethod: account.hasPaymentMethod,
			seeded: true,
		};
		await this.storage.put(STORAGE_KEY, stored);
		return stored;
	}

	private async load(owner: BillingOwner): Promise<StoredMeter> {
		const stored = await this.storage.get<StoredMeter>(STORAGE_KEY);
		return stored?.seeded ? stored : this.seedFromDb(owner);
	}

	/**
	 * Pull the authoritative card status + allotment from Postgres (updated by
	 * Stripe webhooks). Used on the cold blocked path so a freshly added payment
	 * method unblocks near-instantly, and on each flush. Does not touch the
	 * counter — the DO owns that.
	 */
	private async refreshLimits(stored: StoredMeter): Promise<StoredMeter> {
		const [row] = await db
			.select({
				hasPaymentMethod: billingAccounts.hasPaymentMethod,
				freeAllotment: billingAccounts.freeAllotment,
			})
			.from(billingAccounts)
			.where(eq(billingAccounts.id, stored.billingAccountId))
			.limit(1);
		if (!row) {
			return stored;
		}
		const next: StoredMeter = {
			...stored,
			hasPaymentMethod: row.hasPaymentMethod,
			freeAllotment: row.freeAllotment,
		};
		await this.storage.put(STORAGE_KEY, next);
		return next;
	}

	async fetch(request: Request): Promise<Response> {
		const action = new URL(request.url).pathname.split("/").pop();
		const owner = (await request.json()) as BillingOwner;
		const now = new Date();
		let stored = await this.load(owner);
		// Keep a flush armed so Postgres + limits stay fresh even for idle or
		// blocked accounts (which never reach the increment path).
		await this.armFlush();

		if (action === "peek") {
			let decision = peekMeter(stored, now);
			if (decision.blocked) {
				// Cold path: re-check authoritative card status before rejecting.
				stored = await this.refreshLimits({ ...stored, ...decision.state });
				decision = peekMeter(stored, now);
			} else if (
				decision.state.currentPeriodStart !== stored.currentPeriodStart
			) {
				stored = { ...stored, ...decision.state };
				await this.storage.put(STORAGE_KEY, stored);
			}
			return Response.json(this.respond(stored, decision.blocked));
		}

		if (action === "increment") {
			const decision = incrementMeter(stored, now);
			stored = { ...stored, ...decision.state };
			await this.storage.put(STORAGE_KEY, stored);
			return Response.json(this.respond(stored, decision.blocked));
		}

		return new Response("unknown action", { status: 400 });
	}

	private respond(stored: StoredMeter, blocked: boolean): MeterResponse {
		return {
			blocked,
			billingAccountId: stored.billingAccountId,
			currentPeriodRequests: stored.currentPeriodRequests,
		};
	}

	private async armFlush(): Promise<void> {
		if ((await this.storage.getAlarm()) === null) {
			await this.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS);
		}
	}

	async alarm(): Promise<void> {
		const stored = await this.storage.get<StoredMeter>(STORAGE_KEY);
		if (!stored?.seeded) {
			return;
		}
		// Mirror the live counter to Postgres and refresh card status/allotment in
		// one round trip. blocked is recomputed from the freshest values we hold.
		const blocked = computeBlocked(stored);
		const refreshed = await db
			.update(billingAccounts)
			.set({
				currentPeriodRequests: stored.currentPeriodRequests,
				currentPeriodStart: stored.currentPeriodStart,
				blocked,
				updatedAt: new Date(),
			})
			.where(eq(billingAccounts.id, stored.billingAccountId))
			.returning({
				hasPaymentMethod: billingAccounts.hasPaymentMethod,
				freeAllotment: billingAccounts.freeAllotment,
			});
		const row = refreshed[0];
		if (row) {
			await this.storage.put(STORAGE_KEY, {
				...stored,
				hasPaymentMethod: row.hasPaymentMethod,
				freeAllotment: row.freeAllotment,
			});
		}
	}
}
