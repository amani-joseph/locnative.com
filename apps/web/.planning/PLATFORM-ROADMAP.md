# Platform Roadmap: Locnative API Platform

## Purpose

This document translates the 18-month Locnative platform roadmap into repo-local planning artifacts that are actionable for engineering.

This is a strategic planning layer.

It does not replace the existing tactical `.planning` track for project and API key management. Instead, it provides the longer-horizon structure that tactical work should map into.

## Time Horizon

- Duration: 18 months
- Phases: 4
- Planning level: strategic platform roadmap

## Strategic Requirement ID Scheme

- Format: `P{phase}-R{nn}`
- Example: `P1-R02` means Phase 1, Requirement 2
- Usage:
  - use requirement IDs when prompting for execution
  - pair them with milestone IDs when possible
  - treat this file as the canonical source of requirement definitions

## Strategic Phases

### Phase 1: Core API and Developer Foundation

- Timeline: Months 1-3
- Goal: launch a reliable, documented, production-grade core API surface for developers
- Primary outcomes:
  - stable v1 REST endpoints
  - authentication and key management foundation
  - developer portal and quickstart experience
  - baseline SLOs for uptime and latency

#### Strategic requirements

- `P1-R01` Stable v1 address endpoints: the core REST surface is explicit, versioned, and internally consistent.
- `P1-R02` Developer API authentication: developers can authenticate to the public API with valid API keys and invalid, revoked, or expired keys are rejected.
- `P1-R03` Self-serve project and key setup: a signed-in developer can create the minimum project and key setup needed to make a successful request.
- `P1-R04` Developer docs and reference experience: onboarding, auth, example requests, and response structure are documented clearly enough for independent adoption.
- `P1-R05` Baseline platform observability: request visibility, uptime expectations, and latency expectations exist well enough to support a production v1 claim.

### Phase 2: SDKs and Framework Components

- Timeline: Months 4-7
- Goal: move from raw API consumption to first-class developer tooling
- Primary outcomes:
  - JavaScript and TypeScript SDK
  - React component library
  - Python SDK
  - stronger SDK lifecycle and versioning discipline

#### Strategic requirements

- `P2-R01` First-party JS/TS SDK: developers can integrate core flows without hand-writing raw HTTP clients.
- `P2-R02` Typed client contracts: request and response contracts are stable enough to support strong typing and SDK ergonomics.
- `P2-R03` React integration primitives: React teams have provider, hook, and component primitives for common address workflows.
- `P2-R04` Python backend support: backend teams have a supported Python SDK path for common workflows.
- `P2-R05` SDK lifecycle discipline: packaging, versioning, and migration expectations are explicit enough to evolve SDKs safely.

### Phase 3: Platform, Billing and Ecosystem

- Timeline: Months 8-12
- Goal: become a full platform with operational visibility, pricing, async workflows, and integration reach
- Primary outcomes:
  - developer dashboard and usage controls
  - billing and packaging
  - webhooks and batch jobs
  - broader framework and ecosystem support

#### Strategic requirements

- `P3-R01` Usage visibility: customers can inspect API usage and platform activity without support help.
- `P3-R02` Billing and spend controls: pricing, limits, and spend visibility are productized and enforceable.
- `P3-R03` Async workflows: batch jobs and event-driven workflows are available for higher-volume and back-office use cases.
- `P3-R04` Ecosystem expansion: the platform reaches developers through broader framework bindings and at least one meaningful integration.
- `P3-R05` Cohesive platform operations: usage, billing, and async workflows work together coherently as one platform experience.

### Phase 4: Intelligence, Scale and Enterprise

- Timeline: Months 13-18
- Goal: create durable differentiation through intelligence, enterprise readiness, and global scale
- Primary outcomes:
  - AI-powered address intelligence
  - compliance and enterprise controls
  - edge performance and adaptive caching
  - partner and developer growth programs

#### Strategic requirements

- `P4-R01` Address intelligence differentiation: Locnative delivers intelligence features beyond commodity lookup behavior.
- `P4-R02` Enterprise trust posture: enterprise buyers can assess compliance, auditability, and control surfaces with confidence.
- `P4-R03` Global scale architecture: caching, edge or regional routing, and load characteristics are measurable and repeatable.
- `P4-R04` Growth leverage: partner, education, and community motions create reusable growth channels beyond direct discovery.
- `P4-R05` Defensible platform strategy: intelligence, enterprise trust, and scale investments reinforce a durable platform moat.

## Execution Rules

- Tactical roadmap items should map upward into one of these four strategic phases.
- New work should identify both:
  - immediate tactical milestone
  - strategic phase alignment
- For execution prompts, prefer:
  - milestone ID plus one or more requirement IDs
  - example: `M2`, `P1-R02`, and `P1-R03`
- If a proposed task does not clearly support one of these phases, it should be challenged before execution.

## Mapping to Current Repo Work

Current repo work fits primarily inside Strategic Phase 1.

Examples:
- project and API key management supports authentication, onboarding, and developer self-serve setup
- dashboard work supports developer visibility and usage understanding
- API endpoint hardening supports the v1 platform surface
- docs and API explorer work supports developer activation

## Strategic Success Signals

- Phase 1: a developer can sign up, authenticate, make a successful request, and understand the API model quickly
- Phase 2: developers prefer first-party SDKs and components over raw endpoint wiring
- Phase 3: customers can manage usage, spend, teams, and async workflows without support intervention
- Phase 4: enterprise customers can trust the platform operationally and commercially, and the product has differentiated intelligence features

## Related Docs

- `plan.md`
- `apps/web/.planning/PROJECT.md`
- `apps/web/.planning/ROADMAP.md`
- `apps/web/.planning/PLATFORM-MILESTONES.md`
- `apps/web/.planning/PLATFORM-PHASE-01.md`
- `apps/web/.planning/PLATFORM-PHASE-02.md`
- `apps/web/.planning/PLATFORM-PHASE-03.md`
- `apps/web/.planning/PLATFORM-PHASE-04.md`
