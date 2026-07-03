# Project Audit — Pending Items (reconciled 2026-06-20)

Reconciliation of `project-audit-2026-06-12.md` against current git/repo state.
**6 of 8 original items resolved.** Only the items below remain open.

Branch at reconciliation: `feat/docs-ui-reorder`. Working tree clean. Master is the
landed lineage for all former merge-train branches (all now 0 ahead of master).

---

## Pending

### P1 — Billing usage-metering E2E never run
Billing code is **merged to master** (`packages/api/src/billing/*`, `_protected/billing.tsx`,
Stripe meter reporting + routers). Still outstanding:
- Set Stripe secrets in wrangler (prod/preview)
- Apply the billing DB migration (requires explicit user approval)
- Run the end-to-end metering checklist (signup → usage → meter event → invoice)
- Rotate the test keys used during development

**Blocked on:** Stripe creds + DB-migration approval (user action).

### P2 — Branch graveyard (regressed)
**36 local branches** now (was 15 at the 06-12 audit). Many are landed or superseded
and safe to delete after a harvest check:
- All former merge-train branches are 0 ahead of master and deletable:
  `fix/apikey-auth-and-proximity-perf`, `feat/billing-stripe-meters`,
  `feat/usage-based-billing`, `feat/sdk-playground-key-geocode`,
  `worktree-sdk-phase1-publish-harden`, `prototype/batch-cluster-map`,
  `rollback-test`, `seo-landing-docs`, `feat/billing-stripe-meters`
- Stale/superseded: `quick/phase0-critical-fixes` (305 behind),
  `fix/db-migration-consolidation` (271 behind, marked RESOLVED 2026-06-07)
- Verify-then-delete the various `docs/*`, `worktree-*`, and backup branches
  (`backup/master-pre-sync-20260620`, `wip-master-backup-2026-06-20`)

Stale branches amplify the shared-checkout / concurrent-agent loss risk.

**Action:** harvest any unmerged work, then prune. Low risk, do in one pass.

---

## Resolved since 2026-06-12 (for the record)

- **P0-1** SSR `window`-import crash fixes — in master (`__root.tsx` lazy devtools +
  try/catch; `packages/ui/.../globe.tsx` deleted). Working tree clean.
- **P0-2** Merge train — complete; all target branches 0 ahead of master.
- **P1 SDK npm publish** — `@locnative/sdk` live on npm (now `0.4.3`).
- **P1 SDK Playground** — merged (`apps/web/src/components/sdk-playground.tsx` in master).
- **P2 Untracked clutter** — `docs/superpowers/` now committed; no `qa-screenshots/`
  or `.claire/` tracked. (Minor residual: those paths are not in `.gitignore`.)
- **API endpoint perf/crash class** — separately confirmed resolved in
  `docs/audits/api-endpoint-audit-2026-06-15-final.md` (no timeouts/500s/hangs).
- **P2 Planning state sync** (done 2026-06-20) — `.planning/ROADMAP.md`: `01-03-PLAN.md`
  marked `[x]`, Phase 1 progress row set `3/3 Complete`. `.planning/STATE.md`:
  velocity "Total plans completed" `0 → 11`, frontmatter `completed_plans 13 → 11`,
  dates refreshed to 2026-06-20. (The `apps/web/.planning/` copies are a stale,
  divergent legacy lineage — left untouched intentionally.)
