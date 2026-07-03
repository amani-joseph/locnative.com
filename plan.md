# Locnative API Platform Plan

## Source

- Primary source: `locnative-prd.pdf`
- Supplemental source: <https://claude.ai/public/artifacts/31d0b372-ca03-44a9-8710-67399af965bb>
- Source title: `Locnative API Platform: 18-Month Product Roadmap`

## Status

This file is now based on the extracted PDF content, which contains the roadmap structure and detailed phase workstreams.

## Planning Goal

Create a durable, repo-local plan for the Locnative API platform across the next 18 months, aligned to product sequencing, platform maturity, developer experience, monetization, and enterprise readiness.

## Time Horizon

- Total duration: 18 months
- Planning cadence: 4 phases

## Product Positioning

Locnative is positioned between raw geocoding providers and high-level, product-specific address tooling. The platform is meant to give developers production-grade location workflows with better developer experience, clearer abstractions, and a stronger application-layer platform than commodity API vendors.

## Core Design Principles

- Speed of integration: a developer's first success should happen fast.
- Predictability above all: response shapes, error semantics, and operational behavior must feel consistent.
- DX is the product: docs, SDKs, examples, and error handling are part of the actual product surface.
- Framework-neutral core: the JavaScript SDK is the base layer, framework bindings sit on top.
- Composable, not monolithic: customers should be able to use raw API, SDKs, or UI components independently.
- Global by default: country bias, language support, and international workflows should be first-class rather than retrofits.

## Roadmap Overview

### Phase 1: Core API and Developer Foundation

- Timeline: Months 1-3
- Goal: establish the bedrock of Locnative as a reliable, well-documented developer API.

Key workstreams:
- Core REST endpoints
  - `GET /v1/autocomplete`
  - `GET /v1/geocode`
  - `GET /v1/reverse`
  - `POST /v1/validate`
  - `GET /v1/place/{place_id}`
  - `GET /v1/nearby`
- API design principles
  - consistent response envelope
  - predictable errors with correct HTTP semantics
  - idempotent GET endpoints
  - versioning from day 1 with `/v1`
  - rate limit headers
- Developer portal and docs
  - interactive API reference
  - code snippets for curl, JavaScript, and Python
  - quickstart guide
  - response schema explorer
  - changelog
- Authentication and keys
  - API key issuance
  - key scoping
  - key rotation
  - multiple keys per project or environment
- Success metrics
  - time to first successful API call under 5 minutes
  - 99.9% SLA from launch
  - p95 latency targets
  - documentation NPS

Exit criteria:
- A developer can sign up, obtain a key, read the docs, and make a successful API call quickly.
- The platform has stable API conventions, baseline reliability, and observable operational targets.

### Phase 2: SDKs and Framework Components

- Timeline: Months 4-7
- Goal: move from raw API access to a real developer platform with reusable client libraries and drop-in UI components.

Key workstreams:
- JavaScript and TypeScript SDK
  - isomorphic package
  - simple client instantiation
  - fluent API patterns
  - automatic session token management
  - abort controller support
  - first-class response typing
- React component library
  - `LocnativeProvider`
  - `AddressInput`
  - `AddressForm`
  - `PlaceSearch`
  - `Map` wrapper
  - `useLocnative` hook
- Component design philosophy
  - headless-first components
  - optional themed package
  - escape hatches throughout
  - framework parity as a long-term goal
- Python SDK
  - sync and async clients
  - Pydantic models
  - Django and Flask integration guides
- SDK quality commitments
  - strict semantic versioning
  - migration guides
  - published type definitions
  - test utilities and mock clients

Exit criteria:
- Developers can choose between raw HTTP, SDK integration, or component-level adoption.
- React and JS/TS become the fastest path to integration, with Python as the first serious backend SDK.

### Phase 3: Platform, Billing and Ecosystem

- Timeline: Months 8-12
- Goal: evolve Locnative from a useful product into a real platform with operational tooling, billing, and ecosystem leverage.

Key workstreams:
- Developer dashboard
  - usage analytics
  - request inspector
  - cost explorer
  - spend limits and alerts
  - team and organization management
- Billing and pricing model
  - free tier
  - pay-as-you-go pricing
  - volume discounts
  - dedicated plans
  - nonprofit and OSS program
- Webhooks and event system
  - configurable webhook endpoints
  - event taxonomy
  - webhook delivery dashboard
- Batch and async processing
  - batch geocoding
  - batch validation
  - job status and progress APIs
- Expanded framework SDKs
  - Vue 3 component library
  - Svelte and SvelteKit support
  - Angular package
  - React Native support
- Ecosystem and integrations
  - Zapier integration
  - Stripe Tax integration guidance
  - Shopify app
  - community and support channels

Exit criteria:
- Customers can manage spend, teams, and operational usage from the dashboard.
- Locnative supports both synchronous product integrations and higher-volume async workflows.
- Billing, usage controls, and ecosystem integrations make the platform commercially viable.

### Phase 4: Intelligence, Scale and Enterprise

- Timeline: Months 13-18
- Goal: create a differentiated platform with intelligence features, enterprise trust, and large-scale operational maturity.

Key workstreams:
- AI-powered address intelligence
  - fuzzy address matching
  - address deduplication API
  - deliverability scoring
  - context-aware autocomplete
- Enterprise features
  - SOC 2 Type II certification
  - GDPR and data residency options
  - private cloud deployment
  - custom SLAs
  - audit logs
- Performance and reliability
  - global edge network
  - adaptive caching layer
  - load testing dashboard
- Developer relations and growth
  - partner program
  - certification program
  - selective open-source contributions
  - conference and content strategy

Exit criteria:
- Locnative is not just an API vendor, but a differentiated location platform with enterprise credibility.
- The platform can support larger customers, stricter compliance expectations, and global performance requirements.

## Cross-Phase Themes

- Developer activation must stay central throughout the roadmap.
- API consistency and response semantics should not fragment as the surface area grows.
- SDKs and components should reinforce the core platform, not fork product behavior.
- Reliability, pricing transparency, and quota controls should mature before enterprise packaging.
- Intelligence features should arrive only after the core developer and platform foundation is solid.

## Sequencing Logic

- Phase 1 establishes the base API and developer trust layer.
- Phase 2 builds the fastest adoption paths through SDKs and components.
- Phase 3 adds platform mechanics, billing, dashboards, and ecosystem reach.
- Phase 4 introduces higher-order differentiation, enterprise capabilities, and scale.

## Immediate Implications for This Repo

- Short-term implementation should stay tightly aligned with Phase 1.
- Current priorities should favor:
  - stable v1 endpoint design
  - auth and API key workflows
  - docs and onboarding quality
  - baseline dashboard and developer UX foundations
- Mid-term architecture decisions should preserve a path to:
  - SDK generation or maintenance
  - framework component libraries
  - usage metering and billing
  - batch jobs and webhook workflows
  - enterprise controls

## Open Questions

- Which Phase 1 endpoints are already partially implemented versus still missing?
- What should count as the concrete Phase 1 launch milestone for this codebase?
- How should roadmap work map into actual repository phases and execution tickets?
- Which Phase 2 SDK and component items should be designed now to avoid later rework?

## Next Update Needed

This file is now usable as the repo-local roadmap summary. The next valuable update would be to map each phase into:

- repo execution phases
- milestone checklists
- dependencies
- owner areas
- measurable release gates
