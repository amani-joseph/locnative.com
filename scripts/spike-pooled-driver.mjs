// Usage: DATABASE_URL=... node scripts/spike-pooled-driver.mjs
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const t0 = Date.now();
try {
	await client.query("BEGIN");
	await client.query("SET LOCAL statement_timeout = '1500ms'");
	await client.query("SELECT pg_sleep(5)");
	console.log("UNEXPECTED: slept full 5s");
} catch (e) {
	console.log(`OK cancelled after ${Date.now() - t0}ms: ${e.message}`);
} finally {
	await client.query("ROLLBACK").catch(() => {
		// Ignore rollback errors after timeout/cancellation; connection cleanup follows.
	});
	client.release();
	await pool.end();
}
