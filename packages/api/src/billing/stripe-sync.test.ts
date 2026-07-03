import { describe, expect, it } from "vitest";
import { accountUpdateForEvent } from "./stripe-sync.ts";

describe("accountUpdateForEvent", () => {
	it("activates on checkout.session.completed", () => {
		expect(
			accountUpdateForEvent("checkout.session.completed", {
				subscription: "sub_1",
			})
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
