# Roadmap: Locnative.com — BetterAuth Migration

## Overview

Adopt BetterAuth in three phases: stand up BetterAuth infrastructure on Convex, implement all auth flows (email/password + OAuth), then remove legacy auth residue entirely. Each phase delivers a verifiable capability, and the final state is zero legacy-auth residue with full feature parity.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: BetterAuth Infrastructure** - BetterAuth server running on TanStack Start with Convex storage
- [ ] **Phase 2: Auth Flows** - Email/password and OAuth login fully functional through BetterAuth
- [ ] **Phase 3: Legacy Auth Removal** - All legacy auth code, dependencies, and config purged with no regressions

## Phase Details

### Phase 1: BetterAuth Infrastructure
**Goal**: BetterAuth is configured, connected to Convex, and protecting routes -- the foundation all auth flows depend on
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04
**Success Criteria** (what must be TRUE):
  1. BetterAuth server initializes without errors on app startup
  2. Convex stores user and session records created by BetterAuth
  3. Protected routes redirect unauthenticated visitors to login
  4. Client-side hooks expose current user and loading/authenticated state
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Install BetterAuth packages and configure Convex backend (component, auth, HTTP routes)
- [x] 01-02-PLAN.md — Wire BetterAuth into TanStack Start frontend (auth client, proxy, provider swap, route guard)
- [x] 01-03-PLAN.md — Fix UAT gaps: post-auth redirects and route guard error handling (gap closure)

### Phase 2: Auth Flows
**Goal**: Users can sign up, sign in, verify email, reset passwords, and use Google/GitHub OAuth -- all through BetterAuth
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, OATH-01, OATH-02
**Success Criteria** (what must be TRUE):
  1. User can create an account with email and password and is stored in Convex
  2. User receives a verification email after signup and can verify their address
  3. User can reset a forgotten password via email link
  4. User session survives browser refresh without re-login
  5. User can sign in with Google OAuth and with GitHub OAuth
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Legacy Auth Removal
**Goal**: Every trace of legacy auth is removed and the app runs exclusively on BetterAuth with full feature parity
**Depends on**: Phase 2
**Requirements**: MIGR-01, MIGR-02, MIGR-03, MIGR-04
**Success Criteria** (what must be TRUE):
  1. No legacy auth packages exist in package.json or lock file
  2. No legacy auth middleware, components, or API routes remain in the codebase
  3. No legacy auth environment variables exist in .env files or deployment config
  4. User profile and metadata are accessible through BetterAuth (no data loss)
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Implement APIs using oRPC with mutations and procedures
**Goal**: All data fetching and mutations consolidated through oRPC procedures with TanStack Query integration -- no createServerFn wrappers or thin proxy files remain
**Depends on**: Phase 3
**Requirements**: ORPC-01, ORPC-02, ORPC-03, ORPC-04
**Success Criteria** (what must be TRUE):
  1. API explorer requests execute through an oRPC protectedProcedure
  2. TanStack Query utils (createTanstackQueryUtils) are wired up for cache key management
  3. All route components fetch data via orpcClient directly (no thin wrapper files)
  4. Only one createServerFn remains (fetchSession in __root.tsx for SSR optimization)
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Create api-explorer oRPC procedure and wire TanStack Query utils
- [x] 04-02-PLAN.md — Remove thin wrapper files and migrate all consumers to direct orpcClient

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. BetterAuth Infrastructure | 3/3 | Complete | - |
| 2. Auth Flows | 0/3 | Not started | - |
| 3. Legacy Auth Removal | 0/1 | Not started | - |
| 4. oRPC API Layer | 0/2 | Not started | - |
| 5. Tiered Autocomplete Search | 0/3 | Not started | - |

### Phase 5: Optimize autocomplete search with tiered strategy

**Goal:** Autocomplete returns ranked, relevant results in <100ms using tiered search (prefix, trigram, fuzzy, phonetic) with population/proximity boosting -- no Elasticsearch
**Depends on:** Phase 4
**Requirements**: SEARCH-01, SEARCH-02, SEARCH-03, SEARCH-04, SEARCH-05, SEARCH-06
**Success Criteria** (what must be TRUE):
  1. pg_trgm and fuzzystrmatch extensions enabled in PostgreSQL
  2. Queries 3-4 chars use fast prefix search, 5+ use trigram+fuzzy, 8+ widen fuzzy tolerance
  3. Results ranked by population score, admin level, similarity, and optional proximity
  4. Phonetic fallback (dmetaphone) fires when fuzzy returns zero results for 8+ char queries
  5. API accepts optional lat/lon for proximity boosting
