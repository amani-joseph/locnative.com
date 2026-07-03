# MCP Server (mcp.locnative.com) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public MCP server at `mcp.locnative.com` exposing the Locnative location API to AI agents as curated tools.

**Architecture:** A standalone Cloudflare Worker (`apps/mcp`) using the Agents SDK `McpAgent` (Streamable HTTP, Durable Object session state). Each tool is a thin adapter calling the deployed `api.locnative.com` over HTTPS via `@locnative/sdk`. Auth is a Locnative API key passed as `Authorization: Bearer <key>`; the API's auth, rate-limits, and usage billing stay unchanged.

**Tech Stack:** TypeScript, Cloudflare Workers + `wrangler`, `agents` (McpAgent), `@modelcontextprotocol/sdk`, `@locnative/sdk`, `zod` (v4), `vitest` (node environment).

## Global Constraints

- **Auth:** API-key only in v1. No OAuth/authorization server. Missing/blank key → `401` before any tool runs.
- **API access:** Tools call the deployed `api.locnative.com` exclusively through `@locnative/sdk`. Never re-encode endpoint paths or schemas in this worker.
- **Tool annotations:** read tools set `readOnlyHint: true`; `create_zone`/`update_zone`/`delete_zone` set `destructiveHint: true`, `readOnlyHint: false`. `delete_zone` additionally requires an explicit `confirm: true` argument or it refuses.
- **Excluded from v1:** batch geocode (submit/poll/results), webhook CRUD, device location push.
- **Package name:** `@locnative/mcp`. Depends on `@locnative/sdk` via `workspace:*`.
- **Testing convention (repo):** vitest `environment: "node"`, mock the SDK boundary (a mock `LocnativeClient`); test pure input→call→output mapping. No worker-pool / DOM renderer.
- **zod:** use the workspace catalog (`"zod": "catalog:"`, resolves to ^4.1.13).
- **Versions:** `compatibility_date: "2026-04-14"`, `compatibility_flags: ["nodejs_compat"]`, package manager `pnpm@10.12.4`.

## File Structure

```
apps/mcp/
  package.json          # @locnative/mcp, deps, scripts
  tsconfig.json         # extends packages/config/tsconfig.base.json
  wrangler.jsonc        # worker + DO binding + migration + custom domain + vars
  vitest.config.ts      # node environment
  README.md             # run/deploy + DNS-AID follow-up
  src/
    index.ts            # LocnativeMcp extends McpAgent; auth-injecting fetch; default export
    client.ts           # buildClient(apiKey, baseUrl) -> LocnativeClient
    errors.ts           # toToolError(err) -> CallToolResult (isError)
    types.ts            # ToolDef type; Props type
    register.ts         # registerTools(server, getClient)
    tools/
      geocoding.ts      # geocode_address, reverse_geocode, autocomplete_address, nearby_addresses, classify_region
      routing.ts        # get_directions, travel_matrix, isochrone, match_trace, optimize_stops
      zones.ts          # list_zones, get_zone, zones_containing_point, zone_addresses, create_zone, update_zone, delete_zone
      devices.ts        # device_zones
    tools/geocoding.test.ts
    tools/routing.test.ts
    tools/zones.test.ts
    tools/devices.test.ts
    errors.test.ts
    index.test.ts       # auth wrapper + integration handshake
```

**Shared tool contract** (defined in Task 3, `src/types.ts`) — every tool module exports `ToolDef[]`:

```ts
import type { ZodRawShape } from "zod";
import type { LocnativeClient } from "@locnative/sdk";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
  handler: (client: LocnativeClient, args: Record<string, unknown>) => Promise<ToolResult>;
};

export type Props = { apiKey: string };
```

Each handler returns `ok(data)` (JSON-stringified into a text block). `registerTools` wraps every handler with `toToolError` so SDK errors become `isError` results instead of throwing.

---

### Task 1: Scaffold the `apps/mcp` worker with one trivial tool

**Files:**
- Create: `apps/mcp/package.json`, `apps/mcp/tsconfig.json`, `apps/mcp/wrangler.jsonc`, `apps/mcp/vitest.config.ts`, `apps/mcp/src/index.ts`
- Test: `apps/mcp/src/index.test.ts`

**Interfaces:**
- Produces: `LocnativeMcp` (class extending `McpAgent`), default worker export.

- [ ] **Step 1: Create `apps/mcp/package.json`**

```json
{
  "name": "@locnative/mcp",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "check-types": "tsc --noEmit",
    "build": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@locnative/sdk": "workspace:*",
    "agents": "^0.2.0",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260416.2",
    "@types/node": "^20",
    "@locnative/config": "workspace:*",
    "typescript": "^5",
    "vitest": "^4.1.4",
    "wrangler": "^4.81.1"
  }
}
```

