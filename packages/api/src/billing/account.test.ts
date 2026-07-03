import { describe, expect, it } from "vitest";
import {
	billingOwnerFromKey,
	isInNewUtcMonth,
	nextCounterState,
	periodResetPatch,
} from "./account.ts";

describe("billingOwnerFromKey", () => {
	it("uses team when the key has a teamId", () => {
		expect(billingOwnerFromKey({ teamId: "team-1", userId: "user-1" })).toEqual(
			{ ownerType: "team", teamId: "team-1", userId: null }
		);
	});

	it("falls back to user when no teamId", () => {
		expect(billingOwnerFromKey({ teamId: null, userId: "user-1" })).toEqual({
			ownerType: "user",
			teamId: null,
			userId: "user-1",
		});
	});
});

describe("isInNewUtcMonth", () => {
	it("returns true when periodStart is null", () => {
		expect(isInNewUtcMonth(null, new Date("2026-06-11T00:00:00Z"))).toBe(true);
	});

	it("returns true when the month changed", () => {
		expect(
			isInNewUtcMonth("2026-05-31", new Date("2026-06-01T00:00:00Z"))
		).toBe(true);
	});

	it("returns false within the same month", () => {
		expect(
			isInNewUtcMonth("2026-06-01", new Date("2026-06-30T23:59:59Z"))
		).toBe(false);
	});
});

describe("nextCounterState", () => {
	const now = new Date("2026-06-15T00:00:00Z");

	it("resets the counter when entering a new month", () => {
		expect(
			nextCounterState(
				{
					currentPeriodStart: "2026-05-01",
					currentPeriodRequests: 9000,
					freeAllotment: 10_000,
					hasPaymentMethod: false,
				},
				now
			)
		).toEqual({
			currentPeriodStart: "2026-06-01",
			currentPeriodRequests: 1,
			blocked: false,
		});
	});

	it("increments within the month and blocks at the free limit", () => {
		expect(
			nextCounterState(
				{
					currentPeriodStart: "2026-06-01",
					currentPeriodRequests: 9999,
					freeAllotment: 10_000,
					hasPaymentMethod: false,
				},
				now
			)
		).toEqual({
			currentPeriodStart: "2026-06-01",
			currentPeriodRequests: 10_000,
			blocked: true,
		});
	});

	it("never blocks when a card is on file", () => {
		expect(
			nextCounterState(
				{
					currentPeriodStart: "2026-06-01",
					currentPeriodRequests: 999_999,
					freeAllotment: 10_000,
					hasPaymentMethod: true,
				},
				now
			).blocked
		).toBe(false);
	});
});

describe("periodResetPatch", () => {
	const now = new Date("2026-06-02T00:00:00Z");

	it("returns a reset patch when the stored period is a prior month", () => {
		expect(periodResetPatch({ currentPeriodStart: "2026-05-01" }, now)).toEqual(
			{
				currentPeriodStart: "2026-06-01",
				currentPeriodRequests: 0,
				blocked: false,
			}
		);
	});

	it("returns null within the same month", () => {
		expect(
			periodResetPatch({ currentPeriodStart: "2026-06-01" }, now)
		).toBeNull();
	});
});
