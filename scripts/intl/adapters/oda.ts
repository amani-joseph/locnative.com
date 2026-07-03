/**
 * StatCan ODA adapter (Tier-1 for Canada, spec §1B) — downloads per-province
 * zipped CSVs, then one DuckDB pass over all of them emits the canonical
 * staging CSV.
 *
 * Source facts (probed 2026-06-12 on PE):
 * - Reliable columns are the standardized `_pcs` ones (str_name_pcs,
 *   str_type_pcs, str_dir_pcs, city_pcs); raw str_name/str_type often empty.
 * - postal_code coverage varies by provider (PE: 100% null) — caveat, not blocker.
 * - ODA v1 has NO NL/YT/NU data (10 provinces/territories only, ~10M rows).
 * - License: Open Government Licence – Canada; per-source attribution listed
 *   in each zip's Data_Sources.csv.
 *
 * Limit provinces (e.g. smoke tests) with ODA_PROVINCES=PE,NS.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import type { ExtractResult } from "./overture";

const BASE_URL = "https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001";
const WORK_DIR = "/tmp/oda";
const ALL_PROVINCES = [
	"AB",
	"BC",
	"MB",
	"NB",
	"NT",
	"NS",
	"ON",
	"PE",
	"QC",
	"SK",
] as const;
const WHITESPACE_RE = /\s+/;

function provinces(): string[] {
	const env = process.env.ODA_PROVINCES;
	if (!env) {
		return [...ALL_PROVINCES];
	}
	const requested = env.split(",").map((p) => p.trim().toUpperCase());
	const unknown = requested.filter(
		(p) => !ALL_PROVINCES.includes(p as (typeof ALL_PROVINCES)[number])
	);
	if (unknown.length > 0) {
		throw new Error(
			`Unknown ODA provinces: ${unknown.join(", ")} (ODA v1 has no NL/YT/NU)`
		);
	}
	return requested;
}

async function ensureDownloaded(prov: string): Promise<string> {
	mkdirSync(WORK_DIR, { recursive: true });
	const csvPath = `${WORK_DIR}/ODA_${prov}_v1.csv`;
	if (existsSync(csvPath)) {
		return csvPath;
	}
	const zipPath = `${WORK_DIR}/ODA_${prov}_v1.zip`;
	if (!existsSync(zipPath)) {
		console.log(`  downloading ODA ${prov}…`);
		const res = await fetch(`${BASE_URL}/ODA_${prov}_v1.zip`);
		if (!res.ok) {
			throw new Error(`ODA ${prov} download failed: HTTP ${res.status}`);
		}
		await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
	}
	execFileSync("unzip", [
		"-o",
		"-q",
		zipPath,
		`ODA_${prov}_v1.csv`,
		"-d",
		WORK_DIR,
	]);
	return csvPath;
}

/** PRUID -> 2-letter province/territory code (StatCan standard). */
const PRUID_CASE = `CASE TRY_CAST(pruid AS INTEGER)
  WHEN 10 THEN 'NL' WHEN 11 THEN 'PE' WHEN 12 THEN 'NS' WHEN 13 THEN 'NB'
  WHEN 24 THEN 'QC' WHEN 35 THEN 'ON' WHEN 46 THEN 'MB' WHEN 47 THEN 'SK'
  WHEN 48 THEN 'AB' WHEN 59 THEN 'BC' WHEN 60 THEN 'YT' WHEN 61 THEN 'NT'
  WHEN 62 THEN 'NU' ELSE '' END`;

export async function runExtract(outPath: string): Promise<ExtractResult> {
	const csvPaths: string[] = [];
	for (const prov of provinces()) {
		csvPaths.push(await ensureDownloaded(prov));
	}
	const fileList = csvPaths.map((p) => `'${p}'`).join(", ");

	const sql = `
CREATE OR REPLACE MACRO squash(x) AS COALESCE(trim(regexp_replace(x, '\\s+', ' ', 'g')), '');
COPY (
  SELECT * EXCLUDE (rn) FROM (
  SELECT
    'ODA' AS source,
    'CA' AS country,
    ${PRUID_CASE} AS state,
    squash(COALESCE(NULLIF(city_pcs, ''), NULLIF(city, ''), csdname)) AS locality,
    CASE WHEN length(squash(postal_code)) <= 10 THEN squash(upper(postal_code)) ELSE '' END AS postcode,
    squash(COALESCE(NULLIF(str_name_pcs, ''), NULLIF(str_name, ''), street)) AS street_name,
    CASE WHEN length(squash(str_type_pcs)) BETWEEN 1 AND 20 THEN squash(str_type_pcs) END AS street_type,
    CASE WHEN length(squash(str_dir_pcs)) BETWEEN 1 AND 10 THEN squash(str_dir_pcs) END AS street_suffix,
    NULL AS building_name,
    NULL AS flat_type,
    CASE WHEN length(squash(unit)) BETWEEN 1 AND 10 THEN squash(unit) END AS flat_number,
    NULL AS level_type, NULL AS level_number,
    CASE WHEN length(squash(street_no)) BETWEEN 1 AND 15 THEN squash(street_no) END AS number_first,
    NULL AS number_last,
    round(TRY_CAST(longitude AS DOUBLE), 7) AS longitude,
    round(TRY_CAST(latitude AS DOUBLE), 7) AS latitude,
    NULL AS confidence,
    -- source_id dropped (staged but never promoted) — see overture.ts
    row_number() OVER (
      PARTITION BY
        squash(COALESCE(NULLIF(city_pcs, ''), NULLIF(city, ''), csdname)),
        squash(COALESCE(NULLIF(str_name_pcs, ''), NULLIF(str_name, ''), street)),
        CASE WHEN length(squash(street_no)) BETWEEN 1 AND 15 THEN squash(street_no) END,
        CASE WHEN length(squash(unit)) BETWEEN 1 AND 10 THEN squash(unit) END,
        round(TRY_CAST(longitude AS DOUBLE), 5),
        round(TRY_CAST(latitude AS DOUBLE), 5)
    ) AS rn
  -- quote/escape pinned: DuckDB auto-detects quote=empty on these files (most
  -- rows are unquoted), then mis-splits the minority of rows with a quoted
  -- field containing a comma, e.g. full_addr "103, 100 COOPERS CM SW" (AB).
  FROM read_csv([${fileList}], header=true, normalize_names=true, union_by_name=true,
                all_varchar=true, quote='"', escape='"')
  WHERE TRY_CAST(longitude AS DOUBLE) BETWEEN -180 AND 180
    AND TRY_CAST(latitude AS DOUBLE) BETWEEN -90 AND 90
    AND (NULLIF(street_no, '') IS NOT NULL
         OR COALESCE(NULLIF(str_name_pcs, ''), NULLIF(str_name, ''), NULLIF(street, '')) IS NOT NULL)
  ) WHERE rn = 1
) TO '${outPath}' (FORMAT csv, HEADER false);
`;
	execFileSync("duckdb", ["-c", sql], {
		stdio: ["ignore", "inherit", "inherit"],
	});
	const wc = execFileSync("wc", ["-l", outPath], { encoding: "utf-8" });
	const rowCount = Number.parseInt(
		wc.trim().split(WHITESPACE_RE)[0] ?? "0",
		10
	);
	return { csvPath: outPath, rowCount };
}
