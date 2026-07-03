# Database Cost Optimization Execution Plan

This document turns the Neon/Postgres cost review into an execution-ready plan for this repo.

Scope:
- `packages/database/drizzle/*.sql`
- `packages/database/src/schema/addresses.ts`
- `packages/database/src/schema/api-keys.ts`
- `apps/web/src/lib/api-key-auth.ts`
- `packages/database/src/queries/autocomplete.ts`

Goals:
- Guarantee critical PostGIS and reporting indexes in migrations
- Reduce write amplification on authenticated API traffic
- Rebuild autocomplete around an indexed search path
- Add a repeatable `EXPLAIN` checklist for each hot endpoint

## Rollout Order
1. Add baseline migration for PostGIS, trigram, and reporting indexes.
2. Update Drizzle schema definitions to reflect migration-backed indexes.
3. Throttle `lastUsedAt` writes in API key validation.
4. Add autocomplete search column and trigram index.
5. Rewrite autocomplete query to use the new indexed search path.
6. Run `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` before and after each phase.

## PR Checklist

### PR 1: Baseline Infra And Reporting Indexes

Files:
- `packages/database/drizzle/0003_neon_cost_baseline.sql`
- `packages/database/src/schema/addresses.ts`
- `packages/database/src/schema/api-keys.ts`

Checklist:
- [ ] Add `CREATE EXTENSION IF NOT EXISTS postgis`
- [ ] Add `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- [ ] Add `idx_addresses_geom` GiST index on `addresses.geom`
- [ ] Add `idx_api_usage_daily_user_date`
- [ ] Add `idx_api_usage_daily_user_date_endpoint`
- [ ] Mirror supported indexes in Drizzle schema
- [ ] Apply migration in a safe environment first
- [ ] Run `EXPLAIN` on `reverse`, `nearby`, and dashboard queries

Ready-to-paste migration:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_addresses_geom
ON addresses
USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_api_usage_daily_user_date
ON api_usage_daily
USING btree (clerk_user_id, usage_date);

CREATE INDEX IF NOT EXISTS idx_api_usage_daily_user_date_endpoint
ON api_usage_daily
USING btree (clerk_user_id, usage_date, endpoint);
```

Schema patch for `packages/database/src/schema/addresses.ts`:

```ts
index("idx_addresses_geom").using("gist", table.geom),
```

Add it to the existing table index array:

```ts
	(table) => [
		index("idx_addresses_country").on(table.country),
		index("idx_addresses_state").on(table.country, table.state),
		index("idx_addresses_postcode").on(table.postcode),
		index("idx_addresses_locality").on(
			table.country,
			table.state,
			table.locality
		),
		index("idx_addresses_street").on(table.locality, table.streetName),
		index("idx_addresses_gnaf_pid").on(table.gnafPid),
		index("idx_addresses_geom").using("gist", table.geom),
	]
```

Schema patch for `packages/database/src/schema/api-keys.ts` inside `apiUsageDaily`:

```ts
index("idx_api_usage_daily_user_date").on(table.userId, table.usageDate),
index("idx_api_usage_daily_user_date_endpoint").on(
	table.userId,
	table.usageDate,
	table.endpoint
),
```

Full target index block:

```ts
	(table) => [
		uniqueIndex("api_usage_daily_key_date_endpoint").on(
			table.apiKeyId,
			table.usageDate,
			table.endpoint
		),
		index("idx_api_usage_daily_clerk_user_id").on(table.userId),
		index("idx_api_usage_daily_api_key_id").on(table.apiKeyId),
		index("idx_api_usage_daily_project_id").on(table.projectId),
		index("idx_api_usage_daily_user_date").on(table.userId, table.usageDate),
		index("idx_api_usage_daily_user_date_endpoint").on(
			table.userId,
			table.usageDate,
			table.endpoint
		),
	]
```

Operational note:
- If `addresses` is already large in production, prefer a manually-run concurrent index build:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_geom
ON addresses
USING gist (geom);
```

### PR 2: Reduce Write Amplification

Files:
- `apps/web/src/lib/api-key-auth.ts`

Checklist:
- [ ] Replace unconditional `lastUsedAt` updates with thresholded updates
- [ ] Keep API behavior unchanged for clients
- [ ] Confirm no auth regressions
- [ ] Re-run `EXPLAIN` for key lookup and update path

Current behavior:
- Every valid key request updates `last_used_at`
- Every successful response upserts daily usage

Target update SQL:

```sql
UPDATE api_keys
SET last_used_at = now()
WHERE id = $1
  AND (
    last_used_at IS NULL
    OR last_used_at < now() - interval '30 minutes'
  );
