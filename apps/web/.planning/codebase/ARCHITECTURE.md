# Architecture

**Analysis Date:** 2026-04-12

## Pattern Overview

**Overall:** Full-stack monorepo with TanStack Start (SSR/SSG) web app serving both a marketing site, authenticated dashboard, and RESTful geocoding API

**Key Characteristics:**
- Monorepo managed by Turborepo with pnpm workspaces
- TanStack Router file-based routing with SSR via TanStack Start + Vite
- Dual data layer: Convex (real-time, via React Query bridge) + Neon Postgres (geocoding data, API keys, usage tracking)
- Better Auth authentication bridged to Convex
- API routes served from the same TanStack Start app (no separate API server)
- Server functions (`createServerFn`) for authenticated dashboard data fetching

## Monorepo Packages

**`apps/web`** - Primary web application (TanStack Start)
- Marketing landing page, auth pages, protected dashboard, REST API
- Entry: `src/start.ts` (server middleware), `src/router.tsx` (client router)

**`packages/database`** - Drizzle ORM schema + queries for Neon Postgres
- Exports: `@locnative/database`, `@locnative/database/schema`, `@locnative/database/queries`
- Contains: address schema with PostGIS geometry, API key schema, usage tracking schema

**`packages/backend`** - Convex backend (currently empty schema, placeholder)
- Exports: `@locnative/backend`
- Contains: Convex schema, auth config, health check

**`packages/env`** - T3 Env validated environment variables
- Exports: `@locnative/env/web` (client-safe VITE_ vars), `@locnative/env/server`

**`packages/ui`** - Shared UI component library (shadcn/ui based)
- Exports: `@locnative/ui/components/*`, `@locnative/ui/lib/utils`

**`packages/config`** - Shared TypeScript config
- Exports: `@locnative/config`

## Layers

**Routing Layer (TanStack Router):**
- Purpose: File-based routing with layout nesting and route guards
- Location: `src/routes/`
- Contains: Page components, layout routes, API route handlers
- Depends on: Components, lib (server functions), UI package
- Used by: Router in `src/router.tsx`

**Server Functions Layer:**
- Purpose: Server-side data fetching called from client components via RPC
- Location: `src/lib/*-server.ts`
- Contains: `createServerFn` wrappers that authenticate via Better Auth and query Neon DB
- Depends on: `@/lib/auth-server`, `@locnative/database`
- Used by: Protected route components (dashboard, api-keys)
- Key files:
  - `src/lib/dashboard-server.ts` - Dashboard stats aggregation
  - `src/lib/api-keys-server.ts` - CRUD for API keys (list, create, revoke)

**API Layer (REST endpoints):**
- Purpose: Public geocoding API authenticated via API keys (not Better Auth)
- Location: `src/routes/api/v1/`
- Contains: TanStack Router server handlers using `Route.server.handlers.GET`
- Depends on: `src/lib/with-api-key.ts`, `src/lib/api-key-auth.ts`, `@locnative/database`
- Used by: External API consumers

**Authentication Layer:**
- Purpose: User authentication (Clerk) and API key authentication (custom)
- Location: `src/start.ts` (middleware), `src/routes/__root.tsx` (providers), `src/lib/api-key-auth.ts`
- Contains: Clerk middleware, Convex auth bridge, API key validation with scrypt hashing
- Key detail: API routes (`/api/v1/*`) are excluded from Clerk middleware via `ignoredRoutes`

**Database Layer:**
- Purpose: Schema definitions, query functions, DB client factory
- Location: `packages/database/src/`
- Contains: Drizzle schema, typed query functions, Neon HTTP client
- Key files:
  - `packages/database/src/schema/addresses.ts` - Address table with PostGIS geometry column
  - `packages/database/src/schema/api-keys.ts` - API keys + daily usage tracking tables
  - `packages/database/src/client.ts` - Neon serverless + Drizzle client factory
  - `packages/database/src/queries/autocomplete.ts` - Address autocomplete query logic

**Component Layer:**
- Purpose: React UI components for the dashboard shell and marketing pages
- Location: `src/components/`
- Contains: App shell (sidebar + header), navigation, marketing blocks
- Depends on: `@locnative/ui`, TanStack Router, Clerk React
- Key files:
  - `src/components/app-shell.tsx` - Protected layout with sidebar + header
  - `src/components/app-sidebar.tsx` - Navigation sidebar
  - `src/components/app-shared.tsx` - Navigation config (routes, groups, icons)
  - `src/components/shadcn-space/blocks/` - Marketing page sections

## Data Flow

**Dashboard Data Loading:**
1. User navigates to `/_protected/dashboard`
2. `_protected.tsx` layout route runs `beforeLoad` guard, redirects to `/sign-in/$` if no `userId` in context
3. Dashboard component calls `getDashboardStats()` server function via `useEffect`
4. Server function authenticates via `auth()` (Clerk), calls `getDb()` to get Neon connection
5. Parallel Drizzle queries fetch active keys, usage totals, endpoint breakdown
6. Stats returned to client, rendered in cards

