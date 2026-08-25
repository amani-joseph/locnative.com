// Usage: DATABASE_URL=... node scripts/verify-locality-latency.mjs
//
// Latency regression test for suburb autocomplete, from the careproviders.com
// report of 2026-08-25.
//
// The suburb skip-scan filters on country and ranges over locality. Before
// idx_addresses_country_locality the only index leading with `locality` was
// idx_addresses_street (locality, street_name), which carries no country
// column — so an AU lookup walked entries for every country and discarded
// most of them. AU is ~6% of this table (US ~44%), so ~94% of the pages
// touched were irrelevant: 70,445 buffers to return 8 rows, and ~3.0s cold on
// short prefixes like 'SP' and 'O'.
//
// Short prefixes are the ones that matter: autocomplete fires on every
// keystroke, so 2-character prefixes are the common case, not the edge case.
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

const INDEX = "idx_addresses_country_locality";
// The reporter's stated goal is a cold p90 under ~800ms. Assert well inside it
// so a regression is caught before it reaches their budget.
const MAX_MS = 800;
// 'SP' and 'O' were the pathological cases (3.0s+). 'BR' was 3139ms in their
// report. The longer ones confirm selective prefixes did not regress.
const PREFIXES = ["SP", "O", "BR", "CH", "SUNNYBANK", "BONDI"];

const upperBound = (p) =>
	p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1);

const SQL = `
WITH RECURSIVE keys AS (
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
 LIMIT 8`;

const pool = new Pool({ connectionString: url });
let failed = 0;

const client = await pool.connect();
try {
	await client.query("SET statement_timeout = '30s'");

	// The index must exist and be valid. An interrupted CONCURRENTLY build
	// leaves an INVALID index that the planner silently ignores, which would
	// look like a pure latency regression with no obvious cause.
	const idx = await client.query(
		`SELECT x.indisvalid FROM pg_class i
		   JOIN pg_index x ON x.indexrelid = i.oid
		  WHERE i.relname = $1`,
		[INDEX]
	);
	if (idx.rows.length === 0) {
		console.log(`FAIL index: ${INDEX} does not exist`);
		failed++;
	} else if (idx.rows[0].indisvalid === false) {
		console.log(
			`FAIL index: ${INDEX} exists but is INVALID (drop and rebuild)`
		);
		failed++;
	} else {
		console.log(`PASS index: ${INDEX} present and valid`);
	}

	for (const prefix of PREFIXES) {
		const started = Date.now();
		try {
			const r = await client.query(SQL, [prefix, upperBound(prefix)]);
			const ms = Date.now() - started;
			if (r.rows.length === 0) {
				console.log(`FAIL ${prefix}: returned no localities`);
				failed++;
			} else if (ms > MAX_MS) {
				console.log(
					`FAIL ${prefix}: ${ms}ms (> ${MAX_MS}ms), ${r.rows.length} rows`
				);
				failed++;
			} else {
				console.log(`PASS ${prefix}: ${ms}ms, ${r.rows.length} localities`);
			}
		} catch (e) {
			console.log(`FAIL ${prefix}: ${e.message}`);
			failed++;
		}
	}

	// The plan must actually use the new index. Timing alone can pass on a warm
	// cache while the underlying scan is still the wrong one.
	const plan = await client.query(`EXPLAIN ${SQL}`, ["SP", upperBound("SP")]);
	const planText = plan.rows.map((r) => r["QUERY PLAN"]).join("\n");
	if (planText.includes(INDEX)) {
		console.log(`PASS plan: skip-scan uses ${INDEX}`);
	} else {
		console.log(`FAIL plan: expected ${INDEX}, got:\n${planText}`);
		failed++;
	}
} finally {
	client.release();
	await pool.end();
}

console.log(
	failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`
);
process.exit(failed === 0 ? 0 : 1);
