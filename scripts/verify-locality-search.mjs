// Usage: DATABASE_URL=... node scripts/verify-locality-search.mjs
//
// Correctness regression test for suburb-name autocomplete, from the cases
// careproviders.com supplied on 2026-08-24.
//
// A locality sits mid-string in the number-first `search_text`, so a prefix
// match can only find a suburb when a street happens to share its name
// ("MANLY WHARF" matched; plain "sunnybank" did not). 19 of 20 major suburbs
// returned zero matching localities. These assertions fail if that returns.
//
// Exits 0 when every check passes, 1 on regression, 2 on setup error.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("Set DATABASE_URL");
	process.exit(2);
}

// [query, expected locality prefix, optional exact (locality,state,postcode)]
const CASES = [
	["sunnybank", "SUNNYBANK", null],
	["parramatta", "PARRAMATTA", null],
	["bondi", "BONDI", null],
	["carlton", "CARLTON", ["CARLTON", "VIC", "3053"]],
	["chatswood", "CHATSWOOD", null],
	["inala", "INALA", null],
	["dandenong", "DANDENONG", null],
	["blacktown", "BLACKTOWN", null],
	["toowong", "TOOWONG", null],
	["newtown", "NEWTOWN", null],
	["fremantle", "FREMANTLE", null],
	["manly", "MANLY", null],
];

const MAX_MS = 5000;
const pool = new Pool({ connectionString: url });
let failed = 0;

const client = await pool.connect();
try {
	await client.query("SET statement_timeout = '30s'");

	for (const [query, expectPrefix, exact] of CASES) {
		const upper = query.toUpperCase();
		const bound =
			upper.slice(0, -1) +
			String.fromCharCode(upper.charCodeAt(upper.length - 1) + 1);
		const started = Date.now();
		try {
			const r = await client.query(
				`WITH RECURSIVE keys AS (
				   (SELECT locality, state FROM addresses
				     WHERE locality >= $1 AND locality < $2 AND country = 'AU'
				     ORDER BY locality, state LIMIT 1)
				   UNION ALL
				   (SELECT n.locality, n.state FROM keys k
				     CROSS JOIN LATERAL (
				       SELECT a.locality, a.state FROM addresses a
				        WHERE a.country = 'AU' AND a.locality < $2
				          AND (a.locality, a.state) > (k.locality, k.state)
				        ORDER BY a.locality, a.state LIMIT 1) n)
				 )
				 SELECT k.locality, k.state, rep.postcode
				   FROM keys k
				   CROSS JOIN LATERAL (
				     SELECT postcode FROM addresses a
				      WHERE a.country='AU' AND a.locality=k.locality AND a.state=k.state
				      LIMIT 1) rep
				  LIMIT 20`,
				[upper, bound]
			);
			const ms = Date.now() - started;
			const matches = r.rows.filter((row) =>
				row.locality.startsWith(expectPrefix)
			);
			const exactOk =
				exact === null ||
				r.rows.some(
					(row) =>
						row.locality === exact[0] &&
						row.state === exact[1] &&
						row.postcode === exact[2]
				);

			if (matches.length === 0) {
				console.log(`FAIL ${query}: 0 rows with locality "${expectPrefix}"`);
				failed++;
			} else if (!exactOk) {
				console.log(`FAIL ${query}: ${exact.join(" ")} not present`);
				failed++;
			} else if (ms > MAX_MS) {
				console.log(
					`FAIL ${query}: ${matches.length} matched but took ${ms}ms (> ${MAX_MS}ms)`
				);
				failed++;
			} else {
				console.log(`PASS ${query}: ${matches.length} matched, ${ms}ms`);
			}
		} catch (e) {
			console.log(`FAIL ${query}: ${e.message}`);
			failed++;
		}
	}
} finally {
	client.release();
	await pool.end();
}

console.log(
	failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`
);
process.exit(failed === 0 ? 0 : 1);
