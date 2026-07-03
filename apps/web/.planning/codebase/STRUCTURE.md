# Codebase Structure

**Analysis Date:** 2026-04-12

## Directory Layout

```
locnative.com/                    # Monorepo root
├── apps/
│   └── web/                       # TanStack Start web application
│       ├── public/                # Static assets
│       │   ├── brand/             # Favicon, logos
│       │   └── resources/         # Downloadable resources
│       ├── src/
│       │   ├── assets/            # Imported assets (logos)
│       │   │   └── logo/          # Logo SVG/images
│       │   ├── components/        # React components
│       │   │   ├── shadcn-space/  # Marketing page blocks
│       │   │   │   ├── animations/
│       │   │   │   └── blocks/    # Landing page sections
│       │   │   │       ├── feature-15/
│       │   │   │       ├── footer-02/
│       │   │   │       ├── hero-15/
│       │   │   │       ├── integration-01/
│       │   │   │       └── testimonial-07/
│       │   │   └── ui/            # App-level UI primitives (local)
│       │   ├── hooks/             # Custom React hooks
│       │   ├── lib/               # Server functions, utilities, auth
│       │   └── routes/            # TanStack Router file-based routes
│       │       ├── _auth/         # Auth layout group (currently empty)
│       │       ├── _protected/    # Authenticated dashboard pages
│       │       ├── _public/       # Public layout group (currently empty)
│       │       └── api/           # REST API endpoints
│       │           └── v1/
│       │               └── addresses/
│       ├── .planning/             # Planning and analysis docs
│       ├── .tanstack/             # TanStack generated files
│       ├── vite.config.ts         # Vite + TanStack Start config
│       └── tsconfig.json          # TypeScript config
├── packages/
│   ├── backend/                   # Convex backend
│   │   └── convex/                # Convex functions + schema
│   │       └── _generated/        # Convex codegen
│   ├── config/                    # Shared TypeScript config
│   ├── database/                  # Drizzle ORM + Neon Postgres
│   │   ├── drizzle/               # Migration files
│   │   │   └── meta/              # Migration metadata
│   │   └── src/
│   │       ├── schema/            # Drizzle table definitions
│   │       └── queries/           # Reusable query functions
│   ├── env/                       # T3 Env validated env vars
│   │   └── src/
│   └── ui/                        # Shared UI components (shadcn/ui)
│       └── src/
│           └── components/        # shadcn component primitives
├── scripts/                       # Build/deploy scripts
├── package.json                   # Root workspace config
└── pnpm-lock.yaml                 # Lockfile
```

## Directory Purposes

**`apps/web/src/routes/`:**
- Purpose: File-based route definitions for TanStack Router
- Contains: Page components, layout routes, API handlers
- Key files:
  - `__root.tsx`: Root layout with Better Auth/Convex providers, SSR auth
  - `_protected.tsx`: Layout route with auth guard + AppShell wrapper
  - `index.tsx`: Landing/marketing page
  - `sign-in.$.tsx`, `sign-up.$.tsx`: Better Auth pages (splat routes)
  - `sitemap[.]xml.ts`: Server-only sitemap generator

**`apps/web/src/routes/_protected/`:**
- Purpose: Authenticated dashboard pages (all require Better Auth sign-in)
- Contains: Feature pages for the SaaS dashboard
- Key files:
  - `dashboard.tsx`: Main dashboard with stats, usage, quick start
  - `api-keys.tsx`: API key management (create, list, revoke)
  - `api-docs.tsx`: API explorer/documentation
  - `analytics.tsx`, `billing.tsx`, `settings.tsx`, `team.tsx`, `projects.tsx`, `integrations.tsx`, `docs.tsx`, `help.tsx`: Additional dashboard pages

**`apps/web/src/routes/api/v1/addresses/`:**
- Purpose: REST API endpoints for geocoding
- Contains: Server-only route handlers (no client components)
- Key files:
  - `autocomplete.ts`: Address autocomplete search (`?q=...`)
  - `reverse.ts`: Reverse geocoding (`?lat=...&lng=...`)
  - `nearby.ts`: Nearby address search (`?lat=...&lng=...&radius=...`)
  - `$id.ts`: Address lookup by ID

