# API Latency & Cost Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the two production hang-class bugs (`addresses/nearby` and forward `geocode`) and the dashboard/cost concerns from the 2026-06 API audits, verified against the real 173.8M-row prod table.

**Architecture:** Pure query-plan fixes first (no DDL, no new indexes — the needed indexes already exist): swap `ORDER BY ST_Distance(...)` for the geography KNN operator `<->`, and anchor the fuzzy Tier-3 search so it cannot full-scan. Then add a pooled session-capable Neon client on hot paths as a server-side `statement_timeout` cost backstop. Finally parallelize one sequential dashboard read.

**Tech Stack:** TypeScript, oRPC, Drizzle ORM, PostGIS (geometry/geography, `pg_trgm`, `fuzzystrmatch`), Neon Postgres (`@neondatabase/serverless`), Cloudflare Workers, Vitest.

**Source spec:** `docs/superpowers/specs/2026-06-14-api-latency-cost-design.md`

**Rollout order (refined from spec):** A1 → A2 → A4 → A3. Both P0 hangs (A1, A2) are fixed by query changes alone with zero driver risk; A4 is defense-in-depth; A3 is cleanup. Each task is independently shippable.

---

## File structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `packages/api/src/routers/public-http.ts` | `nearby` + `reverse` handlers — change ORDER BY to `<->` | 1 |
| `scripts/verify-spatial-latency.mjs` (new) | Runnable EXPLAIN/latency check against a `DATABASE_URL`; reused as the proof for query-plan tasks | 1, 2 |
| `packages/database/src/queries/query-tokens.ts` (new) | Pure helper: extract the anchor token from a search string (unit-tested) | 2 |
| `packages/database/src/queries/query-tokens.test.ts` (new) | Unit tests for the pure token helper | 2 |
| `packages/database/src/queries/autocomplete.ts` | AND the anchor clause into all three Tier-3 fallbacks | 2 |
| `packages/database/src/pooled-client.ts` (new) | Pooled, session-capable Neon client + `withStatementTimeout` wrapper | 3 |
| `packages/database/src/index.ts` | Export the pooled client + wrapper | 3 |
| `scripts/spike-pooled-driver.mjs` (new) | Spike: confirm `Pool`/WebSocket works under the Workers runtime constraints | 3 |
| `packages/api/src/db.ts` | Add a pooled db instance alongside the existing `neon-http` `db` | 3 |
| `packages/api/src/routers/public/geocode.ts`, `public-http.ts` | Route the geocode/nearby/reverse reads through the timeout wrapper | 3 |
| `packages/api/src/routers/domains/projects.ts` | Parallelize the two sequential reads in `list` + `listApiKeyOptions` | 4 |

---

## Task 1: A1 — nearby/reverse geography KNN rewrite (P0 #1)

**Files:**
- Modify: `packages/api/src/routers/public-http.ts:125` (nearby ORDER BY), `:183` (reverse ORDER BY)
- Create: `scripts/verify-spatial-latency.mjs`

- [ ] **Step 1: Write the verification script (this is the regression check — the repo has no DB test harness, so a runnable EXPLAIN-shape assertion is the proof).**

Create `scripts/verify-spatial-latency.mjs`:

