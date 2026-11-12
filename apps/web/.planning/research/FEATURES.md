# Feature Landscape: Project & API Key Management

**Domain:** SaaS API key management for a geocoding service
**Researched:** 2026-04-12
**Confidence:** MEDIUM (based on established patterns from Stripe, Google Cloud Console, AWS IAM, Mapbox, Twilio, SendGrid, OpenCage, Positionstack; no live web verification available)

## Table Stakes

Features users expect from any API product with project/key management. Missing = product feels amateur or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Project CRUD** (create, rename, delete) | Every API console has workspaces/projects. Users need to separate prod/staging/dev or different apps. | Low | Already scoped in PROJECT.md requirements |
| **API key generation scoped to project** | Keys must belong to something. Unscoped keys become unmanageable past 3-4 keys. | Low | Requires `project_id` FK on existing keys table |
| **Key naming/labeling** | Users need to identify keys without revealing them. "Production Backend" vs "Staging Mobile". | Low | Simple text field |
| **Key revocation (soft delete)** | Users who leak a key need to kill it immediately without destroying usage history. Every API console supports this. | Low | Boolean `revoked` + `revoked_at` timestamp |
| **Key deletion (hard delete)** | GDPR/cleanup. Users should be able to permanently remove keys they no longer want. | Low | CASCADE or soft-delete with purge |
| **Show key only once at creation** | Security standard. Full key visible only at creation time, then masked. Stripe, Google, AWS all do this. | Low | Already implemented in existing key generation |
| **Copy-to-clipboard on creation** | If user can't copy the key easily, they'll screenshot it or write it down -- worse security. | Low | Single button, trivial UX |
| **Usage stats per key** | Users need to know which key is generating traffic. Essential for debugging and cost attribution. | Medium | Already have `api_usage_daily` table; need per-project aggregation |
| **Last-used timestamp per key** | "Is this key still active?" is the #1 question when users audit their keys. | Low | Already tracked or derivable from usage table |
| **Project-scoped usage dashboard** | Users managing multiple apps need usage broken down by project, not just globally. | Medium | Aggregation queries across keys in a project |
| **Cascade delete keys on project deletion** | Orphaned keys are a security risk and confuse users. Every major platform cascades. | Low | DB constraint + confirmation dialog |
| **Confirmation dialog for destructive actions** | Deleting projects/keys is irreversible. Users expect a "are you sure?" step. | Low | Modal with project/key name confirmation |

## Differentiators

Features that set Locnative apart from commodity geocoding APIs. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Key expiration dates** | Auto-expire keys for contractors, trials, or security rotation policies. Most geocoding APIs don't offer this -- Google and Mapbox don't have per-key expiry. | Low | `expires_at` timestamp + validation check in auth middleware |
| **First-key onboarding prompt** | After project creation, prompt to create first key + show quick-start code snippet. Reduces time-to-first-request dramatically. | Medium | Guided flow with code examples for curl/JS/Python |
| **Inline API test/explorer** | "Try it now" button that fires a test request using the newly created key. Positionstack and OpenCage have this; most geocoding APIs don't. | Medium | Already have `api-explorer.tsx` scaffolded |
| **Usage sparkline per key** | Tiny 7-day chart next to each key showing request volume trend. Visual "is this key healthy?" signal. | Medium | Recharts already in stack; needs daily usage query |
| **Project environment labels** | Tag projects as "Production" / "Staging" / "Development" with visual indicators. Helps users organize without enforcing structure. | Low | Enum field + colored badge |
| **Key prefix display** | Show `wh_abc1...` prefix so users can identify which key matches their config without exposing the full key. | Low | Store/derive prefix at creation time |
| **Bulk key management** | Select multiple keys to revoke/delete at once. Useful when rotating all keys in a project. | Medium | Multi-select UI + batch server function |
| **Request log preview** | Show last 5-10 requests per key with timestamp, endpoint, and status. Not full logging, just recent activity. | High | Requires request-level logging infrastructure, not just daily aggregates |

## Anti-Features

