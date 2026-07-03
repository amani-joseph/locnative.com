# Migration Lineage Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠ PRODUCTION WARNING:** Task 5 mutates the production `drizzle.__drizzle_migrations` metadata table. It MUST run with a human checkpoint and only after Tasks 1–4 verify clean. Do NOT auto-run Task 5 from a subagent without confirmation.

**Goal:** Replace the dual (journal + hand-written) migration lineage in `packages/database/` with a single drizzle-managed baseline, and reconcile production's migration-tracking table so `db:migrate` is a verified no-op on prod and fully builds a fresh DB.

**Architecture:** Squash all 16 existing migration SQL files into one generated `0000_baseline.sql`, hand-complete it with the extensions + opclass indexes drizzle's schema layer can't model, archive the old files, then atomically replace prod's 12 tracking rows with one baseline row whose hash is derived from drizzle's own algorithm. Every step is reversible (files archived in git; tracking rows backed up; no table data/structure changes).

**Tech Stack:** drizzle-kit (generate/migrate), drizzle-orm migrator (hashing), Neon serverless (`@neondatabase/serverless`), pnpm workspace, PostGIS/pg_trgm/fuzzystrmatch.

**Conventions:**
- DB scripts read `DATABASE_URL` from `packages/database/.env` and use the installed `@neondatabase/serverless` `neon()` client. NEVER print the connection string.
- Per project rule (CLAUDE.md), run DB/HTTP scripts via `ctx_execute` so output stays out of context; or `node script.mjs` if executing manually.
- The neon-http driver has NO interactive transactions; use `sql.transaction([q1, q2])` (array/batch form) for atomicity.

---

## File Structure

- `packages/database/drizzle/0000_*.sql` — NEW single baseline (generated, then hand-edited).
- `packages/database/drizzle/meta/_journal.json` — REWRITTEN to one entry.
- `packages/database/drizzle/meta/0000_snapshot.json` — NEW single snapshot.
- `packages/database/drizzle/_archive/` — NEW; holds the 16 old `.sql` + old snapshots (git-tracked).
- `packages/database/scripts/` — throwaway verification scripts (NOT committed; created under `/tmp` or removed before final commit).
- `/Users/mac/.claude/projects/.../memory/drizzle-dual-migration-lineage.md` — UPDATED in Task 7.
- Backup file `/tmp/drizzle_migrations_backup_2026-06-07.json` — prod tracking rows (NOT committed).

---

## Task 1: Pre-flight snapshot of prod state + backup tracking table

**Files:**
- Create: `/tmp/preflight.mjs` (throwaway), `/tmp/drizzle_migrations_backup_2026-06-07.json`

- [ ] **Step 1: Write the pre-flight script**

```js
// /tmp/preflight.mjs
import fs from "node:fs";
const ROOT = "/Users/mac/Developer/projects/locnative.com";
const url = fs.readFileSync(`${ROOT}/packages/database/.env`, "utf8")
  .match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");
const base = `${ROOT}/node_modules/.pnpm`;
const neonDir = fs.readdirSync(base).find(d => d.startsWith("@neondatabase+serverless@"));
const { neon } = await import(`${base}/${neonDir}/node_modules/@neondatabase/serverless/index.mjs`);
const sql = neon(url);

const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
const indexes = await sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname`;
const ext = await sql`SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql') ORDER BY extname`;
const rows = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;

const snapshot = {
  tables: tables.map(t => t.table_name),
  indexes: indexes.map(i => ({ name: i.indexname, def: i.indexdef })),
  extensions: ext.map(e => e.extname),
  trackingRows: rows,
};
fs.writeFileSync("/tmp/prod_objects_2026-06-07.json", JSON.stringify(snapshot, null, 2));
fs.writeFileSync("/tmp/drizzle_migrations_backup_2026-06-07.json", JSON.stringify(rows, null, 2));
console.log("tables:", snapshot.tables.length, "indexes:", snapshot.indexes.length,
  "extensions:", snapshot.extensions.join(","), "trackingRows:", rows.length);