- [ ] **Step 2: Create `apps/mcp/tsconfig.json`**

```json
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": {
    "types": ["node", "@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `apps/mcp/wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "locnative-mcp",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-14",
  "compatibility_flags": ["nodejs_compat"],
  "dev": { "port": 3005 },
  "routes": [{ "pattern": "mcp.locnative.com", "custom_domain": true }],
  "vars": { "LOCNATIVE_API_BASE_URL": "https://api.locnative.com" },
  "durable_objects": {
    "bindings": [{ "name": "MCP_OBJECT", "class_name": "LocnativeMcp" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["LocnativeMcp"] }],
  "observability": { "enabled": true }
}
```

- [ ] **Step 4: Create `apps/mcp/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Create `apps/mcp/src/index.ts` with a ping tool**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";

type Env = { LOCNATIVE_API_BASE_URL: string };
type Props = { apiKey: string };

export class LocnativeMcp extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: "locnative", version: "0.1.0" });

  async init() {
    this.server.registerTool(
      "ping",
      { description: "Health check", inputSchema: {} },
      async () => ({ content: [{ type: "text", text: "ok" }] })
    );
  }
}

export default LocnativeMcp.serve("/mcp", { binding: "MCP_OBJECT" });
```

- [ ] **Step 6: Install deps**

Run: `cd apps/mcp && pnpm install`
Expected: `agents`, `@modelcontextprotocol/sdk` resolve; `@locnative/sdk` linked from workspace.

- [ ] **Step 7: Write the failing test `apps/mcp/src/index.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { LocnativeMcp } from "./index.ts";

describe("LocnativeMcp", () => {
  it("exposes a serve() static and an init method", () => {
    expect(typeof LocnativeMcp.serve).toBe("function");
    expect(typeof LocnativeMcp.prototype.init).toBe("function");
  });
});
```

- [ ] **Step 8: Run test**

Run: `cd apps/mcp && pnpm test --run`
Expected: PASS.

- [ ] **Step 9: Type-check**

Run: `cd apps/mcp && pnpm check-types`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/mcp
git commit -m "feat(mcp): scaffold mcp.locnative.com worker with McpAgent"
```

---

### Task 2: SDK client builder + types

**Files:**
- Create: `apps/mcp/src/types.ts`, `apps/mcp/src/client.ts`
- Test: `apps/mcp/src/client.test.ts`

**Interfaces:**
- Produces: `buildClient(apiKey: string, baseUrl: string): LocnativeClient`; `ToolDef`, `ToolResult`, `Props` types (see Shared tool contract above).

- [ ] **Step 1: Create `apps/mcp/src/types.ts`**

Copy the Shared tool contract block verbatim (ToolResult, ToolDef, Props).

- [ ] **Step 2: Write failing test `apps/mcp/src/client.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildClient } from "./client.ts";

describe("buildClient", () => {
  it("creates a client wired to the given baseUrl and apiKey", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = buildClient("key_123", "https://api.example.com", fetchMock);
    await client.zones.list({});
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://api.example.com/api/v1/zones");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer key_123",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run client`
Expected: FAIL ("buildClient is not a function").

- [ ] **Step 4: Create `apps/mcp/src/client.ts`**

```ts
import { createLocnativeClient, type LocnativeClient } from "@locnative/sdk";

export const buildClient = (
  apiKey: string,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): LocnativeClient =>
  createLocnativeClient({ apiKey, baseUrl, fetch: fetchImpl });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test --run client`
Expected: PASS. (If the SDK sends the key via `X-API-Key` instead of `Authorization`, assert that header — confirm against `packages/sdk/src/http.ts`.)

- [ ] **Step 6: Commit**

```bash
git add apps/mcp/src/types.ts apps/mcp/src/client.ts apps/mcp/src/client.test.ts
git commit -m "feat(mcp): SDK client builder and tool contract types"
```

---

### Task 3: Error mapper (`toToolError`)

**Files:**
- Create: `apps/mcp/src/errors.ts`
- Test: `apps/mcp/src/errors.test.ts`

**Interfaces:**
- Consumes: `LocnativeApiError`, `isLocnativeApiError`, `isRateLimitError` from `@locnative/sdk`.
- Produces: `toToolError(err: unknown): ToolResult`; `ok(data: unknown): ToolResult`.

- [ ] **Step 1: Write failing test `apps/mcp/src/errors.test.ts`**

