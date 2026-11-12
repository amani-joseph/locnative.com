# Requirements: Locnative — Projects & API Key Management

**Defined:** 2026-04-12
**Core Value:** Users can create projects and generate API keys to access the geocoding API, with clear visibility into usage per project and per key.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Projects

- [ ] **PROJ-01**: User can create a project with a name and description
- [ ] **PROJ-02**: User can view a list of all their projects
- [ ] **PROJ-03**: User can edit a project's name and description
- [ ] **PROJ-04**: User can delete a project, which cascade-deletes all its API keys

### API Keys

- [ ] **KEY-01**: User can generate an API key scoped to a specific project
- [ ] **KEY-02**: User can assign a name/label to each API key
- [ ] **KEY-03**: API key secret is shown only once at creation time
- [ ] **KEY-04**: User can revoke (invalidate) an API key without deleting it
- [ ] **KEY-05**: User can permanently delete an API key
- [ ] **KEY-06**: User can set an optional expiration date on an API key
- [ ] **KEY-07**: Expired API keys are automatically rejected at validation time
- [ ] **KEY-08**: User can see last-used timestamp and request count per API key

### Migration

- [ ] **MIG-01**: Existing API keys continue working after migration (no breaking changes)
- [ ] **MIG-02**: Database migration adds projects table and scopes existing keys to a default project per user

### UI

- [ ] **UI-01**: Projects page displays projects with their API keys in an integrated view
- [ ] **UI-02**: After creating a project, user is prompted to create their first API key
- [ ] **UI-03**: Dashboard reflects project-scoped usage data

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Permissions

- **PERM-01**: API keys can be limited to specific API endpoints or actions
- **PERM-02**: Project-level role assignments (viewer, editor, admin)

### Team

- **TEAM-01**: Users can invite team members to a project
- **TEAM-02**: Project ownership can be transferred

### Billing

- **BILL-01**: Usage-based billing per project
- **BILL-02**: Rate limiting enforcement per API key based on plan

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-key endpoint permissions | Adds complexity without clear user demand for v1 |
| Team/org project sharing | No multi-user support needed yet |
| Billing integration | Billing page exists but wiring deferred |
| Convex backend migration | All data already in Neon PostgreSQL |
| API key rotation (auto-replace) | Can revoke + create new key manually |
| Audit logs | Not needed for v1, adds significant complexity |
| Per-key rate limiting | Rate limiting is a platform concern, not per-key for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROJ-01 | Phase 2 | Pending |
| PROJ-02 | Phase 2 | Pending |
| PROJ-03 | Phase 2 | Pending |
| PROJ-04 | Phase 2 | Pending |
| KEY-01 | Phase 3 | Pending |
| KEY-02 | Phase 3 | Pending |
| KEY-03 | Phase 3 | Pending |
| KEY-04 | Phase 4 | Pending |
| KEY-05 | Phase 3 | Pending |
| KEY-06 | Phase 4 | Pending |
| KEY-07 | Phase 4 | Pending |
| KEY-08 | Phase 4 | Pending |
| MIG-01 | Phase 1 | Pending |
| MIG-02 | Phase 1 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation*
