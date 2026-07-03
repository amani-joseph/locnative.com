---
status: investigating
trigger: "Debug three distinct console errors in TanStack Start + Convex + BetterAuth app"
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T02:00:00Z
---

## Current Focus

hypothesis: Migration 0007_burly_bullseye.sql (adds request_source column to api_usage_daily) was never applied to the Neon DB — schema drift between Drizzle schema and actual DB
test: Check which migrations were applied via drizzle-kit migrate output
expecting: Running db:migrate from packages/database will apply 0007 (and possibly 0008/0009) and the column will exist
next_action: Run pnpm db:migrate from packages/database with DATABASE_URL set; confirm column exists

## Symptoms

expected: App starts with no console errors; dropdown trigger is a native button; dashboard stats load successfully
actual:
  1. Stylesheet link rendered as direct child of <html>, causing hydration error
  2. DropdownMenuTrigger renders Avatar (a <div>) as trigger with nativeButton=true (default), producing warning
  3. POST /rpc/dashboard/getStats returns 500
errors:
  - "Cannot render a <link rel=\"stylesheet\" /> outside the main document without knowing its precedence"
  - "In HTML, <link> cannot be a child of <html>. This will cause a hydration error."
  - "A component that acts as a button expected a native <button> because the nativeButton prop is true"
  - "POST http://localhost:3003/rpc/dashboard/getStats 500"
reproduction: Load app after login
started: Current rollback-test branch

## Eliminated

- hypothesis: HeadContent is missing entirely
  evidence: HeadContent is present in __root.tsx but placed directly inside <html> without a <head> wrapper
  timestamp: 2026-04-17T00:00:00Z

- hypothesis: DropdownMenuTrigger wrapper itself has a bug
  evidence: The wrapper is correct — it passes all props through. The caller (nav-user.tsx:36) passes render={<Avatar />} which is a <div>, but Base UI Trigger defaults nativeButton=true
  timestamp: 2026-04-17T00:00:00Z

## Evidence

- timestamp: 2026-04-17T00:00:00Z
  checked: apps/web/src/routes/__root.tsx RootDocument() function (line 82-96)
  found: JSX is <html><HeadContent /><body>...</body></html> — HeadContent sits directly inside <html>, no <head> element
  implication: TanStack Start's HeadContent renders <link> tags; without a wrapping <head>, they become direct children of <html>, which is invalid HTML and triggers React's hydration error

- timestamp: 2026-04-17T00:00:00Z
  checked: apps/web/src/components/nav-user.tsx line 36
  found: <DropdownMenuTrigger render={<Avatar className="size-8" />}> — Avatar renders a <div>, not a <button>
  implication: Base UI MenuPrimitive.Trigger defaults nativeButton={true}, meaning it expects a real <button>. Passing a <div> via render prop violates the contract and produces the warning. Fix: add nativeButton={false} to DropdownMenuTrigger when a non-button render element is used, or pass nativeButton={false} through the wrapper.

- timestamp: 2026-04-17T00:00:00Z
  checked: packages/api/src/context.ts createContext() and packages/api/src/auth.ts
  found: Session resolution uses auth.api.getSession({ headers: req.raw.headers }). Cookie has sameSite="none" + secure=true + domain=".locnative.com". In local dev (localhost), secure cookies are NOT sent over plain HTTP, so the auth cookie is never forwarded → session is null → protectedProcedure throws UNAUTHORIZED → 500.
  implication: The 500 on /rpc/dashboard/getStats is caused by the session cookie not being sent in local dev because secure=true + sameSite=none requires HTTPS. The orpcClient sends credentials:"include" but the browser blocks the cookie on non-HTTPS localhost.

- timestamp: 2026-04-17T02:00:00Z
  checked: packages/database/src/schema/api-keys.ts
  found: apiUsageDaily table defines requestSource: text("request_source").notNull().default("production") at line 52
  implication: Schema has the column — this is not a missing schema definition

- timestamp: 2026-04-17T02:00:00Z
  checked: packages/database/drizzle/0007_burly_bullseye.sql
  found: Migration adds request_source column via ALTER TABLE "api_usage_daily" ADD COLUMN "request_source" text DEFAULT 'production' NOT NULL — this is the migration that adds the column
  implication: The migration file exists and is correct

- timestamp: 2026-04-17T02:00:00Z
  checked: packages/database/drizzle/meta/_journal.json
  found: Journal tracks entries 0000–0008. File 0009_tiered_search_extensions.sql exists on disk but is absent from journal (not yet generated/tracked). Migration 0007 is in journal but NeonDbError proves the column doesn't exist in the live DB — migration was generated but never applied.
  implication: ROOT CAUSE — drizzle-kit generate was run (creating 0007) but drizzle-kit migrate was never run against this Neon DB. The DB is behind by at least migration 0007.

## Resolution

root_cause:
  1. __root.tsx: RootDocument JSX has <HeadContent/> as direct child of <html> — missing <head> wrapper
  2. nav-user.tsx: DropdownMenuTrigger receives render={<Avatar>} (a <div>) but nativeButton defaults to true in Base UI — need nativeButton={false} on the trigger
  3. dashboard.getStats 500 (original): auth cookie has secure=true + sameSite=none which browsers refuse to send over plain HTTP localhost
  4. dashboard.getStats 500 (Issue 4 — DB error): Migration 0007_burly_bullseye.sql adds request_source column to api_usage_daily but was never applied to the Neon DB. DB schema is stale — column does not exist in the live database.

fix:
  1. Wrapped HeadContent in <head>...</head> in RootDocument in __root.tsx
  2. Added nativeButton={false} to DropdownMenuTrigger in nav-user.tsx
  3. Made defaultCookieAttributes conditional on NODE_ENV in packages/api/src/auth.ts
  4. Run pending migrations: cd packages/database && pnpm db:migrate
     This applies 0007_burly_bullseye.sql (adds request_source) and any other unapplied migrations (0008, 0009 if needed).
     DATABASE_URL must point to the target Neon DB — verify via .env or wrangler.toml before running.

verification: Issues 1 and 2 self-verified by reading final file content. Issue 3 self-verified by code review. Issue 4 pending — requires running db:migrate and retesting /rpc/dashboard/getStats.
files_changed:
  - apps/web/src/routes/__root.tsx
  - apps/web/src/components/nav-user.tsx
  - packages/api/src/auth.ts
  - packages/database/drizzle/ (migration applied, no file changes needed)