**API Request Flow:**
1. External client sends GET to `/api/v1/addresses/autocomplete?q=...` with `Authorization: Bearer wh_...`
2. Clerk middleware skips this route (configured in `src/start.ts`)
3. `withApiKeyGET` wrapper extracts token from `Authorization` or `X-API-Key` header
4. `validateApiKey` parses token format `wh_{uuid}_{secret}`, looks up key by UUID, verifies secret with scrypt
5. If valid, handler executes query against Neon Postgres (with PostGIS for geo queries)
6. On success, `recordUsage` fires asynchronously (upsert into `api_usage_daily`)

**Authentication Flow (SSR):**
1. `src/start.ts` registers Clerk middleware on all routes except `/api/v1/*`
2. Root route `beforeLoad` calls `fetchClerkAuth` server function to get userId + Convex JWT
3. If JWT exists, sets it on `convexQueryClient.serverHttpClient` for SSR Convex queries
4. Root component wraps app in `ClerkProvider` + `ConvexProviderWithClerk`

**State Management:**
- No global state store. Component-local `useState` + `useEffect` for dashboard/API key data
- Convex React Query bridge available but not heavily used yet (schema is empty)
- TanStack Router context carries `queryClient`, `convexQueryClient`, `userId`, `token`

## Key Abstractions

**`withApiKeyGET` Middleware:**
- Purpose: Reusable wrapper for API key-authenticated GET endpoints
- Location: `src/lib/with-api-key.ts`
- Pattern: Higher-order function that validates API key, injects `db` into handler context, records usage on success
- Usage: All `/api/v1/addresses/*` routes wrap their handler with this

**`createServerFn` (TanStack Start):**
- Purpose: Type-safe server functions callable from client code
- Location: Used in `src/lib/dashboard-server.ts`, `src/lib/api-keys-server.ts`, `src/routes/__root.tsx`
- Pattern: Define server function with method + optional input validator + handler. Called like regular async functions from components.

**`getDb` Singleton:**
- Purpose: Lazy-initialized Neon database connection
- Location: `src/lib/db.ts`
- Pattern: Module-level singleton that creates Drizzle client on first access using `DATABASE_URL`

**Route Layout Nesting:**
- Purpose: Shared layouts via pathless route segments
- Pattern: `_protected.tsx` is a layout route that wraps all `_protected/*.tsx` children with `AppShell` and auth guard
- The `_auth` and `_public` directories exist but are currently empty/unused

## Entry Points

**Server Entry (`src/start.ts`):**
- Location: `src/start.ts`
- Triggers: Vite dev server / production build
- Responsibilities: Creates TanStack Start instance, registers Clerk middleware with API route exclusions

**Router Factory (`src/router.tsx`):**
- Location: `src/router.tsx`
- Triggers: Called during SSR and client hydration
- Responsibilities: Creates TanStack Router with Convex Query Client, React Query client, SSR query integration, route tree from codegen

**Root Route (`src/routes/__root.tsx`):**
- Location: `src/routes/__root.tsx`
- Triggers: Every navigation
- Responsibilities: SSR auth fetch, HTML document shell, Clerk + Convex providers, Toaster, devtools

**Route Tree (generated):**
- Location: `src/routeTree.gen.ts`
- Generated: Yes, by `@tanstack/router-plugin` Vite plugin
- Contains: Auto-generated route tree from file-based routes

## Error Handling

**Strategy:** Mixed - some try-catch with silent fallback, some error throwing

**Patterns:**
- API routes return `Response.json({ error: "..." }, { status: 4xx })` for validation/auth errors
- Server functions throw `Error` for auth failures, return empty defaults for missing auth
- Dashboard silently catches fetch errors and shows empty state
- API key validation returns `null` for any invalid state (timing-safe comparison)
- Usage recording errors are caught and swallowed to avoid failing client responses

## Cross-Cutting Concerns

**Logging:** No structured logging. Errors are silently caught in many places.

**Validation:**
- API route params: Manual validation with early-return error responses
- Server function inputs: Zod schemas via `inputValidator` (see `src/lib/api-keys-server.ts`)
- Environment variables: T3 Env with Zod schemas (`packages/env/src/web.ts`)

**Authentication:**
- Dashboard routes: Clerk auth via `beforeLoad` guard in `_protected.tsx`
- API routes: Custom API key auth via `withApiKeyGET` wrapper (scrypt hash verification)
- Clerk middleware applied globally except API routes

**Build:**
- Turborepo orchestrates `dev` and `build` across packages
- Vite 7 with TanStack Start plugin, React plugin, Tailwind CSS v4 plugin, tsconfig-paths plugin
- Config: `vite.config.ts`, dev server on port 3001

---

*Architecture analysis: 2026-04-12*
