# Technology Stack

**Analysis Date:** 2026-04-12

## Languages

**Primary:**
- TypeScript 5.x - All application code across the monorepo

**Secondary:**
- SQL (PostGIS) - Spatial queries in API route handlers via Drizzle `sql` template literals

## Runtime

**Environment:**
- Node.js (ES2022 target, ESNext modules)
- Vite 7.x dev server on port 3001

**Package Manager:**
- pnpm 10.12.4
- Lockfile: `../../pnpm-lock.yaml` (workspace root)
- Catalog dependencies used for shared versions (`catalog:` protocol)

## Frameworks

**Core:**
- TanStack Start 1.141.x - Full-stack SSR framework (Vite-based, file-route convention)
- TanStack React Router 1.141.x - File-based routing with SSR support
- TanStack React Query 5.80.x - Server state management, integrated with Convex
- React 19+ (catalog version) - UI rendering
- Convex (catalog version) - Realtime backend-as-a-service (schema currently empty)

**UI:**
- Tailwind CSS 4.x - Utility-first styling via `@tailwindcss/vite` plugin
- shadcn/ui 3.6.x - Component primitives (via `@locnative/ui` package)
- Base UI React 1.x - Unstyled accessible component primitives
- Framer Motion / Motion 12.x - Animations
- Lucide React - Icon library
- Recharts 3.x - Data visualization / charts
- Embla Carousel React 8.x - Carousel component
- dnd-kit (core 6.x, sortable 10.x) - Drag and drop
- Sonner - Toast notifications

**Build/Dev:**
- Vite 7.x - Build tool and dev server
- Turborepo 2.8.x - Monorepo orchestration (`turbo dev`, `turbo build`)
- Ultracite 7.4.x / Biome 2.4.x - Linting and formatting (zero-config)

**Database/ORM:**
- Drizzle ORM 0.44.x - Type-safe SQL query builder
- Drizzle Kit 0.31.x - Schema migrations (`db:generate`, `db:migrate`, `db:push`, `db:studio`)

**Testing (dev):**
- Testing Library (DOM 10.x, React 16.x) - Component testing utilities
- jsdom 26.x - DOM environment for tests
- web-vitals 5.x - Performance metrics

## Monorepo Packages

**`@locnative/backend`** (`../../packages/backend/`):
- Convex backend with Better Auth integration
- Scripts: `convex dev`, `convex dev --configure --until-success`

**`@locnative/database`** (`../../packages/database/`):
- Drizzle ORM schema and queries
- Exports: `.` (client/types), `./schema` (table definitions), `./queries` (query functions)
- Neon serverless PostgreSQL driver

**`@locnative/env`** (`../../packages/env/`):
- Type-safe environment variables via `@t3-oss/env-core` + Zod
- Exports: `./web` (client-side VITE_ vars), `./server` (server-side vars)

**`@locnative/ui`** (`../../packages/ui/`):
- Shared UI component library (shadcn-based)
- Exports: `./components/*`, `./lib/*`, `./hooks/*`, `./globals.css`
- Uses class-variance-authority, clsx, tailwind-merge for styling

**`@locnative/config`** (`../../packages/config/`):
- Shared TypeScript config (`tsconfig.base.json`)

## Key Dependencies

**Critical:**
- `better-auth` 1.x - Authentication library
- `@neondatabase/serverless` 1.x - Neon PostgreSQL HTTP driver (serverless-compatible)
- `drizzle-orm` 0.44.x - Database query layer
- `convex` (catalog) - Realtime backend (currently empty schema, wired for future use)
- `@t3-oss/env-core` 0.13.x - Type-safe env var validation

**Infrastructure:**
- `class-variance-authority` 0.7.x - Component variant management
- `tailwind-merge` 3.x - Tailwind class deduplication
- `vite-tsconfig-paths` 5.x - Path alias resolution in Vite
- `zod` (catalog) - Schema validation throughout

## Configuration

**Environment:**
- `.env` file at `apps/web/.env` - contains runtime configuration
- Client-side vars prefixed with `VITE_` (validated in `../../packages/env/src/web.ts`):
  - `VITE_CONVEX_URL` - Convex deployment URL
  - `VITE_CONVEX_SITE_URL` - Better Auth site URL
- Server-side vars (validated in `../../packages/env/src/server.ts`):
  - `DATABASE_URL` - Neon PostgreSQL connection string
- Convex env vars:
  - `BETTER_AUTH_SECRET` - Better Auth secret

**TypeScript:**
- `tsconfig.json` at app root - strict mode, bundler module resolution, ES2022 target
- Path aliases: `@/*` maps to `./src/*`, `@locnative/ui/*` maps to UI package
- Shared base config: `../../packages/config/tsconfig.base.json`

**Build:**
- `vite.config.ts` - Plugins: tsconfigPaths, tailwindcss, tanstackStart, viteReact
- Turborepo manages cross-package builds from workspace root

## Platform Requirements

**Development:**
- Node.js (ES2022 compatible)
- pnpm 10.12.4+
- Neon PostgreSQL database with PostGIS extension
- Better Auth configuration and secret values
- Convex account and deployment

**Production:**
- TanStack Start SSR deployment (Vite-based, needs Node.js runtime)
- Neon serverless PostgreSQL (PostGIS-enabled)
- Convex cloud backend
- Better Auth authentication service

---

*Stack analysis: 2026-04-12*
