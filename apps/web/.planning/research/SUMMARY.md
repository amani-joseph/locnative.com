# Project Research Summary

**Project:** Locnative -- Project-Scoped API Key Management
**Domain:** SaaS geocoding API with developer-facing key management
**Researched:** 2026-04-12
**Confidence:** HIGH

## Executive Summary

Locnative needs to evolve from a flat user-to-key model into a project-scoped API key management system. This is a well-understood domain pattern (Stripe, Google Cloud, Mapbox all use it) and the existing stack already contains every dependency needed. No new runtime libraries are required -- the work is schema extension, server function additions, and UI build-out using Drizzle ORM, TanStack Start server functions, Better Auth, and existing shadcn/ui components.

The recommended approach is a phased migration that preserves backward compatibility. The `api_keys` table gains a nullable `project_id` foreign key, a backfill migration creates default projects for existing users and assigns orphaned keys, and only then is the NOT NULL constraint applied. This prevents the single most dangerous pitfall: breaking existing API keys in production during migration. Key expiration, rotation, and project-scoped usage dashboards layer on top of this foundation.

The primary risks are (1) breaking existing keys during migration, (2) cascade-deleting usage history when projects are removed, and (3) IDOR vulnerabilities if project ownership is not verified on every scoped operation. All three are preventable with established patterns: nullable-then-backfill migration, soft-delete over hard-delete, and a shared `verifyProjectOwnership` helper used by every server function.

## Key Findings

### Recommended Stack

Zero new dependencies. The existing stack handles everything.

**Core technologies (all already installed):**
- **Drizzle ORM ^0.44**: Schema definition, migrations, type-safe queries -- extend with `projects` table
- **Neon PostgreSQL**: Production database -- add `projects` table and `project_id` columns
- **TanStack Start (createServerFn)**: Server functions with Zod validation -- add project CRUD functions
- **Better Auth**: Authentication -- provides `userId` for ownership checks
- **Node.js crypto (scrypt)**: API key hashing -- unchanged, consider async version for scaling
- **shadcn/ui**: UI components -- all needed components (Dialog, Table, Badge, Select) already available

**What NOT to add:** Unkey.dev (managed keys), Redis (caching), node-cron (background jobs), Argon2 (hashing). All are premature complexity.

### Expected Features

**Must have (table stakes):**
- Project CRUD (create, rename, delete with soft-delete)
- API keys scoped to projects with naming/labeling
- Key revocation (soft delete via `revokedAt`)
- Show key only once at creation with copy-to-clipboard
- Cascade behavior on project deletion (soft-delete, not hard-delete)
- Project-scoped usage dashboard
- Last-used timestamp per key
- Confirmation dialogs for destructive actions

**Should have (differentiators):**
- Key expiration dates (most geocoding APIs lack this)
- First-key onboarding prompt after project creation
- Key prefix display (`wh_abc1...`) for identification
- Project environment labels (production/staging/development)

**Defer (v2+):**
- Usage sparklines per key, inline API explorer, bulk key management, request log preview
- Per-key endpoint permissions, team/org sharing, per-key rate limits, webhooks, audit logs

### Architecture Approach

The architecture extends the existing flat model to `User -> Projects -> API Keys -> Usage Records`. Key design decisions: derive key state from timestamps (not an enum column), use soft-delete (`archivedAt`) for projects, denormalize `project_id` into `api_usage_daily` for fast dashboard queries, and maintain a single validation path in `validateApiKey` that always returns project context.

**Major components:**
1. **Project Schema** (`packages/database/src/schema/projects.ts`) -- table definition with slug, environment, archivedAt
2. **Project Server Functions** (`apps/web/src/lib/projects-server.ts`) -- CRUD + `verifyProjectOwnership` helper
3. **Updated Key Server Functions** (`apps/web/src/lib/api-keys-server.ts`) -- project-scoped create/list/revoke
4. **Updated Key Validation** (`apps/web/src/lib/api-key-auth.ts`) -- returns `projectId`, checks expiration
5. **Projects UI** (`apps/web/src/routes/_protected/projects.tsx` + `$projectId.tsx`) -- list, detail, key management

### Critical Pitfalls

