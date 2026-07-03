# Project Audit — 2026-06-12

Branch at audit time: `feat/intl-address-ingestion` (5 ahead of master).
Health baseline: **all tests green** (web 35/35, api 63/63, server 4/4), `tsc --noEmit` clean on `apps/web` + `apps/server`, zero TODO/FIXME markers in source.

The codebase is healthy; the risk is concentrated in **unmerged/uncommitted work** — fixes that exist but aren't on master, which is what prod presumably deploys from (master last commit: 2026-06-10).

---

## P0 — Critical (this week)

### 1. Uncommitted prod-crash-class fixes sitting in the working tree
11 files modified/deleted, uncommitted, in a **shared checkout where other agents switch branches** (known footgun — work can be silently lost):

- `apps/web/src/routes/__root.tsx` — TanStack Router devtools lazy-loaded to fix **workerd SSR crash** (browser build touches `window` at module scope → all SSR routes 500)
- `apps/web/src/components/globe-demo.tsx` + deletion of `packages/ui/src/components/ui/globe.tsx` — same SSR-crash class fix for three-globe
- `apps/web/src/components/sdk-playground.tsx` — Base UI Select null-clear fix
- `apps/web/src/components/batch/results-map.tsx` — basemap fix (Carto default label fonts 404)
- `packages/{config,database,env}/package.json`, `pnpm-lock.yaml`, `packages/env/env.d.ts` (untracked)

**Action:** commit immediately as logical commits (SSR fixes, playground fix, map fix, docs). They don't belong to the ingestion feature — consider a `fix/ssr-window-imports` commit series on this branch or cherry-pick to a fix branch targeting master.

### 2. Master is missing landed fixes — merge-train needed
| Branch | Ahead/behind master | Contains |
|---|---|---|
| `fix/apikey-auth-and-proximity-perf` | +7 / 0 | **API-key auth + proximity perf fixes**, project-name trim fix (the `03c-create-error.png` QA bug), SDK LICENSE |
| `feat/billing-stripe-meters` | +28 / 0 | Billing oRPC router, Stripe meter reporting, billing page, free-tier unblock fix |
| `feat/usage-based-billing` | +43 / 0 | Everything above **plus routing isochrone + GPS map-matching (`/match`)** — Phase 10 work |
| `feat/intl-address-ingestion` (current) | +5 / 0 | Intl ingestion pipeline, registry, adapters |

All are 0 behind — they're a stacked chain, fast-forwardable. If prod deploys from master, prod lacks an **auth fix** and a user-facing **project-creation bug fix**.

**Action:** merge train into master, smallest first: `fix/apikey-auth-and-proximity-perf` → billing chain (`feat/usage-based-billing` supersedes `feat/billing-stripe-meters`) → `feat/intl-address-ingestion` when ready. Each step: open PR, run full test suite, merge.

---

## P1 — High (blocked on human input — unblock these)

### 3. Usage-based billing E2E never run
Code complete; blocked on **Stripe credentials** and **DB migration apply** (DB writes require explicit user approval). Revenue-critical and unverified end-to-end.
**Action:** provide Stripe test creds, approve the migration, run E2E checklist.

### 4. SDK npm publish (Phase 09) at human checkpoint
Plan `09-01` ready (LICENSE, manifest, publint/attw, dry-run). Blocked on npm org + auth and the irreversible `npm publish` of `@locnative/sdk@0.2.0`. Worktree `worktree-sdk-phase1-publish-harden` exists.
**Action:** create/verify npm org, run the plan, publish.

### 5. SDK Playground PR ready but unshipped
`feat/sdk-playground-key-geocode` (+14/−2): tests green, PR doc written (`docs/superpowers/PR-sdk-playground-key-geocode.md`), **3 manual QA items unchecked** (routing place-picker, raw-key passthrough, empty-key error).
**Action:** run the 3 manual checks, rebase on master post-merge-train, open PR.

---

## P2 — Medium (hygiene, do after P0/P1)

### 6. Branch graveyard — 15 local branches, several stale
- `quick/phase0-critical-fixes` (109 behind, 5 ahead): 2 code fixes possibly superseded (geocode tests now pass on master lineage) — verify, then delete
- `fix/db-migration-consolidation` (75 behind): migration consolidation marked RESOLVED 2026-06-07 — verify baseline landed, delete
- `rollback-test`, `prototype/batch-cluster-map`, old sdk-playground branches — delete after harvest
Stale branches amplify the shared-checkout/concurrent-agent risk.

### 7. Planning state out of sync with reality
- `01-03-PLAN.md` (auth redirect UAT gaps) still unchecked in ROADMAP, but fixes are verifiably in code (`navigate` in login/register, try/catch fetchAuth in `__root.tsx`). Mark complete.
- STATE.md says "Total plans completed: 0" — stale metrics.

### 8. Untracked clutter
`qa-screenshots/`, `.claire/`, `docs/superpowers/`, `docs/analysis/mapbox-comparative-analysis.md` — commit what's a deliverable, gitignore the rest.

---

## Recommended execution order

1. **Today:** commit the working-tree fixes (P0-1) — eliminates the loss risk.
2. **Today/tomorrow:** merge `fix/apikey-auth-and-proximity-perf` → master; deploy (P0-2).
3. Merge billing/routing chain → master; deploy behind whatever flag gating exists.
4. Unblock billing E2E (Stripe creds + approved migration) — user action required.
5. Run SDK publish plan 09-01 — user action required (npm auth).
6. Finish SDK playground manual QA, ship the PR.
7. One-shot branch + planning-state cleanup.
