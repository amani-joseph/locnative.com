import type { Database } from "@locnative/database";
import { billingAccounts } from "@locnative/database";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export interface AccountUpdate {
	blocked?: boolean;
	hasPaymentMethod?: boolean;
	status?: "free" | "active" | "past_due" | "canceled";
	stripeSubscriptionId?: string | null;
}

/** Map a Stripe event type to the billing-account fields it should change. */
export function accountUpdateForEvent(
	type: string,
	data: { subscription?: string | null }
): AccountUpdate | null {
	switch (type) {
		case "checkout.session.completed":
		case "customer.subscription.created":
		case "customer.subscription.updated":
			return {
				status: "active",
				hasPaymentMethod: true,
				blocked: false,
				stripeSubscriptionId: data.subscription ?? undefined,
			};
		case "payment_method.attached":
			return { hasPaymentMethod: true, blocked: false };
		case "invoice.paid":
			return { status: "active" };
		case "invoice.payment_failed":
			return { status: "past_due" };
		case "customer.subscription.deleted":
			return {
				status: "canceled",
				hasPaymentMethod: false,
				stripeSubscriptionId: null,
			};
		default:
			return null;
	}
}

/** Pull the Stripe customer id off any supported event object. */
export function customerIdFromEvent(event: Stripe.Event): string | null {
	const obj = event.data.object as { customer?: string | null };
	return typeof obj.customer === "string" ? obj.customer : null;
}

/** Pull a subscription id off the event object when present. */
export function subscriptionIdFromEvent(event: Stripe.Event): string | null {
	const obj = event.data.object as {
		subscription?: string | null;
		id?: string;
		object?: string;
	};
	if (typeof obj.subscription === "string") {
		return obj.subscription;
	}
	if (obj.object === "subscription" && typeof obj.id === "string") {
		return obj.id;
	}
	return null;
}

/** Apply a verified Stripe event to the matching billing account. */
export async function applyStripeEvent(
	db: Database,
	event: Stripe.Event
): Promise<void> {
	const update = accountUpdateForEvent(event.type, {
		subscription: subscriptionIdFromEvent(event),
	});
	if (!update) {
		return;
	}
	const customerId = customerIdFromEvent(event);
	if (!customerId) {
		return;
	}
	await db
		.update(billingAccounts)
		.set({ ...update, updatedAt: new Date() })
		.where(eq(billingAccounts.stripeCustomerId, customerId));
}
