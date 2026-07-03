# @locnative/mcp

MCP (Model Context Protocol) server at `mcp.locnative.com` that exposes the
Locnative location API to AI agents as tools. It's a standalone Cloudflare
Worker (`McpAgent`, Streamable HTTP) whose tools call the deployed
`api.locnative.com` over HTTPS via `@locnative/sdk` — so the API's auth, rate
limits, and usage billing stay in one place.

## Auth

Pass a Locnative project API key on the MCP connection as
`Authorization: Bearer <key>` (or `X-API-Key: <key>`). Requests without a key get
`401` before any tool runs. The key is used to build a per-session SDK client, so
each connection acts as its own project.

## Tools (v1)

- **Geocoding / regions:** `geocode_address`, `reverse_geocode`,
  `autocomplete_address`, `nearby_addresses`, `classify_region`
- **Routing:** `get_directions`, `travel_matrix`, `isochrone`, `match_trace`,
  `optimize_stops`
- **Zones (read):** `list_zones`, `get_zone`, `zones_containing_point`,
  `zone_addresses`
- **Zones (management):** `create_zone`, `update_zone`, `delete_zone`
  — these are flagged destructive; `delete_zone` additionally requires
  `confirm: true` or it refuses.
- **Devices:** `device_zones`

Excluded from v1: batch geocode (async), webhook CRUD, device location push.

## Develop

```sh
pnpm dev          # wrangler dev on http://localhost:3005/mcp
pnpm test         # vitest (node env; tools tested via a mocked SDK client)
pnpm check-types  # tsc --noEmit
```

Point the MCP Inspector at `http://localhost:3005/mcp` with an
`Authorization: Bearer <a real test API key>` header to exercise the tools.

> The worker entry (`src/index.ts`) imports `agents/mcp`, which pulls
> `cloudflare:`-protocol modules that can't load under node vitest — so it has no
> node unit test. All tool logic lives in node-testable modules (`register.ts`,
> `tools/*`, `errors.ts`) covered via the mocked SDK boundary; `index.ts` is
> verified by `check-types` and the local Inspector smoke test.

## Deploy

```sh
pnpm deploy       # wrangler deploy (manual — this repo has no CI/CD)
```

After the first deploy, confirm the `mcp.locnative.com` custom domain is attached
in the Cloudflare dashboard.

## Follow-up (tracked, not in this package yet)

- **DNS-AID discovery:** publish the SVCB/HTTPS record pointing at
  `mcp.locnative.com` and enable DNSSEC once this server is live — see
  `docs/superpowers/specs/2026-06-19-mcp-server-design.md` and the
  `dns-aid-deferred` project memory.
- **OAuth 2.1 connector auth** (one-click connector UX) — requires standing up an
  authorization server; the server is structured so this can layer on later.
- Batch-geocode, webhook, and device-location-push tools.