```js
// Usage: DATABASE_URL=... node scripts/verify-spatial-latency.mjs
// Asserts the nearby query plan is index-ordered KNN (no Sort node) and fast.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL");
  process.exit(2);
}
const pool = new Pool({ connectionString: url });

const cases = [
  { name: "Sydney r=2000", lng: 151.2093, lat: -33.8688, r: 2000 },
  { name: "Melbourne r=1000", lng: 144.9631, lat: -37.8136, r: 1000 },
  { name: "Ocean/no-match r=5000", lng: 155.0, lat: -40.0, r: 5000 },
];

let failed = 0;
const client = await pool.connect();
try {
  await client.query("SET statement_timeout = '10s'");
  for (const c of cases) {
    const point = `ST_SetSRID(ST_MakePoint(${c.lng},${c.lat}),4326)::geography`;
    const sql = `EXPLAIN (ANALYZE, BUFFERS) SELECT id,
        ST_Distance(geom::geography, ${point}) d
      FROM addresses
      WHERE ST_DWithin(geom::geography, ${point}, ${c.r})
      ORDER BY geom::geography <-> ${point}
      LIMIT 10`;
    try {
      const r = await client.query(sql);
      const plan = r.rows.map((row) => row["QUERY PLAN"]).join("\n");
      const usesKnn = /Order By:.*<->/.test(plan);
      const noSort = !/\bSort\b/.test(plan);
      const execMs = Number((plan.match(/Execution Time: ([\d.]+) ms/) || [])[1] ?? "99999");
      const ok = usesKnn && noSort && execMs < 2000;
      console.log(`${ok ? "PASS" : "FAIL"} ${c.name}: knn=${usesKnn} noSort=${noSort} exec=${execMs}ms`);
      if (!ok) failed++;
    } catch (e) {
      console.log(`FAIL ${c.name}: ${e.message}`);
      failed++;
    }
  }
} finally {
  client.release();
  await pool.end();
}
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the verification script BEFORE the code change to capture the failing baseline.**

Run: `DATABASE_URL="<owner-supplied read-only url>" node scripts/verify-spatial-latency.mjs`
Expected: the script asserts the *new* KNN shape, so against the **current** code path it is irrelevant — but run the equivalent current-query EXPLAIN manually to confirm the baseline hangs. Quick baseline check:

Run:
```bash
DATABASE_URL="..." node -e 'import("@neondatabase/serverless").then(async ({Pool,neonConfig})=>{neonConfig.webSocketConstructor=(await import("ws")).default;const p=new Pool({connectionString:process.env.DATABASE_URL});const c=await p.connect();await c.query("SET statement_timeout=\x275s\x27");try{await c.query("EXPLAIN ANALYZE SELECT id FROM addresses WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(151.2093,-33.8688),4326)::geography,2000) ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(151.2093,-33.8688),4326)::geography) LIMIT 10")}catch(e){console.log("BASELINE (expected):",e.message)}finally{c.release();await p.end()}})'
```
Expected: `BASELINE (expected): canceling statement due to statement timeout` (confirms the current `ST_Distance` ORDER BY hangs).

- [ ] **Step 3: Change the `nearby` ORDER BY to the geography KNN operator.**

In `packages/api/src/routers/public-http.ts`, the `nearby` handler currently has (line ~125):

```ts
			.orderBy(sql`ST_Distance(${geomGeo}, ${point})`)
```

Replace with:

```ts
			// KNN operator <-> is index-ordered via idx_addresses_geom_geography and
			// stops at LIMIT N. ST_Distance() (a function) forces a full Sort of the
			// radius bbox candidates — the cause of the >25s hang. See
			// docs/superpowers/specs/2026-06-14-api-latency-cost-design.md (A1).
			.orderBy(sql`${geomGeo} <-> ${point}`)
```

Leave the `ST_DWithin(...)` filter (line ~100) and the `ST_Distance(...)` SELECT projection (line ~121) unchanged — the SELECT still returns exact metres, now computed only on the LIMIT-N rows.

- [ ] **Step 4: Change the `reverse` ORDER BY the same way.**

In the `reverse` handler (line ~183):

```ts
			.orderBy(sql`ST_Distance(${geomGeo}, ${point})`)
```

Replace with:

```ts
			.orderBy(sql`${geomGeo} <-> ${point}`)
