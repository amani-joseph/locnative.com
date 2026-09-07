import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AUTOCOMPLETE_SOURCE = readFileSync(
	fileURLToPath(new URL("./autocomplete.ts", import.meta.url)),
	"utf8"
);
const SCHEMA_SOURCE = readFileSync(
	fileURLToPath(new URL("../schema/addresses.ts", import.meta.url)),
	"utf8"
);
const MIGRATION_SOURCE = readFileSync(
	fileURLToPath(
		new URL(
			"../../drizzle/0021_postcode_locality_skip_scan.sql",
			import.meta.url
		)
	),
	"utf8"
);

const POSTCODE_SEARCH = AUTOCOMPLETE_SOURCE.slice(
	AUTOCOMPLETE_SOURCE.indexOf("async function postcodeSearch("),
	AUTOCOMPLETE_SOURCE.indexOf("async function localitySearch(")
);
const POSTCODE_INDEX_DEFINITION =
	/index\("idx_addresses_country_postcode_locality_state_id"\)\.on\(\s*table\.country,\s*table\.postcode,\s*table\.locality,\s*sql`coalesce\(\$\{table\.state\}, ''\)`,\s*table\.id\s*\)/;
const POSTCODE_INDEX_MIGRATION =
	/\("country", "postcode", "locality", coalesce\("state", ''\), "id"\)/;
const RECURSION_DEPTH_BOUND = /WHERE k\.depth < \$\{limit\}/;

describe("postcode search performance invariant", () => {
	it("uses a limit-bounded loose index scan instead of sorting every address", () => {
		expect(POSTCODE_SEARCH).toContain("WITH RECURSIVE keys");
		expect(POSTCODE_SEARCH).toMatch(RECURSION_DEPTH_BOUND);
		expect(POSTCODE_SEARCH).not.toContain("SELECT DISTINCT ON");
	});

	it("defines an index in postcode skip-scan order", () => {
		expect(SCHEMA_SOURCE).toMatch(POSTCODE_INDEX_DEFINITION);
		expect(MIGRATION_SOURCE).toMatch(POSTCODE_INDEX_MIGRATION);
	});
});
