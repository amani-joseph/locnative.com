# Roadmap: Locnative — Projects & API Key Management

> Tactical roadmap for the current execution track.
> For the strategic 18-month platform roadmap, see `PLATFORM-ROADMAP.md` and `PLATFORM-MILESTONES.md`.

## Overview

Transform Locnative from a flat user-to-key model into a project-scoped API key management system. The work progresses from database schema changes (preserving existing keys), through project CRUD, project-scoped key management, key lifecycle features, and finally an integrated dashboard experience. Each phase delivers a complete vertical slice that can be verified independently.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema & Migration** - Database foundation with projects table, key scoping, and backward-compatible migration
- [ ] **Phase 2: Project Management** - Full project CRUD with server functions and UI
- [ ] **Phase 3: Project-Scoped Keys** - API key creation, viewing, and deletion within project context
- [ ] **Phase 4: Key Lifecycle & Usage** - Expiration, revocation, and usage tracking per key
- [ ] **Phase 5: Dashboard & Integration** - Integrated project-key views, onboarding flow, and project-scoped dashboard

## Phase Details

### Phase 1: Schema & Migration
**Goal**: Database schema supports projects and project-scoped keys without breaking any existing API keys
**Depends on**: Nothing (first phase)
**Requirements**: MIG-01, MIG-02
**Success Criteria** (what must be TRUE):
  1. A `projects` table exists with name, description, and user ownership columns
  2. The `api_keys` table has a `project_id` foreign key linking every key to a project
  3. All existing API keys continue to authenticate successfully against the geocoding API
  4. Each existing user has a default project with their orphaned keys assigned to it
**Plans**: 1 plan

Plans:
- [ ] 01-01-PLAN.md — Create projects schema, update api_keys with project_id, backfill default projects

### Phase 2: Project Management
**Goal**: Users can create, view, edit, and delete projects with full cascade behavior
**Depends on**: Phase 1
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Success Criteria** (what must be TRUE):
  1. User can create a new project by providing a name and description
  2. User can see a list of all their projects on the projects page
  3. User can edit a project's name and description after creation
  4. User can delete a project and all its API keys are removed with it
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 02-01: TBD

### Phase 3: Project-Scoped Keys
**Goal**: Users can generate, name, view, and delete API keys within the context of a specific project
**Depends on**: Phase 2
**Requirements**: KEY-01, KEY-02, KEY-03, KEY-05
**Success Criteria** (what must be TRUE):
  1. User can generate a new API key from within a specific project
  2. User can assign a descriptive name/label when creating a key
  3. The full API key secret is displayed exactly once at creation time (never again)
  4. User can permanently delete an API key from a project
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: TBD

### Phase 4: Key Lifecycle & Usage
**Goal**: Users have full control over key lifecycle with expiration, revocation, and usage visibility
**Depends on**: Phase 3
**Requirements**: KEY-04, KEY-06, KEY-07, KEY-08
**Success Criteria** (what must be TRUE):
  1. User can revoke an API key, making it immediately stop working without deleting it
  2. User can set an optional expiration date when creating or editing a key
  3. An expired API key is automatically rejected when used against the geocoding API
  4. User can see the last-used timestamp and total request count for each API key
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: TBD

### Phase 5: Dashboard & Integration
**Goal**: Users experience a polished, integrated view of projects with keys and project-scoped usage on the dashboard
**Depends on**: Phase 4
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. The projects page displays each project with its API keys in a single integrated view (no separate keys page needed)
  2. After creating a new project, user is prompted to create their first API key immediately
  3. The dashboard shows usage data broken down by project rather than flat across all keys
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & Migration | 0/1 | Planning complete | - |
| 2. Project Management | 0/0 | Not started | - |
| 3. Project-Scoped Keys | 0/0 | Not started | - |
| 4. Key Lifecycle & Usage | 0/0 | Not started | - |
| 5. Dashboard & Integration | 0/0 | Not started | - |
