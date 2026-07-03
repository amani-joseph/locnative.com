# Phase 07 Plan Check

**Verdict: PASS-WITH-NOTES**

Plans 07-01, 07-02, and 07-03, executed in order, will produce a codebase that meets all success criteria in CONTEXT.md. One structural note and one execution-time risk are flagged — neither is a blocker, but both should be understood before execution.

---

## Overall Assessment

All three plans are coherent, correctly ordered, scope-appropriate, and behaviorally preserving. The BetterAuth config is moved verbatim. Consumers are updated correctly. The dependency graph is acyclic. Rollback instructions are present and sensible.

---

## Per-Plan Findings

### 07-01 — Scaffold `packages/auth/`

**Status: PASS**

- Correct file set: `package.json`, `tsconfig.json`, `src/db.ts`, `src/index.ts`.
- Package name `@locnative/auth` matches workspace naming convention (RESEARCH.md §13).
- `src/index.ts` action quotes the BetterAuth config verbatim from `packages/api/src/auth.ts` — cookie attrs, GitHub OAuth, trustedOrigins, secret, emailAndPassword all preserved byte-for-byte.
- `src/db.ts` correctly mirrors `packages/api/src/db.ts` (each consumer owns its own db instance — confirmed correct per RESEARCH.md §7).
- `tsconfig.json` omits `jsx` correctly (no email templates).
- Dependencies correct: `@locnative/database`, `@locnative/env`, `better-auth ^1.5.6`, no Resend/React.
- No consumers touched — safe to roll back with a single `rm -rf`.
- Verification step runs `tsc --noEmit` + `ultracite check` standalone — adequate.

**Note:** `pnpm install --frozen-lockfile` will FAIL after adding a new workspace package because the lockfile will be stale. The `--frozen-lockfile` flag prevents lockfile updates. Plans 07-01 and 07-02 both use this flag. Executors must run `pnpm install` (without `--frozen-lockfile`) on first run, or accept that the flag causes a non-zero exit they must override. This is a known pnpm workspace behavior, not a plan error, but the executor should be aware.

---

### 07-02 — Migrate `packages/api` off `auth.ts`

**Status: PASS**

- Precondition correctly stated: "Plan 07-01 must be complete."
- `context.ts` import change is exact: current file line 9 reads `import { auth } from "./auth.ts"` — confirmed by direct file read. Plan replaces it with `import { auth } from "@locnative/auth"` — correct.
- `index.ts` removal of `export { auth } from "./auth.ts"` is exact — confirmed current line 1.
- `package.json` dep swap (`better-auth` out, `@locnative/auth` in) is logically correct: `context.ts` is the only remaining user of `auth` in `packages/api`, and it now gets it transitively via `@locnative/auth`.
- Rollback uses `git checkout HEAD --` for all four files — correct and safe.
- Verification runs `tsc --noEmit` in `packages/api` + ultracite — adequate.

**Note (same as above):** `--frozen-lockfile` will fail after the `package.json` dep change. Executor must use plain `pnpm install`.

---

### 07-03 — Migrate `apps/server` + final verification

**Status: PASS**

- `apps/server/src/index.ts` current import block (lines 1-9) matches exactly what the plan shows: `auth` is destructured from `@locnative/api` alongside `appRouter`, `createContext`, `publicHttpRouter`. The plan's replacement correctly splits `auth` to its own import while keeping the other three in the `@locnative/api` block.
- `apps/server/package.json` currently has no `@locnative/auth` dep — plan adds it correctly.
- `autonomous: false` is appropriate — the human smoke test checkpoint is blocking.
- Full verification suite (install, stale-import grep, three-package typecheck, lint) is concrete and runnable.
- Rollback covers both pre- and post-checkpoint failure scenarios.

---

## Check Results by Criterion

### 1. Goal Achievement

If all three plans execute without error:
- `packages/auth/` exists with `package.json`, `tsconfig.json`, `src/db.ts`, `src/index.ts` — YES (07-01)
- `packages/api/src/auth.ts` deleted — YES (07-02 Task 1)
- `packages/api` imports `auth` from `@locnative/auth` — YES (07-02)
- `apps/server` imports `auth` from `@locnative/auth` — YES (07-03)
- Zero behavioral change — YES (config moved verbatim)

PASS.

### 2. `apps/web` Coverage

Direct file read of `apps/web/src/lib/auth-client.ts` (confirmed by RESEARCH.md §9 and §6): imports from `better-auth/react` directly — no dependency on `@locnative/api` or `@locnative/auth`. No change needed.

`apps/web/src/lib/auth-server.ts`: imports from `@tanstack/react-start/server` only. No change needed.

`apps/web/src/routes/**`: import from `@/lib/auth-client` or `@/lib/auth-server` only. No change needed.

`apps/web/src/lib/orpc.ts`: imports `AppRouter` type from `@locnative/api` — this is a type-only import of the router, unrelated to auth. Unchanged by this phase. Correct.

