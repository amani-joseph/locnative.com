import { createDb } from "@locnative/database";

let db: ReturnType<typeof createDb> | null = null;

export function getDb() {
	if (!db) {
		const url = process.env.DATABASE_URL;
		if (!url) {
			throw new Error("DATABASE_URL environment variable is required");
		}
		db = createDb(url);
	}
	return db;
}
