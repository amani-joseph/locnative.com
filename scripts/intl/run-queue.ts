/**
 * Sequential country rollout runner (pipeline spec §5, Europe campaign).
 *
 * Usage:
 *   bun scripts/intl/run-queue.ts --db <url|@file> [--countries CC,CC,...]
 *
 * - Loads each registered country via ingest.ts, smallest-first by default.
 * - Skips countries that already have rows (safe to re-run after a failure).
 * - Pipelines: while country N stages/promotes (DB-bound), country N+1's
 *   Overture extract (S3/CPU-bound) runs concurrently via prefetch.ts.
 *   /tmp holds at most one prefetched CSV ahead (~<=3 GB).
 * - Retries transient failures (Neon compute restarts) 3x with 60s backoff;
 *   detects the committed-but-ack-lost case by re-checking row presence.
 * - Stops on persistent failure; progress is in ingest.ts's manifest.json.
 */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { COUNTRIES } from "./lib/source-registry";

/** Smallest-first default queue; only Overture-adapter countries. */
const DEFAULT_ORDER = [
	"FO",
	"LI",
	"LU",
	"IS",
	"LV",
	"SI",
	"LT",
	"HR",
	"SK",
	"EE",
	"AT",
	"RS",
	"CZ",
	"CH",
	"NO",
	"FI",
	"DK",
	"PT",
	"BE",
	"PL",
	"NL",
	"ES",
	"DE",
	"IT",
	"FR",
];

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60_000;
const INGEST_PATH = new URL("ingest.ts", import.meta.url).pathname;
const PREFETCH_PATH = new URL("prefetch.ts", import.meta.url).pathname;

function parseArgs(argv: string[]): { db: string; countries: string[] } {
	const flag = (name: string): string | undefined => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	let db = flag("db") ?? "";
	if (db.startsWith("@")) {
		db = readFileSync(db.slice(1), "utf-8").trim();
	}
	if (!db) {
		throw new Error("--db is required (url or @file)");
	}
	const countries = (flag("countries")?.split(",") ?? DEFAULT_ORDER)
		.map((c) => c.trim().toUpperCase())
		.filter((c) => COUNTRIES[c]?.adapter === "overture");
	return { db, countries };
}

function loadedCountries(db: string): Set<string> {
	const out = execFileSync(
		"psql",
		[
			db,
			"-v",
			"ON_ERROR_STOP=1",
			"-tAc",
			"SELECT DISTINCT country FROM addresses;",
		],
		{ encoding: "utf-8" }
	);
	return new Set(out.split("\n").filter(Boolean));
}

/** Fire-and-track extract of the next country; failures are non-fatal (cache miss). */
function startPrefetch(country: string): Promise<void> {
	return new Promise((resolve) => {
		const child = spawn("bun", [PREFETCH_PATH, country], {
			stdio: ["ignore", "inherit", "inherit"],
		});
		child.on("exit", (code) => {
			if (code !== 0) {
				console.log(`prefetch ${country} failed — ingest will extract inline`);
			}
			resolve();
		});
		child.on("error", () => resolve());
	});
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration loop keeps retry/prefetch flow together
async function main(): Promise<void> {
	const { db, countries } = parseArgs(process.argv.slice(2));
	const done = loadedCountries(db);

	const queue = countries.filter((c) => !done.has(c));
	const skipped = countries.filter((c) => done.has(c));
	if (skipped.length > 0) {
		console.log(`skipping (already loaded): ${skipped.join(", ")}`);
	}
	console.log(`queue (${queue.length}): ${queue.join(", ")}`);

	let pendingPrefetch: { country: string; done: Promise<void> } | null = null;

	for (const [i, country] of queue.entries()) {
		const startedAt = Date.now();
		console.log(`\n===== ${country} =====`);

		// Wait for this country's prefetch (started during the previous load).
		if (pendingPrefetch?.country === country) {
			await pendingPrefetch.done;
			pendingPrefetch = null;
		}

		// Kick off the next country's extract while this one loads — unless
		// PREFETCH=0. On a near-full disk, two concurrent DuckDB extracts spill
		// sort/hash temp simultaneously and can exhaust the volume; disabling
		// prefetch keeps at most one CSV (+ its temp) on disk at a time.
		const next = queue[i + 1];
		if (process.env.PREFETCH !== "0" && next && !pendingPrefetch) {
			pendingPrefetch = { country: next, done: startPrefetch(next) };
		}

		let succeeded = false;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS && !succeeded; attempt++) {
			if (attempt > 1) {
				console.log(`retry ${attempt}/${MAX_ATTEMPTS} for ${country} in 60s…`);
				execFileSync("sleep", [String(RETRY_DELAY_MS / 1000)]);
			}
			const result = spawnSync(
				"bun",
				[INGEST_PATH, country, "--db", db, "--use-cached-csv"],
				{ stdio: "inherit" }
			);
			if (result.status === 0) {
				succeeded = true;
				break;
			}
			// Transient compute restarts (Neon apply_config/suspend) kill connections
			// mid-step. Promote is transactional, so a failure leaves either 0 rows
			// (retry cleanly) or all rows (commit succeeded, ack lost — treat as done).
			if (loadedCountries(db).has(country)) {
				console.log(
					`${country}: rows present after failure — promote committed, ack lost. Continuing.`
				);
				succeeded = true;
			}
		}
		if (!succeeded) {
			throw new Error(
				`${country} failed ${MAX_ATTEMPTS}x — queue stopped; re-run to resume`
			);
		}
		const mins = ((Date.now() - startedAt) / 60_000).toFixed(1);
		console.log(`===== ${country} done in ${mins} min =====`);
	}
	console.log("\nqueue complete");
}

await main();