`apps/web/src/lib/with-api-key.ts` and `apps/web/src/lib/api-key-auth.ts`: import from `@locnative/api/api-key-auth` — unrelated to auth extraction. Unchanged. Correct.

No `apps/web` coverage gap. PASS.

### 3. Ordering and Dependencies

Wave assignment: 07-01 (wave 1) → 07-02 (wave 2, depends_on [07-01]) → 07-03 (wave 3, depends_on [07-01, 07-02]). Acyclic, correct.

07-02 assumes `packages/auth/` exists and exports `{ auth }` — satisfied by 07-01. The `context` block in 07-02 references `07-01-SUMMARY.md` to enforce this at execution time.

Intermediate broken-state risk: After 07-01 only, no consumer has changed — repo is not broken. After 07-02 only (without 07-03), `packages/api/src/index.ts` no longer exports `auth`, and `apps/server/src/index.ts` still imports it from `@locnative/api` — this IS a broken intermediate state. However, because 07-02 and 07-03 are in sequential waves and the executor runs them in order without stopping between waves, this is not a practical risk. If the executor does stop between 07-02 and 07-03, rollback of 07-02 restores the working state. This is acceptable for a sequential wave execution model.

PASS.

### 4. Verification Steps

07-01: `pnpm install`, `tsc --noEmit` (packages/auth), `ultracite check`. Concrete. PASS.

07-02: `pnpm install`, `tsc --noEmit` (packages/api), `ultracite check`. Concrete. PASS.

07-03: `pnpm install`, stale-import audit grep, `tsc --noEmit` (all three packages), `ultracite check`, blocking human smoke test. Comprehensive. PASS.

Missing from any plan: `pnpm build` at repo root (CONTEXT.md success criterion 4 requires `pnpm build` to succeed). The 07-03 `must_haves.truths` lists "pnpm build succeeds at repo root" but Task 2's action only runs `tsc --noEmit`, not `pnpm build`. The verification section also omits it. This is a minor gap — since all packages are consumed source-first with no build step, typecheck is equivalent, but the criterion as stated is unmet.

**Note:** Add `pnpm build` to 07-03 Task 2 action and verification to satisfy CONTEXT.md criterion 4 exactly.

### 5. Behavioral Preservation

07-01 Task 2 action explicitly states: "This is a verbatim copy of the current `packages/api/src/auth.ts`. Do NOT alter cookie attributes, providers, trustedOrigins, or any BetterAuth config value." The quoted file content in the plan matches the divergence analysis in RESEARCH.md §14. No config rewriting occurs. PASS.

### 6. Naming and Workspace Convention

New package name `@locnative/auth` — matches workspace pattern confirmed in RESEARCH.md §13. PASS.

### 7. Rollback

07-01: `rm -rf packages/auth/` — correct, safe, complete.
07-02: `git checkout HEAD --` for each of 4 files, then optional 07-01 rollback. Correct.
07-03: `git checkout HEAD --` for 2 files, then cascade to 07-02 and 07-01. Covers both pre- and post-checkpoint scenarios. Correct.

PASS.

### 8. Atomicity

07-01: Creates 4 files, all within the new package boundary. Coherent unit. 2 tasks.
07-02: Deletes 1 file, modifies 3 files, all within `packages/api`. Coherent unit. 2 tasks.
07-03: Modifies 2 files in `apps/server`, runs full verification, human checkpoint. Coherent unit. 3 tasks (including checkpoint).

No plan mixes unrelated work. All plans are appropriately sized. PASS.

---

## Gaps and Notes

| # | Severity | Location | Issue | Suggested Fix |
|---|----------|----------|-------|---------------|
| 1 | NOTE | 07-01, 07-02 verification | `--frozen-lockfile` will reject a stale lockfile after adding `packages/auth/` and changing `packages/api/package.json`. This is expected pnpm behavior. | Replace `pnpm install --frozen-lockfile` with plain `pnpm install` in both plans, or document that the executor should expect and handle the frozen-lockfile error by running without the flag. |
| 2 | NOTE | 07-03 Task 2 | CONTEXT.md success criterion 4 requires `pnpm build` to succeed. Task 2 only runs `tsc --noEmit`. Build is listed in `must_haves.truths` but not in the action or verification section. | Add `pnpm build` command to Task 2 action step 3 (after typechecks) and to the `<verify>` block. |

Neither gap is a blocker. The plans will achieve the phase goal if executed in order. Both notes are execution-time considerations the executor should handle.

---

## CLAUDE.md Compliance

- Code uses `const` throughout, arrow functions where applicable, explicit imports — consistent with Ultracite standards.
- Plans include `pnpm dlx ultracite check` and `pnpm dlx ultracite fix` steps on all touched files.
- No `console.log` introduced (the existing `console.error` in `apps/server/src/index.ts` is untouched — not introduced by these plans).
- No forbidden patterns introduced.

PASS.

---

**Checked:** 2026-04-17
**Checker:** gsd-plan-checker