```ts
import { LocnativeApiError } from "@locnative/sdk";
import { describe, expect, it } from "vitest";
import { ok, toToolError } from "./errors.ts";

describe("ok", () => {
  it("wraps data as a JSON text block", () => {
    expect(ok({ a: 1 })).toEqual({ content: [{ type: "text", text: '{"a":1}' }] });
  });
});

describe("toToolError", () => {
  const make = (status: number, message: string) =>
    new LocnativeApiError(message, { status });

  it("maps 429 to a rate-limit message", () => {
    const r = toToolError(make(429, "slow down"));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/rate.?limit/i);
  });

  it("maps 401 to an auth message", () => {
    expect(toToolError(make(401, "bad key")).content[0].text).toMatch(/auth|api key/i);
  });

  it("maps 5xx to a generic upstream error without leaking internals", () => {
    const r = toToolError(make(500, "stack trace here"));
    expect(r.content[0].text).toMatch(/upstream|temporarily/i);
    expect(r.content[0].text).not.toContain("stack trace here");
  });

  it("handles non-API errors", () => {
    expect(toToolError(new Error("boom")).isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run errors`
Expected: FAIL.

- [ ] **Step 3: Create `apps/mcp/src/errors.ts`**

```ts
import { isLocnativeApiError } from "@locnative/sdk";
import type { ToolResult } from "./types.ts";

export const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
});

const errText = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

export const toToolError = (err: unknown): ToolResult => {
  if (isLocnativeApiError(err)) {
    const msg = err.payload?.message ?? err.message;
    switch (true) {
      case err.status === 400:
        return errText(`Invalid request: ${msg}`);
      case err.status === 401:
        return errText(`Authentication failed (check your API key): ${msg}`);
      case err.status === 402:
        return errText(`Quota or billing limit reached: ${msg}`);
      case err.status === 404:
        return errText(`Not found: ${msg}`);
      case err.status === 429:
        return errText("Rate limited — please retry after a short delay.");
      case err.status >= 500:
        return errText("Upstream service temporarily unavailable. Try again shortly.");
      default:
        return errText(`Request failed (${err.status}): ${msg}`);
    }
  }
  return errText(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test --run errors`
