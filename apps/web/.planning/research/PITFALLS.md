# Domain Pitfalls

**Domain:** Project-scoped API key management for a geocoding SaaS
**Researched:** 2026-04-12
**Confidence:** HIGH (based on codebase analysis + established API key management patterns)

## Critical Pitfalls

Mistakes that cause data loss, security incidents, or force rewrites.

### Pitfall 1: Breaking Existing API Keys During Migration

**What goes wrong:** Adding a mandatory `project_id` foreign key to the `api_keys` table breaks all existing unscoped keys. If the column is `NOT NULL` without a default or migration strategy, the schema migration fails or existing keys become invalid.

**Why it happens:** The current `api_keys` table has no `project_id` column. Existing keys belong to a user but not a project. A naive `ALTER TABLE api_keys ADD COLUMN project_id UUID NOT NULL REFERENCES projects(id)` fails because existing rows have no value for this column.

**Consequences:**
- Migration fails entirely (best case)
- Existing API keys stop working in production (worst case)
- External consumers calling `/api/v1/addresses/*` get 401 errors with no warning

**Prevention:**
1. Make `project_id` nullable initially: `ADD COLUMN project_id UUID REFERENCES projects(id)`
2. Create a "Default Project" per user during migration, assign orphaned keys to it
3. The `validateApiKey` function must continue to work for keys with `project_id = NULL` during the transition window
4. Only enforce `NOT NULL` after all keys are migrated

**Detection:** Test the migration against a copy of production data before deploying. Check that `validateApiKey` returns valid results for keys created before the migration.

**Phase:** Database schema migration phase (earliest phase). Must be solved before any project-scoped logic is built.

---

### Pitfall 2: Cascade Delete Destroying Usage History

**What goes wrong:** The PROJECT.md states "Deleting a project cascade-deletes all its API keys." The existing schema already cascades `api_usage_daily` on API key deletion (`onDelete: "cascade"`). Deleting a project therefore destroys all usage history for every key in that project, permanently.

**Why it happens:** The cascade chain is: `DELETE project -> DELETE api_keys -> DELETE api_usage_daily`. This is the "simplest mental model" per the project doc, but it silently destroys billing-relevant data.

**Consequences:**
- Usage data needed for billing disputes or auditing is gone
- Dashboard aggregate stats (total requests, historical charts) silently shrink
- If billing is ever wired up, deleted usage data means unbillable requests

**Prevention:**
1. Soft-delete projects (add `deleted_at` timestamp) instead of hard delete, at least for the project row itself
2. OR: Before cascade, archive usage summaries into a separate `usage_archive` or `billing_summary` table
3. OR: Change cascade behavior on `api_keys.project_id` to `SET NULL` instead of `CASCADE`, and soft-delete keys (already using `revokedAt` pattern)
4. At minimum, add a confirmation dialog that explicitly warns "This will permanently delete X API keys and Y days of usage data"

**Detection:** Before implementing cascade delete, query how much usage data exists for the project's keys. If the number is non-trivial, the UX should show this count in the confirmation dialog.

**Phase:** Database schema design phase. Must decide soft-delete vs. cascade before building the delete endpoint.

---

### Pitfall 3: Showing the Full API Key Only Once -- But Not Making It Obvious

**What goes wrong:** The current `createApiKey` function returns the plaintext key (`wh_{uuid}_{secret}`) exactly once. After that, only `secretDisplaySuffix` (last 4 chars) is stored. If the UI does not make it unmistakably clear that this is the only time the key is visible, users lose access and must regenerate.

**Why it happens:** This is the correct security pattern (never store plaintext), but the UX around it is commonly botched. A flash message or small text is easily dismissed.

**Consequences:**
- Users contact support saying their key "disappeared"
- Users screenshot keys (insecure) because they are afraid of losing them
- Users regenerate keys repeatedly, creating orphaned revoked keys

**Prevention:**
1. After creation, show the key in a modal that cannot be dismissed without explicit acknowledgment ("I have copied this key")
2. Provide a one-click copy button with visual confirmation
3. Warn in the modal: "This key will not be shown again. Store it securely."
4. Consider offering a `.env` snippet download (e.g., `LOCNATIVE_API_KEY=wh_...`) for developer convenience
5. Do NOT auto-close the modal or navigate away after creation

**Detection:** Track how many keys are created and immediately revoked within 5 minutes -- this signals users losing their key and regenerating.

