# Technology Stack: Projects & API Key Management

**Project:** Locnative — Project-Scoped API Key Management
**Researched:** 2026-04-12

## Approach: Extend, Don't Replace

This milestone requires **zero new runtime dependencies**. The existing stack (Drizzle ORM 0.44, Neon PostgreSQL, TanStack Start, Better Auth, Zod) already provides everything needed. The work is schema extension, server function additions, and UI build-out.

## Existing Stack (No Changes Needed)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| Drizzle ORM | ^0.44.0 | Schema, queries, migrations | Already installed |
| @neondatabase/serverless | ^1.0.0 | PostgreSQL driver | Already installed |
| drizzle-kit | ^0.31.0 | Schema migrations | Already installed |
| Zod | catalog | Input validation | Already installed |
| Better Auth | existing | Authentication | Already installed |
| TanStack Start | existing | Server functions (`createServerFn`) | Already installed |
| Node.js `crypto` | built-in | scrypt hashing, randomBytes, timingSafeEqual | Already used |

## What to Build (No Libraries Needed)

### 1. `projects` Schema Table

**Confidence: HIGH** -- straightforward Drizzle pgTable definition.

The `projects` table needs: `id` (uuid), `user_id` (text), `name` (text), `description` (text, nullable), `created_at` (timestamp), `updated_at` (timestamp).

Add to `packages/database/src/schema/` as a new `projects.ts` file and export from `index.ts`.

### 2. API Key Schema Extension

**Confidence: HIGH** -- Drizzle supports adding nullable columns and foreign keys in migrations.

Add to `api_keys` table:
- `project_id` (uuid, foreign key to `projects.id`, `onDelete: 'cascade'`) -- initially nullable for backward compatibility with existing keys, then backfill
- `expires_at` (timestamp, nullable) -- for optional expiration

The `validateApiKey` function in `api-key-auth.ts` must check `expires_at` in addition to `revokedAt`. This is a one-line addition: `if (row.expiresAt && row.expiresAt < new Date()) return null;`

### 3. Server Functions (createServerFn)

**Confidence: HIGH** -- follows exact same pattern as existing `api-keys-server.ts`.

New server functions needed:
- `createProject` / `listProjects` / `updateProject` / `deleteProject`
- Update `createApiKey` to accept `projectId`
- `listApiKeysByProject` -- filtered version of `listApiKeys`

All use `createServerFn` with Zod validation, identical to existing patterns.

### 4. API Key Rotation Pattern

**Confidence: HIGH** -- well-established pattern, no library needed.

Rotation is "create new key for same project, then revoke old key." This is a UI workflow, not a backend primitive. The existing `createApiKey` + `revokeApiKey` functions compose to provide rotation. No dedicated rotation endpoint is needed.

### 5. Expiration Enforcement

**Confidence: HIGH** -- purely a query-time check.

Two enforcement points:
1. **Validation time**: Check `expires_at < NOW()` in `validateApiKey()` -- treat expired keys like revoked keys
2. **List time**: Show expiration status in UI, flag expired keys visually

No cron job or background worker needed for a service at this scale. Expired keys are simply rejected at validation time.

## Migration Strategy

**Confidence: HIGH** -- Drizzle Kit handles this well.

```bash
# After schema changes:
pnpm --filter @locnative/database db:generate
pnpm --filter @locnative/database db:migrate
```

Migration order matters:
1. Create `projects` table
2. Add `project_id` (nullable) and `expires_at` columns to `api_keys`
3. Backfill: create a default project per user, assign existing keys to it
4. Make `project_id` NOT NULL (second migration after backfill)

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| API key hashing | scrypt (existing) | Argon2 via `argon2` npm package | scrypt is already implemented and working; switching adds a dependency for negligible benefit at this scale |
| Key format | `wh_{uuid}_{secret}` (existing) | Unkey.dev (managed API key service) | Over-engineered for this use case; adds external dependency and cost; existing format works well |
| Key storage | Neon PostgreSQL (existing) | Redis for key validation cache | Unnecessary at current scale; Neon is fast enough for key lookups; adds infrastructure complexity |
| Migration tool | drizzle-kit (existing) | Raw SQL migrations | drizzle-kit already configured and working; type-safe schema changes |
| Expiration enforcement | Query-time check | Cron job to revoke expired keys | Simpler, no background infra needed; keys are checked on every request anyway |
| Rotation | Compose create+revoke | Dedicated rotation endpoint | Create+revoke achieves the same result; a "rotate" button in UI can call both sequentially |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| **Unkey.dev** | External managed API key service. Adds vendor dependency, cost, and network latency for something trivially handled in-house with existing crypto primitives |
| **Redis / Upstash** | Key validation caching is premature optimization. PostgreSQL handles this fine at expected scale. Add later if latency becomes an issue |
| **node-cron / BullMQ** | Background job for expiration is unnecessary. Query-time checks are simpler and sufficient |
| **Argon2** | Would require native addon or WASM. scrypt from Node.js crypto is already proven in the codebase |
| **nanoid** | For key ID generation. UUID v4 via `crypto.randomUUID()` is already used and provides sufficient uniqueness + is database-friendly |
| **Passport.js / next-auth** | Authentication is already handled by Better Auth. API key auth is custom and intentionally separate |

## UI Components Needed

No new UI libraries required. The existing stack includes:
- shadcn/ui components (already in `packages/ui`)
- Dialog, Table, Tabs, Badge, Select, Switch, Textarea -- all already available (seen in untracked files)

New UI patterns to build with existing components:
- Project list/card view with expandable API key sections
- Create/edit project dialog
- API key creation with project selector and optional expiration date picker
- Key rotation confirmation dialog
- Expiration status badges (active, expiring soon, expired)

## Sources

- Existing codebase analysis (HIGH confidence -- direct code inspection)
- Drizzle ORM documentation for migration patterns (HIGH confidence -- well-established)
- API key management is a solved domain pattern; no novel technology decisions needed (HIGH confidence)
