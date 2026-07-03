import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		/** Base URL of the tile Worker, e.g. https://api.locnative.com . Tiles live under /tiles/v1. */
		VITE_TILES_BASE_URL: z.url().optional(),
		/** Demo API key for component library showcase (publishable key) */
		VITE_DEMO_API_KEY: z.string().optional(),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
