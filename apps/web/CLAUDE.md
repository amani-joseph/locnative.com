<!-- GSD:project-start source:PROJECT.md -->
## Project

**Locnative — Projects & API Key Management**

Locnative is an Australian address geocoding API service. Users sign up, create projects (workspaces representing their apps or environments), and generate API keys scoped to those projects. The API provides address autocomplete and reverse geocoding powered by GNAF data in a Neon PostgreSQL + PostGIS database.

**Core Value:** Users can create projects and generate API keys to access the geocoding API, with clear visibility into usage per project and per key.

### Constraints

- **Tech stack**: TanStack Start, React 19, Drizzle ORM, Neon PostgreSQL — must use existing stack
- **Auth**: Better Auth — all protected routes require an authenticated session
- **Database**: Neon PostgreSQL with PostGIS — API keys and projects stored here (not Convex)
- **API compatibility**: Existing `/api/v1/addresses/*` endpoints must continue working with current API keys
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.x - All application code across the monorepo
- SQL (PostGIS) - Spatial queries in API route handlers via Drizzle `sql` template literals
## Runtime
- Node.js (ES2022 target, ESNext modules)
- Vite 7.x dev server on port 3001
- pnpm 10.12.4
- Lockfile: `../../pnpm-lock.yaml` (workspace root)
- Catalog dependencies used for shared versions (`catalog:` protocol)
## Frameworks
- TanStack Start 1.141.x - Full-stack SSR framework (Vite-based, file-route convention)
- TanStack React Router 1.141.x - File-based routing with SSR support
- TanStack React Query 5.80.x - Server state management, integrated with Convex
- React 19+ (catalog version) - UI rendering
- Convex (catalog version) - Realtime backend-as-a-service (schema currently empty)
- Tailwind CSS 4.x - Utility-first styling via `@tailwindcss/vite` plugin
- shadcn/ui 3.6.x - Component primitives (via `@locnative/ui` package)
- Base UI React 1.x - Unstyled accessible component primitives
- Framer Motion / Motion 12.x - Animations
- Lucide React - Icon library
- Recharts 3.x - Data visualization / charts
- Embla Carousel React 8.x - Carousel component
- dnd-kit (core 6.x, sortable 10.x) - Drag and drop
- Sonner - Toast notifications
- Vite 7.x - Build tool and dev server
- Turborepo 2.8.x - Monorepo orchestration (`turbo dev`, `turbo build`)
- Ultracite 7.4.x / Biome 2.4.x - Linting and formatting (zero-config)
- Drizzle ORM 0.44.x - Type-safe SQL query builder
- Drizzle Kit 0.31.x - Schema migrations (`db:generate`, `db:migrate`, `db:push`, `db:studio`)
- Testing Library (DOM 10.x, React 16.x) - Component testing utilities
- jsdom 26.x - DOM environment for tests
- web-vitals 5.x - Performance metrics
## Monorepo Packages
- Convex backend with Better Auth integration
- Scripts: `convex dev`, `convex dev --configure --until-success`
- Drizzle ORM schema and queries
- Exports: `.` (client/types), `./schema` (table definitions), `./queries` (query functions)
- Neon serverless PostgreSQL driver
- Type-safe environment variables via `@t3-oss/env-core` + Zod
- Exports: `./web` (client-side VITE_ vars), `./server` (server-side vars)
- Shared UI component library (shadcn-based)
- Exports: `./components/*`, `./lib/*`, `./hooks/*`, `./globals.css`
- Uses class-variance-authority, clsx, tailwind-merge for styling
- Shared TypeScript config (`tsconfig.base.json`)
## Key Dependencies
- `better-auth` 1.x - Authentication library
- `@neondatabase/serverless` 1.x - Neon PostgreSQL HTTP driver (serverless-compatible)
- `drizzle-orm` 0.44.x - Database query layer
- `convex` (catalog) - Realtime backend (currently empty schema, wired for future use)
- `@t3-oss/env-core` 0.13.x - Type-safe env var validation
- `class-variance-authority` 0.7.x - Component variant management
- `tailwind-merge` 3.x - Tailwind class deduplication
- `vite-tsconfig-paths` 5.x - Path alias resolution in Vite
- `zod` (catalog) - Schema validation throughout
## Configuration
- `.env` file at `apps/web/.env` - contains runtime configuration
- Client-side vars prefixed with `VITE_` (validated in `../../packages/env/src/web.ts`):
- Server-side vars (validated in `../../packages/env/src/server.ts`):
- Convex env vars:
- `tsconfig.json` at app root - strict mode, bundler module resolution, ES2022 target
- Path aliases: `@/*` maps to `./src/*`, `@locnative/ui/*` maps to UI package
- Shared base config: `../../packages/config/tsconfig.base.json`
- `vite.config.ts` - Plugins: tsconfigPaths, tailwindcss, tanstackStart, viteReact
- Turborepo manages cross-package builds from workspace root
## Platform Requirements
- Node.js (ES2022 compatible)
- pnpm 10.12.4+
- Neon PostgreSQL database with PostGIS extension
- Better Auth configuration and secret values
- Convex account and deployment
- TanStack Start SSR deployment (Vite-based, needs Node.js runtime)
- Neon serverless PostgreSQL (PostGIS-enabled)
- Convex cloud backend
- Better Auth authentication service
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Components: `kebab-case.tsx` (e.g., `src/components/app-sidebar.tsx`, `src/components/nav-user.tsx`)
- Utilities/lib: `kebab-case.ts` (e.g., `src/lib/api-key-auth.ts`, `src/lib/dashboard-server.ts`)
- Hooks: `use-kebab-case.ts` (e.g., `src/hooks/use-mobile.ts`)
- Routes: `kebab-case.tsx` for page routes (e.g., `src/routes/_protected/api-keys.tsx`)
- API routes: nested directory structure matching URL path (e.g., `src/routes/api/v1/addresses/autocomplete.ts`)
- UI primitives: `kebab-case.tsx` in `src/components/ui/` (e.g., `src/components/ui/button.tsx`)
- Use `camelCase` for all functions: `getDb()`, `validateApiKey()`, `navItemMatchesPath()`
- React components use `PascalCase`: `AppSidebar`, `NavUser`, `RouteComponent`
- Server functions use `camelCase` with descriptive verbs: `getDashboardStats`, `listApiKeys`, `createApiKey`, `revokeApiKey`
- Private/internal helpers use `camelCase`: `formatDisplayLabel()`, `todayUtcDateString()`
- Use `camelCase` for variables: `activeKeysResult`, `thirtyDaysAgo`, `usagePct`
- Use `UPPER_SNAKE_CASE` for constants: `PLAN_LIMIT`, `API_KEY_PREFIX`, `MOBILE_BREAKPOINT`, `SCRYPT_KEYLEN`
- Use numeric separators for large numbers: `16_384`, `100_000`
- Use `PascalCase` for interfaces and type aliases: `DashboardStats`, `ApiKeyListItem`, `ValidatedApiKey`, `RouterAppContext`
- Use `interface` for object shapes with methods or complex structures
- Use `type` for simple object shapes and unions: `type ApiKeyListItem = { ... }`
- Export types alongside their related functions in the same file
## Code Style
- Tool: Biome via Ultracite (`ultracite fix` / `ultracite check`)
- Indent style: **tabs**
- Quote style: **double quotes**
- Self-closing elements enforced
- Sorted Tailwind classes enforced (via `useSortedClasses` rule for `clsx`, `cva`, `cn`)
- Config: `/biome.json` (extends `ultracite/biome/core` and `ultracite/biome/react`)
- Tool: Biome (recommended rules enabled)
- Key rules enforced:
- Import organization: automatic via Biome `organizeImports`
- Auto-fix available: `pnpm dlx ultracite fix`
## Import Organization
- `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- `@locnative/ui/*` maps to `../../packages/ui/src/*`
- Use `@/` for all intra-app imports: `import { getDb } from "@/lib/db"`
- Use workspace package imports for shared code: `import { Button } from "@locnative/ui/components/button"`
- Use named imports, not default imports (except for React component default exports from shadcn blocks)
- Use `type` keyword for type-only imports: `import type { Database } from "@locnative/database"`
- Include `.ts` extension in relative imports within server-side lib files: `import { getDb } from "./db.ts"`
## Error Handling
- Return `null` for validation failures in utility functions (e.g., `parseApiKeyFromRequest` returns `string | null`)
- Throw `Error` objects with descriptive messages for authorization failures: `throw new Error("Unauthorized")`
- Use early returns for guard clauses - check auth first, then validate input, then execute
- Return typed error responses for API endpoints using `Response.json()`:
- Fire-and-forget for non-critical operations with `void` + `.catch()`:
- Use `try-catch` blocks with empty `catch` for expected failures (e.g., crypto operations in `api-key-auth.ts`)
- Silently handle dashboard fetch failures and show empty state instead
## Logging
- No `console.log` statements in production code (enforced by Ultracite/Biome)
- Silent error handling with empty catch blocks for non-critical operations
- Comments explain why errors are silenced: `// Usage accounting must not fail the client response`
## Comments
- Use JSDoc-style comments for regex patterns and constants that need context:
- Use inline comments to explain non-obvious business decisions:
- Comment silenced errors to explain why they are safe to ignore
- Use single-line JSDoc (`/** ... */`) for brief descriptions on constants and exported functions
- Do not over-document - prefer self-documenting code with descriptive names
- No JSDoc on React components or obvious utility functions
## Function Design
- Use destructured objects for functions with multiple parameters
- Use typed object parameters with interfaces for server function inputs
- Validate inputs with Zod schemas for server mutations:
- Use explicit return types on server functions: `Promise<DashboardStats>`
- Use `Response.json()` for API route responses
- Return typed result objects from mutations: `Promise<CreateApiKeyResult>`
## Module Design
- Named exports preferred over default exports
- Co-locate types with their related functions in the same file
- Export constants that are part of the public API: `export { API_KEY_PREFIX }`
- Not used in the web app `src/` directory
- UI components from `@locnative/ui` are imported individually by path
## Component Patterns
- Use TanStack Router `createFileRoute()` to define the `Route` export
- Define a private `RouteComponent` function for the route's component
- Extract sub-components (skeletons, empty states, content views) as sibling functions in the same file
- Pattern:
- Use `createServerFn({ method: "GET" | "POST" })` from `@tanstack/react-start`
- Chain `.inputValidator()` for mutations, omit for queries
- Chain `.handler()` with async function containing auth + logic
- Defined in `src/lib/*-server.ts` files, imported by route components
- Use CVA (class-variance-authority) for variant-based styling: `src/components/ui/button.tsx`
- Use `cn()` utility (clsx + tailwind-merge) for conditional class composition
- Use `data-slot` attributes for parent-based CSS targeting
- Wrap Base UI primitives with styled variants
- Props: spread remaining props with `...props` pattern
- Local state with `useState` + `useEffect` for data fetching in dashboard components
- `useCallback` for memoized fetch functions passed to `useEffect`
- Convex + React Query for real-time data via `ConvexQueryClient`
- Better Auth hooks for auth state: `useSession()`, `signIn()`, `signOut()`
## Tailwind CSS Patterns
- Use Tailwind v4 with `@tailwindcss/vite` plugin
- Dark mode: hardcoded `className="dark"` on `<html>` element
- Use design tokens: `text-muted-foreground`, `bg-background`, `border-border`
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints
- Use `cn()` for merging classes, never raw string concatenation
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Monorepo managed by Turborepo with pnpm workspaces
- TanStack Router file-based routing with SSR via TanStack Start + Vite
- Dual data layer: Convex (real-time, via React Query bridge) + Neon Postgres (geocoding data, API keys, usage tracking)
- Better Auth authentication bridged to Convex
- API routes served from the same TanStack Start app (no separate API server)
- Server functions (`createServerFn`) for authenticated dashboard data fetching
## Monorepo Packages
- Marketing landing page, auth pages, protected dashboard, REST API
- Entry: `src/start.ts` (server middleware), `src/router.tsx` (client router)
- Exports: `@locnative/database`, `@locnative/database/schema`, `@locnative/database/queries`
- Contains: address schema with PostGIS geometry, API key schema, usage tracking schema
- Exports: `@locnative/backend`
- Contains: Convex schema, auth config, health check
- Exports: `@locnative/env/web` (client-safe VITE_ vars), `@locnative/env/server`
- Exports: `@locnative/ui/components/*`, `@locnative/ui/lib/utils`
- Exports: `@locnative/config`
## Layers
- Purpose: File-based routing with layout nesting and route guards
- Location: `src/routes/`
- Contains: Page components, layout routes, API route handlers
- Depends on: Components, lib (server functions), UI package
- Used by: Router in `src/router.tsx`
- Purpose: Server-side data fetching called from client components via RPC
- Location: `src/lib/*-server.ts`
- Contains: `createServerFn` wrappers that authenticate via Better Auth and query Neon DB
- Depends on: `@/lib/auth-server`, `@locnative/database`
- Used by: Protected route components (dashboard, api-keys)
- Key files:
- Purpose: Public geocoding API authenticated via API keys (not session auth)
- Location: `src/routes/api/v1/`
- Contains: TanStack Router server handlers using `Route.server.handlers.GET`
- Depends on: `src/lib/with-api-key.ts`, `src/lib/api-key-auth.ts`, `@locnative/database`
- Used by: External API consumers
- Purpose: User authentication (Better Auth) and API key authentication (custom)
- Location: `src/start.ts` (middleware), `src/routes/__root.tsx` (providers), `src/lib/api-key-auth.ts`
- Contains: Better Auth integration, Convex auth bridge, API key validation with scrypt hashing
- Key detail: API routes (`/api/v1/*`) bypass session auth and use API-key auth instead
- Purpose: Schema definitions, query functions, DB client factory
- Location: `packages/database/src/`
- Contains: Drizzle schema, typed query functions, Neon HTTP client
- Key files:
- Purpose: React UI components for the dashboard shell and marketing pages
- Location: `src/components/`
- Contains: App shell (sidebar + header), navigation, marketing blocks
- Depends on: `@locnative/ui`, TanStack Router, Better Auth client hooks
- Key files:
## Data Flow
- No global state store. Component-local `useState` + `useEffect` for dashboard/API key data
- Convex React Query bridge available but not heavily used yet (schema is empty)
- TanStack Router context carries `queryClient`, `convexQueryClient`, `userId`, `token`
## Key Abstractions
- Purpose: Reusable wrapper for API key-authenticated GET endpoints
- Location: `src/lib/with-api-key.ts`
- Pattern: Higher-order function that validates API key, injects `db` into handler context, records usage on success
- Usage: All `/api/v1/addresses/*` routes wrap their handler with this
- Purpose: Type-safe server functions callable from client code
- Location: Used in `src/lib/dashboard-server.ts`, `src/lib/api-keys-server.ts`, `src/routes/__root.tsx`
- Pattern: Define server function with method + optional input validator + handler. Called like regular async functions from components.
- Purpose: Lazy-initialized Neon database connection
- Location: `src/lib/db.ts`
- Pattern: Module-level singleton that creates Drizzle client on first access using `DATABASE_URL`
- Purpose: Shared layouts via pathless route segments
- Pattern: `_protected.tsx` is a layout route that wraps all `_protected/*.tsx` children with `AppShell` and auth guard
- The `_auth` and `_public` directories exist but are currently empty/unused
## Entry Points
- Location: `src/start.ts`
- Triggers: Vite dev server / production build
- Responsibilities: Creates TanStack Start instance and initializes the server runtime
- Location: `src/router.tsx`
- Triggers: Called during SSR and client hydration
- Responsibilities: Creates TanStack Router with Convex Query Client, React Query client, SSR query integration, route tree from codegen
- Location: `src/routes/__root.tsx`
- Triggers: Every navigation
- Responsibilities: SSR auth fetch, HTML document shell, Better Auth + Convex providers, Toaster, devtools
- Location: `src/routeTree.gen.ts`
- Generated: Yes, by `@tanstack/router-plugin` Vite plugin
- Contains: Auto-generated route tree from file-based routes
## Error Handling
- API routes return `Response.json({ error: "..." }, { status: 4xx })` for validation/auth errors
- Server functions throw `Error` for auth failures, return empty defaults for missing auth
- Dashboard silently catches fetch errors and shows empty state
- API key validation returns `null` for any invalid state (timing-safe comparison)
- Usage recording errors are caught and swallowed to avoid failing client responses
## Cross-Cutting Concerns
- API route params: Manual validation with early-return error responses
- Server function inputs: Zod schemas via `inputValidator` (see `src/lib/api-keys-server.ts`)
- Environment variables: T3 Env with Zod schemas (`packages/env/src/web.ts`)
- Dashboard routes: Better Auth via `beforeLoad` guard in `_protected.tsx`
- API routes: Custom API key auth via `withApiKeyGET` wrapper (scrypt hash verification)
- Session auth applies to protected routes while API routes use API keys
- Turborepo orchestrates `dev` and `build` across packages
- Vite 7 with TanStack Start plugin, React plugin, Tailwind CSS v4 plugin, tsconfig-paths plugin
- Config: `vite.config.ts`, dev server on port 3001
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
