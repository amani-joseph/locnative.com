import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Standalone vitest config — deliberately does NOT extend the main
 * `vite.config.ts` because it pulls in the Cloudflare vite plugin which
 * is incompatible with vitest's node runner.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "src"),
			"@locnative/ui": resolve(import.meta.dirname, "../../packages/ui/src"),
		},
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		// serverEnv (t3-env) validates all server vars eagerly on import; some
		// lib tests import it transitively. Provide the OSRM vars the routing
		// feature added, plus the billing/key-encryption vars, so validation
		// passes in the test runner. KEY_ENC_KEY must be 64 hex chars and is a
		// test-only dummy used by api-key-crypto tests.
		env: {
			OSRM_BASE_URL: "http://localhost:5000",
			OSRM_AUTH_TOKEN: "test-token",
			KEY_ENC_KEY:
				"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
			STRIPE_SECRET_KEY: "sk_test_dummy",
			STRIPE_WEBHOOK_SECRET: "whsec_test_dummy",
			STRIPE_PRICE_ID: "price_test_dummy",
		},
	},
});
