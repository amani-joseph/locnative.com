import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

function buildServerEnv() {
	return createEnv({
		server: {
			DATABASE_URL: z.string().url(),
			BETTER_AUTH_SECRET: z.string().min(32),
			BETTER_AUTH_URL: z.string().url(),
			GITHUB_CLIENT_ID: z.string().min(1),
			GITHUB_CLIENT_SECRET: z.string().min(1),
			WEB_BASE_URL: z.string().url(),
			AUTH_COOKIE_DOMAIN: z.string().optional(),
			PORT: z.coerce.number().int().positive().default(3002),
			NODE_ENV: z
				.enum(["development", "production", "test"])
				.default("development"),
			RESEND_API_KEY: z.string().min(1),
			EMAIL_FROM: z.string().email(),
			KEY_ENC_KEY: z
				.string()
				.regex(
					/^[0-9a-fA-F]{64}$/,
					"KEY_ENC_KEY must be 64 hex chars (32 bytes)"
				),
			OSRM_BASE_URL: z.string().url(),
			OSRM_AUTH_TOKEN: z.string().min(1),
			STRIPE_SECRET_KEY: z.string().min(1).optional(),
			STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
			STRIPE_PRICE_ID: z.string().min(1).optional(),
			STRIPE_METER_EVENT_NAME: z.string().min(1).default("api_request"),
			BILLING_FREE_ALLOTMENT: z.coerce
				.number()
				.int()
				.positive()
				.default(15_000),
		},
		runtimeEnv: {
			...process.env,
			WEB_BASE_URL: process.env.WEB_BASE_URL ?? "http://localhost:3001",
			RESEND_API_KEY: process.env.RESEND_API_KEY,
			EMAIL_FROM: process.env.EMAIL_FROM,
			KEY_ENC_KEY: process.env.KEY_ENC_KEY,
			OSRM_BASE_URL: process.env.OSRM_BASE_URL,
			OSRM_AUTH_TOKEN: process.env.OSRM_AUTH_TOKEN,
			STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
			STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
			STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
			STRIPE_METER_EVENT_NAME: process.env.STRIPE_METER_EVENT_NAME,
			BILLING_FREE_ALLOTMENT: process.env.BILLING_FREE_ALLOTMENT,
		},
		emptyStringAsUndefined: true,
	});
}

type ServerEnv = ReturnType<typeof buildServerEnv>;

let cachedServerEnv: ServerEnv | undefined;

/**
 * Lazily validate + expose server env vars.
 *
 * `createEnv` validates every field eagerly. If it ran at module load, the
 * Cloudflare deploy-time startup validation (which executes the Worker global
 * scope WITHOUT secrets injected — only `wrangler.jsonc` `vars` are present)
 * would throw `Invalid environment variables` (CF error 10021) and reject the
 * deploy. Deferring validation to first property access means it only runs at
 * request time, when secrets ARE injected. The Proxy preserves the existing
 * `serverEnv.X` consumer API so no call sites change.
 *
 * IMPORTANT: consumers must not read `serverEnv.*` at module/global scope, or
 * they reintroduce the eager-validation-at-startup failure.
 */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
	get(_target, prop) {
		cachedServerEnv ??= buildServerEnv();
		return Reflect.get(cachedServerEnv as object, prop);
	},
	has(_target, prop) {
		cachedServerEnv ??= buildServerEnv();
		return prop in (cachedServerEnv as object);
	},
});
