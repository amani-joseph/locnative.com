import { describe, expect, it } from "vitest";
import { computeMeterDeltas, recentUsageDates } from "./meter-reporting.ts";

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
