# Platform Phase 02: SDKs and Framework Components

## Goal

Turn Locnative from a raw HTTP API into a developer platform with first-party SDKs and drop-in framework primitives.

## Timeline

- Months 4-7

## Depends On

- Platform Phase 01

## Strategic Outcomes

- JavaScript and TypeScript SDK
- React integration surface with hooks and components
- Python SDK for backend adoption
- clear SDK lifecycle, versioning, and migration rules

## Strategic Requirements

- `P2-R01` First-party JS/TS SDK
- `P2-R02` Typed client contracts
- `P2-R03` React integration primitives
- `P2-R04` Python backend support
- `P2-R05` SDK lifecycle discipline

## Milestones

- `M5` JavaScript and TypeScript SDK
  - advances `P2-R01`, `P2-R02`, and `P2-R05`
- `M6` React integration layer
  - advances `P2-R03` and `P2-R05`
- `M7` Python SDK and backend integration docs
  - advances `P2-R04` and `P2-R05`

## Candidate Tactical Workstreams

- Extract stable API client primitives from current app code
- Define typed response contracts suitable for SDK packaging
- Create a React provider and address-input primitives
- Publish SDK examples and migration guidance
- Add Python clients for common workflows

## Success Criteria

1. A developer can adopt the platform through a first-party SDK instead of raw fetch calls.
2. React teams can integrate core flows with provider, hook, and component primitives.
3. Backend teams have at least one supported non-JavaScript SDK path.
4. SDK releases can evolve without breaking adopters unexpectedly.

## Repo Mapping

- Shared client logic: `packages/api`
- UI primitives: `packages/ui`, `apps/web/src/components`
- Documentation and examples: docs routes and API explorer surfaces

## Readiness Gate

Do not start this phase fully until:

- endpoint contracts are stable
- auth and project/key setup are easy to understand
- docs cover the base API clearly enough to support SDK onboarding

## Prompting Reference

When requesting execution against this phase, reference both:

- milestone ID
- strategic requirement ID

Example prompt shape:

- "Plan `M5` in support of `P2-R01` and `P2-R02`."

## Open Questions

- Should JS/TS SDK live in `packages/api` or a dedicated package?
- Which React components should ship first versus remain app-local?
- What is the minimum Python scope for first release?
