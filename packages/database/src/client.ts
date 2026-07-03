import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
// biome-ignore lint/performance/noNamespaceImport: Drizzle expects a schema namespace object
import * as schema from "./schema/index.ts";

export function createDb(databaseUrl: string) {
	const sql = neon(databaseUrl);
	return drizzle({ client: sql, schema });
}

export type Database = ReturnType<typeof createDb>;
