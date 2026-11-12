# Platform Milestones: Locnative API Platform

## Purpose

This document breaks the strategic platform roadmap into executable milestone units that can later be converted into tactical roadmap items, phase plans, and implementation work.

## Milestone Format

Each milestone should be executable as a vertical slice:

- one user-visible or platform-visible outcome
- clear repo areas touched
- measurable completion criteria
- obvious strategic phase alignment
- explicit strategic requirement ID mapping

## Phase 1 Milestones: Core API and Developer Foundation

### M1. Core endpoint contract stabilization

- Outcome: the core v1 address endpoints are stable, documented, and internally consistent
- Strategic requirements advanced:
  - `P1-R01`
  - `P1-R04`
- Likely repo areas:
  - `packages/api`
  - `apps/web/src/routes/api`
  - `packages/database`
- Completion criteria:
  - core endpoints respond with consistent envelopes
  - errors and status codes are normalized
  - endpoint naming and versioning are explicit

### M2. Auth and developer access foundation

- Outcome: developers can authenticate, create projects, mint keys, and make successful API calls
- Strategic requirements advanced:
  - `P1-R02`
  - `P1-R03`
- Likely repo areas:
  - `apps/web/src/lib`
  - `apps/web/src/routes/_protected`
  - `packages/api`
  - `packages/database`
- Completion criteria:
  - API key lifecycle works for first-party onboarding
  - project-scoped key model is stable
  - protected product flows support developer self-serve setup

### M3. Developer portal and reference experience

- Outcome: a developer can learn the API, test it, and understand payloads without support help
- Strategic requirements advanced:
  - `P1-R03`
  - `P1-R04`
- Likely repo areas:
  - `apps/web/src/routes/docs.tsx`
  - `apps/web/src/routes/_protected/api-docs.tsx`
  - `apps/web/src/components/docs-page.tsx`
  - `apps/web/src/components/api-explorer.tsx`
- Completion criteria:
  - quickstart path exists
  - interactive examples exist
  - response and auth documentation are clear

### M4. Observability and baseline platform SLOs

- Outcome: the team can measure and defend a v1 reliability baseline
- Strategic requirements advanced:
  - `P1-R05`
- Likely repo areas:
  - `packages/api`
  - `apps/server`
  - monitoring and deployment config
- Completion criteria:
  - latency and uptime targets are defined
  - basic request visibility exists
  - platform regressions can be detected quickly

## Phase 2 Milestones: SDKs and Framework Components

### M5. JavaScript and TypeScript SDK

- Outcome: developers can integrate without hand-writing raw fetch logic
- Strategic requirements advanced:
  - `P2-R01`
  - `P2-R02`
  - `P2-R05`
- Completion criteria:
  - a first-party JS/TS SDK exists
  - core responses are strongly typed
  - auth and request ergonomics are first-class

### M6. React integration layer

- Outcome: React users can adopt Locnative with provider, hooks, and drop-in components
- Strategic requirements advanced:
  - `P2-R03`
  - `P2-R05`
- Completion criteria:
  - provider and hooks exist
  - address input primitives exist
  - component escape hatches are documented

### M7. Python SDK and backend integration docs

- Outcome: backend teams can adopt the API with first-party Python support
- Strategic requirements advanced:
  - `P2-R04`
  - `P2-R05`
- Completion criteria:
  - sync and async clients exist
  - response models are typed
  - framework-specific onboarding docs exist

## Phase 3 Milestones: Platform, Billing and Ecosystem

### M8. Developer dashboard and usage visibility

- Outcome: customers can inspect requests, usage, and trends from the product
- Strategic requirements advanced:
  - `P3-R01`
  - `P3-R05`
- Completion criteria:
  - usage analytics exist
  - request inspection exists
  - customers can understand current consumption

### M9. Billing, limits, and spend controls

- Outcome: platform monetization is operationally real and visible
- Strategic requirements advanced:
  - `P3-R02`
  - `P3-R05`
- Completion criteria:
  - pricing model is productized
  - spend alerts and limits exist
  - account tiers are enforceable

### M10. Async workflows and eventing

- Outcome: customers can use batch jobs and webhooks for higher-volume or back-office workflows
- Strategic requirements advanced:
  - `P3-R03`
  - `P3-R05`
- Completion criteria:
  - batch geocoding exists
  - batch validation exists
  - webhooks are configurable and observable

### M11. Ecosystem reach

- Outcome: the platform reaches more developers through frameworks, integrations, and community touchpoints
- Strategic requirements advanced:
  - `P3-R04`
- Completion criteria:
  - additional framework bindings exist
  - at least one meaningful no-code or commerce integration exists
  - community support channels are established

## Phase 4 Milestones: Intelligence, Scale and Enterprise

### M12. Intelligence layer

- Outcome: Locnative ships differentiated address intelligence features beyond commodity lookup
- Strategic requirements advanced:
  - `P4-R01`
  - `P4-R05`
- Completion criteria:
  - fuzzy matching exists
  - deduplication exists
  - deliverability scoring exists

### M13. Enterprise trust package

- Outcome: enterprise buyers can evaluate Locnative as a serious vendor
- Strategic requirements advanced:
  - `P4-R02`
  - `P4-R05`
- Completion criteria:
  - compliance posture is documented
  - auditability exists
  - deployment and residency options are defined

### M14. Scale architecture

- Outcome: the platform can sustain global traffic with better performance characteristics
- Strategic requirements advanced:
  - `P4-R03`
  - `P4-R05`
- Completion criteria:
  - edge or regional strategy is operational
  - caching strategy is measurable
  - load testing becomes repeatable

### M15. Growth and ecosystem defensibility

- Outcome: adoption grows through partners, certification, content, and community leverage
- Strategic requirements advanced:
  - `P4-R04`
  - `P4-R05`
- Completion criteria:
  - partner motion exists
  - developer education and certification path exists
  - selected platform assets are reusable and promotable

## Recommended Conversion Path

Convert milestones into tactical execution in this order:

1. Phase 1 milestones first, starting with M2 and M3 because they align most closely with the current repo state.
2. Use the existing `apps/web/.planning/ROADMAP.md` as the short-horizon execution track.
3. When a tactical roadmap item is created, annotate which platform milestone and strategic requirement IDs it advances.

## Immediate Next Milestones for This Repo

- M2. Auth and developer access foundation
- M3. Developer portal and reference experience
- M1. Core endpoint contract stabilization

Those three milestones are the best bridge from the current codebase to the strategic roadmap.