Expected: PASS. (Confirm `LocnativeApiError`'s constructor signature in `packages/sdk/src/errors.ts`; it takes `(message, { status, code?, payload? })`.)

- [ ] **Step 5: Commit**

```bash
git add apps/mcp/src/errors.ts apps/mcp/src/errors.test.ts
git commit -m "feat(mcp): map LocnativeApiError to MCP tool errors"
```

---

### Task 4: Geocoding & regions tools

**Files:**
- Create: `apps/mcp/src/tools/geocoding.ts`
- Test: `apps/mcp/src/tools/geocoding.test.ts`

**Interfaces:**
- Consumes: `ToolDef`, `ok`, `buildClient` output (`LocnativeClient`).
- Produces: `geocodingTools: ToolDef[]`.

- [ ] **Step 1: Write failing test `apps/mcp/src/tools/geocoding.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { geocodingTools } from "./geocoding.ts";

const tool = (name: string) => {
  const t = geocodingTools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
};

describe("geocoding tools", () => {
  it("registers the five expected tools, all read-only", () => {
    expect(geocodingTools.map((t) => t.name).sort()).toEqual([
      "autocomplete_address",
      "classify_region",
      "geocode_address",
      "nearby_addresses",
      "reverse_geocode",
    ]);
    for (const t of geocodingTools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("geocode_address calls geocode.forward and returns JSON", async () => {
    const forward = vi.fn(async () => ({ candidates: [{ id: 1 }] }));
    const client = { geocode: { forward } } as any;
    const res = await tool("geocode_address").handler(client, { q: "1 Main St" });
    expect(forward).toHaveBeenCalledWith({ q: "1 Main St" });
    expect(res.content[0].text).toContain('"candidates"');
  });

  it("reverse_geocode calls addresses.reverse with lat/lng", async () => {
    const reverse = vi.fn(async () => ({ address: "x" }));
    const client = { addresses: { reverse } } as any;
    await tool("reverse_geocode").handler(client, { lat: -33.8, lng: 151.2 });
    expect(reverse).toHaveBeenCalledWith({ lat: -33.8, lng: 151.2 });
  });

  it("classify_region calls regions.classify", async () => {
    const classify = vi.fn(async () => ({ matches: [] }));
    const client = { regions: { classify } } as any;
    await tool("classify_region").handler(client, { lat: -33.8, lng: 151.2 });
    expect(classify).toHaveBeenCalledWith({ lat: -33.8, lng: 151.2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run geocoding`
Expected: FAIL.

- [ ] **Step 3: Create `apps/mcp/src/tools/geocoding.ts`**

```ts
import { z } from "zod";
import { ok } from "../errors.ts";
import type { ToolDef } from "../types.ts";

const READ = { readOnlyHint: true } as const;

export const geocodingTools: ToolDef[] = [
  {
    name: "geocode_address",
    description:
      "Forward-geocode an address. Use `q` for freeform text, or set structured fields (street/locality/state/postcode/country) with structured='true'.",
    inputSchema: {
      q: z.string().optional(),
      street: z.string().optional(),
      locality: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().optional(),
      structured: z.enum(["true", "false"]).optional(),
    },
    annotations: READ,
    handler: (client, args) => client.geocode.forward(args as never).then(ok),
  },
  {
    name: "reverse_geocode",
    description: "Reverse-geocode a coordinate to the nearest known address.",
    inputSchema: { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) },
    annotations: READ,
    handler: (client, args) => client.addresses.reverse(args as never).then(ok),
  },
  {
    name: "autocomplete_address",
    description: "Type-ahead address suggestions for a partial query.",
    inputSchema: {
      q: z.string().min(1),
      country: z.string().optional(),
      state: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      limit: z.number().int().positive().optional(),
    },
    annotations: READ,
    handler: (client, args) => client.addresses.autocomplete(args as never).then(ok),
  },
  {
    name: "nearby_addresses",
    description: "Find known addresses near a coordinate, optionally within a radius (metres).",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radius: z.number().positive().optional(),
      country: z.string().optional(),
      limit: z.number().int().positive().optional(),
    },
    annotations: READ,
    handler: (client, args) => client.addresses.nearby(args as never).then(ok),
  },
  {
    name: "classify_region",
    description: "Classify a coordinate into administrative regions (ABS layers).",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      layers: z.string().optional(),
    },
    annotations: READ,
    handler: (client, args) => client.regions.classify(args as never).then(ok),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test --run geocoding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp/src/tools/geocoding.ts apps/mcp/src/tools/geocoding.test.ts
git commit -m "feat(mcp): geocoding and region tools"
```

---

### Task 5: Routing tools

**Files:**
- Create: `apps/mcp/src/tools/routing.ts`
- Test: `apps/mcp/src/tools/routing.test.ts`

**Interfaces:**
- Produces: `routingTools: ToolDef[]`.

- [ ] **Step 1: Write failing test `apps/mcp/src/tools/routing.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { routingTools } from "./routing.ts";

const tool = (name: string) => {
  const t = routingTools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
};

describe("routing tools", () => {
  it("registers the five expected tools, all read-only", () => {
    expect(routingTools.map((t) => t.name).sort()).toEqual([
      "get_directions",
      "isochrone",
      "match_trace",
      "optimize_stops",
      "travel_matrix",
    ]);
    for (const t of routingTools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("get_directions calls routing.directions", async () => {
    const directions = vi.fn(async () => ({ routes: [] }));
    const client = { routing: { directions } } as any;
    await tool("get_directions").handler(client, { from: "a", to: "b" });
    expect(directions).toHaveBeenCalledWith({ from: "a", to: "b" });
  });

  it("travel_matrix calls routing.matrix", async () => {
    const matrix = vi.fn(async () => ({ durations: [] }));
    const client = { routing: { matrix } } as any;
    await tool("travel_matrix").handler(client, { sources: "x", destinations: "y" });
    expect(matrix).toHaveBeenCalledWith({ sources: "x", destinations: "y" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run routing`
Expected: FAIL.

- [ ] **Step 3: Create `apps/mcp/src/tools/routing.ts`**

```ts
import { z } from "zod";
import { ok } from "../errors.ts";
import type { ToolDef } from "../types.ts";

const READ = { readOnlyHint: true } as const;
const profile = z.enum(["driving", "walking", "cycling"]).optional();
const point = z.object({ lat: z.number(), lng: z.number() });

export const routingTools: ToolDef[] = [
  {
    name: "get_directions",
    description:
      "Driving/walking/cycling directions between two points. Each endpoint is `from`/`to` as 'lat,lng' or an address id via fromAddressId/toAddressId.",
    inputSchema: {
      from: z.string().optional(),
      to: z.string().optional(),
      fromAddressId: z.number().int().optional(),
      toAddressId: z.number().int().optional(),
      profile,
    },
    annotations: READ,
    handler: (client, args) => client.routing.directions(args as never).then(ok),
  },
  {
    name: "travel_matrix",
    description:
      "N×M duration/distance matrix. `sources` and `destinations` are 'lat,lng|lat,lng|<addressId>' delimited strings (≤25 points each).",
    inputSchema: {
      sources: z.string().min(1),
      destinations: z.string().min(1),
      profile,
    },
    annotations: READ,
    handler: (client, args) => client.routing.matrix(args as never).then(ok),
  },
  {
    name: "isochrone",
    description:
      "Reachability polygon for an origin and a travel budget. Provide exactly one of durationSeconds or distanceMeters. `origin` is 'lat,lng' or an address id string.",
    inputSchema: {
      origin: z.string().optional(),
      originAddressId: z.number().int().optional(),
      durationSeconds: z.number().positive().optional(),
      distanceMeters: z.number().positive().optional(),
      includeRegions: z.boolean().optional(),
      layers: z.string().optional(),
      profile,
    },
    annotations: READ,
    handler: (client, args) => client.routing.isochrone(args as never).then(ok),
  },
  {
    name: "match_trace",
    description: "Snap a sequence of GPS points to the road network (map-matching).",
    inputSchema: {
      coordinates: z.array(point).min(2),
      gaps: z.enum(["split", "ignore"]).optional(),
      tidy: z.boolean().optional(),
      profile,
    },
    annotations: READ,
    handler: (client, args) => client.routing.match(args as never).then(ok),
  },
  {
    name: "optimize_stops",
    description: "Optimise the visiting order of a set of stops (travelling-salesman).",
    inputSchema: {
      waypoints: z.array(point).min(2),
      roundtrip: z.boolean().optional(),
      source: z.enum(["any", "first"]).optional(),
      destination: z.enum(["any", "last"]).optional(),
      profile,
    },
    annotations: READ,
    handler: (client, args) => client.routing.optimize(args as never).then(ok),
  },
];
```

> Note: `match_trace.coordinates` and `optimize_stops.waypoints` use a `{lat,lng}` point shape. If the SDK's exported `MatchPoint`/`OptimizeWaypoint` types carry extra optional fields (e.g. timestamp, name), widen the `point` schema to match before finalising — read `packages/sdk/src/resources/routing.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test --run routing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp/src/tools/routing.ts apps/mcp/src/tools/routing.test.ts
git commit -m "feat(mcp): routing tools"
```

---

### Task 6: Zone read tools

**Files:**
- Create: `apps/mcp/src/tools/zones.ts` (read tools first; management added in Task 7)
- Test: `apps/mcp/src/tools/zones.test.ts`

**Interfaces:**
- Produces: `zoneReadTools: ToolDef[]` (and, after Task 7, `zoneTools` aggregating read + management).

- [ ] **Step 1: Write failing test (read portion) `apps/mcp/src/tools/zones.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { zoneReadTools } from "./zones.ts";

const tool = (list: any[], name: string) => {
  const t = list.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
};

describe("zone read tools", () => {
  it("registers four read-only tools", () => {
    expect(zoneReadTools.map((t) => t.name).sort()).toEqual([
      "get_zone",
      "list_zones",
      "zone_addresses",
      "zones_containing_point",
    ]);
    for (const t of zoneReadTools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("get_zone calls zones.get with numeric id", async () => {
    const get = vi.fn(async () => ({ id: 7 }));
    const client = { zones: { get } } as any;
    await tool(zoneReadTools, "get_zone").handler(client, { id: 7 });
    expect(get).toHaveBeenCalledWith(7);
  });

  it("zones_containing_point calls zones.contains", async () => {
    const contains = vi.fn(async () => ({ zones: [] }));
    const client = { zones: { contains } } as any;
    await tool(zoneReadTools, "zones_containing_point").handler(client, { lat: 1, lng: 2 });
    expect(contains).toHaveBeenCalledWith({ lat: 1, lng: 2 });
  });

  it("zone_addresses calls zones.addresses with id + paging", async () => {
    const addresses = vi.fn(async () => ({ addresses: [] }));
    const client = { zones: { addresses } } as any;
    await tool(zoneReadTools, "zone_addresses").handler(client, { id: 3, limit: 10 });
    expect(addresses).toHaveBeenCalledWith(3, { limit: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run zones`
Expected: FAIL.

- [ ] **Step 3: Create `apps/mcp/src/tools/zones.ts` (read tools)**

```ts
import { z } from "zod";
import { ok } from "../errors.ts";
import type { ToolDef } from "../types.ts";

const READ = { readOnlyHint: true } as const;

export const zoneReadTools: ToolDef[] = [
  {
    name: "list_zones",
    description: "List geofence zones in the caller's project.",
    inputSchema: {
      limit: z.number().int().positive().optional(),
      page: z.number().int().positive().optional(),
    },
    annotations: READ,
    handler: (client, args) => client.zones.list(args as never).then(ok),
  },
  {
    name: "get_zone",
    description: "Get a single geofence zone (with geometry) by id.",
    inputSchema: { id: z.number().int() },
    annotations: READ,
    handler: (client, args) => client.zones.get(args.id as number).then(ok),
  },
  {
    name: "zones_containing_point",
    description: "Find the zones that contain a given coordinate.",
    inputSchema: { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) },
    annotations: READ,
    handler: (client, args) =>
      client.zones.contains({ lat: args.lat as number, lng: args.lng as number }).then(ok),
  },
  {
    name: "zone_addresses",
    description: "List the known addresses that fall within a zone.",
    inputSchema: {
      id: z.number().int(),
      limit: z.number().int().positive().optional(),
      page: z.number().int().positive().optional(),
    },
    annotations: READ,
    handler: (client, args) => {
      const { id, ...paging } = args as { id: number; limit?: number; page?: number };
      return client.zones.addresses(id, paging).then(ok);
    },
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test --run zones`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp/src/tools/zones.ts apps/mcp/src/tools/zones.test.ts
git commit -m "feat(mcp): zone read tools"
```

---

### Task 7: Zone management tools (destructive, with delete confirm gate)

**Files:**
- Modify: `apps/mcp/src/tools/zones.ts` (add management tools + `zoneTools` aggregate)
- Modify: `apps/mcp/src/tools/zones.test.ts`

**Interfaces:**
- Consumes: `zoneReadTools`.
- Produces: `zoneManagementTools: ToolDef[]`, `zoneTools: ToolDef[]` (= read + management).

- [ ] **Step 1: Add failing tests to `apps/mcp/src/tools/zones.test.ts`**

```ts
import { zoneManagementTools, zoneTools } from "./zones.ts";

describe("zone management tools", () => {
  const tool = (name: string) => {
    const t = zoneManagementTools.find((x) => x.name === name);
    if (!t) throw new Error(`missing tool ${name}`);
    return t;
  };

  it("zoneTools aggregates read + management (7 total)", () => {
    expect(zoneTools).toHaveLength(7);
  });

  it("management tools are flagged destructive, not read-only", () => {
    for (const t of zoneManagementTools) {
      expect(t.annotations?.destructiveHint).toBe(true);
      expect(t.annotations?.readOnlyHint).toBe(false);
    }
  });

  it("create_zone calls zones.create with the body", async () => {
    const create = vi.fn(async () => ({ id: 9 }));
    const client = { zones: { create } } as any;
    const body = { name: "Z", geometry: { type: "Polygon", coordinates: [] } };
    await tool("create_zone").handler(client, body);
    expect(create).toHaveBeenCalledWith(body);
  });

  it("delete_zone refuses without confirm:true and does not call the API", async () => {
    const del = vi.fn();
    const client = { zones: { delete: del } } as any;
    const res = await tool("delete_zone").handler(client, { id: 5 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/confirm/i);
    expect(del).not.toHaveBeenCalled();
  });

  it("delete_zone calls zones.delete when confirm:true", async () => {
    const del = vi.fn(async () => ({ deleted: true }));
    const client = { zones: { delete: del } } as any;
    await tool("delete_zone").handler(client, { id: 5, confirm: true });
    expect(del).toHaveBeenCalledWith(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run zones`
Expected: FAIL.

- [ ] **Step 3: Append to `apps/mcp/src/tools/zones.ts`**

```ts
const DESTRUCTIVE = { destructiveHint: true, readOnlyHint: false } as const;

const geometry = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});

export const zoneManagementTools: ToolDef[] = [
  {
    name: "create_zone",
    description: "Create a geofence zone from a GeoJSON Polygon.",
    inputSchema: {
      name: z.string().min(1),
      geometry,
      description: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: DESTRUCTIVE,
    handler: (client, args) => client.zones.create(args as never).then(ok),
  },
  {
    name: "update_zone",
    description: "Update a geofence zone's name, geometry, description, or metadata.",
    inputSchema: {
      id: z.number().int(),
      name: z.string().min(1).optional(),
      geometry: geometry.optional(),
      description: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: DESTRUCTIVE,
    handler: (client, args) => {
      const { id, ...body } = args as { id: number };
      return client.zones.update(id, body as never).then(ok);
    },
  },
  {
    name: "delete_zone",
    description:
      "Permanently delete a geofence zone. Requires confirm=true; set it only after the user has agreed to the deletion.",
    inputSchema: {
      id: z.number().int(),
      confirm: z.boolean().optional(),
    },
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    handler: (client, args) => {
      if (args.confirm !== true) {
        return Promise.resolve({
          content: [
            {
              type: "text" as const,
              text: "Refusing to delete: call again with confirm=true to confirm permanent deletion.",
            },
          ],
          isError: true,
        });
      }
      return client.zones.delete(args.id as number).then(ok);
    },
  },
];

export const zoneTools: ToolDef[] = [...zoneReadTools, ...zoneManagementTools];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test --run zones`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp/src/tools/zones.ts apps/mcp/src/tools/zones.test.ts
git commit -m "feat(mcp): zone management tools with delete confirm gate"
```

---

### Task 8: Device tool

**Files:**
- Create: `apps/mcp/src/tools/devices.ts`
- Test: `apps/mcp/src/tools/devices.test.ts`

**Interfaces:**
- Produces: `deviceTools: ToolDef[]`.

- [ ] **Step 1: Write failing test `apps/mcp/src/tools/devices.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { deviceTools } from "./devices.ts";

describe("device tools", () => {
  it("registers one read-only tool", () => {
    expect(deviceTools.map((t) => t.name)).toEqual(["device_zones"]);
    expect(deviceTools[0].annotations?.readOnlyHint).toBe(true);
  });

  it("device_zones calls devices.zones with the deviceId", async () => {
    const zones = vi.fn(async () => ({ deviceId: "d1", zones: [] }));
    const client = { devices: { zones } } as any;
    await deviceTools[0].handler(client, { deviceId: "d1" });
    expect(zones).toHaveBeenCalledWith("d1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run devices`
Expected: FAIL.

- [ ] **Step 3: Create `apps/mcp/src/tools/devices.ts`**

```ts
import { z } from "zod";
import { ok } from "../errors.ts";
import type { ToolDef } from "../types.ts";

export const deviceTools: ToolDef[] = [
  {
    name: "device_zones",
    description: "Get the current zone membership for a device by its id.",
    inputSchema: { deviceId: z.string().min(1).max(255) },
    annotations: { readOnlyHint: true },
    handler: (client, args) => client.devices.zones(args.deviceId as string).then(ok),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test --run devices`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp/src/tools/devices.ts apps/mcp/src/tools/devices.test.ts
git commit -m "feat(mcp): device zone-membership tool"
```

---

### Task 9: Tool registry + wire into the agent + auth wrapper

**Files:**
- Create: `apps/mcp/src/register.ts`
- Modify: `apps/mcp/src/index.ts`
- Modify: `apps/mcp/src/index.test.ts`

**Interfaces:**
- Consumes: `geocodingTools`, `routingTools`, `zoneTools`, `deviceTools`, `toToolError`, `buildClient`, `Props`.
- Produces: `allTools: ToolDef[]`; `registerTools(server, getClient)`.

- [ ] **Step 1: Write failing test for the registry in `apps/mcp/src/index.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { allTools, registerTools } from "./register.ts";

describe("tool registry", () => {
  it("collects all 18 v1 tools with unique names", () => {
    expect(allTools).toHaveLength(18);
    expect(new Set(allTools.map((t) => t.name)).size).toBe(18);
  });

  it("registerTools registers every tool and routes calls through getClient", async () => {
    const registered: Record<string, (args: any) => Promise<any>> = {};
    const server = {
      registerTool: (name: string, _cfg: unknown, cb: (a: any) => Promise<any>) => {
        registered[name] = cb;
      },
    } as any;
    const client = { zones: { list: vi.fn(async () => ({ zones: [] })) } };
    registerTools(server, () => client as any);
    await registered.list_zones({});
    expect(client.zones.list).toHaveBeenCalled();
  });

  it("registerTools converts thrown SDK errors into isError results", async () => {
    const registered: Record<string, (args: any) => Promise<any>> = {};
    const server = {
      registerTool: (name: string, _cfg: unknown, cb: (a: any) => Promise<any>) => {
        registered[name] = cb;
      },
    } as any;
    const client = {
      zones: { list: vi.fn(async () => { throw new Error("boom"); }) },
    };
    registerTools(server, () => client as any);
    const res = await registered.list_zones({});
    expect(res.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test --run register`
Expected: FAIL.

- [ ] **Step 3: Create `apps/mcp/src/register.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LocnativeClient } from "@locnative/sdk";
import { toToolError } from "./errors.ts";
import { deviceTools } from "./tools/devices.ts";
import { geocodingTools } from "./tools/geocoding.ts";
import { routingTools } from "./tools/routing.ts";
import { zoneTools } from "./tools/zones.ts";
import type { ToolDef } from "./types.ts";

export const allTools: ToolDef[] = [
  ...geocodingTools,
  ...routingTools,
  ...zoneTools,
  ...deviceTools,
];

export const registerTools = (
  server: McpServer,
  getClient: () => LocnativeClient
): void => {
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => {
        try {
          return await tool.handler(getClient(), args);
        } catch (err) {
          return toToolError(err);
        }
      }
    );
  }
};
```

- [ ] **Step 4: Replace `apps/mcp/src/index.ts` to use the registry + auth wrapper**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { buildClient } from "./client.ts";
import { registerTools } from "./register.ts";
import type { Props } from "./types.ts";

type Env = { LOCNATIVE_API_BASE_URL: string };

export class LocnativeMcp extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: "locnative", version: "0.1.0" });

  async init() {
    registerTools(this.server, () =>
      buildClient(this.props.apiKey, this.env.LOCNATIVE_API_BASE_URL)
    );
  }
}

const extractApiKey = (request: Request): string | null => {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return request.headers.get("x-api-key")?.trim() || null;
};

const mcpHandler = LocnativeMcp.serve("/mcp", { binding: "MCP_OBJECT" });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing API key. Send Authorization: Bearer <key>." }),
        { status: 401, headers: { "content-type": "application/json", "WWW-Authenticate": "Bearer" } }
      );
    }
    (ctx as ExecutionContext & { props: Props }).props = { apiKey };
    return mcpHandler.fetch(request, env, ctx);
  },
};
```

> Note: the agents SDK reads per-session props from `ctx.props` (this is what `OAuthProvider` populates in the OAuth flow; here we set it directly for API-key auth). Confirm the prop-passing mechanism against the installed `agents` version's `agents/mcp` README; if it differs, adapt the wrapper while keeping the "401 before tools, apiKey into props" behaviour.

- [ ] **Step 5: Run tests**

Run: `cd apps/mcp && pnpm test --run`
Expected: all PASS.

- [ ] **Step 6: Type-check**

Run: `cd apps/mcp && pnpm check-types`
Expected: no errors.

- [ ] **Step 7: Smoke-test locally**

Run: `cd apps/mcp && pnpm dev` (in one shell). In another:
`npx @modelcontextprotocol/inspector` → connect to `http://localhost:3005/mcp` with header `Authorization: Bearer <a real test API key>`.
Expected: 18 tools list; `list_zones` returns data; calling with no auth header → 401.

- [ ] **Step 8: Commit**

```bash
git add apps/mcp/src/register.ts apps/mcp/src/index.ts apps/mcp/src/index.test.ts
git commit -m "feat(mcp): register all tools and inject API-key auth"
```

---

### Task 10: README + deploy/DNS follow-up notes

**Files:**
- Create: `apps/mcp/README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Create `apps/mcp/README.md`**

````markdown
# @locnative/mcp

MCP server at `mcp.locnative.com` exposing the Locnative location API to AI agents.

## Auth
Pass a Locnative project API key as `Authorization: Bearer <key>` (or `X-API-Key`).

## Tools (v1)
Geocoding/regions: geocode_address, reverse_geocode, autocomplete_address, nearby_addresses, classify_region.
Routing: get_directions, travel_matrix, isochrone, match_trace, optimize_stops.
Zones: list_zones, get_zone, zones_containing_point, zone_addresses, create_zone, update_zone, delete_zone (delete needs confirm=true).
Devices: device_zones.

## Develop
`pnpm dev` then connect MCP Inspector to `http://localhost:3005/mcp`.

## Deploy
`pnpm deploy` (manual — this repo has no CI/CD). After first deploy, confirm the
`mcp.locnative.com` custom domain is attached in the Cloudflare dashboard.

## Follow-up (not in this plan)
- Publish the DNS-AID discovery record pointing at this endpoint + enable DNSSEC
  (see docs/superpowers/specs/2026-06-19-mcp-server-design.md and the dns-aid-deferred memory).
- OAuth 2.1 connector auth, batch-geocode tools, webhook/device-push tools.
````

- [ ] **Step 2: Commit**

```bash
git add apps/mcp/README.md
git commit -m "docs(mcp): README and deploy/DNS follow-up notes"
```

---

## Self-Review

**Spec coverage:**
- Architecture A (standalone worker, SDK over HTTP, mcp.locnative.com) → Tasks 1, 9. ✓
- API-key auth, 401 before tools → Task 9. ✓
- 18 tools across geocoding/routing/zones/devices → Tasks 4–8, count asserted in Task 9. ✓
- Read vs destructive annotations + delete confirm gate → Tasks 4–8 (READ), Task 7 (DESTRUCTIVE + confirm). ✓
- Error mapping by status class → Task 3. ✓
- Excludes batch/webhooks/device-push → none added; documented in README (Task 10). ✓
- Testing convention (node env, mock SDK boundary) → vitest.config (Task 1), all tool tests mock a fake client. ✓
- DNS-AID + OAuth out-of-scope follow-ups → Task 10 README. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Two explicit "confirm against the SDK/agents source" notes (match/optimize point shape; props mechanism) are verification steps, not placeholders — each has a concrete default to ship.

**Type consistency:** `ToolDef`/`ToolResult`/`Props` defined once (Task 2) and used everywhere. `ok`/`toToolError` (Task 3) used by every tool module and the registry. Tool arrays exported with stable names (`geocodingTools`, `routingTools`, `zoneReadTools`/`zoneManagementTools`/`zoneTools`, `deviceTools`, `allTools`) and consumed in Task 9. SDK method calls match confirmed signatures: `geocode.forward(params)`, `addresses.reverse/autocomplete/nearby(params)`, `regions.classify(params)`, `routing.directions/matrix/isochrone/match/optimize(params)`, `zones.list(params)/get(id)/contains(params)/addresses(id, params)/create(body)/update(id, body)/delete(id)`, `devices.zones(deviceId)`.