**`apps/web/src/lib/`:**
- Purpose: Server functions, authentication logic, utilities
- Contains: Server-side code and shared helpers
- Key files:
  - `db.ts`: Singleton Neon DB connection factory
  - `api-key-auth.ts`: API key parsing, validation (scrypt), usage recording, key generation
  - `with-api-key.ts`: Higher-order function wrapping API handlers with auth + usage tracking
  - `dashboard-server.ts`: `getDashboardStats` server function
  - `api-keys-server.ts`: `listApiKeys`, `createApiKey`, `revokeApiKey` server functions
  - `nav-item-matches-path.ts`: Sidebar active-state helper
  - `utils.ts`: General utilities (cn/clsx)

**`apps/web/src/components/`:**
- Purpose: Reusable React components for the application
- Contains: Dashboard shell components and marketing page blocks
- Key files:
  - `app-shell.tsx`: SidebarProvider + AppSidebar + AppHeader wrapper
  - `app-sidebar.tsx`: Navigation sidebar with route groups
  - `app-header.tsx`: Top header with breadcrumbs and user menu
  - `app-shared.tsx`: Navigation configuration (route groups, icons, paths)
  - `nav-group.tsx`: Sidebar navigation group renderer
  - `nav-user.tsx`: User avatar/menu in sidebar
  - `logo.tsx`: Logo component
  - `loader.tsx`: Loading spinner
  - `api-explorer.tsx`: Interactive API documentation component

**`apps/web/src/components/shadcn-space/blocks/`:**
- Purpose: Marketing landing page sections
- Contains: Self-contained block components from shadcn-space templates
- Naming: Each block in its own directory (`hero-15/`, `feature-15/`, etc.)

**`apps/web/src/components/ui/`:**
- Purpose: App-local UI primitives (supplements the shared `packages/ui`)
- Contains: Components specific to this app that don't belong in the shared library

**`packages/database/src/schema/`:**
- Purpose: Drizzle ORM table definitions
- Contains: PostgreSQL table schemas with indexes
- Key files:
  - `addresses.ts`: Address table with PostGIS `geometry(Point, 4326)` column, multiple indexes
  - `api-keys.ts`: `api_keys` table (scrypt hash storage) + `api_usage_daily` table (usage tracking with upsert)
  - `index.ts`: Re-exports all schemas and types

**`packages/database/src/queries/`:**
- Purpose: Reusable typed query functions
- Contains: Complex queries that are shared across routes
- Key files:
  - `autocomplete.ts`: Multi-token address search with ilike matching
  - `index.ts`: Re-exports query functions

**`packages/env/src/`:**
- Purpose: Validated environment variable access via T3 Env
- Key files:
  - `web.ts`: Client-safe vars (`VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`)
  - `server.ts`: Server-only vars (exists but not yet read)

**`packages/ui/src/components/`:**
- Purpose: Shared shadcn/ui component library used across apps
- Contains: ~24 components (button, card, dialog, sidebar, table, tabs, etc.)
- Import pattern: `@locnative/ui/components/button`

## Key File Locations

**Entry Points:**
- `apps/web/src/start.ts`: TanStack Start server entry (middleware config)
- `apps/web/src/router.tsx`: Router factory (Convex + React Query setup)
- `apps/web/src/routes/__root.tsx`: Root route (HTML shell, providers)
- `apps/web/src/index.css`: Global styles entry

**Configuration:**
- `apps/web/vite.config.ts`: Vite config (plugins: tailwind, tanstackStart, react, tsconfigPaths)
- `apps/web/tsconfig.json`: TypeScript config with path aliases (`@/*` -> `./src/*`)
- `apps/web/package.json`: App dependencies and scripts
- `package.json`: Root workspace config (Turborepo, Ultracite)
- `packages/database/package.json`: DB package with Drizzle Kit scripts

**Core Logic:**
- `apps/web/src/lib/api-key-auth.ts`: API key cryptography and validation
- `apps/web/src/lib/with-api-key.ts`: API middleware pattern
- `packages/database/src/client.ts`: Neon + Drizzle client factory
- `packages/database/src/queries/autocomplete.ts`: Address search algorithm

**Generated (do not edit):**
- `apps/web/src/routeTree.gen.ts`: Auto-generated route tree
- `packages/backend/convex/_generated/`: Convex codegen

## Naming Conventions

