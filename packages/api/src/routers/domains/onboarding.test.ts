import { describe, expect, it } from "vitest";
import {
	type ConsentEvent,
	completeOnboardingForUser,
	updatePreferencesForUser,
} from "./onboarding.ts";

type Db = Parameters<typeof completeOnboardingForUser>[0];

const user = { email: "dev@example.com", id: "user-1" };
const now = new Date("2026-11-12T00:00:00.000Z");

/** Fake db that returns `currentConsent` from lookups and records updates. */
function createMockDb(currentConsent = false) {
	const updates: Record<string, unknown>[] = [];
	const db = {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve([{ marketingConsent: currentConsent }]),
				}),
			}),
		}),
		update: () => ({
			set: (set: Record<string, unknown>) => {
				updates.push(set);
				return { where: () => Promise.resolve() };
			},
		}),
	} as unknown as Db;
	return { db, updates };
}

function createReporter() {
	const events: ConsentEvent[] = [];
	return { events, reportConsent: (event: ConsentEvent) => events.push(event) };
}

describe("completeOnboardingForUser", () => {
	it("stores choices and reports a ticked box to Clivly as an opt-in", async () => {
		const { db, updates } = createMockDb();
		const { events, reportConsent } = createReporter();

		await completeOnboardingForUser(db, {
			input: {
				marketingConsent: true,
				serviceInterests: ["geocoding", "routing"],
				skipped: false,
			},
			now,
			reportConsent,
			user,
		});

		expect(updates).toEqual([
			{
				marketingConsent: true,
				marketingConsentUpdatedAt: now,
				onboardingCompletedAt: now,
				serviceInterests: ["geocoding", "routing"],
				updatedAt: now,
			},
		]);
		expect(events).toEqual([
			{
				email: user.email,
				granted: true,
				occurredAt: now,
				source: "onboarding",
				userId: user.id,
			},
		]);
	});

	it("does not report an unticked box as an opt-out", async () => {
		const { db } = createMockDb();
		const { events, reportConsent } = createReporter();

		await completeOnboardingForUser(db, {
			input: { marketingConsent: false, serviceInterests: [], skipped: false },
			now,
			reportConsent,
			user,
		});

		expect(events).toEqual([]);
	});

	it("ignores choices when skipped but still marks onboarding complete", async () => {
		const { db, updates } = createMockDb();
		const { events, reportConsent } = createReporter();

		await completeOnboardingForUser(db, {
			input: {
				marketingConsent: true,
				serviceInterests: ["zones"],
				skipped: true,
			},
			now,
			reportConsent,
			user,
		});

		expect(updates[0]).toMatchObject({
			marketingConsent: false,
			onboardingCompletedAt: now,
			serviceInterests: [],
		});
		expect(events).toEqual([]);
	});
});

describe("updatePreferencesForUser", () => {
	it("reports an untick in Settings as an opt-out", async () => {
		const { db, updates } = createMockDb(true);
		const { events, reportConsent } = createReporter();

		await updatePreferencesForUser(db, {
			input: { marketingConsent: false },
			now,
			reportConsent,
			user,
		});

		expect(updates[0]).toMatchObject({
			marketingConsent: false,
			marketingConsentUpdatedAt: now,
		});
		expect(events).toEqual([
			expect.objectContaining({ granted: false, source: "settings" }),
		]);
	});

	it("does not re-report consent that has not changed", async () => {
		const { db, updates } = createMockDb(true);
		const { events, reportConsent } = createReporter();

		await updatePreferencesForUser(db, {
			input: { marketingConsent: true, serviceInterests: ["map_tiles"] },
			now,
			reportConsent,
			user,
		});

		expect(updates[0]).toEqual({
			serviceInterests: ["map_tiles"],
			updatedAt: now,
		});
		expect(events).toEqual([]);
	});
});
