import type { BillingAccount, Database } from "@locnative/database";
import { billingAccounts } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { eq } from "drizzle-orm";
import { getStripeClient } from "./stripe.ts";

/** Ensure the billing account has a Stripe customer; create + persist if missing. */
export async function ensureStripeCustomer(
	db: Database,
	account: BillingAccount,
	opts: { email?: string; label: string }
): Promise<string> {
	if (account.stripeCustomerId) {
		return account.stripeCustomerId;
	}
	const stripe = getStripeClient();
	const customer = await stripe.customers.create({
		email: opts.email,
		name: opts.label,
		metadata: {
			billing_account_id: account.id,
			owner_type: account.ownerType,
			team_id: account.teamId ?? "",
			user_id: account.userId ?? "",
		},
	});
	await db
		.update(billingAccounts)
		.set({ stripeCustomerId: customer.id, updatedAt: new Date() })
		.where(eq(billingAccounts.id, account.id));
	return customer.id;
}

/** Create a Checkout Session to subscribe the customer to the metered price. */
export async function createCheckoutUrl(
	customerId: string,
	returnBaseUrl: string
): Promise<string> {
	const stripe = getStripeClient();
	const session = await stripe.checkout.sessions.create({
		mode: "subscription",
		customer: customerId,
		line_items: [{ price: serverEnv.STRIPE_PRICE_ID }],
		success_url: `${returnBaseUrl}/billing?checkout=success`,
		cancel_url: `${returnBaseUrl}/billing?checkout=cancel`,
	});
	if (!session.url) {
		throw new Error("Stripe did not return a checkout URL");
	}
	return session.url;
}

/** Create a Billing Portal session for managing card + invoices. */
export async function createPortalUrl(
	customerId: string,
	returnBaseUrl: string
): Promise<string> {
	const stripe = getStripeClient();
	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: `${returnBaseUrl}/billing`,
	});
	return session.url;
}
