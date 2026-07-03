---
phase: 07-extract-auth-into-its-own-package
plan: "03"
subsystem: server
tags: [auth, import-migration, wave-3]
dependency_graph:
  requires: [07-01, 07-02]
  provides: [complete-auth-extraction]
  affects: [apps/server]
tech_stack:
  added: []
  patterns: [workspace-dependency, split-import]
key_files:
  modified:
    - apps/server/src/index.ts
    - apps/server/package.json
decisions:
  - "Split @locnative/api import: auth now from @locnative/auth, api symbols unchanged"
  - "Pre-existing TS2353 in api-explorer.ts causes pnpm build exit 2 — out of scope for this phase"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  files_modified: 2
---

# Phase 07 Plan 03: Server Import Migration Summary

**One-liner:** Split `apps/server` auth import from `@locnative/api` to `@locnative/auth`, completing the full phase-07 consumer migration.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Update apps/server/src/index.ts and apps/server/package.json | Done |
| 2 | Full repo verification — install, typecheck, lint | Done (with pre-existing caveat) |

## Verification Results

### Import Audit
- **Result: CLEAN.** No file in `apps/` or `packages/` imports `auth` from `@locnative/api`.
- `apps/server/src/index.ts` confirmed: `auth` imported from `@locnative/auth`; `appRouter`, `createContext`, `publicHttpRouter` still from `@locnative/api`.

### Typecheck Results

| Package | Command Exit | Errors | New Errors |
|---------|-------------|--------|------------|
| `packages/auth` | 0 (OK) | 0 | 0 |
| `packages/api` | 0 (OK) | 1 (pre-existing TS2353 in api-explorer.ts) | 0 |
| `apps/server` | 2 (non-zero) | 1 (same pre-existing TS2353 via transitive compile) | 0 |

The `apps/server` tsc exits non-zero solely because its tsconfig transitively compiles `packages/api` source files, picking up the pre-existing `TS2353 'cache' does not exist in type 'RequestInit'` error in `packages/api/src/routers/domains/api-explorer.ts`. This error was last committed at `87f65f4` (before phase 07). Zero new errors were introduced by this plan.

### Ultracite Check
- **Touched files result:** 1 pre-existing error — `lint/performance/noBarrelFile` on `packages/api/src/index.ts`.
- This warning was documented in the wave-2 report as pre-existing and out of scope.
- `apps/server/src/index.ts` itself: clean (no fixes needed, no lint errors).

### pnpm build
- **Result: FAILED (exit 2)** — caused entirely by the pre-existing `TS2353` in `api-explorer.ts` surfacing through `@locnative/server#build` (`tsc --noEmit`).
- No build failures introduced by wave-3 changes.
- The `apps/web` build task did not reach completion due to the server task failing first.
- This is a pre-existing blocker that must be fixed separately (deferred item).

### Dev Smoke Test
- **NOT run.** The agent environment has no browser. The GitHub OAuth sign-in end-to-end test must be performed manually by the user.
- **User must verify:** Start `pnpm dev` at repo root, navigate to `http://localhost:3001/sign-in`, click "Sign in with GitHub", complete OAuth flow, confirm session persists on refresh.

## Deviations from Plan

### Pre-existing Issues (documented, not fixed — out of scope)

**1. [Pre-existing] TS2353 in packages/api/src/routers/domains/api-explorer.ts**
- Causes `apps/server` tsc to exit 2 and `pnpm build` to fail.
- Last modified at commit `87f65f4` — predates phase 07.
- Not introduced by wave 3. Deferred to a separate fix.

**2. [Pre-existing] noBarrelFile lint warning on packages/api/src/index.ts**
- Documented in wave-2 report. Not introduced by this plan.

## Known Stubs

None — this plan is a pure import migration with no new logic.

## Deferred Items

- `packages/api/src/routers/domains/api-explorer.ts` line 204: `TS2353 'cache' does not exist in type 'RequestInit'` — must be fixed to restore `pnpm build` to exit 0. Likely needs `// @ts-ignore` suppression or a type cast for the Cloudflare Workers `cache` extension on `RequestInit`.

## Self-Check: PASSED

- `apps/server/src/index.ts` exists and contains `import { auth } from "@locnative/auth"`
- `apps/server/package.json` exists and contains `"@locnative/auth": "workspace:*"`
