import { computeBlocked, isInNewUtcMonth, utcMonthStart } from "./account.ts";

/**
 * In-memory metering state held by the UsageMeter Durable Object. Mirrors the
 * billing-relevant columns of `billing_accounts`. Pure helpers below are the
 * single source of truth for rollover / gate / increment semantics so they can
 * be unit-tested without the Workers runtime; the DO is a thin durable wrapper.
 */
export interface MeterState {
	currentPeriodRequests: number;
	/** First-of-UTC-month string, e.g. "2026-06-01". */
	currentPeriodStart: string;
	freeAllotment: number;
	hasPaymentMethod: boolean;
}

export interface MeterDecision {
	blocked: boolean;
	state: MeterState;
}

/** Reset the counter when `now` is in a later UTC month than the stored period. */
export function applyRollover(state: MeterState, now: Date): MeterState {
	if (isInNewUtcMonth(state.currentPeriodStart, now)) {
		return {
			...state,
			currentPeriodStart: utcMonthStart(now),
			currentPeriodRequests: 0,
		};
	}
	return state;
}

/** Read the free-tier gate without counting a request (rollover applied). */
export function peek(state: MeterState, now: Date): MeterDecision {
	const rolled = applyRollover(state, now);
	return { state: rolled, blocked: computeBlocked(rolled) };
}

/**
 * Count one successful request (rollover applied) and recompute the gate.
 * Single-threaded execution inside the DO makes this atomic — no lost updates.
 */
export function increment(state: MeterState, now: Date): MeterDecision {
	const rolled = applyRollover(state, now);
	const next: MeterState = {
		...rolled,
		currentPeriodRequests: rolled.currentPeriodRequests + 1,
	};
	return { state: next, blocked: computeBlocked(next) };
}

/** The `billing_accounts` columns the DO mirrors on flush. */
export interface FlushSnapshot {
	blocked: boolean;
	currentPeriodRequests: number;
	currentPeriodStart: string;
}

export function flushSnapshot(state: MeterState): FlushSnapshot {
	return {
		blocked: computeBlocked(state),
		currentPeriodRequests: state.currentPeriodRequests,
		currentPeriodStart: state.currentPeriodStart,
	};
}

/**
 * Whether a flush would change Postgres. Skipping unchanged flushes keeps
 * peek-only traffic (e.g. blocked accounts) from waking the database.
 */
export function flushNeeded(
	next: FlushSnapshot,
	lastFlushed: FlushSnapshot | undefined
): boolean {
	return (
		lastFlushed === undefined ||
		next.blocked !== lastFlushed.blocked ||
		next.currentPeriodRequests !== lastFlushed.currentPeriodRequests ||
		next.currentPeriodStart !== lastFlushed.currentPeriodStart
	);
}