**Phase:** UI implementation phase for the "create API key" flow within a project.

---

### Pitfall 4: No Authorization Check on Project Ownership in API Key Operations

**What goes wrong:** When API keys become project-scoped, every key operation (create, list, revoke, delete) must verify that the authenticated user owns the project. Without this, a user could create keys in another user's project by guessing/enumerating the `project_id` UUID.

**Why it happens:** The current code correctly scopes operations to `userId`. But once `project_id` is added, developers may validate only that the project exists (not that it belongs to the requesting user) since the user check feels redundant when a project ID is provided.

**Consequences:**
- IDOR vulnerability: User A creates API keys in User B's project
- Usage data attributed to wrong project/user
- Potential data access if project-level permissions are ever added

**Prevention:**
1. Every server function that accepts a `project_id` MUST join or subquery against `projects` to verify `projects.user_id = userId`
2. Create a reusable `assertProjectOwnership(db, projectId, userId)` helper used by all project-scoped operations
3. Never trust `project_id` from client input without ownership verification
4. Add this check in the `withApiKeyGET` middleware if project-level rate limiting is added later

**Detection:** Write explicit tests: "User A cannot create/list/revoke keys in User B's project." These should be the first tests written.

**Phase:** Server function implementation phase. Build the ownership helper before any project-scoped endpoints.

## Moderate Pitfalls

### Pitfall 5: Scrypt Validation Latency Under Load

**What goes wrong:** The current `validateApiKey` uses synchronous `scryptSync` with N=16384. Each API request blocks the Node.js event loop for ~50-100ms during hash verification. Under concurrent load, this serializes all API requests.

**Why it happens:** `scryptSync` is intentionally slow (that is its purpose for password hashing), but using it synchronously in a request-handling hot path blocks the single-threaded event loop.

**Prevention:**
1. Switch to async `scrypt` (from `node:crypto`) wrapped in a promise -- `await new Promise((resolve, reject) => scrypt(secret, salt, keylen, opts, (err, key) => ...))`
2. Consider adding an in-memory LRU cache of recently validated key hashes (keyed by `apiKeyId`, TTL 60s) to avoid re-hashing on every request from the same key
3. If caching, invalidate on revocation

**Detection:** Measure p99 latency on `/api/v1/addresses/*` endpoints. If it exceeds 200ms with no geo-query explanation, scrypt blocking is likely the cause.

**Phase:** Can be deferred but should be addressed before any production scaling. Good candidate for the "hardening" phase after core features work.

---

### Pitfall 6: Missing `project_id` in Usage Tracking

**What goes wrong:** The `api_usage_daily` table tracks usage by `api_key_id` and `user_id`, but not by `project_id`. To show per-project usage on the dashboard, every query must JOIN through `api_keys` to get the project. This is slow and error-prone for aggregate queries.

**Why it happens:** The table was designed before projects existed. It is natural to think "we can derive project from the key" -- but aggregate queries across date ranges with GROUP BY project become expensive JOINs.

**Prevention:**
1. Add `project_id` directly to `api_usage_daily` as a denormalized column
2. Populate it during the `recordUsage` function (the project ID is available through the validated key)
3. Index on `(project_id, usage_date)` for dashboard queries
4. For historical data, backfill from the key's project assignment

**Detection:** If dashboard project-usage queries take >100ms or require complex CTEs, this denormalization was skipped.

**Phase:** Database schema phase, alongside the `project_id` addition to `api_keys`.

---

### Pitfall 7: No Rate Limiting on Key Creation

**What goes wrong:** The `createApiKey` endpoint has no limit on how many keys a user (or project) can create. A malicious or confused user could generate thousands of keys, bloating the database and making the key management UI unusable.

**Why it happens:** Rate limiting feels like a "later" concern, but key creation involves cryptographic operations (random bytes, scrypt hashing) that are CPU-intensive. Unbounded creation is both a UX and resource problem.

**Prevention:**
1. Enforce a per-project key limit (e.g., max 25 active keys per project)
2. Check count before insert: `SELECT COUNT(*) FROM api_keys WHERE project_id = ? AND revoked_at IS NULL`
3. Return a clear error: "Maximum of 25 active API keys per project. Revoke unused keys first."
4. Consider a per-user global limit as well (e.g., max 100 active keys across all projects)

**Detection:** Query `SELECT user_id, COUNT(*) FROM api_keys WHERE revoked_at IS NULL GROUP BY user_id ORDER BY count DESC` periodically.

