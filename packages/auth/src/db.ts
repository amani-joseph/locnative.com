import { createDb, type Database } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";

let cachedDb: Database | undefined;

function getDb(): Database {
	if (!cachedDb) {
		cachedDb = createDb(serverEnv.DATABASE_URL);
	}
	return cachedDb;
}

/**
 * Lazily-initialized database client.
 *
 * Reading `serverEnv.DATABASE_URL` (and `createDb`/`neon()`, which throws on an
 * undefined URL) at module scope would run during Cloudflare's deploy-time
 * startup validation, where the DATABASE_URL secret is absent — failing the
 * deploy. The Proxy defers construction to first use (request time), while
 * preserving the `db.X` API so no call sites change.
 */
export const db: Database = new Proxy({} as Database, {
	get(_target, prop) {
		const instance = getDb();
		const value = Reflect.get(instance as object, prop);
		return typeof value === "function" ? value.bind(instance) : value;
	},
});