**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md — Enable pg_trgm/fuzzystrmatch extensions, add population_score/admin_level columns and indexes
- [ ] 05-02-PLAN.md — Rewrite autocomplete query with tiered search strategy and result ranking
- [ ] 05-03-PLAN.md — Wire lat/lon proximity parameters through the API endpoint

### Phase 6: Mirror Cloudflare deployment configurations from mydeffo.com-web

**Goal:** All Worker-incompatible code is replaced, wrangler configs aligned with production-ready patterns from mydeffo.com-web, and auth cookies work across subdomains
**Depends on:** Phase 5
**Requirements**: CFDP-01, CFDP-02, CFDP-03, CFDP-04, CFDP-05
**Success Criteria** (what must be TRUE):
  1. Server env module has no node:fs or node:path imports (Worker-compatible)
  2. Both wrangler configs have observability logging with invocation_logs enabled
  3. apps/server has production environment block with custom domain routing
  4. Dead dependencies (next, postcss tooling) removed from apps/web
  5. Auth cookie domain is configurable via AUTH_COOKIE_DOMAIN env var
**Plans:** 3 plans

Plans:
- [ ] 06-01-PLAN.md — Replace Node.js filesystem env loader and remove dead dependencies
- [ ] 06-02-PLAN.md — Align wrangler configs with observability, production env blocks, and Workers types
- [ ] 06-03-PLAN.md — Add configurable auth cookie domain for cross-subdomain deployment

### Phase 7: Extract auth into its own package

**Goal:** BetterAuth server config and auth client extracted from `packages/api` into a dedicated `packages/auth/` package that mirrors the mydeffo.com-web reference 1:1 — pure refactor, no behavioral changes
**Depends on:** Phase 6
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. `packages/auth/` exists with structure matching mydeffo 1:1 (file names, export shape, dependency set scoped to auth)
  2. `packages/api/src/auth.ts` no longer contains BetterAuth config (removed or thin re-export)
  3. `apps/web` and `apps/server` import auth from `@locnative/auth` — no direct imports from `packages/api`
  4. `pnpm install` + `pnpm build` succeed at repo root; `pnpm dlx ultracite check` clean on touched files
  5. Dev sign-in flow (GitHub OAuth) still works end-to-end — no regression
**Plans:** 3 plans

Plans:
- [ ] 07-01-PLAN.md — Plans pre-drafted (see phase dir); adopt via /gsd:plan-phase 7 or execute directly
- [ ] 07-02-PLAN.md — Plans pre-drafted (see phase dir)
- [ ] 07-03-PLAN.md — Plans pre-drafted (see phase dir)

### Phase 8: Teams — creation, email invitations (Resend), and auto-generated per-member API keys scoped to the team

**Goal:** Turn the static `/team` route into a functional multi-user workspace — users create Teams, invite members by email (Resend), and every member gets an auto-generated API key that authorizes requests against any project in that team; removal from the team revokes authorization at the middleware
**Depends on:** Phase 7
**Requirements**: TBD (no REQ-IDs in REQUIREMENTS.md matched this phase scope; coverage added when requirements doc is updated for Teams)
**Plans:** 1/7 plans executed

Plans:
- [x] 08-01-PLAN.md — Teams/members/invitations schema, nullable teamId on projects+apiKeys, encrypted-secret columns, env vars
- [ ] 08-02-PLAN.md — Backfill Personal teams, reassign projects+apiKeys, tighten team_id to NOT NULL, drop legacy index
- [ ] 08-03-PLAN.md — AES-256-GCM crypto helper + BetterAuth organization plugin (Resend sendInvitationEmail, user.create.after auto-Personal-team, organizationClient)
- [ ] 08-04-PLAN.md — teams-server + api-keys-server createServerFns, membership-aware api-key-auth middleware, afterAcceptInvitation auto-key hook
- [ ] 08-05-PLAN.md — /invite/:id route, OneTimeKeyModal, TeamSwitcher component + sidebar integration
- [ ] 08-06-PLAN.md — /team route rewrite with live data, InviteMemberDialog, RemoveMemberAlert, ?newKey reveal flow
- [ ] 08-07-PLAN.md — Thread active teamId through /projects and /api-keys; owner-gated Reveal key; full phase UAT

---

# Milestone 2 — Platform Parity & Distribution

