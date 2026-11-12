# Locnative.com — BetterAuth Migration

## What This Is

Locnative.com is an existing application built on TanStack Start + Convex. This project uses BetterAuth (self-hosted, open-source) for authentication, giving full ownership of auth data and infrastructure. The mydeffo.com-web project serves as architectural inspiration for BetterAuth patterns.

## Core Value

Users can authenticate seamlessly — login, signup, OAuth, and session persistence must work without disruption after the migration.

## Requirements

### Validated

- ✓ Email/password authentication — existing
- ✓ OAuth login (Google, GitHub) — existing
- ✓ Session management and persistence — existing
- ✓ User profiles and metadata — existing

### Active

- [ ] Replace legacy email/password auth with BetterAuth
- [ ] Replace legacy OAuth with BetterAuth OAuth (Google, GitHub)
- [ ] Migrate session management to BetterAuth
- [ ] Store auth data (users, sessions) in Convex
- [ ] Migrate user profiles/metadata to BetterAuth
- [ ] Remove all legacy auth dependencies and code
- [ ] Adapt BetterAuth patterns from mydeffo.com-web for TanStack Start

### Out of Scope

- Apple Sign In — not currently used, can add later
- Multi-tenancy / organizations — not part of current auth setup
- User data migration tooling — manual migration if needed, not automated
- Additional OAuth providers beyond Google/GitHub — defer to future

## Context

- **Current stack:** TanStack Start frontend, Convex backend
- **Current auth:** BetterAuth (email/password, Google OAuth, GitHub OAuth, sessions, user profiles)
- **Reference project:** `/Users/mac/Developer/projects/mydeffo.com-web` — has working BetterAuth implementation
- **Key adaptation needed:** mydeffo.com-web is likely a different framework; patterns must be adapted for TanStack Start's routing, server functions, and middleware
- **Convex integration:** Auth data (users, sessions) should live in Convex, not a separate database

## Constraints

- **Stack:** Must remain on TanStack Start + Convex — no framework changes
- **Data storage:** Auth data must be stored in Convex (not a separate DB)
- **Feature parity:** Existing auth features must work identically on BetterAuth
- **Zero legacy auth residue:** Full replacement — no legacy auth code or dependency should remain

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| BetterAuth over other alternatives | Self-hosted control, proven in mydeffo.com-web | — Pending |
| Convex for auth storage | Keep all data in one place, avoid managing separate DB | — Pending |
| Adapt (not mirror) mydeffo.com-web patterns | Different framework (TanStack Start vs mydeffo's stack) | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-15 after Phase 4 completion — oRPC API migration complete*