```

Suggested Drizzle replacement in `validateApiKey()`:

```ts
await db.execute(sql`
	UPDATE api_keys
	SET last_used_at = now()
	WHERE id = ${keyId}
	  AND (
	    last_used_at IS NULL
	    OR last_used_at < now() - interval '30 minutes'
	  )
`);
```

Implementation notes:
- Keep the existing `SELECT` and `scryptSync` validation logic unchanged.
- Only the update frequency changes.
- If traffic grows materially, evaluate short-TTL cache or queued usage batching in a later PR.

### PR 3: Indexed Autocomplete Search Path

Files:
- `packages/database/drizzle/0004_autocomplete_search.sql`
- `packages/database/src/schema/addresses.ts`
- `packages/database/src/queries/autocomplete.ts`

Checklist:
- [ ] Add `search_text` column
- [ ] Backfill `search_text`
- [ ] Add trigram `GIN` index on `search_text`
- [ ] Add supporting `country/state/postcode` filter index
- [ ] Rewrite autocomplete query to use `search_text`
- [ ] Limit selected columns instead of `select()`
- [ ] Benchmark old and new query plans

Ready-to-paste migration:

```sql
ALTER TABLE addresses
ADD COLUMN IF NOT EXISTS search_text text;

UPDATE addresses
SET search_text = trim(
	concat_ws(
		' ',
		number_first,
		number_last,
		street_name,
		street_type,
		street_suffix,
		building_name,
		locality,
		state,
		postcode,
		country
	)
)
WHERE search_text IS NULL;

