// biome-ignore lint/performance/noNamespaceImport: Clivly discovers every exported Drizzle table.
import * as schema from "@locnative/database";
import { createDb } from "@locnative/database";
import {
	discoverFromDrizzle,
	drizzleIntrospector,
	fromDrizzle,
} from "clivly/drizzle";
import type { CursorKV } from "clivly/sdk";
import { createClivlySDK, defineClivlyConfig, kvCursorStore } from "clivly/sdk";

// This file also runs inside the Cloudflare Worker, so it must stay edge-safe:
// no `node:*` imports. The CLI loads local env files from `clivly.cli.ts`;
// on Workers, env comes from bindings (already on `process.env`).

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

const getCursorNamespace = async (): Promise<CursorKV> => {
	// Resolve bindings inside an invocation so the CLI and Vite's Node process
	// can still load this config without importing the Workers runtime.
	const { env } = await import("cloudflare:workers");
	const namespace = env.CLIVLY_CURSORS;
	if (!namespace) {
		throw new Error("CLIVLY_CURSORS binding is required for persistent sync");
	}
	return namespace;
};

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
	apiKey:
		process.env.CLIVLY_SECRET_KEY?.trim() ||
		process.env.CLIVLY_API_KEY?.trim() ||
		"",
	entities,
	// Development uses the SDK's memory store; production survives Worker eviction.
	cursorStore: import.meta.env?.PROD
		? kvCursorStore({
				async get(key) {
					const namespace = await getCursorNamespace();
					return namespace.get(key);
				},
				async put(key, value) {
					const namespace = await getCursorNamespace();
					await namespace.put(key, value);
				},
			})
		: undefined,
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