```

- [ ] **Step 5: Run the verification script to confirm the fix.**

Run: `DATABASE_URL="..." node scripts/verify-spatial-latency.mjs`
Expected output:
```
PASS Sydney r=2000: knn=true noSort=true exec=<~500>ms
PASS Melbourne r=1000: knn=true noSort=true exec=<~540>ms
PASS Ocean/no-match r=5000: knn=true noSort=true exec=<~1>ms
```

- [ ] **Step 6: Run the existing test suite + typecheck.**

Run: `pnpm --filter @locnative/api test && pnpm --filter @locnative/api check-types`
Expected: all existing tests pass; `tsc --noEmit` clean.

- [ ] **Step 7: Commit.**

```bash
git add packages/api/src/routers/public-http.ts scripts/verify-spatial-latency.mjs
git commit -m "perf(geo): index-ordered KNN for nearby/reverse (fix >25s hang)"
```

---

## Task 2: A2 — anchor the fuzzy Tier-3 search (P0 #2)

The Tier-3 path (reached by forward geocode and autocomplete for 8+ char queries that miss the prefix tiers) runs three unindexed full-table scans over 173.8M rows: `word_similarity <%`, `levenshtein`, `dmetaphone`. We AND a selective first-token prefix anchor into all three so none can full-scan. Unresolvable POI-style queries then return empty fast → the geocode handler already maps empty to a 404.

**Files:**
- Create: `packages/database/src/queries/query-tokens.ts`, `packages/database/src/queries/query-tokens.test.ts`
- Create: `packages/database/vitest.config.ts`; Modify: `packages/database/package.json` (add vitest + `test` script)
- Modify: `packages/database/src/queries/autocomplete.ts` (the `tieredSearch` Tier-3 block, lines ~385–442)

> **Pre-req (test infra):** The `@locnative/database` package has **no vitest** (only `db:*` scripts) and an orphaned `parse-unit-address.test.ts` that nothing runs. Before Step 1, stand up vitest in this package — this also covers Task 3's `pooled-client.test.ts`.

- [ ] **Step 0: Add vitest to the database package.**

Add to `packages/database/package.json` devDependencies and scripts (match the version vitest resolves to in `packages/api`):

```jsonc
  "scripts": {
    "test": "vitest run",
    // ...existing db:* scripts unchanged
  },
  "devDependencies": {
    "vitest": "^4.1.4",
    // ...existing devDeps unchanged
  }
```

Create `packages/database/vitest.config.ts` (pure-logic tests need no DB env, so keep it minimal):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Run: `pnpm install` then `pnpm --filter @locnative/database test`
Expected: vitest runs and the pre-existing `parse-unit-address.test.ts` passes (confirms the harness works).

- [ ] **Step 1: Write the failing test for the pure anchor-token helper.**

Create `packages/database/src/queries/query-tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { anchorToken } from "./query-tokens.ts";

