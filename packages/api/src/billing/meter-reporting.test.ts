import { describe, expect, it } from "vitest";
import {
	computeMeterDeltas,
	meterEventTimestamp,
	recentUsageDates,
} from "./meter-reporting.ts";

describe("computeMeterDeltas", () => {
	it("emits positive deltas vs the reported ledger", () => {
		const deltas = computeMeterDeltas(
			[
				{ usageDate: "2026-06-10", liveCount: 500 },
				{ usageDate: "2026-06-11", liveCount: 1200 },
			],
			new Map([["2026-06-10", 500]])
		);
		expect(deltas).toEqual([
			{ usageDate: "2026-06-11", delta: 1200, liveCount: 1200 },
		]);
	});

	it("skips dates where live <= reported", () => {
		expect(
			computeMeterDeltas(
				[{ usageDate: "2026-06-11", liveCount: 100 }],
				new Map([["2026-06-11", 100]])
			)
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

describe("meterEventTimestamp", () => {
	it("attributes a past date to its last second (UTC)", () => {
		const now = new Date("2026-06-11T00:10:00Z");
		expect(meterEventTimestamp("2026-06-10", now)).toBe(
			Date.parse("2026-06-10T23:59:59Z") / 1000
		);
	});

	it("caps today's timestamp at now", () => {
		const now = new Date("2026-06-11T00:10:00Z");
		expect(meterEventTimestamp("2026-06-11", now)).toBe(now.getTime() / 1000);
	});
});
