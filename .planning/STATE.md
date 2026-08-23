---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 8 Wave 2 deferred — Neon storage cap. Code for Waves 3-7 proceeding against schema; runtime needs DB reconciliation later.
last_updated: "2026-06-20T00:00:00.000Z"
last_activity: 2026-06-20
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 21
  completed_plans: 11
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-14)

**Core value:** Users can authenticate seamlessly -- login, signup, OAuth, and session persistence must work without disruption after the migration.
**Current focus:** Phase 08 — Teams — creation, invitations, API keys

## Current Position

Phase: 08 (Teams — creation, invitations, API keys) — EXECUTING
Plan: 2 of 7
Status: Ready to execute
Last activity: 2026-04-19

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 04 P01 | 1min | 2 tasks | 3 files |
| Phase 04 P02 | 4min | 2 tasks | 5 files |
| Phase 08 P01 | 7 | 3 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 3 phases (coarse granularity) -- Infrastructure, Auth Flows, Legacy Auth Removal
- [Roadmap]: Reference mydeffo.com-web for BetterAuth patterns during Phase 1 planning
- [Phase 01]: router.invalidate() before navigate() for post-auth redirect to update isAuthenticated context
- [Phase 04]: Inline endpoint config and auth constants in api-explorer.ts to avoid cross-package imports from apps/web
- [Phase 04]: Use Awaited<ReturnType<...>> for type inference from orpcClient instead of duplicating interfaces
- [Phase 05]: Hand-written migrations for indexes requiring operator classes (text_pattern_ops) since Drizzle cannot express them
- [Phase 05]: Used Drizzle sql template literals for raw SQL since trigram operators cannot be expressed in query builder
- [Phase 06]: Use dotenv/config side-effect import for Worker-compatible env loading
- [Phase 06]: Replaced crossSubDomainCookies with defaultCookieAttributes for explicit cookie domain control via AUTH_COOKIE_DOMAIN env var
- [Phase 08]: text (not uuid) for userId/invitedBy in team tables — matches users.id text PK in auth.ts
- [Phase 08]: uq_projects_user_slug kept alongside uq_projects_team_slug in Plan 01 — Plan 02 drops old index after backfill

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 4 added: Implement APIs using oRPC with mutations and procedures
- Phase 5 added: Optimize autocomplete search with tiered strategy
- Phase 6 added: Mirror Cloudflare deployment configurations from mydeffo.com-web
- Phase 7 adopted: Extract auth into its own package (pre-drafted research + 3 plans in 07-extract-auth-into-its-own-package/, now formally in roadmap)
- Phase 8 added: Teams — creation, email invitations (Resend), and auto-generated per-member API keys scoped to the team (renumbered from 7 due to phase 7 adoption)

### Blockers/Concerns

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260414-ght | Realign hero section layout to center the animated address input demo | 2026-04-14 | b9d5b16 | [260414-ght-realign-hero-section-layout-to-center-th](./quick/260414-ght-realign-hero-section-layout-to-center-th/) |
| 260415-hwm | Fix hero section mobile responsiveness and viewport fitting | 2026-04-15 | 9444085 | [260415-hwm-fix-hero-section-responsiveness-and-view](./quick/260415-hwm-fix-hero-section-responsiveness-and-view/) |
| 260416-qlh | Check and configure Better Auth GitHub social provider | 2026-04-16 | 7e6f6d4 | [260416-qlh-check-and-configure-better-auth-github-s](./quick/260416-qlh-check-and-configure-better-auth-github-s/) |
| 260419-lml | Fix critical audit issues C1 (wrangler NODE_ENV) and C2 (CLAUDE.md Convex→Postgres) | 2026-04-19 | 7b0e382, 5b3ce0b | [260419-lml-fix-critical-audit-issues-c1-and-c2-remo](./quick/260419-lml-fix-critical-audit-issues-c1-and-c2-remo/) |
| 260823-pcq | Fix bare AU postcode queries in /addresses/autocomplete | 2026-08-23 | 2c771db | [260823-pcq-fix-bare-au-postcode-autocomplete](./quick/260823-pcq-fix-bare-au-postcode-autocomplete/) |

## Session Continuity

Last session: 2026-04-18T02:12:38.652Z
Stopped at: Phase 8 Wave 2 deferred — Neon storage cap. Code for Waves 3-7 proceeding against schema; runtime needs DB reconciliation later.
Resume file: .planning/phases/08-teams-creation-email-invitations-resend-and-auto-generated-per-member-api-keys-scoped-to-the-team/08-02-PLAN.md
