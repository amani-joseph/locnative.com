# MCP Server Fronting the Locnative API — Design (v1)

**Date:** 2026-06-19
**Status:** Approved design, pending implementation plan
**Scope:** A public Model Context Protocol (MCP) server that exposes the Locnative location API to AI agents.

## Background & Motivation

Locnative.com is a location API platform (geocoding, routing, geofencing) served at
`api.locnative.com` via oRPC's `OpenAPIHandler`, authed by project-scoped API keys. It
currently has **no agent-facing surface**. This design adds an MCP server so AI agents
(Claude, ChatGPT, etc.) can consume the API as tools.

This also unblocks the deferred **DNS-AID** agent-discovery work: once a real MCP endpoint
exists at `mcp.locnative.com`, we can publish the SVCB/HTTPS discovery record + DNSSEC
that points at it (see `dns-aid-deferred` memory). Publishing those records before a real
endpoint existed would have misdirected agents, so it was deliberately deferred.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Audience | **Public product surface** | Third-party agents connect their assistant to Locnative as a tool; this is what makes DNS-AID discovery meaningful. |
| Tool scope | **Read + zone management** | All read/query tools plus zone create/update/delete. Excludes webhooks and device location push. |
| Auth | **API key (v1)** | Reuse existing project-scoped API keys. OAuth 2.1 deferred (no authorization server today — BetterAuth is consumer-only). |
| Architecture | **A — curated tools + HTTP proxy** | Standalone worker calling the deployed API over HTTP via the SDK. Reuses auth/billing/limits; isolates risk. |
| Batch geocode | **Excluded from v1** | Async submit/poll/results doesn't map cleanly to single tool calls; forward geocode covers the synchronous case. |

## Architecture

```
MCP client (Claude/ChatGPT)
        │  Streamable HTTP + Authorization: Bearer <locnative API key>
        ▼
mcp.locnative.com   ── new Cloudflare Worker: apps/mcp ──
  McpAgent (Agents SDK, Durable Object for session state)
   └── tools (thin adapters)
         │  @locnative/sdk (typed, auth-aware HTTP client)
         ▼
api.locnative.com/api/v1/*   (unchanged: auth, rate limits, usage-based billing meter)
```

- **New worker** `apps/mcp`, deployed to custom domain `mcp.locnative.com`.
- **Cloudflare Agents SDK `McpAgent`** with a backing **Durable Object** for session state;
  **Streamable HTTP** transport (current MCP standard).
- Each tool calls **`@locnative/sdk`**, which is the *only* API client. No endpoint paths,
  schemas, or auth logic are re-encoded in the MCP worker — this eliminates drift.
- The API is reached over HTTP (same Cloudflare edge), so the live usage-based billing meter,
  rate limiting, and API-key validation all keep happening at the API, unchanged.

### Why a separate worker (not a `/mcp` route on the API worker)

- Independent deploy target; cannot destabilize the hot-path geocoding worker.
- Maps directly to the `mcp.locnative.com` DNS-AID discovery target.
- Clean separation of the agent surface from the REST surface.

## Authentication

- The MCP client supplies the Locnative API key as `Authorization: Bearer <key>` on the
  Streamable HTTP transport.
- `McpAgent` reads the bearer token from the incoming request and holds it in per-session
  agent context, instantiating the SDK with that key for the session.
- If no key is present, the server returns an MCP-level auth error before any tool runs.
- `401` (bad key) / `402` (quota/billing) responses from the API pass straight back to the
  client with the API's structured message.

## Tools (v1)

All tools are thin adapters over `@locnative/sdk` methods. ~18 tools:

### Geocoding & regions (read)
- `geocode_address` — forward geocode (freeform `q` or structured fields) → `addresses.geocode`
- `reverse_geocode` — coordinate → nearest address → `addresses.reverse`
- `autocomplete_address` — type-ahead address suggestions → `addresses.autocomplete`
- `nearby_addresses` — addresses near a coordinate → `addresses.nearby`
- `classify_region` — coordinate → administrative regions → `regions` (via the SDK's
  dedicated method if present, else its low-level `request` helper to `GET /api/v1/regions`)

### Routing
- `get_directions` — driving directions between two points → `routing.directions`
- `travel_matrix` — N×M duration/distance matrix → `routing.matrix`
- `isochrone` — reachability polygon for an origin + travel budget → `routing.isochrone`
- `match_trace` — snap a GPS trace to roads (map-matching) → `routing.match`
- `optimize_stops` — optimize visiting order of stops (TSP) → `routing.optimize`

### Zones — geofences (read)
- `list_zones` — list zones → `zones.list`
- `get_zone` — get a zone by ID → `zones.get`
- `zones_containing_point` — find zones containing a coordinate → `zones.contains`
- `zone_addresses` — addresses within a zone → `zones.addresses`

### Zones — management (destructive)
- `create_zone` — create a geofence → `zones.create`
- `update_zone` — update a geofence → `zones.update`
- `delete_zone` — delete a geofence → `zones.delete`

### Devices (read)
- `device_zones` — current zone membership for a device → `devices.zones`

**Excluded from v1:** batch geocode (submit/poll/results), webhook CRUD, device location push.

## Destructive-operation safety

- Read tools carry MCP annotation `readOnlyHint: true`.
- `create_zone` / `update_zone` / `delete_zone` carry `destructiveHint: true`,
  `readOnlyHint: false`, so MCP clients prompt the user for confirmation.
- `delete_zone` additionally requires an explicit `confirm: true` argument; the model must
  pass it deliberately or the tool refuses with guidance. This is a defense-in-depth gate on
  top of the client-side confirmation prompt, since the tool surface is public.

## Error handling

- The SDK throws `LocnativeApiError` carrying the upstream status and structured body.
- A single shared wrapper maps status → MCP tool error (returned as a tool error result,
  never thrown out of the agent):
  - `400` → validation message (echo the API's field errors)
  - `401` / `402` → auth / quota — surface the API's structured message verbatim
  - `404` → not found
  - `429` → rate-limited — include any retry hint from the API
  - `5xx` → generic upstream-error message (do not leak internals)

## Testing

Follows the repo's no-DOM test convention (extract pure logic; mock the client boundary):

- **Unit:** each tool's `input → SDK call → output` mapping, asserting the SDK is called with
  the right shape and the result is mapped to MCP content correctly. Mock the SDK boundary.
- **Error mapping:** drive `LocnativeApiError` for each status class through the shared
  wrapper and assert the MCP error result.
- **Integration:** one test driving the MCP handshake + a `list_zones` call against a mocked
  SDK, to validate transport + tool registration wiring.
- Runner: Vitest on `@cloudflare/vitest-pool-workers` (workerd), consistent with `apps/server`.

## Out of scope (future work)

- **OAuth 2.1 connector auth** — one-click connector UX; requires standing up an authorization
  server. Tracked alongside the deferred OAuth-discovery work. The server is designed so this
  can be layered on without restructuring tools.
- **Batch geocode tools** — revisit if agents need bulk geocoding.
- **Webhook + device-location-push tools** — management/ingest surface, deferred.
- **DNS-AID discovery record + DNSSEC** — publish the SVCB/HTTPS record at
  `mcp.locnative.com` and enable DNSSEC once this server ships (see `dns-aid-deferred`).

## Open implementation questions (for the plan)

- Exact `McpAgent` / Durable Object wiring and `wrangler.jsonc` bindings for `apps/mcp`.
- Whether the SDK base URL is configured per-environment (prod vs. preview).
- Tool input schema source: import the public input zod schemas from the API contract vs.
  rely on the SDK's typed params — resolve to whichever minimizes drift.