**Phase:** Server function implementation phase, in the `createApiKey` handler.

---

### Pitfall 8: Expiration Check Not Enforced at Validation Time

**What goes wrong:** The PROJECT.md specifies "API keys have an optional expiration date (auto-invalidate after)." If expiration is stored but not checked during `validateApiKey`, expired keys continue to work. This is a security gap that is easy to miss because the feature "looks" implemented in the UI.

**Why it happens:** The expiration column is added to the schema. The UI shows it. The create flow sets it. But nobody adds `AND (expires_at IS NULL OR expires_at > NOW())` to the validation query, or the equivalent check in the `validateApiKey` function.

**Prevention:**
1. Add the expiration check in `validateApiKey` immediately after fetching the row: `if (row.expiresAt && row.expiresAt < new Date()) return null`
2. Also filter expired keys from `listApiKeys` OR show them with an "expired" badge (do not silently hide them)
3. Write a test: "Expired key returns 401"

**Detection:** Create a key with expiration 1 minute in the future. Wait 2 minutes. Try to use it. If it works, the check is missing.

**Phase:** Must be implemented in the same phase as the expiration feature. Never ship the column without the validation check.

## Minor Pitfalls

### Pitfall 9: Key Name Uniqueness Confusion

**What goes wrong:** Users create multiple keys with the same name (e.g., "Production") across different projects or even within the same project. When viewing usage or revoking, they cannot distinguish which "Production" key is which.

**Prevention:**
1. Enforce unique key names within a project: `UNIQUE(project_id, name) WHERE revoked_at IS NULL`
2. Show the display suffix (`...abcd`) prominently alongside the name in all lists
3. Consider auto-suggesting names based on project context (e.g., "my-app-production-1")

**Phase:** Schema design + UI implementation phase.

---

### Pitfall 10: Project Deletion Without Key Revocation Timing

**What goes wrong:** When a project is deleted, its keys are cascade-deleted. But if a key is currently mid-validation (the `validateApiKey` function has fetched the row but not yet returned), the request may succeed on a key that was just deleted. This is a minor race condition.

**Prevention:**
1. Soft-delete the project first (set `deleted_at`)
2. Revoke all keys in the project (set `revokedAt`)
3. Wait a brief period (or just accept the tiny race window)
4. Then hard-delete if desired

**Phase:** Project deletion implementation.

---

### Pitfall 11: Default Project Naming and UX Confusion

**What goes wrong:** During migration, existing unscoped keys are assigned to an auto-created "Default Project." Users do not understand what this project is, why it exists, or whether they should keep it. They may delete it (destroying their working keys) or ignore it (creating a messy state).

**Prevention:**
1. Name the default project clearly: "My First Project" or use the user's name
2. Show a one-time banner explaining the migration: "Your existing API keys have been organized into a project"
3. Do NOT allow deletion of the default project if it contains active keys without explicit warning
4. Consider making the default project undeletable until user creates another project and migrates keys

**Phase:** Migration phase + post-migration UX phase.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Database schema migration | Breaking existing keys (#1) | Nullable `project_id`, default project migration |
| Database schema migration | Losing usage history (#2) | Soft-delete or archive before cascade |
| Database schema migration | Missing denormalization (#6) | Add `project_id` to `api_usage_daily` |
| Server function implementation | IDOR on project ownership (#4) | `assertProjectOwnership` helper |
| Server function implementation | No creation limits (#7) | Per-project key count check |
| API key creation UI | Key visibility UX (#3) | Modal with copy + acknowledge flow |
| Expiration feature | Not enforcing at validation (#8) | Check in `validateApiKey`, test it |
| Project deletion | Cascade destroying data (#2) | Soft-delete pattern |
| Migration UX | Default project confusion (#11) | Clear naming + explainer banner |
| Performance/scaling | Scrypt blocking (#5) | Async scrypt + optional LRU cache |

## Sources

- Codebase analysis: `packages/database/src/schema/api-keys.ts`, `src/lib/api-key-auth.ts`, `src/lib/api-keys-server.ts`, `src/lib/with-api-key.ts`
- Project requirements: `.planning/PROJECT.md`
- Architecture context: `.planning/codebase/ARCHITECTURE.md`
- Domain expertise: API key management patterns from Stripe, GitHub, Vercel, and AWS IAM (training data, MEDIUM confidence on external patterns)

---

*Pitfalls analysis: 2026-04-12*