1. **Breaking existing keys during migration** -- Make `project_id` nullable, backfill with default projects, then enforce NOT NULL. Test against production data copy.
2. **Cascade delete destroying usage history** -- Use soft-delete (`archivedAt`) for projects instead of hard delete. Never destroy billing-relevant usage data.
3. **IDOR on project ownership** -- Build `verifyProjectOwnership(db, projectId, userId)` helper before any scoped endpoints. Every server function must call it.
4. **Expiration not enforced at validation time** -- Add `expiresAt` check in `validateApiKey` in the same phase as the expiration column. Never ship the column without the check.
5. **Scrypt blocking the event loop** -- Switch `scryptSync` to async `scrypt` before production scaling. Consider LRU cache for hot keys.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Database Schema and Migration
**Rationale:** Everything depends on the `projects` table and `project_id` column existing. This is the foundation with zero UI dependencies.
**Delivers:** `projects` table, nullable `project_id` + `expires_at` on `api_keys`, `project_id` on `api_usage_daily`, backfill migration creating default projects, NOT NULL constraint after backfill.
**Addresses:** Project CRUD (data layer), key scoping (data layer), cascade safety
**Avoids:** Pitfall 1 (breaking existing keys), Pitfall 2 (cascade delete), Pitfall 6 (missing denormalization)

### Phase 2: Server Functions and Authorization
**Rationale:** Server functions are the API layer that UI depends on. Building them before UI allows testing authorization logic in isolation.
**Delivers:** `verifyProjectOwnership` helper, project CRUD server functions, updated project-scoped key CRUD, expiration check in `validateApiKey`, per-project key count limits.
**Addresses:** Project CRUD, key scoping, key revocation, expiration enforcement, key creation limits
**Avoids:** Pitfall 4 (IDOR), Pitfall 7 (unbounded key creation), Pitfall 8 (expiration not enforced)

### Phase 3: Projects UI and Key Management
**Rationale:** With server functions tested, build the UI layer. This is the largest phase by line count but lowest risk since patterns are established.
**Delivers:** Project list page, project detail page with keys and usage, create/edit project dialogs, key creation within project context (with copy + acknowledge modal), expiration date picker, environment labels, key prefix display.
**Addresses:** All table stakes UI features, key visibility UX, confirmation dialogs, project-scoped dashboard
**Avoids:** Pitfall 3 (key visibility UX), Pitfall 9 (key name confusion), Pitfall 11 (default project confusion)

### Phase 4: Differentiators and Polish
**Rationale:** High-value, low-complexity features that layer on top of the working system. Ship after core is stable.
**Delivers:** First-key onboarding prompt, usage sparklines, migration banner for existing users, async scrypt optimization.
**Addresses:** Differentiator features, onboarding experience, performance hardening
**Avoids:** Pitfall 5 (scrypt blocking)

### Phase Ordering Rationale

- Schema must come first because every server function and UI component depends on the `projects` table existing
- Server functions before UI because authorization logic (ownership verification) must be correct before exposing it through a UI -- easier to test and fix at the function level
- UI as a single phase because all project management screens share the same server function dependencies and can be built together
- Polish last because differentiators are valuable but not blocking for a functional release

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Drizzle migration ordering for nullable-then-backfill-then-constrain pattern. Verify exact syntax for multi-step migration with drizzle-kit.
- **Phase 3:** Key creation modal UX patterns (copy + acknowledge flow). Worth checking competitor implementations for edge cases.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Server function patterns are identical to existing `api-keys-server.ts`. No novel patterns.
- **Phase 4:** Onboarding prompts and sparklines are straightforward UI work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all technology is already installed and working in the codebase |
| Features | HIGH (table stakes), MEDIUM (differentiators) | Table stakes verified against Stripe/Google/AWS patterns. Differentiators based on training data for geocoding competitors |
| Architecture | HIGH | Based on direct codebase analysis; extends existing patterns rather than introducing new ones |
| Pitfalls | HIGH | Migration pitfalls derived from schema analysis; security pitfalls are well-established IDOR/auth patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **Competitor feature verification:** Differentiator claims (e.g., "most geocoding APIs lack per-key expiry") are based on training data through May 2025. Verify if competitors have added these features since.
- **Drizzle multi-step migration:** The nullable-then-constrain pattern is standard SQL but verify drizzle-kit handles the two-migration sequence correctly (generate migration 1, run it, backfill, generate migration 2, run it).
- **Scrypt performance baseline:** No current p99 latency measurements exist. Measure before deciding whether async scrypt is Phase 4 or needs to be pulled earlier.
- **Rate limits / key count limits:** Exact numbers (e.g., max 25 keys per project) are product decisions, not technical constraints. Need validation.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis -- direct inspection of schema, server functions, auth middleware, UI components
- Drizzle ORM documentation -- migration and schema patterns
- Node.js crypto module -- scrypt async API

### Secondary (MEDIUM confidence)
- Stripe, Google Cloud, AWS IAM, Mapbox key management patterns -- training data, not live-verified
- Positionstack, OpenCage geocoding API dashboards -- training data

---
*Research completed: 2026-04-12*
*Ready for roadmap: yes*