**Files:**
- Route files: kebab-case matching URL path (`api-keys.tsx`, `api-docs.tsx`)
- Route params: `$param` prefix (`$id.ts`)
- Splat routes: `.$` suffix (`sign-in.$.tsx`)
- Escaped dots in routes: `[.]` (`sitemap[.]xml.ts`)
- Components: kebab-case (`app-shell.tsx`, `nav-user.tsx`)
- Server function modules: `*-server.ts` suffix (`dashboard-server.ts`, `api-keys-server.ts`)
- Schema files: kebab-case (`api-keys.ts`, `addresses.ts`)

**Directories:**
- Route layout groups: underscore prefix (`_protected/`, `_auth/`, `_public/`)
- API versioning: `api/v1/` path segments
- Marketing blocks: `shadcn-space/blocks/{block-name}/`

**Exports:**
- Components: Named exports, PascalCase (`export function AppShell`)
- Server functions: Named exports, camelCase (`export const getDashboardStats`)
- Types: Named exports with `type` keyword (`export type DashboardStats`)
- Schemas: Named exports, camelCase (`export const apiKeys`)

## Where to Add New Code

**New Protected Dashboard Page:**
- Route: `apps/web/src/routes/_protected/{page-name}.tsx`
- Server functions (if needed): `apps/web/src/lib/{page-name}-server.ts`
- Pattern: Use `createFileRoute("/_protected/{page-name}")`, component fetches data via server functions in `useEffect`
- The page automatically gets the AppShell (sidebar + header) from `_protected.tsx` layout

**New API Endpoint:**
- Route: `apps/web/src/routes/api/v1/{resource}/{action}.ts`
- Pattern: Use `createFileRoute("/api/v1/...")` with `server.handlers.GET` (or POST)
- Wrap handler with `withApiKeyGET` from `src/lib/with-api-key.ts`
- Add query logic to `packages/database/src/queries/` if complex

**New Database Table:**
- Schema: `packages/database/src/schema/{table-name}.ts`
- Re-export from: `packages/database/src/schema/index.ts`
- Migration: Run `pnpm --filter @locnative/database db:generate` then `db:migrate`

**New Query Function:**
- Location: `packages/database/src/queries/{query-name}.ts`
- Re-export from: `packages/database/src/queries/index.ts`
- Pattern: Accept `db: Database` as first parameter, return typed results

**New Shared UI Component:**
- Location: `packages/ui/src/components/{component-name}.tsx`
- Import as: `@locnative/ui/components/{component-name}`

**New App-Local Component:**
- Location: `apps/web/src/components/{component-name}.tsx`
- Import as: `@/components/{component-name}`

**New Server Function:**
- Location: `apps/web/src/lib/{feature}-server.ts`
- Pattern: `export const myFn = createServerFn({ method: "GET" }).handler(async () => { ... })`
- Always resolve session identity at the top of the handler for user identity

**New Hook:**
- Location: `apps/web/src/hooks/{hook-name}.ts`
- Pattern: `export function useMyHook() { ... }`

**New Marketing Block:**
- Location: `apps/web/src/components/shadcn-space/blocks/{block-name}/`
- Import from landing page: `apps/web/src/routes/index.tsx`

## Special Directories

**`.tanstack/`:**
- Purpose: TanStack Router/Start temporary build artifacts
- Generated: Yes
- Committed: No (should be gitignored)

**`packages/backend/convex/_generated/`:**
- Purpose: Convex codegen (API types, server stubs)
- Generated: Yes, by Convex CLI
- Committed: Yes

**`packages/database/drizzle/`:**
- Purpose: SQL migration files generated by Drizzle Kit
- Generated: Yes, by `drizzle-kit generate`
- Committed: Yes

**`apps/web/src/routeTree.gen.ts`:**
- Purpose: Auto-generated route tree from file-based routes
- Generated: Yes, by `@tanstack/router-plugin` Vite plugin
- Committed: Yes (checked into git)

**`public/`:**
- Purpose: Static files served directly (brand assets, robots.txt, resources)
- Generated: No
- Committed: Yes

## Path Aliases

Defined in `apps/web/tsconfig.json`:
- `@/*` -> `./src/*` (app source imports)
- `@locnative/ui/*` -> `../../packages/ui/src/*` (shared UI, also resolved by `vite-tsconfig-paths`)

Workspace packages (resolved by pnpm):
- `@locnative/backend` -> `packages/backend`
- `@locnative/database` -> `packages/database`
- `@locnative/env` -> `packages/env`
- `@locnative/ui` -> `packages/ui`
- `@locnative/config` -> `packages/config`

---

*Structure analysis: 2026-04-12*