> Source: competitive analysis vs Mapbox/Radar/Mappify (`docs/competitive-analysis-2026-06.md`,
> `docs/analysis/mapbox-comparative-analysis.md`). Closes the developer-distribution and
> routing-depth gaps that data-API buyers expect, while deliberately declining the
> map-rendering arms race. Phase numbering continues from Milestone 1.

**Sequencing rationale:** P0 (publish SDK) is the highest-ROI, hours-sized item and ships
first. P2/P3/P4 are server-side, buildable on the existing OSRM + PostGIS + oRPC stack and
follow in priority order. **P1 (client/mobile SDKs)** is multi-quarter native work and is
tracked as its own future milestone (below), not a phase here.

- [ ] **Phase 9: Publish the TypeScript SDK to npm** (P0) — the built/hardened `@locnative/sdk` becomes installable
- [x] **Phase 10: Advanced routing** (P2) — matrix, multi-profile, isochrones, map-matching, optimisation on existing OSRM (code+tests complete on feat/routing-multiprofile; OSRM 3-profile car/bike/foot **deployed & verified** 2026-06-14 on locnative-osrm.fly.dev; remaining: API-key end-to-end smokes + SDK publish via Phase 9)
- [ ] **Phase 11: Server-side DX completion** (P3) — error envelope, rate-limit headers, idempotency enforcement + Python SDK
- [ ] **Phase 12: Places/POI + address validation** (P4) — AU POI search + G-NAF-canonical address validation

## Phase Details

### Phase 9: Publish the TypeScript SDK to npm
**Goal:** The already-built, hardened `@locnative/sdk` is installable from npm — moving the SDK from "shipped as code" to "on the registry" so its value reaches buyers
**Depends on:** Nothing (independent of Milestone 1; the SDK package already exists)
**Requirements**: SDK-PUB-01..05 (added to REQUIREMENTS.md when this phase is finalised)
**Decisions (locked 2026-06-11):** proprietary/custom license (published publicly, restricted terms via `license: "SEE LICENSE IN LICENSE"` + LICENSE file — NOT `private:true`); manual first publish via `prepublishOnly` gate, CI/changesets deferred to a follow-up
**Success Criteria** (what must be TRUE):
  1. `packages/sdk/LICENSE` exists with the proprietary terms and `package.json` `license` is `SEE LICENSE IN LICENSE` (no longer `UNLICENSED`)
  2. `pnpm -F @locnative/sdk build && pnpm -F @locnative/sdk lint:pkg && pnpm -F @locnative/sdk smoke` all pass (dist builds, `publint` + `attw` clean, smoke imports resolve)
  3. `npm publish --dry-run` (or `pnpm publish --dry-run`) shows the correct file set (dist + README + LICENSE + CHANGELOG) and the scoped public access config
  4. `@locnative/sdk@0.2.0` is live on npm and `npm install @locnative/sdk` resolves in a clean external project
  5. README install/quickstart verified against the published artifact (not the workspace source)
**Plans:** 1 plan

Plans:
- [ ] 09-01-PLAN.md — License + publish-readiness gate + manual first publish of @locnative/sdk@0.2.0

### Phase 10: Advanced routing (matrix · multi-profile · isochrones · map-matching · optimisation)
**Goal:** Routing reaches Mappify/Mapbox parity beyond point-to-point driving directions — N×M matrices, walking/cycling profiles, reachability isochrones, GPS map-matching, and route optimisation, all on the existing self-hosted OSRM + PostGIS
**Depends on:** Nothing hard (extends the live `/api/v1/routing/directions`); can run in parallel with Phase 9
**Requirements**: ROUTE-* (TBD)
**Success Criteria** (what must be TRUE):
  1. `/api/v1/routing/matrix` returns N×M durations/distances via OSRM `/table`
  2. `directions` accepts `profile=walking|cycling` (OSRM foot/bike profiles deployed)
  3. `/api/v1/routing/isochrone` returns reachability polygons (PostGIS hull over sampled OSRM points); optional ABS-region overlap
  4. `/api/v1/routing/match` snaps a GPS trace to roads via OSRM `/match`
  5. `/api/v1/routing/optimize` solves a TSP/VRP ordering (OSRM Trip or VROOM sidecar)
  6. Each new endpoint has an SDK method on the `routing` resource + tests
**Plans:** 5 plans (wave 1: 01 → wave 2: 02/03/04 parallel → wave 3: 05)

