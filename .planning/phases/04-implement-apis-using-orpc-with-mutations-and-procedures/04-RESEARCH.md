# Phase 4: Implement APIs using oRPC with mutations and procedures - Research

**Researched:** 2026-04-15
**Domain:** oRPC server/client setup, TanStack Query integration, procedure patterns
**Confidence:** HIGH

## Summary

The oRPC infrastructure is **already substantially built** in the locnative project. A `@locnative/api` package exists with builder, context, procedures (public + protected), and four domain routers (auth, dashboard, apiKeys, projects). A separate `apps/server` Hono app serves the RPC handler at `/rpc`, and the web app proxies requests to it via a TanStack Start catch-all route at `/rpc/$`. The frontend uses `orpcClient` directly (not TanStack Query hooks) for data fetching in thin wrapper files (`dashboard-server.ts`, `api-keys-server.ts`, `projects-server.ts`).

The main remaining work is: (1) migrating the `sendApiExplorerRequest` `createServerFn` to an oRPC procedure, (2) migrating the `fetchSession` `createServerFn` in `__root.tsx` to use the oRPC auth router, (3) integrating `@orpc/tanstack-query` for proper React Query hook integration (the package is already installed but not used), and (4) ensuring the client-side data fetching pattern matches the mydeffo reference (using `createTanstackQueryUtils` for query key management and cache invalidation).

**Primary recommendation:** Complete the oRPC migration by moving the last two `createServerFn` usages to oRPC procedures, wire up `@orpc/tanstack-query` for React Query integration following the mydeffo pattern, and remove the thin wrapper files in favor of direct `orpcClient` calls or TanStack Query utils.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@orpc/server` | ^1.9.0 (latest: 1.13.14) | Define routers, procedures, middleware | Already installed, matches mydeffo pattern |
| `@orpc/client` | ^1.9.0 (latest: 1.13.14) | Client-side RPC calls via RPCLink | Already installed |
| `@orpc/tanstack-query` | ^1.9.0 (latest: 1.13.14) | `createTanstackQueryUtils` for React Query integration | Already installed, not yet wired up |
| `hono` | ^4.10.4 | Server framework for RPC handler | Already used in `apps/server` |
| `zod` | catalog | Input validation schemas | Already used in procedures |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-auth` | ^1.5.6 | Session resolution in context | Already integrated in context creation |
| `drizzle-orm` | ^0.44.7 | Database queries inside procedures | Already used in all domain routers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `orpcClient` calls | `@orpc/tanstack-query` hooks | TanStack Query utils give automatic cache keys, invalidation, and SSR dehydration -- prefer this |
| `createServerFn` (TanStack) | oRPC procedures | oRPC centralizes all server logic in `@locnative/api` package -- prefer this |

## Architecture Patterns

### Current Project Structure (already exists)
```
packages/api/
  src/
    auth.ts              # BetterAuth instance
    builder.ts           # os.$context<Context>()
    context.ts           # createContext with session + db
    db.ts                # Database connection
    index.ts             # Re-exports
    procedures.ts        # publicProcedure, protectedProcedure
    routers/
      index.ts           # appRouter combining all domain routers
      domains/
        api-keys.ts      # CRUD for API keys
        api-keys-shared.ts  # Shared helpers
        auth.ts          # healthCheck, getSession, signUp, privateData
        dashboard.ts     # getStats
        projects.ts      # CRUD for projects
apps/server/
  src/
    index.ts             # Hono app with RPCHandler at /rpc
apps/web/
  src/
    lib/
      orpc.ts            # RPCLink client pointing at /rpc
    routes/
      rpc/$.ts           # Proxy catch-all to apps/server
```