```

- [ ] **Step 2: Run it**

Run: `node /tmp/preflight.mjs` (or via ctx_execute)
Expected: prints `tables: <N> indexes: 49 extensions: fuzzystrmatch,pg_trgm,postgis trackingRows: 12`, and writes both JSON files.

- [ ] **Step 3: Confirm the backup exists and is non-empty**

Run: `test -s /tmp/drizzle_migrations_backup_2026-06-07.json && echo OK`
Expected: `OK`. This file is the rollback source for Task 5 — do not delete until the whole plan is verified complete.

- [ ] **Step 4: (No commit — read-only/backup task.)**

---

## Task 2: Archive existing migrations and generate the baseline

**Files:**
- Move: `packages/database/drizzle/*.sql` → `packages/database/drizzle/_archive/`
- Move: `packages/database/drizzle/meta/*` → `packages/database/drizzle/_archive/meta/`
- Create: `packages/database/drizzle/0000_*.sql`, `packages/database/drizzle/meta/0000_snapshot.json`, fresh `meta/_journal.json`

- [ ] **Step 1: Archive the old lineage**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/database
mkdir -p drizzle/_archive/meta
git mv drizzle/*.sql drizzle/_archive/ 2>/dev/null || mv drizzle/*.sql drizzle/_archive/
git mv drizzle/meta/* drizzle/_archive/meta/ 2>/dev/null || mv drizzle/meta/* drizzle/_archive/meta/
ls drizzle/        # should show only _archive/
ls drizzle/meta 2>/dev/null || echo "meta empty (expected)"
```
Expected: `drizzle/` contains only `_archive/`; `drizzle/meta` is empty/absent.

- [ ] **Step 2: Generate the fresh baseline**

```bash
cd /Users/mac/Developer/projects/locnative.com
pnpm --filter @locnative/database db:generate
```
Expected: drizzle-kit writes a new `drizzle/0000_<random>.sql`, `drizzle/meta/0000_snapshot.json`, and `drizzle/meta/_journal.json` with exactly ONE entry. It may print "No schema changes" warnings for nothing — that's fine; we want the full CREATE from empty.

> If `db:generate` produces an empty migration (because it diffs against a leftover snapshot), confirm `drizzle/meta` was truly emptied in Step 1 and re-run.

- [ ] **Step 3: Verify exactly one journal entry + one snapshot**

Run: `cat packages/database/drizzle/meta/_journal.json | grep -c '"tag"'; ls packages/database/drizzle/meta/`
Expected: count `1`; meta dir lists `_journal.json` and `0000_snapshot.json` only.

- [ ] **Step 4: Verify the baseline contains the core tables**

Run: `grep -c 'CREATE TABLE' packages/database/drizzle/0000_*.sql`
Expected: a count matching the number of tables in `/tmp/prod_objects_2026-06-07.json` (e.g. addresses, api_keys, api_usage_daily, projects, zones, device_zone_state, webhook_subscriptions, webhook_delivery_attempts, batch_geocode_jobs, regions, teams, team_members, team_invitations, auth tables). Note the exact number for the Task 3 diff.

- [ ] **Step 5: Commit the archive + raw baseline**

```bash
cd /Users/mac/Developer/projects/locnative.com
git add packages/database/drizzle
git commit -m "refactor(db): squash migrations into single generated baseline (raw)"
```

---

## Task 3: Hand-complete the baseline with un-modeled objects + completeness diff

**Files:**
- Modify: `packages/database/drizzle/0000_*.sql`

- [ ] **Step 1: Prepend extensions (before the first CREATE TABLE)**

Open `packages/database/drizzle/0000_*.sql`. At the very TOP of the file (geometry columns require postgis to exist first), insert:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
--> statement-breakpoint
```

- [ ] **Step 2: Append the opclass indexes drizzle can't model (at end of file)**

```sql
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_addresses_search_text_btree" ON "addresses" USING btree ("search_text" text_pattern_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_addresses_search_text_trgm" ON "addresses" USING gin ("search_text" gin_trgm_ops);
```

> Plain `CREATE INDEX` (not `CONCURRENTLY`): a fresh DB builds inside drizzle's per-migration transaction with no live traffic, so concurrency is unnecessary and `CONCURRENTLY` would error inside the txn.

- [ ] **Step 3: Write the completeness-diff script**

```js
// /tmp/diff_baseline.mjs
import fs from "node:fs";
const ROOT = "/Users/mac/Developer/projects/locnative.com";
const prod = JSON.parse(fs.readFileSync("/tmp/prod_objects_2026-06-07.json", "utf8"));
const sqlFile = fs.readdirSync(`${ROOT}/packages/database/drizzle`).find(f => /^0000_.*\.sql$/.test(f));
const baseline = fs.readFileSync(`${ROOT}/packages/database/drizzle/${sqlFile}`, "utf8");

// Tables present in prod but not created in baseline
const missingTables = prod.tables.filter(t =>
  !new RegExp(`CREATE TABLE (IF NOT EXISTS )?"?${t}"?`, "i").test(baseline));
// Index names present in prod but not in baseline (drizzle internal/pk indexes excluded)
const prodIdxNames = prod.indexes.map(i => i.name)
  .filter(n => !/_pkey$/.test(n)); // PK indexes are implicit from PRIMARY KEY
const missingIndexes = prodIdxNames.filter(n => !baseline.includes(n));
// Extensions
const missingExt = prod.extensions.filter(e => !baseline.toLowerCase().includes(`extension if not exists ${e}`) && !baseline.toLowerCase().includes(`extension "${e}"`));

console.log("MISSING TABLES:", missingTables.length ? missingTables.join(", ") : "none");
console.log("MISSING INDEXES:", missingIndexes.length ? missingIndexes.join(", ") : "none");
console.log("MISSING EXTENSIONS:", missingExt.length ? missingExt.join(", ") : "none");
// Print defs for any missing index so they can be appended verbatim
for (const n of missingIndexes) {
  const def = prod.indexes.find(i => i.name === n)?.def;
  console.log("  NEED:", def);
}
```

- [ ] **Step 4: Run the diff**

Run: `node /tmp/diff_baseline.mjs`
Expected: `MISSING TABLES: none`, `MISSING EXTENSIONS: none`. `MISSING INDEXES` should be `none` after Steps 1–2; if any remain, the script prints the exact `CREATE INDEX` def — append each verbatim to the baseline (use `CREATE INDEX IF NOT EXISTS`) and re-run until all three lines say `none`.

- [ ] **Step 5: Sanity-check SQL parses (dry, no DB)**

Run: `node -e "const f=require('fs');const d='packages/database/drizzle';const s=f.readdirSync(d).find(x=>/^0000_.*sql$/.test(x));const t=f.readFileSync(d+'/'+s,'utf8');console.log('stmts:',t.split('--> statement-breakpoint').length,'has postgis:',/CREATE EXTENSION IF NOT EXISTS postgis/.test(t))"`
Expected: prints a statement count and `has postgis: true`.

- [ ] **Step 6: Commit the completed baseline**

```bash
cd /Users/mac/Developer/projects/locnative.com
git add packages/database/drizzle
git commit -m "refactor(db): complete baseline with extensions + opclass indexes"
```

---

## Task 4: Derive the baseline migration hash (matching drizzle's algorithm)

**Files:**
- Create: `/tmp/derive_hash.mjs` (throwaway)

- [ ] **Step 1: Confirm drizzle's hashing algorithm from installed source**

Run: `grep -n "createHash\|sha256\|digest" node_modules/.pnpm/drizzle-orm@*/node_modules/drizzle-orm/migrator.js`
Expected: shows drizzle computes `crypto.createHash("sha256").update(<query string>).digest("hex")`. Read the surrounding lines to confirm WHAT string is hashed — in drizzle-orm `readMigrationFiles`, it reads the `.sql` file, splits on `--> statement-breakpoint`, and hashes the **joined SQL string** (the full file content with breakpoints removed, i.e. `queries.join("")`). Note the exact expression for Step 2.

- [ ] **Step 2: Write the hash derivation script (mirror drizzle exactly)**

```js
// /tmp/derive_hash.mjs
import fs from "node:fs";
import crypto from "node:crypto";
const ROOT = "/Users/mac/Developer/projects/locnative.com";
const dir = `${ROOT}/packages/database/drizzle`;
const sqlFile = fs.readdirSync(dir).find(f => /^0000_.*\.sql$/.test(f));
const content = fs.readFileSync(`${dir}/${sqlFile}`, "utf8");
// drizzle splits on the breakpoint marker then joins the statements before hashing.
const queries = content.split("--> statement-breakpoint");
const hash = crypto.createHash("sha256").update(queries.join("")).digest("hex");
const journal = JSON.parse(fs.readFileSync(`${dir}/meta/_journal.json`, "utf8"));
const when = journal.entries[0].when;
console.log("sqlFile:", sqlFile);
console.log("hash:", hash);
console.log("when:", when);
fs.writeFileSync("/tmp/baseline_meta.json", JSON.stringify({ hash, when, sqlFile }, null, 2));
```

> IMPORTANT: Step 1 confirms whether drizzle hashes `queries.join("")` or the raw file content. If the source shows it hashes something else (e.g. the raw `content`), update `update(...)` in Step 2 to match EXACTLY before running. The Task 6 no-op `db:migrate` is the ground-truth check that the hash is right.

- [ ] **Step 3: Run it**

Run: `node /tmp/derive_hash.mjs`
Expected: prints `hash:` (64-hex) and `when:` (epoch ms), writes `/tmp/baseline_meta.json`.

- [ ] **Step 4: (No commit — derivation only.)**

---

## Task 5: ⚠ PRODUCTION — reconcile the tracking table (HUMAN CHECKPOINT)

**Files:**
- Create: `/tmp/reconcile.mjs` (throwaway)

- [ ] **Step 1: HUMAN CHECKPOINT — confirm before mutating prod**

Confirm with the human operator: Tasks 1–4 are green, `/tmp/drizzle_migrations_backup_2026-06-07.json` has 12 rows, `/tmp/baseline_meta.json` exists. Do NOT proceed without explicit go-ahead.

- [ ] **Step 2: Write the reconcile script (atomic, neon batch transaction)**

```js
// /tmp/reconcile.mjs
import fs from "node:fs";
const ROOT = "/Users/mac/Developer/projects/locnative.com";
const url = fs.readFileSync(`${ROOT}/packages/database/.env`, "utf8")
  .match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");
