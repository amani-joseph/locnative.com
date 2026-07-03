import { serverEnv } from "@locnative/env/server";
import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Stripe client configured for the Cloudflare Workers runtime: the fetch HTTP
 * client (workerd has no Node http) and no implicit Node crypto. Reused across
 * invocations within an isolate.
 */
export function getStripeClient(): Stripe {
	if (cached) {
		return cached;
	}
	if (!serverEnv.STRIPE_SECRET_KEY) {
		throw new Error(
			"Billing is not configured: STRIPE_SECRET_KEY is missing on the server."
		);
	}
	cached = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
		httpClient: Stripe.createFetchHttpClient(),
	});
	return cached;
}

/** Shared SubtleCrypto provider for async webhook signature verification. */
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();