### Pattern 1: Domain Router Definition
**What:** Each domain gets its own file exporting a router object with named procedures.
**When to use:** Every new API capability.
**Example (from existing codebase):**
```typescript
// packages/api/src/routers/domains/dashboard.ts
import { protectedProcedure } from "../../procedures.ts";

export const dashboardRouter = {
  getStats: protectedProcedure.handler(async ({ context }) => {
    const authUserId = context.session.user.id;
    // ... database queries using context.db
    return { activeKeys: 0, totalRequests: 0 };
  }),
};
```

### Pattern 2: Procedure with Input Validation
**What:** Mutations use Zod schemas for input validation via `.input()`.
**When to use:** Any procedure that accepts user input.
**Example (from existing codebase):**
```typescript
// packages/api/src/routers/domains/api-keys.ts
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";

const createApiKeyInputSchema = z.object({
  name: z.string().min(1).max(128),
});

export const apiKeysRouter = {
  create: protectedProcedure
    .input(createApiKeyInputSchema)
    .handler(async ({ context, input }) => {
      // input is typed from schema
      return await createApiKeyRecord(context.db, {
        userId: context.session.user.id,
        name: input.name,
        projectId: null,
      });
    }),
};
```

### Pattern 3: Router Composition
**What:** Domain routers are spread/nested into the app router.
**When to use:** Adding new domain routers.
**Example (from existing codebase):**
```typescript
// packages/api/src/routers/index.ts
export const appRouter = {
  apiKeys: apiKeysRouter,   // Nested style (locnative)
  auth: authRouter,
  dashboard: dashboardRouter,
  projects: projectsRouter,
};
// Note: mydeffo uses spread style (...authRouter) for flat namespace.
// locnative uses nested style (auth: authRouter) for namespaced access.
```

### Pattern 4: oRPC Client with TanStack Query Utils (mydeffo reference)
**What:** `createTanstackQueryUtils` wraps the client for React Query integration.
**When to use:** All frontend data fetching.
**Example (from mydeffo reference):**
```typescript
// utils/orpc.ts
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({ /* ... */ });
const link = new RPCLink({
  url: "/rpc",
  fetch(url, options) {
    return fetch(url, { ...options, credentials: "include" });
  },
});
export const client = createORPCClient(link) as RouterClient<AppRouter>;
export const orpc = createTanstackQueryUtils(client);
```

### Pattern 5: Frontend Direct Client Usage (mydeffo reference)
**What:** Components import `client` and call procedures directly with `await`.
**When to use:** Mutations and one-off data fetches in event handlers.
**Example (from mydeffo components):**
```typescript
import { client } from "@/utils/orpc";

const handleSubmit = async () => {
  const result = await client.apiKeys.create({ name: "my-key" });
};
```

### Anti-Patterns to Avoid
- **Wrapping oRPC calls in `createServerFn`:** Adds an unnecessary proxy layer. oRPC already handles server/client separation.
- **Thin wrapper files that just re-export oRPC calls:** Files like `dashboard-server.ts` that only call `orpcClient.dashboard.getStats()` add no value. Call the client directly from components.
- **Using `getSession()` via separate HTTP fetch when context already has it:** The oRPC context already resolves the session. Use `context.session` inside procedures.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query key management | Manual query key strings | `@orpc/tanstack-query` `createTanstackQueryUtils` | Automatic type-safe query keys from router shape |
| Auth middleware | Per-procedure auth checks | `protectedProcedure` (already exists) | Centralized, consistent auth enforcement |
| Input validation | Manual parsing | Zod schemas with `.input()` | Type inference, error messages, consistent pattern |
| Error codes | Custom error objects | `ORPCError` with standard codes | Standardized error handling across client/server |
| RPC serialization | Custom fetch wrappers | `RPCLink` + `RPCHandler` | Handles serialization, content negotiation automatically |

## Common Pitfalls

### Pitfall 1: Mixing createServerFn and oRPC
**What goes wrong:** Having some endpoints as `createServerFn` and others as oRPC procedures creates two parallel API layers with different auth patterns.
**Why it happens:** Incremental migration leaves legacy patterns behind.
**How to avoid:** Migrate all `createServerFn` calls to oRPC procedures in this phase. Only two remain: `fetchSession` in `__root.tsx` and `sendApiExplorerRequest` in `api-explorer-server.ts`.
**Warning signs:** Import of `createServerFn` from `@tanstack/react-start` anywhere in the codebase.

