# Phase 07: Extract Auth Into Its Own Package

## Goal

Extract BetterAuth server configuration and auth client setup from the current locations (`packages/api/src/auth.ts` and scattered points in `apps/web`) into a dedicated `packages/auth/` package that mirrors the structure used in `/Users/mac/Developer/projects/mydeffo.com-web` **1:1**.

Success = full parity with mydeffo's `packages/auth/` shape, no behavioral changes, all consumers (`apps/web`, `apps/server`, `packages/api`) importing from the new package.

## Why

- Reduces cross-package coupling (`packages/api` currently owns auth, which is unrelated to RPC).
- Enables auth to be consumed by future packages (e.g. a native app, additional workers) without dragging in oRPC.
- Aligns the monorepo with the proven working reference (mydeffo), which the team already treats as architectural inspiration for this project.

## Non-Goals

- **No behavioral changes.** This is a pure refactor. Cookie attributes, OAuth providers, session durations, DB schema stay identical.
- **No DB schema changes.** The BetterAuth tables stay in `packages/database` (unless mydeffo mirrors schema in auth package — researcher to confirm). No migrations.
- **No deploy-config changes.** Wrangler files, env vars, custom domains unchanged.
- **No GitHub OAuth app changes.**

## Constraints

- Stack stays on TanStack Start + Convex + Drizzle/Neon as per project CLAUDE.md.
- Must pass `pnpm dlx ultracite fix` / `check`.
- Existing sign-in flow must still work (pre/post refactor parity verified in dev).
- pnpm workspace + any turbo pipeline must be updated so builds succeed.

## Reference

- Upstream pattern: `/Users/mac/Developer/projects/mydeffo.com-web/packages/auth/`
- Current locnative implementation: `packages/api/src/auth.ts`

## Success Criteria

1. `packages/auth/` exists with structure matching mydeffo 1:1 (same file names, same export shape, same dependency set scoped to auth).
2. `packages/api/src/auth.ts` no longer contains the BetterAuth config (file removed or reduced to a thin re-export if mydeffo does that).
3. `apps/web` and `apps/server` import auth from `@locnative/auth` (or whatever namespace the workspace uses) — no direct imports from `packages/api`.
4. `pnpm install` succeeds; `pnpm build` succeeds at repo root; `pnpm dlx ultracite check` clean on all touched files.
5. Dev sign-in flow (GitHub OAuth) still completes end-to-end locally — no regression.
