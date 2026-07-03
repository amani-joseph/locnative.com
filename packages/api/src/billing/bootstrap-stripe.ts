// Run once per Stripe environment: `pnpm --filter @locnative/api billing:bootstrap`
// Prints the meter id, price id, and event name to put in env.
import { serverEnv } from "@locnative/env/server";
import { getStripeClient } from "./stripe.ts";

async function main(): Promise<void> {
	const stripe = getStripeClient();
	const eventName = serverEnv.STRIPE_METER_EVENT_NAME;

	const meter = await stripe.billing.meters.create({
		display_name: "API requests",
		event_name: eventName,
		default_aggregation: { formula: "sum" },
	});

	const price = await stripe.prices.create({
		currency: "usd",
		// $0.70 per 1,000 requests = 0.07 cents per request.
		unit_amount_decimal: stripe.Decimal.from("0.07"),
		recurring: { interval: "month", usage_type: "metered", meter: meter.id },
		product_data: { name: "Locnative API usage" },
	});

	process.stdout.write(
		`STRIPE_METER_EVENT_NAME=${eventName}\nSTRIPE_PRICE_ID=${price.id}\nMETER_ID=${meter.id}\n`
	);
}

main().catch((err) => {
	process.stderr.write(`bootstrap failed: ${String(err)}\n`);
	process.exit(1);
});
