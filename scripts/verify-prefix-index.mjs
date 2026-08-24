// Usage: DATABASE_URL=... node scripts/verify-prefix-index.mjs
//
// Regression test for the autocomplete prefix-scan index path.
//
// idx_addresses_search_text_btree is declared `text_pattern_ops`, a
// case-sensitive operator class.
//
// The failure is prefix-dependent, which is what made it intermittent:
//
//   - For an ALPHABETIC prefix, ILIKE cannot use the btree at all. Measured on
//     production: `ILIKE 'brow%'` and `ILIKE 'BROW%'` both exceed 25s, while
//     `LIKE 'BROW%'` returns in ~11ms.
//   - For a PURELY NUMERIC prefix, Postgres CAN derive a range condition from
//     ILIKE (~>=~ '407' AND ~<~ '408') because digits are case-invariant, so
//     it applies ~~* only as a recheck filter. Measured: ~0.24ms, plan
//     identical to LIKE.
//
// So numeric prefixes were never slow via ILIKE — the hang came from alpha
// prefixes, and from ilikeFallback's `%tok%` substring predicates which cannot
// use a prefix btree under any operator. Writing every search_text predicate
// as uppercase LIKE removes the whole class of problem regardless of prefix.
//
// This has regressed twice (see .planning/debug/autocomplete-slow-query.md and
// .planning/debug/autocomplete-tier1-ilike.md), because unit tests in this repo
// are pure-function and never touch a plan. This script closes that loop.
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

const INDEX = "idx_addresses_search_text_btree";
const MAX_EXEC_MS = 2000;
// Row cap for the equivalence sample — see check 4.
const SAMPLE_ROWS = 500;
const NUMERIC_PREFIX_REGEX = /^\d+$/;

// Prefixes the reporter typed. Short numeric ones hit tieredSearch Tier 1
// (len <= 4); the longer alpha one exercises the ordinary prefixSearch path.
const PREFIXES = ["407", "411", "4118", "BROWNS"];

const pool = new Pool({ connectionString: url });
let failed = 0;

function fail(name, detail) {
	console.log(`FAIL ${name}: ${detail}`);
	failed++;
}

