import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "@locnative/database";
import { createDb } from "@locnative/database";
import { defineClivlyConfig } from "clivly/core";
import { discoverFromDrizzle } from "clivly/core/drizzle";
import { drizzleIntrospector, fromDrizzle } from "clivly/drizzle";
import { createClivlySDK } from "clivly/sdk";
import { config as loadEnv } from "dotenv";

// The `.env` files only exist in the Node/CLI context, where the `clivly` CLI
// loads this config. On Cloudflare Workers (the deployed web app) there is no
// filesystem and `import.meta.url` is `undefined`, so calling `fileURLToPath`
// on it throws and crashes the Worker on every request. Env there comes from
// Workers bindings (already on `process.env`), so skip filesystem loading.
if (import.meta.url) {
	const configDir = dirname(fileURLToPath(import.meta.url));
	const localEnvFiles = [
		resolve(configDir, ".env"),
		resolve(configDir, ".dev.vars"),
		resolve(configDir, "../server/.env"),
		resolve(configDir, "../server/.dev.vars"),
	];

	for (const envPath of localEnvFiles) {
		if (existsSync(envPath)) {
			loadEnv({ path: envPath, override: false });
		}
	}
}

let cachedDb: ReturnType<typeof createDb> | undefined;

const getDb = () => {
	if (!cachedDb) {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is required for Clivly configuration");
		}
		cachedDb = createDb(databaseUrl);
	}
	return cachedDb;
};

const db = new Proxy({} as ReturnType<typeof createDb>, {
	get(_target, prop) {
		const instance = getDb();
		const value = Reflect.get(instance as object, prop);
		return typeof value === "function" ? value.bind(instance) : value;
	},
});

const entities = defineClivlyConfig({
	entities: {
		contacts: {
			concept: "contact",
			source: "contacts",
			fields: { name: "name", email: "email" },
		},
		companies: {
			concept: "company",
			source: "companies",
			fields: { name: "name" },
		},
	},
});

export default createClivlySDK({
	apiKey: process.env.CLIVLY_API_KEY!,
	entities,
	// Expose the full Drizzle namespace so Clivly can discover additional tables
	// if you add more mappings in the dashboard later.
	schema: discoverFromDrizzle(schema),
	introspector: drizzleIntrospector(db),
	source: {
		contacts: fromDrizzle(db, schema.users, {
			entity: "contacts",
			cursorField: "updatedAt",
		}),
		companies: fromDrizzle(db, schema.teams, {
			entity: "companies",
			cursorField: "updatedAt",
		}),
	},
	syncTrigger: {
		path: "/api/clivly/tick",
		// The public URL Clivly Cloud calls to trigger a sync. Leave unset locally
		// and let `clivly dev` or production deploy config provide the origin.
		url: process.env.CLIVLY_SYNC_TRIGGER_URL,
		secret: process.env.CLIVLY_SYNC_TRIGGER_SECRET,
	},
	verifyToken: process.env.CLIVLY_VERIFY_TOKEN,
});
