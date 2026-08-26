// Usage: DATABASE_URL=... node scripts/verify-fuzzy-locality.mjs
//
// Quality and latency guard for fuzzy suburb matching (fuzzy-locality.ts).
//
// This runs only after every exact path returns nothing — i.e. when someone has
// mistyped their suburb. Before it existed, a misspelling returned an empty
// dropdown, which for a care directory disproportionately affects the users
// least able to spell an unfamiliar suburb name.
//
// Scoring takes the better of trigram similarity and normalised edit distance
// (trigrams miss transpositions, edit distance misses length changes), then
// breaks ties by address count as a population proxy — that is what puts SYDNEY
// above SYDENHAM and PERTH WA above PERON WA.
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

const MAX_MS = 1500;

// Typos that must rank the intended suburb FIRST.
const MUST_RANK_FIRST = [
	["sydeny", "SYDNEY"],
	["perht", "PERTH"],
	["hobrat", "HOBART"],
	["adelade", "ADELAIDE"],
	["melborne", "MELBOURNE"],
	["chatswod", "CHATSWOOD"],
	["sprngwood", "SPRINGWOOD"],
];

// Known limitation, asserted so it is visible rather than forgotten: dropping
// two or more characters from a longer name does not rank the intended suburb.
// If this ever starts passing, the scoring improved — update the expectation.
const KNOWN_MISS = ["brisbn", "BRISBANE"];

const upperBound = (p) =>
	p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1);

const SQL = `
WITH RECURSIVE keys AS (
  (SELECT locality, state FROM addresses
    WHERE country='AU' AND locality >= $2 AND locality < $3
    ORDER BY locality, state LIMIT 1)
  UNION ALL
  (SELECT n.locality, n.state FROM keys k CROSS JOIN LATERAL (
     SELECT a.locality, a.state FROM addresses a
      WHERE a.country='AU' AND a.locality < $3
        AND (a.locality, a.state) > (k.locality, k.state)
      ORDER BY a.locality, a.state LIMIT 1) n)
),
scored AS (
  SELECT locality, state,
    greatest(similarity(locality, $1::text),
      1.0 - (levenshtein(locality, $1::text)::float
             / greatest(length(locality), length($1::text)))) AS score
  FROM keys
),
top AS (SELECT * FROM scored WHERE score >= 0.55 ORDER BY score DESC LIMIT 40)
SELECT t.locality, t.state, t.score, sz.n
FROM top t CROSS JOIN LATERAL (
  SELECT count(*) n FROM (
    SELECT 1 FROM addresses a
     WHERE a.country='AU' AND a.locality=t.locality AND a.state=t.state
     LIMIT 20000) capped) sz
ORDER BY t.score DESC, sz.n DESC, t.locality
LIMIT 3`;

const pool = new Pool({ connectionString: url });
let failed = 0;

const client = await pool.connect();
try {
	await client.query("SET statement_timeout = '20s'");

	for (const [typo, expected] of MUST_RANK_FIRST) {
		const anchor = typo.slice(0, 2).toUpperCase();
		const started = Date.now();
		try {
			const r = await client.query(SQL, [
				typo.toUpperCase(),
				anchor,
				upperBound(anchor),
			]);
			const ms = Date.now() - started;
			const first = r.rows[0]?.locality;
			if (first !== expected) {
				console.log(
					`FAIL "${typo}": expected ${expected} first, got ${first ?? "(none)"}`
				);
				failed++;
			} else if (ms > MAX_MS) {
				console.log(`FAIL "${typo}": ranked correctly but took ${ms}ms`);
				failed++;
			} else {
				console.log(`PASS "${typo}" -> ${first} (${ms}ms)`);
			}
		} catch (e) {
			console.log(`FAIL "${typo}": ${e.message}`);
			failed++;
		}
	}

	const [typo, expected] = KNOWN_MISS;
	const anchor = typo.slice(0, 2).toUpperCase();
	const r = await client.query(SQL, [
		typo.toUpperCase(),
		anchor,
		upperBound(anchor),
	]);
	const first = r.rows[0]?.locality;
	if (first === expected) {
		console.log(
			`NOTE "${typo}" now ranks ${expected} first — scoring improved, update KNOWN_MISS`
		);
	} else {
		console.log(
			`PASS "${typo}": still a known miss (${first ?? "none"}), documented`
		);
	}
} finally {
	client.release();
	await pool.end();
}

console.log(
	failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`
);
process.exit(failed === 0 ? 0 : 1);
