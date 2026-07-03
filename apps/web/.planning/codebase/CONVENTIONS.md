# Coding Conventions

**Analysis Date:** 2026-04-12

## Naming Patterns

**Files:**
- Components: `kebab-case.tsx` (e.g., `src/components/app-sidebar.tsx`, `src/components/nav-user.tsx`)
- Utilities/lib: `kebab-case.ts` (e.g., `src/lib/api-key-auth.ts`, `src/lib/dashboard-server.ts`)
- Hooks: `use-kebab-case.ts` (e.g., `src/hooks/use-mobile.ts`)
- Routes: `kebab-case.tsx` for page routes (e.g., `src/routes/_protected/api-keys.tsx`)
- API routes: nested directory structure matching URL path (e.g., `src/routes/api/v1/addresses/autocomplete.ts`)
- UI primitives: `kebab-case.tsx` in `src/components/ui/` (e.g., `src/components/ui/button.tsx`)

**Functions:**
- Use `camelCase` for all functions: `getDb()`, `validateApiKey()`, `navItemMatchesPath()`
- React components use `PascalCase`: `AppSidebar`, `NavUser`, `RouteComponent`
- Server functions use `camelCase` with descriptive verbs: `getDashboardStats`, `listApiKeys`, `createApiKey`, `revokeApiKey`
- Private/internal helpers use `camelCase`: `formatDisplayLabel()`, `todayUtcDateString()`

**Variables:**
- Use `camelCase` for variables: `activeKeysResult`, `thirtyDaysAgo`, `usagePct`
- Use `UPPER_SNAKE_CASE` for constants: `PLAN_LIMIT`, `API_KEY_PREFIX`, `MOBILE_BREAKPOINT`, `SCRYPT_KEYLEN`
- Use numeric separators for large numbers: `16_384`, `100_000`

**Types:**
- Use `PascalCase` for interfaces and type aliases: `DashboardStats`, `ApiKeyListItem`, `ValidatedApiKey`, `RouterAppContext`
- Use `interface` for object shapes with methods or complex structures
- Use `type` for simple object shapes and unions: `type ApiKeyListItem = { ... }`
- Export types alongside their related functions in the same file

## Code Style

**Formatting:**
- Tool: Biome via Ultracite (`ultracite fix` / `ultracite check`)
- Indent style: **tabs**
- Quote style: **double quotes**
- Self-closing elements enforced
- Sorted Tailwind classes enforced (via `useSortedClasses` rule for `clsx`, `cva`, `cn`)
- Config: `/biome.json` (extends `ultracite/biome/core` and `ultracite/biome/react`)

**Linting:**
- Tool: Biome (recommended rules enabled)
- Key rules enforced:
  - `noParameterAssign: error` - never reassign function parameters
  - `useAsConstAssertion: error` - use `as const` for immutable literals
  - `useDefaultParameterLast: error` - default params go last
  - `useSelfClosingElements: error` - self-close empty JSX elements
  - `noInferrableTypes: error` - do not annotate types that can be inferred
  - `noUselessElse: error` - use early returns instead
  - `useExhaustiveDependencies: info` - hook deps should be complete
- Import organization: automatic via Biome `organizeImports`
- Auto-fix available: `pnpm dlx ultracite fix`

## Import Organization

**Order** (automatically enforced by Biome):
1. Node built-ins (`node:crypto`)
2. External packages (`better-auth`, `@tanstack/...`, `drizzle-orm`, `lucide-react`, `react`, `zod`)
3. Workspace packages (`@locnative/ui/...`, `@locnative/database/...`, `@locnative/env/...`)
4. Local aliases (`@/components/...`, `@/lib/...`)
5. Relative imports (`../index.css?url`)

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- `@locnative/ui/*` maps to `../../packages/ui/src/*`
- Use `@/` for all intra-app imports: `import { getDb } from "@/lib/db"`
- Use workspace package imports for shared code: `import { Button } from "@locnative/ui/components/button"`

**Import style:**
- Use named imports, not default imports (except for React component default exports from shadcn blocks)
- Use `type` keyword for type-only imports: `import type { Database } from "@locnative/database"`
- Include `.ts` extension in relative imports within server-side lib files: `import { getDb } from "./db.ts"`

## Error Handling

