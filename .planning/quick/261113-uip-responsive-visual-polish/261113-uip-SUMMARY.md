---
quick_id: 261113-uip
status: complete
date: 2026-11-13
commits: [eab3b96, b5c569d, f7c1a7f]
---

# 261113-uip: Responsive and visual polish audit — Summary

GSD tooling was unavailable (`gsd-sdk` is not on PATH, and `gsd-tools.cjs` fails on a missing
`~/.claude/sdk/shared/model-catalog.json`). The quick workflow was followed by hand.

## Method
Playwright against local dev (web :3001, API :3003, Neon **dev** branch) with a throwaway
`ui-audit+…@example.test` account. Every route was captured at 375 / 430 / 768 / 1024 /
1440 / 2560 in dark and light (360 shots), with an automated horizontal-overflow check and
contact sheets for review. Changed routes were re-captured afterwards at 375 and 1440 in both themes.

## Done

| Task | Commit | Result |
|---|---|---|
| T1 AuthFrame | eab3b96 | One frame for sign-in, sign-up, forgot, reset, two-factor and invite. Real `<h1>`. Sign-in is now vertically centred like the others. The invite card no longer shrinks, and its skeleton no longer collapses. |
| T2 PageHeader / EmptyState | b5c569d | Batch, zones, webhooks, devices and help gain the standard header. All empty states share one brand-tinted design. With no projects, the selector offers "Create a project". Fixed `<a><button>` nesting on the dashboard. |
| T3 Responsive + glow | f7c1a7f | API docs endpoint rows wrap on mobile. Team member names and emails truncate. A faint emerald glow sits at the top of the app content area. |

## Kept deliberately (already strong)
The landing page, pricing (including its emerald wash), coverage, changelog, docs, legal and the
sign-in/up forms. Also the dark landing page and footer in light mode, the JetBrains Mono brand
type, and the global reduced-motion guard. The baseline showed **0 horizontal overflow** on
every public route at every viewport.

## Verification
- `ultracite check`: clean on all 23 changed files.
- `tsc --noEmit`: no new errors (4 pre-existing, in legal-page, changelog and zones/geometry).
- `vitest`: 28 files, 156 tests pass.

## Follow-ups (not done)
- The header's Send icon button has no `aria-label` and no handler.
- `ActiveProjectSelector` and analytics metric cards are left as they are. The "Most Active
  Endpoint" value is too long for a two-column tile layout at 375px.
- The Neon dev branch was missing migration 0023's four `user` columns, which broke local
  signup. They were added with `ADD COLUMN IF NOT EXISTS`. The dev `__drizzle_migrations`
  journal is already out of step with the repo (8 rows against 19 entries).