### Pitfall 2: Forgetting credentials: "include" on RPCLink
**What goes wrong:** Session cookies are not sent with RPC requests, causing all protected procedures to return UNAUTHORIZED.
**Why it happens:** The RPCLink uses `fetch` which defaults to `same-origin` credentials.
**How to avoid:** The existing `orpc.ts` already has `credentials: "include"` configured. Do not remove this.
**Warning signs:** 401 errors on protected procedure calls that work when using the API directly.

### Pitfall 3: Session Proxy Latency
**What goes wrong:** The web app at `apps/web` proxies RPC calls to `apps/server` via `/rpc/$` catch-all route. Each RPC call requires the server to call BetterAuth's `getSession()` which itself makes an HTTP call.
**Why it happens:** The auth-server.ts proxy pattern adds network hops.
**How to avoid:** This is an architectural decision already made. Be aware that each oRPC call has this overhead. Batch related data fetches into single procedures where possible (as `dashboard.getStats` already does).
**Warning signs:** Slow page loads due to waterfall RPC calls.

### Pitfall 4: Not Invalidating Queries After Mutations
**What goes wrong:** After creating/revoking an API key or creating a project, the list views show stale data.
**Why it happens:** Direct `client.apiKeys.create()` calls don't automatically invalidate related queries.
**How to avoid:** Use `queryClient.invalidateQueries()` after mutations, or use `@orpc/tanstack-query` utils which provide query keys for targeted invalidation.
**Warning signs:** Users need to refresh the page to see changes.

### Pitfall 5: API Explorer Server Function Needs Server-Side Env Access
**What goes wrong:** The `sendApiExplorerRequest` function needs `serverEnv.BETTER_AUTH_SECRET` and `serverEnv.WEB_BASE_URL` which are server-only environment variables.
**Why it happens:** The API explorer makes internal server-to-server requests with auth headers.
**How to avoid:** When migrating to oRPC, this procedure must run on the server (which it will, as all oRPC procedures do). The context already has `db` and `session`. But the internal fetch to the API endpoints needs the server URL -- access it through the server environment in the procedure.
**Warning signs:** Environment variable errors when calling the procedure.

## Code Examples

### Current State: What Exists
```typescript
// Already working oRPC procedures in packages/api/src/routers/domains/:
// - auth.ts: healthCheck, getSession, signUp, privateData
// - dashboard.ts: getStats
// - api-keys.ts: list, create, revoke
// - projects.ts: list, listApiKeyOptions, create, assignApiKey
```

### Migration Target 1: Move fetchSession to oRPC
```typescript
// In __root.tsx, replace:
const fetchSession = createServerFn({ method: "GET" }).handler(async () => {
  return await getSession();
});

// With direct oRPC call (auth.getSession already exists):
// In beforeLoad: const session = await orpcClient.auth.getSession();
```

### Migration Target 2: Move sendApiExplorerRequest to oRPC
```typescript
// New procedure in packages/api/src/routers/domains/api-explorer.ts
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";

const explorerRequestSchema = z.object({
  authMode: z.enum(["managed", "raw"]),
  endpointId: z.string(),
  managedKeyId: z.string().uuid().optional(),
  paramValues: z.record(z.string(), z.string()).default({}),
  rawApiKey: z.string().optional(),
});

export const apiExplorerRouter = {
  sendRequest: protectedProcedure
    .input(explorerRequestSchema)
    .handler(async ({ context, input }) => {
      // Move logic from api-explorer-server.ts here
      // context.session gives auth, context.db gives database access
    }),
};
```