**Patterns:**
- Return `null` for validation failures in utility functions (e.g., `parseApiKeyFromRequest` returns `string | null`)
- Throw `Error` objects with descriptive messages for authorization failures: `throw new Error("Unauthorized")`
- Use early returns for guard clauses - check auth first, then validate input, then execute
- Return typed error responses for API endpoints using `Response.json()`:
  ```typescript
  return Response.json(
    { error: "unauthorized", message: "API key required." },
    { status: 401 }
  );
  ```
- Fire-and-forget for non-critical operations with `void` + `.catch()`:
  ```typescript
  void recordUsage(db, { ... }).catch(() => {
    // Usage accounting must not fail the client response
  });
  ```
- Use `try-catch` blocks with empty `catch` for expected failures (e.g., crypto operations in `api-key-auth.ts`)
- Silently handle dashboard fetch failures and show empty state instead

**Server function auth pattern** (used consistently in `src/lib/*-server.ts`):
```typescript
const session = await getSession();
const userId = session?.user.id;
if (!userId) {
  // Return empty data for GET, throw for POST
  return [];        // GET: return empty
  throw new Error("Unauthorized");  // POST: throw
}
```

## Logging

**Framework:** No logging framework configured

**Patterns:**
- No `console.log` statements in production code (enforced by Ultracite/Biome)
- Silent error handling with empty catch blocks for non-critical operations
- Comments explain why errors are silenced: `// Usage accounting must not fail the client response`

## Comments

**When to Comment:**
- Use JSDoc-style comments for regex patterns and constants that need context:
  ```typescript
  /** UUID v4 pattern (case-insensitive) */
  const API_KEY_TOKEN_RE = /^wh_([0-9a-f]{8}-...$/i;
  ```
- Use inline comments to explain non-obvious business decisions:
  ```typescript
  // Better Auth may return a missing-session response when auth state is absent
  ```
- Comment silenced errors to explain why they are safe to ignore

**JSDoc/TSDoc:**
- Use single-line JSDoc (`/** ... */`) for brief descriptions on constants and exported functions
- Do not over-document - prefer self-documenting code with descriptive names
- No JSDoc on React components or obvious utility functions

## Function Design

**Size:** Functions are kept focused and small. Route components rarely exceed 50 lines. Server functions are single-purpose.

**Parameters:**
- Use destructured objects for functions with multiple parameters
- Use typed object parameters with interfaces for server function inputs
- Validate inputs with Zod schemas for server mutations:
  ```typescript
  const createApiKeyInputSchema = z.object({
    name: z.string().min(1).max(128),
  });
  ```

**Return Values:**
- Use explicit return types on server functions: `Promise<DashboardStats>`
- Use `Response.json()` for API route responses
- Return typed result objects from mutations: `Promise<CreateApiKeyResult>`

## Module Design

**Exports:**
- Named exports preferred over default exports
- Co-locate types with their related functions in the same file
- Export constants that are part of the public API: `export { API_KEY_PREFIX }`

**Barrel Files:**
- Not used in the web app `src/` directory
- UI components from `@locnative/ui` are imported individually by path

## Component Patterns

**Route Components:**
- Use TanStack Router `createFileRoute()` to define the `Route` export
- Define a private `RouteComponent` function for the route's component
- Extract sub-components (skeletons, empty states, content views) as sibling functions in the same file
- Pattern:
  ```typescript
  export const Route = createFileRoute("/_protected/dashboard")({
    component: RouteComponent,
  });

  function RouteComponent() { ... }
  ```

**Server Functions (TanStack Start):**
- Use `createServerFn({ method: "GET" | "POST" })` from `@tanstack/react-start`
- Chain `.inputValidator()` for mutations, omit for queries
- Chain `.handler()` with async function containing auth + logic
- Defined in `src/lib/*-server.ts` files, imported by route components

**UI Components:**
- Use CVA (class-variance-authority) for variant-based styling: `src/components/ui/button.tsx`
- Use `cn()` utility (clsx + tailwind-merge) for conditional class composition
- Use `data-slot` attributes for parent-based CSS targeting
- Wrap Base UI primitives with styled variants
- Props: spread remaining props with `...props` pattern

**State Management:**
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

---

*Convention analysis: 2026-04-12*
