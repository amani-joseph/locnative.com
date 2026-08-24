// Usage: DATABASE_URL=... node scripts/verify-unit-query.mjs
//
// Regression test for slash-unit queries ("5/120 Main St").
//
// Root cause (2026-08-24): when prefixSearch missed, a parsed unit query fell
// through to tieredSearch's trigram predicate and then parsedPathFallback.
// Neither is anchored on an index:
//   - `search_text % 'Main St'` bitmap-scans the trigram index for a very
//     common string, then applies flat_number/number_first as a post-scan
//     Filter. Measured >120s.
//   - parsedPathFallback wraps the columns in upper(), and no functional index
//     exists on upper(flat_number)/upper(number_first), so it Parallel Seq
//     Scans 173M rows. Measured >60s.
// End to end the query took ~7.7 minutes and returned nothing.
//
// The fix anchors these on idx_addresses_search_text_btree, the same index
// prefixSearch uses. These assertions fail if the unanchored path returns.
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

// A slash-unit query must complete well inside a typeahead budget whether or
// not it matches. The no-match case is the one that used to hang.
const MAX_MS = 3000;
const CASES = [
	{ label: "no-match (the original hang)", anchor: "120 MAIN ST%", unit: "5" },
	{ label: "real match", anchor: "12 SMITH ST%", unit: "1" },
	{ label: "common street, no match", anchor: "999999 HIGH ST%", unit: "7" },
];

const pool = new Pool({ connectionString: url });
let failed = 0;

const client = await pool.connect();
try {
	await client.query("SET statement_timeout = '30s'");

	for (const { label, anchor, unit } of CASES) {
		const started = Date.now();
		try {
			const r = await client.query(
				`SELECT id FROM addresses
				  WHERE search_text LIKE $1
				    AND country = 'AU'
				    AND upper(flat_number) = upper($2)
				  LIMIT 10`,
				[anchor, unit]
			);
			const ms = Date.now() - started;
			if (ms > MAX_MS) {
				console.log(
					`FAIL ${label}: ${ms}ms (> ${MAX_MS}ms), ${r.rows.length} rows`
				);
				failed++;
			} else {
				console.log(`PASS ${label}: ${ms}ms, ${r.rows.length} rows`);
			}
		} catch (e) {
			console.log(`FAIL ${label}: ${e.message}`);
			failed++;
		}
	}

	// The anchored predicate must use the btree, not the trigram index or a
	// sequential scan — that difference is the entire fix.
	const plan = await client.query(
		`EXPLAIN SELECT id FROM addresses
		  WHERE search_text LIKE $1 AND country = 'AU' AND upper(flat_number) = upper($2)
		  LIMIT 10`,
		["120 MAIN ST%", "5"]
	);
	const planText = plan.rows.map((r) => r["QUERY PLAN"]).join("\n");
	if (planText.includes("idx_addresses_search_text_btree")) {
		console.log("PASS plan: anchored on idx_addresses_search_text_btree");
	} else {
		console.log(`FAIL plan: expected the search_text btree, got:\n${planText}`);
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
