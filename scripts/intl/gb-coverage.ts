/**
 * GB OS-OpenData coverage loader (UK plan, Phase 2).
 *
 * Appends Code-Point Open + OS Open Names coverage rows (produced by the
 * os-open adapter) into `addresses`, tagged with `source` so they coexist with —
 * and can be refreshed independently of — the OSM house-number rows loaded by
 * `ingest.ts GB` (Phase 1).
 *
 * Why a separate loader (not ingest.ts): ingest.ts is one-adapter-per-country and
 * its --replace deletes the whole country, which would wipe the OSM GB rows. This
 * loader is SOURCE-scoped: pre-flight and --replace key on
 * (country='GB', source IN OS_*), so the osm-derived rows are never touched.
 *
 * Requires the `source` column (drizzle migration 0015). The staging DDL, columns,
 * and promote SQL deliberately mirror ingest.ts — keep them in sync.
 *
 * Usage:
 *   bun scripts/intl/gb-coverage.ts --db <url|@file> [options]
 *     --db <url|@file>   REQUIRED (unless --dry-run). Same contract as ingest.ts:
 *                        never read from .env; pointing at a DB is explicit.
 *     --replace          Delete existing GB OS coverage rows before promote.
 *     --dry-run          Print the plan, touch nothing.
 *     --keep-staging     Keep addresses_staging after promote (default: drop).
 *     --use-cached-csv   Reuse a previously produced /tmp/os-open-gb.csv.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runExtract as osOpenExtract } from "./adapters/os-open";

const MANIFEST_PATH = new URL("manifest.json", import.meta.url).pathname;
const HOST_FROM_URL_RE = /.*@([^/:]+).*/;
const WHITESPACE_RE = /\s+/;
const CSV_PATH = "/tmp/os-open-gb.csv";
// The sources this loader owns. Scoping every destructive op to these means a
// reload can never delete the osm-derived GB rows (which carry source NULL).
const SOURCES = "'OS_CODEPOINT', 'OS_OPENNAMES'";
const SCOPE = `country = 'GB' AND source IN (${SOURCES})`;

interface Args {
	db: string;
	dryRun: boolean;
	keepStaging: boolean;
	replace: boolean;
	useCachedCsv: boolean;
}

function parseArgs(argv: string[]): Args {
	const has = (name: string): boolean => argv.includes(`--${name}`);
	const flag = (name: string): string | undefined => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	let db = flag("db") ?? "";
	if (db.startsWith("@")) {
		db = readFileSync(db.slice(1), "utf-8").trim();
	}
	if (!(db || has("dry-run"))) {
		throw new Error(
			"--db is required (connection string, or @path to a file containing one). " +
				"This loader never reads DATABASE_URL from .env."
		);
	}
	return {
		db,
		dryRun: has("dry-run"),
		keepStaging: has("keep-staging"),
		replace: has("replace"),
		useCachedCsv: has("use-cached-csv"),
	};
}

function psql(db: string, sql: string): string {
	return execFileSync("psql", [db, "-v", "ON_ERROR_STOP=1", "-tAc", sql], {
		encoding: "utf-8",
	}).trim();
}

// Mirrors ingest.ts STAGING_DDL.
const STAGING_DDL = `
CREATE UNLOGGED TABLE IF NOT EXISTS addresses_staging (
  source text NOT NULL,
  country varchar(2) NOT NULL,
  state varchar(10) NOT NULL DEFAULT '',
  locality text NOT NULL DEFAULT '',
  postcode varchar(10) NOT NULL DEFAULT '',
  street_name text NOT NULL DEFAULT '',
  street_type varchar(20), street_suffix varchar(10), building_name text,
  flat_type varchar(10), flat_number varchar(10),
  level_type varchar(10), level_number varchar(10),
  number_first varchar(15), number_last varchar(15),
  longitude real NOT NULL, latitude real NOT NULL,
  confidence integer, source_id text
);
TRUNCATE addresses_staging;`;

// Mirrors ingest.ts STAGING_COLUMNS.
const STAGING_COLUMNS =
	"source,country,state,locality,postcode,street_name,street_type,street_suffix," +
	"building_name,flat_type,flat_number,level_type,level_number,number_first," +
	"number_last,longitude,latitude,confidence";

