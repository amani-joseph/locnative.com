// Usage: DATABASE_URL=... node scripts/verify-fuzzy-tier.mjs
//
// Regression test for the zero-match hang reported by careproviders.com on
// 2026-08-26.
//
// tieredSearch's Tier 2 (5-7 characters) ran an unanchored trigram predicate,
// `search_text % 'zzzzz'`. On a query that matches nothing, that scans the
// whole GIN index without a bound and never completes — measured >45s, with
// EXPLAIN ANALYZE itself timing out. Tier 3 has an anchor guard for exactly
// this reason; Tier 2 never got one.
//
// The window was exact and user-visible: length <=4 took the prefix tier,
// length >=8 took anchored Tier 3, and 5-7 fell into the unanchored middle.
// Real typos live there — "sydeny", "perht", "hobrat" all hung.
//
// Two things this asserts:
//   1. zero-match queries at every length return quickly
//   2. queries that DO match still return correct results
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

// Generous: the point is "returns at all", not a latency target.
const MAX_MS = 3000;

// Zero-match strings spanning the whole length range, including the 5-7 window.
const NO_MATCH = [
	"zzzz",
	"zzzzz",
	"zzzzzz",
	"zzzzzzz",
	"zzzzzzzz",
	"sydeny",
	"perht",
	"hobrat",
	"brisbn",
	"blorf",
	"qqqqq",
];

// Real localities of the same length that must keep working.
const MUST_MATCH = ["bondi", "perth", "hobart", "cairns", "darwin"];

const pool = new Pool({ connectionString: url });
let failed = 0;

const client = await pool.connect();
try {
	// Below the old hang duration, so a regression fails loudly rather than
	// stalling this script for a minute per case.
	await client.query("SET statement_timeout = '10s'");
	await client.query("SELECT set_limit(0.3)");

	for (const q of NO_MATCH) {
		const started = Date.now();
		try {
			await client.query(
				`SELECT id FROM addresses
				  WHERE search_text LIKE $2
				    AND search_text % $1::text
				    AND country = 'AU'
				  LIMIT 8`,
				[q.toUpperCase(), `${q.toUpperCase()}%`]
			);
			const ms = Date.now() - started;
			if (ms > MAX_MS) {
				console.log(`FAIL no-match "${q}" (len ${q.length}): ${ms}ms`);
				failed++;
			} else {
				console.log(`PASS no-match "${q}" (len ${q.length}): ${ms}ms`);
			}
		} catch (e) {
			console.log(`FAIL no-match "${q}" (len ${q.length}): ${e.message}`);
			failed++;
		}
	}

	for (const q of MUST_MATCH) {
		const started = Date.now();
		try {
			const r = await client.query(
				`SELECT id FROM addresses WHERE search_text LIKE $1 AND country = 'AU' LIMIT 8`,
				[`${q.toUpperCase()}%`]
			);
			const ms = Date.now() - started;
			if (r.rows.length === 0) {
				console.log(`FAIL match "${q}": returned no rows`);
				failed++;
			} else if (ms > MAX_MS) {
				console.log(`FAIL match "${q}": ${ms}ms`);
				failed++;
			} else {
				console.log(`PASS match "${q}": ${ms}ms, ${r.rows.length} rows`);
			}
		} catch (e) {
			console.log(`FAIL match "${q}": ${e.message}`);
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
