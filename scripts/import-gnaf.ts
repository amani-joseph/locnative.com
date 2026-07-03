/**
 * G-NAF ETL Script — Fast COPY-based import
 *
 * Phase 1: Extract PSV files, join tables, generate a single CSV
 * Phase 2: Use psql COPY to bulk-load into Neon (100x faster than HTTP inserts)
 *
 * Usage:
 *   npx tsx scripts/import-gnaf.ts [--state ACT] [--skip-existing]
 */
import { execSync } from "node:child_process";
import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	rmSync,
	statSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { config } from "dotenv";

config({ path: "apps/web/.env" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required");
	process.exit(1);
}

const ZIP_PATH =
	"apps/web/public/resources/g-naf_feb26_allstates_gda94_psv_1022.zip";
const EXTRACT_DIR = "/tmp/gnaf-extract";
const STANDARD_DIR = `${EXTRACT_DIR}/G-NAF/G-NAF FEBRUARY 2026/Standard`;
const CSV_DIR = "/tmp/gnaf-csv";

const STATES = ["ACT", "NSW", "NT", "OT", "QLD", "SA", "TAS", "VIC", "WA"];

const args = process.argv.slice(2);
const stateFilter = args.includes("--state")
	? args[args.indexOf("--state") + 1]?.toUpperCase()
	: undefined;
const skipExisting = args.includes("--skip-existing");

const statesToProcess = stateFilter
	? STATES.filter((s) => s === stateFilter)
	: STATES;

if (stateFilter && statesToProcess.length === 0) {
	console.error(`Unknown state: ${stateFilter}. Valid: ${STATES.join(", ")}`);
	process.exit(1);
}

async function parsePsv<T extends Record<string, string>>(
	filePath: string
): Promise<Map<string, T>> {
	const map = new Map<string, T>();
	if (!existsSync(filePath)) {
		console.warn(`  File not found: ${filePath}`);
		return map;
	}
	const rl = createInterface({
		input: createReadStream(filePath, "utf-8"),
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	let headers: string[] = [];
	let isFirst = true;
	for await (const line of rl) {
		if (isFirst) {
			headers = line.split("|");
			isFirst = false;
			continue;
		}
		const values = line.split("|");
		const record = {} as Record<string, string>;
		for (let i = 0; i < headers.length; i++) {
			record[headers[i]] = values[i] ?? "";
		}
		const pid = values[0] ?? "";
		if (pid) {
			map.set(pid, record as T);
		}
	}
	return map;
}

async function parsePsvByKey<T extends Record<string, string>>(
	filePath: string,
	keyColumn: string
): Promise<Map<string, T>> {
	const map = new Map<string, T>();
	if (!existsSync(filePath)) {
		console.warn(`  File not found: ${filePath}`);
		return map;
	}
	const rl = createInterface({
		input: createReadStream(filePath, "utf-8"),
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	let headers: string[] = [];
	let keyIndex = -1;
	let isFirst = true;
	for await (const line of rl) {
		if (isFirst) {
			headers = line.split("|");
			keyIndex = headers.indexOf(keyColumn);
			isFirst = false;
			continue;
		}
		const values = line.split("|");
		const record = {} as Record<string, string>;
		for (let i = 0; i < headers.length; i++) {
			record[headers[i]] = values[i] ?? "";
		}
		const key = values[keyIndex] ?? "";
		if (key) {
			map.set(key, record as T);
		}
	}
	return map;
}

function combineNumberParts(
	prefix: string,
	num: string,
	suffix: string
): string {
	return [prefix, num, suffix].filter(Boolean).join("");
}

function escapeCsv(val: string | null): string {
	if (val === null || val === "") {
		return "\\N";
	}
	if (val.includes("\t") || val.includes("\n") || val.includes("\\")) {
		return val
			.replace(/\\/g, "\\\\")
			.replace(/\t/g, "\\t")
			.replace(/\n/g, "\\n");
	}
	return val;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear ETL row builder with many source columns
async function generateCsv(
	state: string
): Promise<{ path: string; count: number }> {
	const csvPath = `${CSV_DIR}/${state}.tsv`;

	if (skipExisting && existsSync(csvPath)) {
		// Count lines to report
		const rl = createInterface({
			input: createReadStream(csvPath),
			crlfDelay: Number.POSITIVE_INFINITY,
		});
		let count = 0;
		for await (const _ of rl) {
			count++;
		}
		console.log(`  Reusing existing CSV (${count.toLocaleString()} rows)`);
		return { path: csvPath, count };
	}

	console.log("  Loading locality data...");
	const localities = await parsePsv<Record<string, string>>(
		`${STANDARD_DIR}/${state}_LOCALITY_psv.psv`
	);

	console.log("  Loading street locality data...");
	const streets = await parsePsv<Record<string, string>>(
		`${STANDARD_DIR}/${state}_STREET_LOCALITY_psv.psv`
	);

	console.log("  Loading geocode data...");
	const geocodes = await parsePsvByKey<Record<string, string>>(
		`${STANDARD_DIR}/${state}_ADDRESS_DEFAULT_GEOCODE_psv.psv`,
		"ADDRESS_DETAIL_PID"
	);

	console.log(
		`  Joining data (${geocodes.size.toLocaleString()} geocoded addresses)...`
	);

	const detailPath = `${STANDARD_DIR}/${state}_ADDRESS_DETAIL_psv.psv`;
	if (!existsSync(detailPath)) {
		console.warn(`  ADDRESS_DETAIL file not found for ${state}`);
		return { path: csvPath, count: 0 };
	}

	const out = createWriteStream(csvPath);
	const rl = createInterface({
		input: createReadStream(detailPath, "utf-8"),
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	let headers: string[] = [];
	let isFirst = true;
	let count = 0;
	let skipped = 0;

	for await (const line of rl) {
		if (isFirst) {
			headers = line.split("|");
			isFirst = false;
			continue;
		}

		const values = line.split("|");
		const r: Record<string, string> = {};
		for (let i = 0; i < headers.length; i++) {
			r[headers[i]] = values[i] ?? "";
		}

		if (r.DATE_RETIRED) {
			continue;
		}

		const pid = r.ADDRESS_DETAIL_PID;
		const geocode = geocodes.get(pid);
		if (!geocode) {
			skipped++;
			continue;
		}

		const lng = Number.parseFloat(geocode.LONGITUDE);
		const lat = Number.parseFloat(geocode.LATITUDE);
		if (Number.isNaN(lng) || Number.isNaN(lat)) {
			skipped++;
			continue;
		}

		const street = streets.get(r.STREET_LOCALITY_PID);
		const locality = localities.get(r.LOCALITY_PID);

		const flatNum = combineNumberParts(
			r.FLAT_NUMBER_PREFIX,
			r.FLAT_NUMBER,
			r.FLAT_NUMBER_SUFFIX
		);
		const levelNum = combineNumberParts(
			r.LEVEL_NUMBER_PREFIX,
			r.LEVEL_NUMBER,
			r.LEVEL_NUMBER_SUFFIX
		);
		const numFirst = combineNumberParts(
			r.NUMBER_FIRST_PREFIX,
			r.NUMBER_FIRST,
			r.NUMBER_FIRST_SUFFIX
		);
		const numLast = combineNumberParts(
			r.NUMBER_LAST_PREFIX,
			r.NUMBER_LAST,
			r.NUMBER_LAST_SUFFIX
		);

		// TSV row: tab-separated, \N for nulls
		const cols = [
			"AU",
			state,
			locality?.LOCALITY_NAME ?? "UNKNOWN",
			r.POSTCODE || "\\N",
			street?.STREET_NAME ?? "UNKNOWN",
			escapeCsv(street?.STREET_TYPE_CODE || null),
			escapeCsv(street?.STREET_SUFFIX_CODE || null),
			escapeCsv(r.BUILDING_NAME || null),
			escapeCsv(r.FLAT_TYPE_CODE || null),
			escapeCsv(flatNum || null),
			escapeCsv(r.LEVEL_TYPE_CODE || null),
			escapeCsv(levelNum || null),
			escapeCsv(numFirst || null),
			escapeCsv(numLast || null),
			lng.toString(),
			lat.toString(),
			r.CONFIDENCE || "\\N",
			pid,
		];

		out.write(`${cols.join("\t")}\n`);
		count++;

		if (count % 500_000 === 0) {
			console.log(`  ${state}: ${count.toLocaleString()} rows written...`);
		}
	}

	await new Promise<void>((resolve) => out.end(resolve));

	console.log(
		`  ${state}: ${count.toLocaleString()} rows, ${skipped.toLocaleString()} skipped`
	);
	return { path: csvPath, count };
}

function runPsql(command: string): void {
	execSync(`psql "${DATABASE_URL}" -c "${command.replace(/"/g, '\\"')}"`, {
		stdio: "inherit",
	});
}

function copyFile(tsvPath: string): void {
	const columns = [
		"country",
		"state",
		"locality",
		"postcode",
		"street_name",
		"street_type",
		"street_suffix",
		"building_name",
		"flat_type",
		"flat_number",
		"level_type",
		"level_number",
		"number_first",
		"number_last",
		"longitude",
		"latitude",
		"confidence",
		"gnaf_pid",
	].join(", ");

	execSync(
		`psql "${DATABASE_URL}" -c "\\copy addresses(${columns}) FROM '${tsvPath}'"`,
		{ stdio: "inherit", timeout: 600_000 }
	);
}

async function main() {
	console.log("G-NAF Import Script (COPY mode)");
	console.log("===============================");
	console.log(`States: ${statesToProcess.join(", ")}`);

	// Check psql is available
	try {
		execSync("which psql", { stdio: "pipe" });
	} catch {
		console.error(
			"psql is required for COPY import. Install with: brew install libpq"
		);
		process.exit(1);
	}

	// Extract zip if needed
	if (existsSync(STANDARD_DIR)) {
		console.log(`\nUsing existing extraction at ${EXTRACT_DIR}`);
	} else {
		console.log(`\nExtracting zip to ${EXTRACT_DIR}...`);
		mkdirSync(EXTRACT_DIR, { recursive: true });
		execSync(`unzip -o "${ZIP_PATH}" -d "${EXTRACT_DIR}"`, {
			stdio: "inherit",
		});
	}

	mkdirSync(CSV_DIR, { recursive: true });

	// Create table via psql
	console.log("\nCreating addresses table...");
	runPsql(`
		CREATE TABLE IF NOT EXISTS addresses (
			id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
			country VARCHAR(2) NOT NULL,
			state VARCHAR(10) NOT NULL,
			locality TEXT NOT NULL,
			postcode VARCHAR(10),
			street_name TEXT NOT NULL,
			street_type VARCHAR(20),
			street_suffix VARCHAR(10),
			building_name TEXT,
			flat_type VARCHAR(10),
			flat_number VARCHAR(10),
			level_type VARCHAR(10),
			level_number VARCHAR(10),
			number_first VARCHAR(15),
			number_last VARCHAR(15),
			longitude REAL NOT NULL,
			latitude REAL NOT NULL,
			confidence INTEGER,
			gnaf_pid VARCHAR(30)
		)
	`);

	let grandTotal = 0;

	for (const state of statesToProcess) {
		console.log(`\n========== ${state} ==========`);

		// Phase 1: Generate CSV
		console.log("  Phase 1: Generating TSV...");
		const { path: tsvPath, count } = await generateCsv(state);
		if (count === 0) {
			continue;
		}

		const fileSize = statSync(tsvPath).size;
		console.log(`  TSV: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

		// Phase 2: COPY into Neon
		console.log("  Phase 2: COPY into Neon...");
		const start = Date.now();
		copyFile(tsvPath);
		const elapsed = ((Date.now() - start) / 1000).toFixed(1);
		console.log(
			`  COPY complete: ${count.toLocaleString()} rows in ${elapsed}s`
		);

		grandTotal += count;
	}

	// Create indexes
	console.log("\n\nCreating indexes...");
	const indexes = [
		"CREATE INDEX IF NOT EXISTS idx_addresses_country ON addresses (country)",
		"CREATE INDEX IF NOT EXISTS idx_addresses_state ON addresses (country, state)",
		"CREATE INDEX IF NOT EXISTS idx_addresses_postcode ON addresses (postcode)",
		"CREATE INDEX IF NOT EXISTS idx_addresses_locality ON addresses (country, state, locality)",
		"CREATE INDEX IF NOT EXISTS idx_addresses_street ON addresses (locality, street_name)",
		"CREATE INDEX IF NOT EXISTS idx_addresses_gnaf_pid ON addresses (gnaf_pid)",
	];
	for (const idx of indexes) {
		const name = idx.split("IF NOT EXISTS ")[1]?.split(" ON")[0];
		console.log(`  ${name}...`);
		runPsql(idx);
	}

	// PostGIS
	console.log("\nEnabling PostGIS and spatial index...");
	runPsql("CREATE EXTENSION IF NOT EXISTS postgis");
	runPsql(
		"ALTER TABLE addresses ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)"
	);
	console.log("  Populating geometry column (this may take a few minutes)...");
	runPsql(
		"UPDATE addresses SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE geom IS NULL"
	);
	runPsql(
		"CREATE INDEX IF NOT EXISTS idx_addresses_geom ON addresses USING gist(geom)"
	);

	console.log("\n===============================");
	console.log("Import complete!");
	console.log(`Total addresses: ${grandTotal.toLocaleString()}`);

	// Cleanup
	console.log("\nCleaning up...");
	rmSync(EXTRACT_DIR, { recursive: true, force: true });
	rmSync(CSV_DIR, { recursive: true, force: true });
	console.log("Done!");
}

main().catch((err) => {
	console.error("Import failed:", err);
	process.exit(1);
});