CREATE INDEX IF NOT EXISTS idx_addresses_search_text_trgm
ON addresses
USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_addresses_country_state_postcode
ON addresses
USING btree (country, state, postcode);
```

Schema patch for `packages/database/src/schema/addresses.ts`:

```ts
searchText: text("search_text"),
```

Add the supporting btree index:

```ts
index("idx_addresses_country_state_postcode").on(
	table.country,
	table.state,
	table.postcode
),
```

Target schema block:

```ts
export const addresses = pgTable(
	"addresses",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		country: varchar({ length: 2 }).notNull(),
		state: varchar({ length: 10 }).notNull(),
		locality: text().notNull(),
		postcode: varchar({ length: 10 }).notNull(),
		streetName: text("street_name").notNull(),
		streetType: varchar("street_type", { length: 20 }),
		streetSuffix: varchar("street_suffix", { length: 10 }),
		buildingName: text("building_name"),
		flatType: varchar("flat_type", { length: 10 }),
		flatNumber: varchar("flat_number", { length: 10 }),
		levelType: varchar("level_type", { length: 10 }),
		levelNumber: varchar("level_number", { length: 10 }),
		numberFirst: varchar("number_first", { length: 15 }),
		numberLast: varchar("number_last", { length: 15 }),
		longitude: real().notNull(),
		latitude: real().notNull(),
		confidence: integer(),
		gnafPid: varchar("gnaf_pid", { length: 30 }),
		searchText: text("search_text"),
		geom: geometry("geom"),
	},
	(table) => [
		index("idx_addresses_country").on(table.country),
		index("idx_addresses_state").on(table.country, table.state),
		index("idx_addresses_postcode").on(table.postcode),
		index("idx_addresses_locality").on(
			table.country,
			table.state,
			table.locality
		),
		index("idx_addresses_street").on(table.locality, table.streetName),
		index("idx_addresses_gnaf_pid").on(table.gnafPid),
		index("idx_addresses_country_state_postcode").on(
			table.country,
			table.state,
			table.postcode
		),
		index("idx_addresses_geom").using("gist", table.geom),
	]
);
```

Recommended rewrite for `packages/database/src/queries/autocomplete.ts`:

```ts
import { and, eq, ilike, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { addresses } from "../schema/addresses.ts";

export async function autocompleteAddresses(
	db: Database,
	query: string,
	options: { country?: string; state?: string; limit?: number } = {}
): Promise<AutocompleteResult[]> {
	const { country, state, limit = 10 } = options;
	const trimmed = query.trim();
	if (!trimmed) {
		return [];
	}

	const filters = [];
	if (country) {
		filters.push(eq(addresses.country, country.toUpperCase()));
	}
	if (state) {
		filters.push(eq(addresses.state, state.toUpperCase()));
	}

	const pattern = `%${trimmed}%`;

	const rows = await db
		.select({
			id: addresses.id,
			country: addresses.country,
			state: addresses.state,
			locality: addresses.locality,
			postcode: addresses.postcode,
			streetName: addresses.streetName,
			streetType: addresses.streetType,
			streetSuffix: addresses.streetSuffix,
			buildingName: addresses.buildingName,
			flatType: addresses.flatType,
			flatNumber: addresses.flatNumber,
			levelType: addresses.levelType,
			levelNumber: addresses.levelNumber,
			numberFirst: addresses.numberFirst,
			numberLast: addresses.numberLast,
			longitude: addresses.longitude,
			latitude: addresses.latitude,
		})
		.from(addresses)
		.where(and(...filters, ilike(addresses.searchText, pattern)))
		.limit(limit);

	return rows.map((row) => {
		const streetAddress = formatStreetAddress(row);
		return {
			id: row.id,
			formattedAddress: `${streetAddress}, ${row.locality} ${row.state} ${row.postcode}, ${row.country}`,
			streetAddress,
			locality: row.locality,
			state: row.state,
			postcode: row.postcode ?? "",
			country: row.country,
			longitude: row.longitude,
			latitude: row.latitude,
		};
	});
}
```

Follow-up option:
- If you want ranking, replace `ILIKE(search_text, pattern)` with trigram similarity ordering in a later PR.

## EXPLAIN Checklist

Always use:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
```

Record:
- total execution time
- planning time
- whether the intended index is used
- shared hit blocks / shared read blocks
- estimated rows vs actual rows

### Endpoint: `addresses.autocomplete`

Before:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM addresses
WHERE country = 'AU'
  AND state = 'NSW'
  AND (
    street_name ILIKE '%200%'
    OR locality ILIKE '%200%'
    OR postcode ILIKE '%200%'
    OR number_first ILIKE '%200%'
    OR building_name ILIKE '%200%'
    OR state ILIKE '%200%'
  )
  AND (
    street_name ILIKE '%george%'
    OR locality ILIKE '%george%'
    OR postcode ILIKE '%george%'
    OR number_first ILIKE '%george%'
    OR building_name ILIKE '%george%'
    OR state ILIKE '%george%'
  )
LIMIT 10;
```

After:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, country, state, locality, postcode, street_name, longitude, latitude
FROM addresses
WHERE country = 'AU'
  AND state = 'NSW'
  AND search_text ILIKE '%200 george%'
LIMIT 10;
```

Success criteria:
- broad `Seq Scan` is reduced or eliminated
- fewer shared reads
- execution time becomes stable as table size grows

### Endpoint: `addresses.reverse`

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id,
       ST_Distance(
         geom::geography,
         ST_SetSRID(ST_MakePoint(151.2093, -33.8688), 4326)::geography
       ) AS distance
FROM addresses
WHERE ST_DWithin(
  geom::geography,
  ST_SetSRID(ST_MakePoint(151.2093, -33.8688), 4326)::geography,
  200
)
ORDER BY ST_Distance(
  geom::geography,
  ST_SetSRID(ST_MakePoint(151.2093, -33.8688), 4326)::geography
)
LIMIT 1;
```

Success criteria:
- `idx_addresses_geom` is used
- no full table scan
- candidate row set remains small

### Endpoint: `addresses.nearby`

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id,
       ST_Distance(
         geom::geography,
         ST_SetSRID(ST_MakePoint(151.2093, -33.8688), 4326)::geography
       ) AS distance
FROM addresses
WHERE country = 'AU'
  AND ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint(151.2093, -33.8688), 4326)::geography,
    1000
  )
ORDER BY ST_Distance(
  geom::geography,
  ST_SetSRID(ST_MakePoint(151.2093, -33.8688), 4326)::geography
)
LIMIT 10;
```

Success criteria:
- `idx_addresses_geom` is used
- no wide scan of `addresses`
- country filter reduces heap fetches

### Dashboard: Total Requests

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT sum(request_count)
FROM api_usage_daily
WHERE clerk_user_id = 'user_x';
```

### Dashboard: Recent Requests

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT sum(request_count)
FROM api_usage_daily
WHERE clerk_user_id = 'user_x'
  AND usage_date >= '2026-03-01';
```

### Dashboard: Endpoint Breakdown

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT endpoint, sum(request_count)
FROM api_usage_daily
WHERE clerk_user_id = 'user_x'
  AND usage_date >= '2026-03-01'
GROUP BY endpoint
ORDER BY sum(request_count) DESC;
```

Success criteria:
- `(clerk_user_id, usage_date)` or `(clerk_user_id, usage_date, endpoint)` index is used when appropriate
- buffer reads decline after migration

### API Key Validation

Lookup:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, clerk_user_id, secret_hash, secret_salt, revoked_at, last_used_at
FROM api_keys
WHERE id = '00000000-0000-0000-0000-000000000000'
LIMIT 1;
```

Guarded update:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
UPDATE api_keys
SET last_used_at = now()
WHERE id = '00000000-0000-0000-0000-000000000000'
  AND (
    last_used_at IS NULL
    OR last_used_at < now() - interval '30 minutes'
  );
```

Usage upsert:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
INSERT INTO api_usage_daily (api_key_id, clerk_user_id, usage_date, endpoint, request_count)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'user_x',
  '2026-04-14',
  'addresses.reverse',
  1
)
ON CONFLICT (api_key_id, usage_date, endpoint)
DO UPDATE SET request_count = api_usage_daily.request_count + 1;
```

Success criteria:
- lookup remains cheap
- `last_used_at` writes happen infrequently
- upsert remains cheap but total write count per request path drops

## Commands To Run

Generate migration metadata after schema changes:

```bash
pnpm --filter @locnative/database db:generate
```

Apply migrations:

```bash
pnpm --filter @locnative/database db:migrate
```

If you need manual SQL verification against Neon:

```bash
psql "$DATABASE_URL"
```

## Definition Of Done
- `idx_addresses_geom` exists in every environment through migrations
- dashboard/reporting indexes exist and improve usage queries
- `lastUsedAt` is no longer updated on every request
- autocomplete uses an indexed search path instead of multi-column wildcard scans
- before/after `EXPLAIN` output is captured for every hot endpoint
