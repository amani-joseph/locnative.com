# Consolidate dual migration lineage into a single drizzle-managed history

**Date:** 2026-06-07
**Status:** Approved (design)
**Scope:** `packages/database/` migrations + one production metadata write
**Environments affected:** Production only (single Neon DB; no staging/preview branch)

---

## Problem

`packages/database/drizzle/` has two parallel migration lineages that drift:

1. **drizzle-kit-generated** — random-suffix names (`0000_zippy_bloodscream` … `0011_outstanding_gunslinger`), tracked in `meta/_journal.json`. `db:migrate` applies only these.
2. **hand-written descriptive** — `0009_tiered_search_extensions`, `0010_api_usage_daily_request_source`, `0011_webhook_delivery_attempts`, `0012_batch_jobs_apikey_nullable`. **Not** in the journal; `db:migrate` ignores them and they must be applied manually.

Consequences:
- Filename collisions across lineages (`0009/0010/0011` appear twice).
- A migration can silently never reach a database — `0009_tiered_search_extensions` was missing from production until manually applied on 2026-06-07 (added `addresses.population_score` / `admin_level`, `pg_trgm`/`fuzzystrmatch` extensions, and two specialized indexes).
- The drizzle snapshot already reflects the full schema, so `db:generate` will not re-emit the missing objects — the drift is invisible to tooling.

## Goal

A single, drizzle-managed migration history where:
- `db:migrate` on a fresh database builds the complete current schema (including extensions and specialized indexes drizzle's schema layer cannot model).
- `db:migrate` on production is a verified no-op.
- There is one lineage, one journal, no orphan SQL files.

## Current state (verified 2026-06-07)

- Schema files (`src/schema/*.ts`) already declare the full desired schema. The latest snapshot (`meta/0011_snapshot.json`) reflects it.
- Production physically contains the full schema: all tables, 49 indexes, extensions `postgis`, `pg_trgm`, `fuzzystrmatch`.
- `drizzle.__drizzle_migrations` (prod) holds **12 rows**.
- Objects drizzle's schema layer does **not** model (must be captured by hand in the baseline):
  - Extensions: `postgis`, `pg_trgm`, `fuzzystrmatch`.
  - Indexes: `idx_addresses_search_text_btree` (`btree … text_pattern_ops`), `idx_addresses_search_text_trgm` (`gin … gin_trgm_ops`).
  - (The `gist` geom indexes on `addresses`/`zones`/`regions` ARE modeled via `.using("gist", …)`; the implementation step will diff to confirm exactly which objects are missing from the generated baseline.)

## Chosen approach: Baseline squash + prod reconcile

Rejected alternatives:
- **Adopt hand-written files into the journal (preserve history):** the `CREATE INDEX CONCURRENTLY` migration cannot be a standard drizzle migration (drizzle wraps each migration in a transaction), so a single clean lineage is unreachable; hand-rebuilding incremental snapshots is fragile.
- **Switch to `drizzle-kit push`:** loses auditable history; `push` can produce destructive diffs against prod.

## Design

### 1. Generate the baseline
- Move existing `drizzle/*.sql` and `drizzle/meta/*` into `drizzle/_archive/` (kept in git for audit/rollback).
- Run `pnpm --filter @locnative/database db:generate` against the current schema → produces `0000_<name>.sql`, `meta/0000_snapshot.json`, and a fresh one-entry `_journal.json`.

### 2. Hand-complete the baseline for un-modeled objects
Edit the generated `0000_<name>.sql`:
- **Prepend, before any `CREATE TABLE`** (geometry columns require postgis first):
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
  ```
- **Append** the specialized indexes as plain (non-concurrent) `CREATE INDEX` — a fresh DB builds in a transaction with no live traffic, so `CONCURRENTLY` is unnecessary:
  ```sql
  CREATE INDEX "idx_addresses_search_text_btree" ON "addresses" USING btree ("search_text" text_pattern_ops);
  CREATE INDEX "idx_addresses_search_text_trgm" ON "addresses" USING gin ("search_text" gin_trgm_ops);
  ```
- **Completeness diff:** enumerate every table/index/extension in production and assert each exists in the final baseline. Append any modeled-but-missing objects.

### 3. Reconcile production tracking table (the only prod mutation)
1. **Back up:** `SELECT * FROM drizzle.__drizzle_migrations` → save all 12 rows to a local file.
2. **Derive the baseline hash** using drizzle's own algorithm, read from the installed `drizzle-orm` migrator source (SHA-256 of the migration SQL file content) — not guessed.
3. **Atomic swap** via neon-http's array transaction (`sql.transaction([delete, insert])` — the batch form, which neon-http supports; NOT an interactive transaction, which it does not):
   - `DELETE FROM drizzle.__drizzle_migrations;`
   - `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (<baseline_hash>, <baseline_journal_when_ms>);`
4. **Verification gate:** run `db:migrate` → must report nothing pending. If it attempts to run the baseline, the hash was wrong → restore the 12 rows from backup and re-derive.

### 4. Verification
- `db:migrate` is a no-op on prod (confirms hash match + single lineage).
- Programmatic object diff: every prod table/index/extension is present in the baseline.
- `tsc` + existing `packages/database` tests pass.
- Optional (if a throwaway Neon branch is available): run the baseline on an empty DB and confirm the resulting schema matches prod.

### 5. Cleanup
- Remove the obsolete "hand-written migrations must be applied manually" guidance from docs and from the `drizzle-dual-migration-lineage` memory; replace with the single-lineage workflow.

## Rollback
Every step is reversible:
- Archived migration files are git-tracked, restorable by moving back.
- The 12 tracking rows are backed up and restorable.
- No production table **data** or **structure** is altered — prod already matches the baseline; only the metadata tracking rows change.

## Risks
- **Single risk:** rewriting 12 rows in the `drizzle.__drizzle_migrations` metadata table. Mitigations: row backup, atomic swap, hash derived from drizzle's own code, and a no-op `db:migrate` verification gate with documented restore.

## Out of scope
- No changes to application code, schema definitions, or table data.
- No staging/preview reconciliation (none exists).