Features to explicitly NOT build in this milestone. Each has a clear reason.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Per-key endpoint permissions** (e.g., allow autocomplete but block reverse geocode) | Over-engineering for a 2-endpoint API. Adds complexity to auth middleware and confuses users with only 2 endpoints. | Revisit if/when API has 5+ endpoints with different cost profiles |
| **Team/org sharing on projects** | Requires invitation system, role management, org billing. Massive scope increase for a feature most early users don't need. | Single-user projects for now. Add team features when users request it. |
| **API key rate limiting configuration per key** | Requires rate limiting infrastructure (Redis/token bucket). Rate limits should be plan-level, not key-level, for a geocoding API. | Implement plan-level rate limits globally when billing is wired |
| **Webhook notifications for key events** | Requires webhook infrastructure, retry logic, delivery tracking. Overkill for key management. | Email notifications for key expiry warnings if needed later |
| **API versioning UI** | Only one API version (v1) exists. Building version management UI is premature. | Add version selector only when v2 ships |
| **Key rotation (auto-generate replacement)** | Sounds nice but adds complexity: overlapping validity windows, migration coordination. Users can create a new key and revoke the old one manually. | Document the manual rotation process (create new, update config, revoke old) |
| **Project-level billing/invoicing** | Billing page exists but is unwired. Splitting billing per-project requires metering infrastructure and payment provider integration. | Track usage per project (for future billing), but don't build invoicing yet |
| **Audit log for key operations** | Full audit trail (who created/revoked/deleted which key when) is valuable for enterprises but overkill for early-stage. | Log key events to server console. Build audit UI when enterprise features are needed |

## Feature Dependencies

```
Project CRUD ──────────────────┬──> API keys scoped to project
                               │
                               ├──> Project-scoped usage dashboard
                               │
                               └──> Cascade delete (keys on project delete)

API keys scoped to project ────┬──> Key naming/labeling
                               │
                               ├──> Key revocation (soft delete)
                               │
                               ├──> Key expiration dates
                               │
                               ├──> Usage stats per key
                               │     └──> Usage sparkline per key
                               │
                               ├──> Last-used timestamp
                               │
                               └──> First-key onboarding prompt
                                     └──> Inline API test/explorer

Key naming/labeling ───────────> Key prefix display (derive from name context)

Project CRUD ──────────────────> Project environment labels (optional metadata)
```

## MVP Recommendation

**Prioritize (must ship together):**

1. **Project CRUD** -- foundation for everything else
2. **API keys scoped to project** -- the core relationship change
3. **Key naming/labeling** -- essential for usability
4. **Key revocation** -- security table stakes
5. **Show key once + copy-to-clipboard** -- already exists, ensure it works in new flow
6. **Cascade delete on project deletion** -- data integrity
7. **Project-scoped usage dashboard** -- proves the value of project organization
8. **Last-used timestamp** -- minimal effort, high value for key auditing

**Ship shortly after (high-value, low-complexity):**

9. **Key expiration dates** -- differentiator, low effort (one timestamp field + auth check)
10. **First-key onboarding prompt** -- reduces time-to-first-request
11. **Key prefix display** -- helps identify keys in config
12. **Project environment labels** -- low effort organizational aid

**Defer:**

- **Usage sparkline per key** -- nice but requires charting per-key, can add incrementally
- **Inline API test/explorer** -- scaffolded but not critical for key management milestone
- **Bulk key management** -- only matters when users have many keys
- **Request log preview** -- requires infrastructure changes to log individual requests

## Confidence Notes

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Table stakes features | HIGH | Consistent across every API management console (Stripe, Google Cloud, AWS, Mapbox, Twilio). These are universal patterns. |
| Differentiators | MEDIUM | Based on analysis of geocoding-specific competitors (Positionstack, OpenCage, Google Maps Platform, Mapbox). Training data may not reflect latest feature additions. |
| Anti-features | HIGH | Based on clear scope boundaries in PROJECT.md and standard SaaS product staging principles. Over-building auth/billing infrastructure early is a well-documented anti-pattern. |
| Dependencies | HIGH | Derived directly from data model relationships (projects own keys, keys have usage). |
| MVP ordering | HIGH | Follows dependency graph -- can't have scoped keys without projects, can't have project usage without scoped keys. |

## Sources

- Stripe Dashboard API key management patterns (training knowledge)
- Google Cloud Console project/credentials management (training knowledge)
- AWS IAM access key lifecycle (training knowledge)
- Mapbox account/token management (training knowledge)
- Twilio/SendGrid API key management (training knowledge)
- Positionstack and OpenCage geocoding API dashboards (training knowledge)
- PROJECT.md requirements and constraints (local project file)

*Note: WebSearch was unavailable during this research. All competitive analysis is based on training data (cutoff ~May 2025). Feature sets of competitors may have changed since then. Flag as MEDIUM confidence for differentiator claims.*
