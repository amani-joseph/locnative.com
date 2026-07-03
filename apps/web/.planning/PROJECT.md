# Locnative — Projects & API Key Management

> Tactical project definition for the current implementation track.
> For the broader platform direction, see `PLATFORM-ROADMAP.md`.

## What This Is

Locnative is an Australian address geocoding API service. Users sign up, create projects (workspaces representing their apps or environments), and generate API keys scoped to those projects. The API provides address autocomplete and reverse geocoding powered by GNAF data in a Neon PostgreSQL + PostGIS database.

## Core Value

Users can create projects and generate API keys to access the geocoding API, with clear visibility into usage per project and per key.

## Requirements

### Validated

- ✓ User authentication via Better Auth — existing
- ✓ Protected dashboard with stats overview — existing
- ✓ API key generation (unscoped, not linked to projects) — existing
- ✓ API endpoints for address autocomplete and reverse geocoding — existing
- ✓ API key validation middleware on public endpoints — existing
- ✓ Daily usage tracking per API key per endpoint — existing

### Active

- [ ] User can create a project (name, description)
- [ ] User can view, edit, and delete projects
- [ ] Deleting a project cascade-deletes all its API keys
- [ ] User can generate API keys scoped to a project
- [ ] After project creation, user is prompted to create their first API key
- [ ] API keys have a user-defined name/label
- [ ] API keys have an optional expiration date (auto-invalidate after)
- [ ] API key usage tracking shows last-used timestamp and request count
- [ ] User can invalidate (revoke) an API key without deleting it
- [ ] User can delete an API key permanently
- [ ] One project can have multiple API keys
- [ ] Dashboard reflects project-scoped usage data
- [ ] UI presents projects with their keys in a clear, integrated view

### Out of Scope

- Scoped permissions per API key (e.g., endpoint-level access control) — not needed for v1
- Team/org-level project sharing — defer to later
- Billing integration per project — billing page exists but is not wired
- Convex backend migration — staying with Neon/Drizzle for data storage

## Context

- **Brownfield project** — existing TanStack Start app with Better Auth, Drizzle ORM, Neon PostgreSQL
- **Monorepo** at `/Users/mac/Developer/projects/locnative.com` with packages for UI, database, backend, env
- **Database schema** lives in `@locnative/database` package using Drizzle ORM
- **API keys** currently exist but are not linked to projects — need to add `project_id` foreign key
- **Projects route** scaffolded at `src/routes/_protected/projects.tsx` but not implemented
- **API keys route** exists at `src/routes/_protected/api-keys.tsx` with working generation/listing
- **Server functions** use `createServerFn` from TanStack Start for backend logic
- **Existing API key format**: `wh_{uuid}_{secret}` with scrypt hashing

## Constraints

- **Tech stack**: TanStack Start, React 19, Drizzle ORM, Neon PostgreSQL — must use existing stack
- **Auth**: Better Auth — all protected routes require an authenticated session
- **Database**: Neon PostgreSQL with PostGIS — API keys and projects stored here (not Convex)
- **API compatibility**: Existing `/api/v1/addresses/*` endpoints must continue working with current API keys

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Neon/Drizzle for projects+keys (not Convex) | Existing API keys already in PostgreSQL, Convex schema is empty | — Pending |
| Merge project + API key UI into single page | Projects page with expandable key sections reduces navigation, matches existing dashboard pattern | — Pending |
| Prompt for first API key after project creation | Reduces friction while keeping creation explicit | — Pending |
| Cascade delete keys on project deletion | Simplest mental model, prevents orphaned keys | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after initialization*