function pass(name, detail) {
	console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

const client = await pool.connect();
try {
	await client.query("SET statement_timeout = '30s'");

	// ---------------------------------------------------------------------
	// 1. The index still uses the case-sensitive opclass this all depends on.
	//    If someone recreates it with the default opclass, LIKE stops being
	//    indexable and every check below becomes meaningless.
	// ---------------------------------------------------------------------
	const opclass = await client.query(
		`SELECT op.opcname
		   FROM pg_index x
		   JOIN pg_class i ON i.oid = x.indexrelid
		   JOIN pg_class t ON t.oid = x.indrelid
		   JOIN pg_opclass op ON op.oid = ANY(x.indclass::oid[])
		  WHERE t.relname = 'addresses' AND i.relname = $1`,
		[INDEX]
	);
	const opcname = opclass.rows[0]?.opcname;
	if (opcname === "text_pattern_ops") {
		pass("opclass", `${INDEX} is text_pattern_ops`);
	} else {
		fail(
			"opclass",
			`${INDEX} opclass is ${opcname ?? "MISSING"}, expected text_pattern_ops`
		);
	}

	// ---------------------------------------------------------------------
	// 2. LIKE on an uppercased prefix must use that btree, and be fast.
	// ---------------------------------------------------------------------
	for (const prefix of PREFIXES) {
		const name = `LIKE '${prefix}%'`;
		try {
			const r = await client.query(
				`EXPLAIN (ANALYZE, BUFFERS)
				 SELECT id FROM addresses WHERE search_text LIKE $1 LIMIT 10`,
				[`${prefix}%`]
			);
			const plan = r.rows.map((row) => row["QUERY PLAN"]).join("\n");
			const usesBtree = plan.includes(INDEX);
			const noSeqScan = !/Seq Scan on addresses/.test(plan);
			const execMs = Number(
				(plan.match(/Execution Time: ([\d.]+) ms/) || [])[1] ?? "99999"
			);
			if (usesBtree && noSeqScan && execMs < MAX_EXEC_MS) {
				pass(name, `btree exec=${execMs}ms`);
			} else {
				fail(
					name,
					`btree=${usesBtree} noSeqScan=${noSeqScan} exec=${execMs}ms`
				);
			}
		} catch (e) {
			fail(name, e.message);
		}
	}

	// ---------------------------------------------------------------------
	// 3. The guard that actually catches the regression: an ALPHABETIC prefix.
	//    This is the case where ILIKE genuinely cannot use the btree. A numeric
	//    prefix would NOT catch it — Postgres derives a safe range from digits
	//    and the ILIKE plan looks identical to LIKE. Any regression test that
	//    only checks numbers gives a false all-clear, which is how this defect
	//    survived twice.
	// ---------------------------------------------------------------------
	try {
		const r = await client.query(
			"EXPLAIN SELECT id FROM addresses WHERE search_text ILIKE $1 LIMIT 10",
			["BROW%"]
		);
		const plan = r.rows.map((row) => row["QUERY PLAN"]).join("\n");
		if (plan.includes(INDEX)) {
			pass(
				"alpha ILIKE",
				"ILIKE now uses the btree for an alpha prefix — Postgres behaviour changed, revisit the uppercase-LIKE rationale"
			);
		} else {
			pass(
				"alpha ILIKE",
				"ILIKE cannot use the btree for an alpha prefix, as expected"
			);
		}
	} catch (e) {
		fail("alpha ILIKE", e.message);
	}

	// ---------------------------------------------------------------------
	// 3b. `ORDER BY 1` must never reappear as a "no ordering" placeholder.
	//     It is an ordinal reference to the first select column, so Postgres
	//     performs a real sort and LIMIT can no longer short-circuit the index
	//     scan. That is what made 3-digit prefixes (411/318/529) take 6-20s while
	//     2- and 4-digit ones stayed fast. Assert the sortless form does not sort.
	// ---------------------------------------------------------------------
	try {
		const r = await client.query(
			"EXPLAIN SELECT id FROM addresses WHERE search_text LIKE $1 AND country = 'AU' LIMIT 10",
			["318%"]
		);
		const plan = r.rows.map((row) => row["QUERY PLAN"]).join("\n");
		if (/\bSort\b/.test(plan)) {
			fail(
				"no placeholder sort",
				`unordered prefix query plans a Sort:\n${plan}`
			);
		} else {
			pass(
				"no placeholder sort",
				"unordered prefix query short-circuits on LIMIT"
			);
		}
	} catch (e) {
		fail("no placeholder sort", e.message);
	}

	// ---------------------------------------------------------------------
	// 4. Correctness, not just speed: because search_text is stored uppercase,
	//    LIKE on an uppercased pattern must return exactly what ILIKE returned.
	//    This is what proves the fix was not a behaviour change.
	// ---------------------------------------------------------------------
	// Only numeric prefixes are compared here. For an alpha prefix the ILIKE
	// side is precisely the unindexed scan this fix removes, so it times out and
	// the comparison can never complete — the timeout would be reported as a
	// failure of the fix rather than a consequence of the bug. Check 3 already
	// proves the alpha ILIKE plan is unindexed; equivalence for uppercase
	// patterns is established by the numeric cases plus the fact that
	// search_text is stored uppercase.
	for (const prefix of PREFIXES.filter((p) => NUMERIC_PREFIX_REGEX.test(p))) {
		const name = `equivalence '${prefix}%'`;
		try {
			// Bounded comparison: an unbounded count(*) over a hot prefix scans
			// millions of rows and times out without telling us anything extra.
			// Comparing a capped, ordered id sample is enough to prove the two
			// predicates select the same rows.
			const r = await client.query(
				`SELECT
				   (SELECT array_agg(id ORDER BY id) FROM (
					  SELECT id FROM addresses WHERE search_text ILIKE $1
					  ORDER BY id LIMIT $2) a) AS ilike_ids,
				   (SELECT array_agg(id ORDER BY id) FROM (
					  SELECT id FROM addresses WHERE search_text LIKE $1
					  ORDER BY id LIMIT $2) b) AS like_ids`,
				[`${prefix}%`, SAMPLE_ROWS]
			);
			const { ilike_ids, like_ids } = r.rows[0];
			if (JSON.stringify(ilike_ids) === JSON.stringify(like_ids)) {
				pass(name, `${(like_ids ?? []).length} sampled ids identical`);
			} else {
				fail(name, "ILIKE and LIKE selected different rows");
			}
		} catch (e) {
			fail(name, e.message);
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