describe("anchorToken", () => {
  it("returns the first whitespace-delimited token, lowercased", () => {
    expect(anchorToken("George Street")).toBe("george");
  });
  it("strips a leading unit/number so the anchor matches stored street prefixes", () => {
    expect(anchorToken("10 Bourke St")).toBe("bourke");
  });
  it("returns null for tokens shorter than 3 chars (not selective enough)", () => {
    expect(anchorToken("a b")).toBeNull();
    expect(anchorToken("")).toBeNull();
  });
  it("ignores a purely numeric first token and uses the next word", () => {
    expect(anchorToken("123 45 Main")).toBe("main");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `pnpm --filter @locnative/database test query-tokens`
Expected: FAIL — `Cannot find module './query-tokens.ts'`.

- [ ] **Step 3: Implement the pure helper.**

Create `packages/database/src/queries/query-tokens.ts`:

```ts
const MIN_ANCHOR_LEN = 3;

/**
 * Pick a selective prefix anchor token from a free-text address query.
 *
 * Tier-3 fuzzy fallbacks (word_similarity / levenshtein / dmetaphone) are
 * unindexed over the full addresses table. ANDing `search_text ILIKE
 * '<anchor>%'` bounds their candidate set. We skip leading unit/house numbers
 * (which are stored mid-string) and require >= 3 chars to stay selective.
 *
 * Returns null when no token qualifies — callers then skip the fuzzy tier.
 */
export function anchorToken(query: string): string | null {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^\d+$/.test(t));
  const first = tokens.find((t) => t.length >= MIN_ANCHOR_LEN);
  return first ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `pnpm --filter @locnative/database test query-tokens`
Expected: PASS (4 tests).

- [ ] **Step 5: Apply the anchor in the Tier-3 block of `autocomplete.ts`.**

At the top of `autocomplete.ts`, add the import (near the other local imports):

```ts
import { anchorToken } from "./query-tokens.ts";
```

In `tieredSearch`, replace the Tier-3 block (currently starting at the `// Tier 3 (8+ chars)` comment, ~line 385) so each of the three fallbacks ANDs the anchor. Build the anchor clause once and thread it into all three `buildWhereClause` calls:

```ts
	// Tier 3 (8+ chars): Word similarity + levenshtein + phonetic.
	// All three are unindexed over the full table, so AND a selective prefix
	// anchor to bound the candidate set. If no anchor qualifies, skip Tier 3
	// entirely (returns [] -> geocode maps to 404, autocomplete to no results).
	// See docs/superpowers/specs/2026-06-14-api-latency-cost-design.md (A2).
	const anchor = anchorToken(trimmed);
	if (!anchor) {
		return [];
	}
	const anchorClause = sql`search_text ILIKE ${`${anchor}%`}`;
	const tier3Filters = [...filterClauses, anchorClause];

	await db.execute(sql`SELECT set_limit(${TRIGRAM_SIMILARITY_THRESHOLD})`);

	const tier3Where = buildWhereClause(
		sql`search_text <%% ${trimmed}::text`,
		tier3Filters
	);

	const result = await db.execute(sql`
		SELECT ${SELECT_COLUMNS},
			word_similarity(search_text, ${trimmed}::text) as similarity_score
		FROM addresses
		WHERE ${tier3Where}
		ORDER BY ${orderBy}
		LIMIT ${limit}
	`);

	const rows = result.rows as unknown as RawAddressRow[];

	if (rows.length > 0) {
		return rows.map(mapRowToResult);
	}

	// Levenshtein fallback (distance <= 2) — anchored.
	const levenshteinWhere = buildWhereClause(
		sql`levenshtein(lower(left(search_text, ${len + 2})), lower(${trimmed})) <= ${LEVENSHTEIN_LONG_MAX_DISTANCE}`,
		tier3Filters
	);

	const levenshteinResult = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 0.5 as similarity_score
		FROM addresses
		WHERE ${levenshteinWhere}
		ORDER BY ${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	const levenshteinRows = levenshteinResult.rows as unknown as RawAddressRow[];

	if (levenshteinRows.length > 0) {
		return levenshteinRows.map(mapRowToResult);
	}

	// Phonetic fallback (dmetaphone) — anchored.
	const phoneticWhere = buildWhereClause(
		sql`dmetaphone(left(search_text, 20)) = dmetaphone(${trimmed})`,
		tier3Filters
	);

	const phoneticResult = await db.execute(sql`
		SELECT ${SELECT_COLUMNS}, 0.3 as similarity_score
		FROM addresses
		WHERE ${phoneticWhere}
		ORDER BY ${buildOrderBy(latitude, longitude)}
		LIMIT ${limit}
	`);

	return (phoneticResult.rows as unknown as RawAddressRow[]).map(
		mapRowToResult
	);
```

- [ ] **Step 6: Add an EXPLAIN check that the anchored Tier-3 query is bounded (no full Seq Scan).**

Run (substitute a real prod `DATABASE_URL`):
```bash
DATABASE_URL="..." node -e 'import("@neondatabase/serverless").then(async ({Pool,neonConfig})=>{neonConfig.webSocketConstructor=(await import("ws")).default;const p=new Pool({connectionString:process.env.DATABASE_URL});const c=await p.connect();await c.query("SET statement_timeout=\x278s\x27");await c.query("SELECT set_limit(0.3)");const r=await c.query("EXPLAIN ANALYZE SELECT id, word_similarity(search_text,\x27Sydney Opera House\x27) s FROM addresses WHERE search_text <% \x27Sydney Opera House\x27 AND search_text ILIKE \x27sydney%\x27 ORDER BY s DESC LIMIT 1");console.log(r.rows.map(x=>x["QUERY PLAN"]).join("\n"));c.release();await p.end()})'
```
Expected: an index-backed plan (Bitmap/Index Scan using a trigram or btree index), `Execution Time` well under 2000 ms — NOT a `Seq Scan on addresses` over 173M rows.

- [ ] **Step 7: Run the existing autocomplete + geocode test suites.**

Run: `pnpm --filter @locnative/database test && pnpm --filter @locnative/api test geocode`
Expected: all pass (known-good queries like `10 Bourke St`, `George Street` still resolve).

- [ ] **Step 8: Commit.**

```bash
git add packages/database/src/queries/query-tokens.ts packages/database/src/queries/query-tokens.test.ts packages/database/src/queries/autocomplete.ts
git commit -m "perf(geocode): anchor Tier-3 fuzzy search to bound candidate set (fix >30s hang)"
```

---

## Task 3: A4 — pooled-driver statement_timeout backstop

Defense-in-depth: a server-side `statement_timeout` cancels any runaway query (stops Neon compute billing) without a global `ALTER ROLE`. `neon-http` is stateless so a per-request `SET` does not persist — use a pooled, session-capable client (`drizzle-orm/neon-serverless` + `Pool`) which supports a transaction in which `SET LOCAL statement_timeout` holds. **Spike first** — confirm `Pool`/WebSocket runs under the Workers runtime.

**Files:**
- Create: `scripts/spike-pooled-driver.mjs`, `packages/database/src/pooled-client.ts`
- Modify: `packages/database/src/index.ts`, `packages/api/src/db.ts`, `packages/api/src/routers/public/geocode.ts`, `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Spike — verify the pooled WebSocket driver works under Workers constraints.**

Create `scripts/spike-pooled-driver.mjs`:

```js
// Usage: DATABASE_URL=... node scripts/spike-pooled-driver.mjs
// Confirms a pooled session can hold SET LOCAL statement_timeout in a tx and
// that a deliberately slow query is cancelled server-side within budget.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const t0 = Date.now();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout = '1500ms'");
  await client.query("SELECT pg_sleep(5)"); // should be cancelled at ~1.5s
  console.log("UNEXPECTED: slept full 5s");
} catch (e) {
  const ms = Date.now() - t0;
  console.log(`OK cancelled after ${ms}ms: ${e.message}`);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end();
}
```

Run: `DATABASE_URL="..." node scripts/spike-pooled-driver.mjs`
Expected: `OK cancelled after ~1500ms: canceling statement due to statement timeout`.

**Decision gate:** If the spike fails under the actual Workers runtime (not just node) — i.e. `Pool`/WebSocket is unavailable under the current `wrangler` `compatibility_date`/flags — STOP and fall back: skip the pooled client and instead request owner approval for a role-scoped `ALTER ROLE <api_role> SET statement_timeout = '5s'` (DDL, needs approval per project rule). Record the decision in the commit message. The A1/A2 query fixes already remove the hangs, so this task is non-blocking.

- [ ] **Step 2: Write the failing test for the timeout-wrapper helper.**

Create `packages/database/src/pooled-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { statementTimeoutSql } from "./pooled-client.ts";

describe("statementTimeoutSql", () => {
  it("formats an integer millisecond budget as a SET LOCAL statement", () => {
    expect(statementTimeoutSql(3000)).toBe("SET LOCAL statement_timeout = 3000");
  });
  it("rejects non-positive budgets", () => {
    expect(() => statementTimeoutSql(0)).toThrow();
    expect(() => statementTimeoutSql(-1)).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

Run: `pnpm --filter @locnative/database test pooled-client`
Expected: FAIL — `Cannot find module './pooled-client.ts'`.

- [ ] **Step 4: Implement the pooled client + wrapper.**

Create `packages/database/src/pooled-client.ts`:

```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index.ts";

/** Build the SET LOCAL statement (exported for unit testing). */
export function statementTimeoutSql(budgetMs: number): string {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new Error(`Invalid statement_timeout budget: ${budgetMs}`);
  }
  return `SET LOCAL statement_timeout = ${Math.floor(budgetMs)}`;
}

export function createPooledDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema });
}

export type PooledDatabase = ReturnType<typeof createPooledDb>;

/**
 * Run `fn` inside a transaction bounded by a server-side statement_timeout.
 * A runaway query is cancelled by Postgres (stops Neon compute billing)
 * rather than left running after the Worker aborts the HTTP wait.
 */
export async function withStatementTimeout<T>(
  db: PooledDatabase,
  budgetMs: number,
  fn: (tx: PooledDatabase) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(statementTimeoutSql(budgetMs)));
    return fn(tx as unknown as PooledDatabase);
  });
}
```

Note: requires `neonConfig.webSocketConstructor` to be set in the Workers entry (Workers provides a global `WebSocket`; in Node scripts set it via `ws`). Add to the Workers server bootstrap if not already present:

```ts
// apps/server/src/index.ts (near imports), guarded so it only runs in Workers
import { neonConfig } from "@neondatabase/serverless";
// Workers exposes a global WebSocket; bind it for the pooled Neon driver.
neonConfig.webSocketConstructor = (globalThis as { WebSocket?: unknown })
  .WebSocket as never;
```

- [ ] **Step 5: Run the test to verify it passes.**

Run: `pnpm --filter @locnative/database test pooled-client`
Expected: PASS (2 tests).

- [ ] **Step 6: Export from the database package.**

In `packages/database/src/index.ts`, add:

```ts
export { createPooledDb, withStatementTimeout } from "./pooled-client.ts";
export type { PooledDatabase } from "./pooled-client.ts";
```

- [ ] **Step 7: Add a pooled db instance in the api package.**

In `packages/api/src/db.ts`, alongside the existing `neon-http` `db`, add a lazily-created pooled instance from the same `DATABASE_URL`:

```ts
import { createPooledDb } from "@locnative/database";
// ...existing neon-http `db` export stays unchanged...
export const pooledDb = createPooledDb(serverEnv.DATABASE_URL);
```

(Match the existing env access pattern in this file for `DATABASE_URL`.)

- [ ] **Step 8: Widen the shared query helper to accept either driver.**

`autocompleteAddresses` is typed `(db: Database, ...)` where `Database` is the `neon-http` client. The pooled transaction is a different Drizzle type, so passing it would not typecheck. The function only uses `db.execute(sql\`...\`)`, so widen the parameter to a union. In `packages/database/src/index.ts` (or a small shared types module it re-exports), add:

```ts
import type { PooledDatabase } from "./pooled-client.ts";
import type { Database } from "./client.ts";
/** Either Neon driver — both expose the Drizzle `.execute()` used by query helpers. */
export type AnyDatabase = Database | PooledDatabase;
```

In `packages/database/src/queries/autocomplete.ts`, change the `autocompleteAddresses` signature (and the internal helpers it passes `db` to: `tieredSearch`, `prefixSearch`, `parsedPathFallback`, `ilikeFallback`) from `db: Database` to `db: AnyDatabase`, importing `AnyDatabase`. No body changes — they only call `.execute()`.

- [ ] **Step 9: Wrap the geocode + autocomplete handler reads (budget 3000 ms).**

In `packages/api/src/routers/public/geocode.ts`, add imports `import { withStatementTimeout } from "@locnative/database";` and `import { pooledDb } from "../../db.ts";`, then replace:

```ts
		const { results } = await autocompleteAddresses(context.db, query, {
			country,
			state,
			limit: 1,
		});
```

with:

```ts
		const { results } = await withStatementTimeout(pooledDb, 3000, (tx) =>
			autocompleteAddresses(tx, query, { country, state, limit: 1 })
		);
```

In `packages/api/src/routers/public-http.ts`, the `autocomplete` handler (~line 62) currently does:

```ts
		const { results, parsedQuery } = await autocompleteAddresses(
			context.db,
			input.q,
			{ country: input.country, state: input.state, limit: input.limit, latitude: input.lat, longitude: input.lon }
		);
```

Replace with (add the same two imports to this file):

```ts
		const { results, parsedQuery } = await withStatementTimeout(
			pooledDb,
			3000,
			(tx) =>
				autocompleteAddresses(tx, input.q, {
					country: input.country,
					state: input.state,
					limit: input.limit,
					latitude: input.lat,
					longitude: input.lon,
				})
		);
```

- [ ] **Step 10: Wrap the nearby + reverse selects (budget 5000 ms).**

In `packages/api/src/routers/public-http.ts`, the `nearby` handler runs `const rows = await context.db.select({...}).from(addresses).where(and(...filters)).orderBy(sql\`${geomGeo} <-> ${point}\`).limit(limit);`. Wrap the whole chain so it executes on the timeout-bounded transaction:

```ts
		const rows = await withStatementTimeout(pooledDb, 5000, (tx) =>
			tx
				.select({
					id: addresses.id,
					country: addresses.country,
					state: addresses.state,
					locality: addresses.locality,
					postcode: addresses.postcode,
					streetName: addresses.streetName,
					streetType: addresses.streetType,
					numberFirst: addresses.numberFirst,
					numberLast: addresses.numberLast,
					buildingName: addresses.buildingName,
					flatType: addresses.flatType,
					flatNumber: addresses.flatNumber,
					longitude: addresses.longitude,
					latitude: addresses.latitude,
					distance: sql<number>`ST_Distance(${geomGeo}, ${point})`.as("distance"),
				})
				.from(addresses)
				.where(and(...filters))
				.orderBy(sql`${geomGeo} <-> ${point}`)
				.limit(limit)
		);
```

Apply the identical transform to the `reverse` handler: wrap its `context.db.select({...}).from(addresses).where(sql\`ST_DWithin(${geomGeo}, ${point}, 200)\`).orderBy(sql\`${geomGeo} <-> ${point}\`).limit(1)` chain in `withStatementTimeout(pooledDb, 5000, (tx) => tx.select({...})...)`, keeping its (larger) select projection unchanged — only `context.db` becomes `tx`.

- [ ] **Step 11: Typecheck + full test + smoke the timeout end-to-end.**

Run: `pnpm --filter @locnative/api check-types && pnpm --filter @locnative/api test`
Expected: clean + green.

Then smoke against a local `wrangler dev` (or staging): a forward-geocode for `Sydney Opera House` returns a fast 404 (not a hang); a normal geocode/nearby returns 200 as before.

- [ ] **Step 12: Commit.**

```bash
git add packages/database/src/pooled-client.ts packages/database/src/pooled-client.test.ts packages/database/src/index.ts packages/api/src/db.ts packages/api/src/routers/public/geocode.ts packages/api/src/routers/public-http.ts apps/server/src/index.ts scripts/spike-pooled-driver.mjs
git commit -m "perf(db): pooled statement_timeout backstop on geocode/nearby/reverse"
```

---

## Task 4: A3 — parallelize sequential dashboard reads

`projects.list` and `projects.listApiKeyOptions` each do two independent reads sequentially (project rows, then `listActiveApiKeyRowsForUser`). Run them with `Promise.all`. `dashboard.getStats` is intentionally NOT changed (EXPLAIN showed 1.5ms exec; its tail is connection variance).

**Files:**
- Modify: `packages/api/src/routers/domains/projects.ts` (`list` ~line 141, `listApiKeyOptions` ~line 167)

- [ ] **Step 1: Parallelize `projects.list`.**

In `projects.ts`, the `list` handler currently awaits `projectRows` then `keyRows` sequentially. Replace the two sequential `await`s:

```ts
		const projectRows = await context.db
			.select({ id: projects.id, name: projects.name, slug: projects.slug, createdAt: projects.createdAt })
			.from(projects)
			.where(and(eq(projects.userId, authUserId), isNull(projects.archivedAt)))
			.orderBy(asc(projects.createdAt));
		const keyRows = await listActiveApiKeyRowsForUser(context.db, authUserId);
```

with a single `Promise.all`:

```ts
		const [projectRows, keyRows] = await Promise.all([
			context.db
				.select({ id: projects.id, name: projects.name, slug: projects.slug, createdAt: projects.createdAt })
				.from(projects)
				.where(and(eq(projects.userId, authUserId), isNull(projects.archivedAt)))
				.orderBy(asc(projects.createdAt)),
			listActiveApiKeyRowsForUser(context.db, authUserId),
		]);
```

- [ ] **Step 2: Parallelize `listApiKeyOptions` the same way.**

In the `listApiKeyOptions` handler, replace the sequential `projectRows` await followed by `listActiveApiKeyRowsForUser` with a single `Promise.all([...])` binding `[projectRows, keyRows]`, mirroring Step 1 (the project select here selects only `{ id, name }`).

- [ ] **Step 3: Typecheck + run the suite.**

Run: `pnpm --filter @locnative/api check-types && pnpm --filter @locnative/api test`
Expected: clean + all existing tests green (behaviour is identical; only concurrency changed).

- [ ] **Step 4: Commit.**

```bash
git add packages/api/src/routers/domains/projects.ts
git commit -m "perf(dashboard): parallelize projects.list reads"
```

---

## Task 5: Final verification & audit refresh

- [ ] **Step 1: Run the test suites + typecheck.**

There is no root `test` script. Run the packages that have tests, plus the turbo typecheck pipeline:

Run: `pnpm --filter @locnative/api test && pnpm --filter @locnative/database test && pnpm --filter @locnative/server test && pnpm check-types`
Expected: all green; `turbo check-types` clean across the workspace.

- [ ] **Step 2: Re-run the endpoint audit latency sweep against the changed endpoints (production or staging) and capture before/after.**

Re-measure `nearby` (radii 100m→5km, Sydney + Melbourne), forward `geocode` (`Sydney Opera House`, `1 George St, Sydney`, `10 Bourke St`), `autocomplete`, and `projects.list`. Confirm: no >2s responses; both former hangs resolved.

- [ ] **Step 3: Append a results addendum to the audit.**

Add a short "Remediation results (2026-06-14)" section to `docs/audits/api-endpoint-audit-2026-06-14.md` with the before/after p50/p95 for the four touched endpoints.

- [ ] **Step 4: Commit.**

```bash
git add docs/audits/api-endpoint-audit-2026-06-14.md
git commit -m "docs(audit): remediation before/after results"
```

---

## Out of scope (tracked separately)

- **A5 — `regions` empty (0 rows):** data-ingestion task, not code. Load boundary/region layers, then re-test `GET /api/v1/regions`.
- **Track B — release hygiene** (`docs/audit/project-audit-2026-06-12.md`): commit uncommitted SSR/playground/map fixes → merge-train to master → billing E2E → SDK npm publish → branch/planning cleanup. Run as an interactive checklist, each step gated on the full test suite.