### Migration Target 3: Wire up TanStack Query Utils
```typescript
// apps/web/src/lib/orpc.ts - Enhanced version
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouter } from "@locnative/api";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({});

const link = new RPCLink({
  url: getRpcUrl(),
  fetch(url, options) {
    return fetch(url, { ...options, credentials: "include" });
  },
});

export const orpcClient = createORPCClient(link) as RouterClient<AppRouter>;
export const orpc = createTanstackQueryUtils(orpcClient);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createServerFn` wrappers | Direct oRPC procedure calls | Already partially migrated | Most data fetching already uses oRPC |
| Manual query keys | `@orpc/tanstack-query` utils | Available now | Type-safe cache management |
| `tRPC` | `oRPC` | Project started with oRPC | No migration needed |

**Current state:**
- 4 domain routers with 11 procedures already implemented
- 2 remaining `createServerFn` usages to migrate
- `@orpc/tanstack-query` installed but not integrated
- Thin wrapper files exist but can be eliminated

## Open Questions

1. **Should the API Explorer procedure live in `@locnative/api` or stay in the web app?**
   - What we know: It needs server-only env vars (`BETTER_AUTH_SECRET`, `WEB_BASE_URL`) and makes internal HTTP requests to the same web app's API endpoints.
   - What's unclear: Whether the server package should know about API endpoint URL patterns that are defined in the web app.
   - Recommendation: Move it to the API package. The endpoint patterns can be passed as configuration or the procedure can receive the full URL from the client.

2. **Should the `__root.tsx` session fetch use oRPC or keep `createServerFn`?**
   - What we know: The session is fetched during SSR in `beforeLoad`. Using oRPC means the web app makes an HTTP call to the server app just to get the session.
   - What's unclear: Whether the network overhead of an RPC call for session is acceptable vs. the direct `getSession()` call via `createServerFn`.
   - Recommendation: Keep `createServerFn` for the root session fetch since it runs during SSR and benefits from the direct server-side call without network overhead. This is the one justified use of `createServerFn`.

3. **Should thin wrapper files (`dashboard-server.ts`, etc.) be kept or removed?**
   - What we know: They currently just proxy to `orpcClient`. mydeffo imports `client` directly in components.
   - What's unclear: Whether the project prefers the indirection for type re-exports.
   - Recommendation: Remove them in favor of direct `orpcClient` usage. The types come from the router itself.

## Project Constraints (from CLAUDE.md)

- **Ultracite/Biome formatting:** All code must pass `pnpm dlx ultracite check`. Use tabs, double quotes, sorted imports.
- **No console.log in production:** Enforced by Biome. Use `ORPCError` for error signaling.
- **Arrow functions for callbacks, `for...of` over `.forEach()`**
- **Explicit types on function parameters and return values**
- **Named exports over default exports**
- **Use `const` by default, never `var`**
- **Zod for input validation** (already used in procedures)
- **No `any` types** -- use `unknown` when type is genuinely unknown
- **TanStack Start + existing stack** -- no framework changes

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `packages/api/src/` -- all router, builder, context, procedure files
- Direct codebase analysis of `apps/server/src/index.ts` -- Hono + RPCHandler setup
- Direct codebase analysis of `apps/web/src/lib/orpc.ts` -- client configuration
- Reference project analysis of `/Users/mac/Developer/projects/mydeffo.com-web/packages/api/` -- complete oRPC architecture
- Reference project analysis of `/Users/mac/Developer/projects/mydeffo.com-web/apps/web/src/utils/orpc.ts` -- TanStack Query integration

### Secondary (MEDIUM confidence)
- npm registry: `@orpc/server@1.13.14`, `@orpc/client@1.13.14`, `@orpc/tanstack-query@1.13.14` (latest versions verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - packages already installed and in use
- Architecture: HIGH - pattern already established in codebase and verified against reference project
- Pitfalls: HIGH - identified from actual codebase analysis, not theoretical concerns

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable -- oRPC API is settled, existing patterns are working)