Plans:
- [x] 10-01-PLAN.md — Profile-aware OSRM client + `/matrix` (OSRM `/table`) + multi-profile `directions` + foot/bike OSRM infra (code-complete; OSRM rebuild+volume migration pending deploy window)
- [x] 10-02-PLAN.md — `/isochrone` reachability polygons (sample → `/table` → PostGIS hull → optional ABS overlap) (code+tests complete; ST_ConcaveHull confirmed on Neon; live smoke pending OSRM deploy)
- [x] 10-03-PLAN.md — `/match` GPS map-matching (OSRM `/match`) (code+tests complete; live smoke pending OSRM deploy)
- [x] 10-04-PLAN.md — `/optimize` TSP ordering (OSRM `/trip`; VROOM deferred) (code+tests complete; D2 resolved OSRM Trip; live smoke pending OSRM deploy)
- [x] 10-05-PLAN.md — SDK `routing` methods + types + tests for all four new endpoints (build + lint:pkg clean; no version bump — publishing deferred to Phase 9)

### Phase 11: Server-side DX completion (API contract enforcement + Python SDK)
**Goal:** The server emits and enforces the resilience signals the TS SDK already sends, and a Python SDK mirrors the proven namespaced surface — completing the server-side developer story
**Depends on:** Phase 9 (publish flow proven for TS before mirroring to Python)
**Requirements**: DX-* (TBD)
**Success Criteria** (what must be TRUE):
  1. All API errors return a consistent typed envelope (`code`, `message`, `requestId`, `docUrl`, `fields`)
  2. Responses carry rate-limit headers (`RateLimit-*` / `Retry-After`)
  3. Idempotency-Key is enforced server-side (duplicate writes deduplicated, not just accepted)
  4. A Python SDK mirrors the TS resource namespaces with retries/typed errors and is publishable to PyPI
**Plans:** 4 plans (wave 1: 01 → wave 2: 02/03 parallel → wave 3: 04)

Plans:
- [ ] 11-01-PLAN.md — Unify all public errors into the typed envelope (`code`, `message`, `requestId`, `docUrl`, `fields`) + `X-Request-Id`
- [ ] 11-02-PLAN.md — Live per-API-key rate limiter (Cloudflare KV) + IETF `RateLimit-*` / `Retry-After` headers
- [ ] 11-03-PLAN.md — Server-side `Idempotency-Key` enforcement (Postgres `idempotency_keys`, `ON CONFLICT` — no transactions)
- [ ] 11-04-PLAN.md — Python SDK mirroring the TS surface (httpx + hatchling) + manual PyPI publish

### Phase 12: Places/POI + address validation
**Goal:** Move beyond addresses — AU POI/category search (Radar Places parity) and a G-NAF-canonical address validation endpoint that Locnative can do better than Mapbox/Google for AU
**Depends on:** Phase 5 (tiered search infra is reused for POI ranking)
**Requirements**: PLACE-*, VALID-* (TBD)
**Success Criteria** (what must be TRUE):
  1. An AU POI dataset (OSM POIs or licensed) is ingested and queryable
  2. `/api/v1/places/search` supports text + category filters with ranked results
  3. `/api/v1/addresses/validate` returns a corrected/standardised G-NAF-canonical address + confidence score
  4. Both endpoints have SDK methods + tests
**Plans:** 4 plans (wave 1: 01 → wave 2: 02/03 parallel → wave 3: 04)

Plans:
- [ ] 12-01-PLAN.md — POI ingestion: `places` table (PostGIS + trigram) + category taxonomy/OSM tag map + idempotent importer
- [ ] 12-02-PLAN.md — `GET /api/v1/places/search` reusing the Phase 5 tier engine (text + category + proximity ranking)
- [ ] 12-03-PLAN.md — `GET /api/v1/addresses/validate` — canonical G-NAF resolution + confidence scorer
- [ ] 12-04-PLAN.md — SDK `places` resource + `addresses.validate` + tests

---

## Future Milestone (scoped separately) — Client / Mobile SDKs (P1)

**Not a phase in Milestone 2.** Drop-in iOS / Android / React Native SDKs handling background
location, battery, permissions, and on-device geofence evaluation — the single largest
strategic investment and Radar's core moat. Multi-quarter native effort requiring its own
milestone discovery (`/gsd-new-milestone`) before any phase planning. Captured here so it is
not lost; deliberately deferred until the server-side parity work (Phases 9–12) lands.
