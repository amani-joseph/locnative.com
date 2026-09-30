import { describe, expect, it } from "vitest";
import {
	applyRollover,
	flushNeeded,
	flushSnapshot,
	increment,
	type MeterState,
	peek,
} from "./meter-core.ts";

const base: MeterState = {
	currentPeriodStart: "2026-06-01",
	currentPeriodRequests: 0,
	freeAllotment: 10_000,
	hasPaymentMethod: false,
};
const now = new Date("2026-06-15T00:00:00Z");

describe("applyRollover", () => {
	it("resets the counter when entering a new month", () => {
		expect(
			applyRollover(
				{
					...base,
					currentPeriodStart: "2026-05-01",
					currentPeriodRequests: 9000,
				},
				now
			)
		).toEqual({
			...base,
			currentPeriodStart: "2026-06-01",
			currentPeriodRequests: 0,
		});
	});

	it("leaves state untouched within the same month", () => {
		const s = { ...base, currentPeriodRequests: 42 };
		expect(applyRollover(s, now)).toEqual(s);
	});
});

describe("peek", () => {
	it("does not count and reports not-blocked under the limit", () => {
		const d = peek({ ...base, currentPeriodRequests: 5000 }, now);
		expect(d.state.currentPeriodRequests).toBe(5000);
		expect(d.blocked).toBe(false);
	});

	it("reports blocked at the limit with no card", () => {
		expect(peek({ ...base, currentPeriodRequests: 10_000 }, now).blocked).toBe(
			true
		);
	});

	it("never blocks when a card is on file", () => {
		expect(
			peek(
				{ ...base, currentPeriodRequests: 999_999, hasPaymentMethod: true },
				now
			).blocked
		).toBe(false);
	});
});

describe("increment", () => {
	it("counts one request within the month", () => {
		const d = increment({ ...base, currentPeriodRequests: 41 }, now);
		expect(d.state.currentPeriodRequests).toBe(42);
		expect(d.blocked).toBe(false);
	});

	it("resets to 1 on month rollover", () => {
		const d = increment(
			{
				...base,
				currentPeriodStart: "2026-05-01",
				currentPeriodRequests: 9999,
			},
			now
		);
		expect(d.state.currentPeriodStart).toBe("2026-06-01");
		expect(d.state.currentPeriodRequests).toBe(1);
		expect(d.blocked).toBe(false);
	});

	it("blocks once the increment reaches the free allotment", () => {
		const d = increment({ ...base, currentPeriodRequests: 9999 }, now);
		expect(d.state.currentPeriodRequests).toBe(10_000);
		expect(d.blocked).toBe(true);
	});

	it("is exact across N sequential increments (no lost updates)", () => {
		let state = base;
		for (let i = 0; i < 11_000; i++) {
			state = increment(state, now).state;
		}
		expect(state.currentPeriodRequests).toBe(11_000);
	});
});

describe("flushNeeded", () => {
	const snapshot = flushSnapshot(base);

	it("flushes when nothing has been flushed yet", () => {
		expect(flushNeeded(snapshot, undefined)).toBe(true);
	});

	it("skips when the mirrored columns are unchanged", () => {
		expect(flushNeeded(flushSnapshot({ ...base }), snapshot)).toBe(false);
	});

	it("flushes when the counter, period or gate changes", () => {
		expect(
			flushNeeded(
				flushSnapshot({ ...base, currentPeriodRequests: 1 }),
				snapshot
			)
		).toBe(true);
		expect(
			flushNeeded(
				flushSnapshot({ ...base, currentPeriodStart: "2026-07-01" }),
				snapshot
			)
		).toBe(true);
		expect(
			flushNeeded(
				flushSnapshot({ ...base, currentPeriodRequests: 10_000 }),
				flushSnapshot({
					...base,
					currentPeriodRequests: 10_000,
					hasPaymentMethod: true,
				})
			)
		).toBe(true);
	});
});
