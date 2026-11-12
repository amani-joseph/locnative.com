---
quick_id: 261113-uip
mode: quick
created: 2026-11-13
---

# Quick Task 261113-uip: Responsive and visual polish audit (web)

Audit every `apps/web` route at 375 / 430 / 768 / 1024 / 1440 / 2560 px in dark and light,
using real Playwright screenshots against local dev (web :3001, API :3003, Neon dev branch).
Keep what already works. Fix inconsistencies through shared components, not one-off route styles.

## Baseline findings (screenshots, 360 captures)

- No horizontal overflow on any public route at any viewport. Landing, pricing, coverage,
  changelog, docs, legal and sign-in/up are strong. **Keep as is.**
- The auth frame (ruled header, illustration and form) is copy-pasted into 4 blocks. The title
  is a `<p>`, not an `<h1>`. Sign-in's `<section>` lacks `flex-col`, so it sits at the top of
  the viewport while forgot/reset are centred.
- `/two-factor` is a bare card with no brand frame and a native checkbox.
- `/invite/$id`: the shell is a grid item with `mx-auto` and no `w-full`, so it shrinks to fit.
  The card is cramped and the loading skeleton collapses to zero width.
- `/batch`, `/zones`, `/webhooks` and `/devices` have no page header (no `h1`). With no
  projects they open on an orphaned "No projects yet." line.
- `/help` centres its header while every other page is left-aligned.
- Empty states differ: three styles plus plain-text rows.
- `/api-docs` on mobile: the endpoint summary is squeezed into a one-word-wide column.
- `/team` on mobile: the member email breaks mid-word and the role badge is crammed against the edge.

## Tasks

### T1: Shared AuthFrame
- files: `components/auth-frame.tsx` (new), the 4 `shadcn-space/blocks/*-03` auth blocks,
  `routes/_auth/two-factor.tsx`, `routes/invite.$id.tsx`
- action: one frame with an `<h1>`, a brand eyebrow dot, a responsive title scale and
  vertical centring. Two-factor and invite use it. Two-factor uses the styled Checkbox.
  Fix the invite skeleton width.

### T2: PageHeader + EmptyState primitives
- files: `components/page-header.tsx`, `components/empty-state.tsx` (new). Applied to
  batch, zones, webhooks, devices, help, dashboard, projects, job-history, zone-list,
  webhook-list, active-project-selector.
- action: consistent title block with an actions slot that stacks on mobile. Brand-tinted
  empty state. The project selector's empty case links to `/projects`, and the selector is
  full-width on mobile.

### T3: Responsive fixes and brand depth
- files: `components/api-explorer.tsx`, `routes/_protected/team.tsx`, `components/app-shell.tsx`
- action: the endpoint row wraps on mobile; team rows truncate; a faint emerald glow sits at
  the top of the app content area.

## Verify
- Re-capture changed routes at m375 and d1440 in dark and light, and compare contact sheets.
- `ultracite check` and `tsc` (no new errors) on changed files, plus vitest.