const base = `${ROOT}/node_modules/.pnpm`;
const neonDir = fs.readdirSync(base).find(d => d.startsWith("@neondatabase+serverless@"));
const { neon } = await import(`${base}/${neonDir}/node_modules/@neondatabase/serverless/index.mjs`);
const sql = neon(url);
const { hash, when } = JSON.parse(fs.readFileSync("/tmp/baseline_meta.json", "utf8"));

// Re-verify backup has 12 rows before mutating
const backup = JSON.parse(fs.readFileSync("/tmp/drizzle_migrations_backup_2026-06-07.json", "utf8"));
if (backup.length !== 12) throw new Error(`backup has ${backup.length} rows, expected 12 — abort`);

// Atomic swap: delete all, insert one baseline row (neon batch transaction)
await sql.transaction([
  sql`DELETE FROM drizzle.__drizzle_migrations`,
  sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${when})`,
]);

const after = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
console.log("rows after:", after.length, "| hash:", after[0]?.hash?.slice(0,16), "| created_at:", after[0]?.created_at);
```

- [ ] **Step 3: Run it**

Run: `node /tmp/reconcile.mjs` (or via ctx_execute)
Expected: `rows after: 1 | hash: <first16> | created_at: <when>`.

- [ ] **Step 4: (No git commit — this is a DB mutation, not a file change.)**

---

## Task 6: Verify single lineage end-to-end

**Files:** none (verification only)

- [ ] **Step 1: `db:migrate` must be a no-op on prod**

Run: `cd /Users/mac/Developer/projects/locnative.com && pnpm --filter @locnative/database db:migrate`
Expected: drizzle reports nothing to apply / completes without running the baseline (no `CREATE TABLE` errors). 

> If it ATTEMPTS the baseline and errors with "relation already exists", the hash did not match. ROLLBACK: run a script that `DELETE FROM drizzle.__drizzle_migrations` then re-inserts the 12 rows from `/tmp/drizzle_migrations_backup_2026-06-07.json`, then return to Task 4 Step 1 to re-derive the hash (the hashed string was wrong).

- [ ] **Step 2: Re-run completeness diff (still clean)**

Run: `node /tmp/diff_baseline.mjs`
Expected: `MISSING TABLES: none`, `MISSING INDEXES: none`, `MISSING EXTENSIONS: none`.

- [ ] **Step 3: Typecheck + db tests pass**

```bash
cd /Users/mac/Developer/projects/locnative.com
pnpm --filter @locnative/database test 2>&1 | tail -5
pnpm --filter @locnative/api exec tsc --noEmit && echo API_TYPES_CLEAN
```
Expected: db tests pass; `API_TYPES_CLEAN`.

- [ ] **Step 4: (Optional) prove a fresh build — only if a throwaway Neon branch is available**

If a scratch `DATABASE_URL` is provided, point `db:migrate` at it and confirm it builds the full schema from the baseline, then diff its objects against `/tmp/prod_objects_2026-06-07.json`. Skip if no scratch DB; Steps 1–2 are the binding checks.

- [ ] **Step 5: (No commit — verification only.)**

---

## Task 7: Cleanup + documentation

**Files:**
- Modify: `/Users/mac/.claude/projects/-Users-mac-Developer-projects-locnative-com/memory/drizzle-dual-migration-lineage.md`
- Create/Modify: `packages/database/README.md` (migration workflow note)

- [ ] **Step 1: Update the memory to reflect the resolved state**

Edit `drizzle-dual-migration-lineage.md`: change it from "two lineages, apply hand-written manually" to "consolidated to a single baseline on 2026-06-07; old migrations archived in `drizzle/_archive/`; `db:migrate` is the single source of truth; never hand-write out-of-journal migrations again — use `db:generate` (+ `--custom` for raw SQL like extensions/opclass indexes, which get a journal entry)."

- [ ] **Step 2: Add a migration-workflow note to the db package**

Create or append `packages/database/README.md`:

```markdown
## Migrations

Single drizzle-managed lineage. To change schema:
1. Edit `src/schema/*.ts`.
2. `pnpm --filter @locnative/database db:generate` (creates a journaled migration + snapshot).
3. For objects drizzle can't model (extensions, opclass/partial indexes), use
   `db:generate --custom --name=<desc>` and write the raw SQL — it still gets a
   journal entry so it is applied by `db:migrate`.
4. `db:migrate` applies pending migrations. NEVER hand-create out-of-journal .sql files.

Pre-2026-06-07 migrations are archived in `drizzle/_archive/` for history.
```

- [ ] **Step 3: Remove throwaway scripts**

```bash
rm -f /tmp/preflight.mjs /tmp/diff_baseline.mjs /tmp/derive_hash.mjs /tmp/reconcile.mjs
# keep /tmp/drizzle_migrations_backup_2026-06-07.json until you are confident (a few days)
```

- [ ] **Step 4: Commit docs**

```bash
cd /Users/mac/Developer/projects/locnative.com
git add packages/database/README.md
git commit -m "docs(db): document single-lineage migration workflow"
```

- [ ] **Step 5: Final push**

```bash
cd /Users/mac/Developer/projects/locnative.com
git push
```
Expected: archive + baseline + docs commits land on the remote.

---

## Self-Review notes
- **Spec coverage:** §1 generate → Task 2; §2 hand-complete + diff → Task 3; §3 reconcile (backup, hash, atomic swap, verify gate) → Tasks 1/4/5/6; §4 verification → Task 6; §5 cleanup → Task 7. All covered.
- **Rollback:** backup created in Task 1, restore path documented in Task 6 Step 1.
- **Hash risk:** Task 4 Step 1 confirms the algorithm from source; Task 6 Step 1 is the ground-truth verification with a documented rollback.
- **No prod data/structure change:** only `__drizzle_migrations` metadata rows change (Task 5).
