# Platform Phase 01: Core API and Developer Foundation

## Goal

Establish Locnative as a reliable, documented, production-grade API platform that developers can adopt without manual support.

## Timeline

- Months 1-3

## Depends On

- None

## Strategic Outcomes

- Stable v1 REST endpoint surface
- Developer authentication and access foundation
- First usable portal, docs, and reference experience
- Baseline operational SLOs

## Strategic Requirements

- `P1-R01` Stable v1 address endpoints
- `P1-R02` Developer API authentication
- `P1-R03` Self-serve project and key setup
- `P1-R04` Developer docs and reference experience
- `P1-R05` Baseline platform observability

## Milestones

- `M1` Core endpoint contract stabilization
  - advances `P1-R01` and `P1-R04`
- `M2` Auth and developer access foundation
  - advances `P1-R02` and `P1-R03`
- `M3` Developer portal and reference experience
  - advances `P1-R03` and `P1-R04`
- `M4` Observability and baseline platform SLOs
  - advances `P1-R05`

## Candidate Tactical Workstreams

- Normalize endpoint contracts and error handling
- Finish project and API key onboarding flow
- Improve API explorer and docs routes into a real developer portal
- Add request visibility, latency tracking, and uptime baseline reporting

## Success Criteria

1. A new developer can authenticate and make a successful request quickly.
2. Core endpoints are stable enough to support SDK work without churn.
3. Documentation covers onboarding, auth, example requests, and response structure.
4. The team can measure the platform well enough to enforce latency and uptime expectations.

## Repo Mapping

- API surface: `packages/api`, `apps/web/src/routes/api`
- Product onboarding: `apps/web/src/routes/_protected`, `apps/web/src/lib`
- Docs and explorer: `apps/web/src/routes/docs.tsx`, `apps/web/src/components/api-explorer.tsx`, `apps/web/src/components/docs-page.tsx`
- Data and auth foundations: `packages/database`, `apps/server`

## Immediate Execution Priority

This is the active strategic phase for the current repo.

Near-term tactical work should favor:

- developer access flows
- API docs and explorer quality
- endpoint contract cleanup
- measurement and reliability basics

## Prompting Reference

When requesting execution against this phase, reference both:

- milestone ID
- strategic requirement ID

Example prompt shape:

- "Implement `M2` in support of `P1-R02` and `P1-R03`."

## Open Questions

- Which current API routes are already close to v1-stable?
- What is the minimum docs experience required to declare Phase 1 complete?
- Which telemetry is mandatory before claiming platform readiness?
