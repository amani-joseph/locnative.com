// Read-only validation of the atomic increment UPDATE. EXPLAIN plans the
// statement (checks columns + syntax) WITHOUT executing it — no rows change.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL_REGEX = /^DATABASE_URL=(.*)$/m;
const SURROUNDING_QUOTES_REGEX = /^["']|["']$/g;

function url() {
	for (const p of ["apps/server/.env", "apps/web/.env", ".env"]) {
		try {
			const m = readFileSync(p, "utf8").match(DATABASE_URL_REGEX);
			if (m) {
				return m[1].trim().replace(SURROUNDING_QUOTES_REGEX, "");
			}
		} catch {
			/* next */
		}
	}
	throw new Error("no url");
}

const sql = neon(url());
const monthStart = "2026-06-01";
const id = "00000000-0000-0000-0000-000000000000";
const plan = await sql.query(
	`EXPLAIN UPDATE billing_accounts SET
		current_period_requests = CASE WHEN current_period_start IS NULL OR current_period_start < $1 THEN 1 ELSE current_period_requests + 1 END,
		current_period_start = $1,
		blocked = (NOT has_payment_method) AND (CASE WHEN current_period_start IS NULL OR current_period_start < $1 THEN 1 ELSE current_period_requests + 1 END) >= free_allotment,
		updated_at = now()
	WHERE id = $2`,
	[monthStart, id]
);
console.log("EXPLAIN OK — statement valid. Plan rows:", plan.length);
