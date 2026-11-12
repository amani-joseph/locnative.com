# Platform Phase 03: Platform, Billing and Ecosystem

## Goal

Operationalize Locnative as a self-serve platform with visibility, pricing, async workflows, and broader integration reach.

## Timeline

- Months 8-12

## Depends On

- Platform Phase 02

## Strategic Outcomes

- Developer dashboard with real usage visibility
- Productized billing and spend controls
- webhook and batch processing support
- broader framework and ecosystem reach

## Strategic Requirements

- `P3-R01` Usage visibility
- `P3-R02` Billing and spend controls
- `P3-R03` Async workflows
- `P3-R04` Ecosystem expansion
- `P3-R05` Cohesive platform operations

## Milestones

- `M8` Developer dashboard and usage visibility
  - advances `P3-R01` and `P3-R05`
- `M9` Billing, limits, and spend controls
  - advances `P3-R02` and `P3-R05`
- `M10` Async workflows and eventing
  - advances `P3-R03` and `P3-R05`
- `M11` Ecosystem reach
  - advances `P3-R04`

## Candidate Tactical Workstreams

- Expand dashboard analytics beyond current project/key views
- introduce spend projections and account controls
- add batch geocoding and validation jobs
- define webhook event contracts and delivery tracking
- ship at least one ecosystem integration with clear value

## Success Criteria

1. Customers can understand usage and projected cost without contacting support.
2. Billing and limits are visible and enforceable.
3. High-volume and async workflows are supported cleanly.
4. The platform reaches new adoption surfaces through integrations and framework coverage.

## Repo Mapping

- Dashboard and product UX: `apps/web/src/routes/_protected`
- API and job orchestration: `packages/api`, `apps/server`
- database support: `packages/database`

## Readiness Gate

Do not treat this phase as complete until usage, pricing, and async workflows all work together coherently.

Shipping one of those without the others creates platform confusion.

## Prompting Reference

When requesting execution against this phase, reference both:

- milestone ID
- strategic requirement ID

Example prompt shape:

- "Plan `M9` in support of `P3-R02` while preserving `P3-R05` coherence."

## Open Questions

- What billing model should be introduced first: simple usage tiers or true pay-as-you-go?
- Should batch processing live in the main app stack or a dedicated worker/service?
- Which integration surface creates the strongest distribution advantage first?