// Mirrors ingest.ts PROMOTE_SQL, but (a) carries `source` into addresses (so the
// rows can be source-scoped later) and (b) tiers admin_level by source so these
// number-less coverage rows rank BELOW real addresses. autocomplete orders
// `population_score DESC, admin_level ASC`; with all GB population_score=0,
// admin_level is the live tiebreaker, so real addresses (5) beat place (6),
// street (7), postcode (8). search_text/geom otherwise identical to ingest.ts.
const PROMOTE_SQL = `
INSERT INTO addresses
 (country, state, locality, postcode, street_name, street_type, street_suffix,
  building_name, flat_type, flat_number, level_type, level_number,
  number_first, number_last, longitude, latitude, confidence, gnaf_pid,
  search_text, geom, population_score, admin_level, source)
SELECT country, NULLIF(state, ''), locality, postcode, street_name, street_type, street_suffix,
  building_name, flat_type, flat_number, level_type, level_number,
  number_first, number_last, longitude, latitude, confidence, NULL,
  trim(concat_ws(' ',
    NULLIF(number_first, ''), NULLIF(number_last, ''), NULLIF(street_name, ''),
    street_type, street_suffix, building_name,
    NULLIF(locality, ''), NULLIF(state, ''), NULLIF(postcode, ''), country)),
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
  0,
  CASE
    WHEN source = 'OS_CODEPOINT' THEN 8
    WHEN source = 'OS_OPENNAMES' AND street_name <> '' THEN 7
    WHEN source = 'OS_OPENNAMES' THEN 6
    ELSE 5
  END,
  source
FROM addresses_staging;`;

function assertSourceColumn(db: string): void {
	const exists = psql(
		db,
		"SELECT 1 FROM information_schema.columns WHERE table_name = 'addresses' AND column_name = 'source';"
	);
	if (exists !== "1") {
		throw new Error(
			"addresses.source column missing — apply drizzle migration 0015 first " +
				"(pnpm --filter @locnative/database db:migrate)."
		);
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	console.log("GB coverage loader (Code-Point + OS Open Names)");
	if (args.dryRun) {
		console.log(
			`[dry-run] would extract to ${CSV_PATH}, stage, then promote ${SCOPE}.`
		);
		return;
	}

	const host = args.db.replace(HOST_FROM_URL_RE, "$1");
	console.log(`target host: ${host}`);
	assertSourceColumn(args.db);

	// Pre-flight: refuse silent re-ingest (source-scoped, so osm rows are ignored).
	const existing = Number(
		psql(args.db, `SELECT count(*) FROM addresses WHERE ${SCOPE};`)
	);
	if (existing > 0 && !args.replace) {
		throw new Error(
			`GB already has ${existing} OS coverage rows. Re-run with --replace to delete+reload (osm rows are untouched).`
		);
	}

	// Extract (or reuse a prefetched CSV).
	let rowCount: number;
	if (args.useCachedCsv && existsSync(CSV_PATH)) {
		const wc = execFileSync("wc", ["-l", CSV_PATH], { encoding: "utf-8" });
		rowCount = Number.parseInt(wc.trim().split(WHITESPACE_RE)[0] ?? "0", 10);
		console.log(`using cached CSV: ${rowCount} rows at ${CSV_PATH}`);
	} else {
		({ rowCount } = await osOpenExtract(CSV_PATH));
		console.log(`extracted ${rowCount} rows -> ${CSV_PATH}`);
	}

	// Stage.
	psql(args.db, STAGING_DDL);
	execFileSync(
		"psql",
		[
			args.db,
			"-v",
			"ON_ERROR_STOP=1",
			"-c",
			`\\copy addresses_staging (${STAGING_COLUMNS}) FROM '${CSV_PATH}' WITH (FORMAT csv)`,
		],
		{ stdio: ["ignore", "inherit", "inherit"] }
	);
	const staged = Number(
		psql(args.db, "SELECT count(*) FROM addresses_staging;")
	);
	console.log(`staged ${staged} rows`);

	// Promote (source-scoped replace) — single transaction.
	const replaceSql = args.replace
		? `DELETE FROM addresses WHERE ${SCOPE};`
		: "";
	psql(args.db, `BEGIN; ${replaceSql} ${PROMOTE_SQL} COMMIT;`);

	// Post-flight: scoped total + null geoms.
	const out = psql(
		args.db,
		`SELECT count(*) || '|' || count(*) FILTER (WHERE geom IS NULL) FROM addresses WHERE ${SCOPE};`
	);
	const [promoted, nullGeoms] = out.split("|").map(Number);
	console.log(
		`promoted: ${promoted} GB coverage rows (${nullGeoms} null geoms)`
	);
	if ((nullGeoms ?? 0) > 0) {
		throw new Error("null geoms detected after promote");
	}
	if ((promoted ?? 0) < staged) {
		throw new Error(
			`promoted ${promoted} < staged ${staged} — promote incomplete?`
		);
	}

	if (!args.keepStaging) {
		psql(args.db, "DROP TABLE addresses_staging;");
		rmSync(CSV_PATH, { force: true });
	}

	// Manifest.
	const manifest = existsSync(MANIFEST_PATH)
		? JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"))
		: [];
	manifest.push({
		country: "GB",
		adapter: "os-open",
		sources: ["OS_CODEPOINT", "OS_OPENNAMES"],
		staged,
		promoted,
		targetHost: host,
		finishedAt: new Date().toISOString(),
	});
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
	console.log("done — manifest updated");
}

await main();
