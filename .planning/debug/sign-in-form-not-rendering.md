---
status: investigating
trigger: "sign-in-form-not-rendering"
created: 2026-04-18T00:00:00Z
updated: 2026-04-18T01:00:00Z
---

## Current Focus

hypothesis: The fix to __root.tsx (removing <head> wrapper) exists on disk but was never committed or deployed. User may be testing the deployed Workers app (locnative-web.mr-amanijoseph.workers.dev) which still has the old code, OR the dev server is not running.
test: Confirmed __root.tsx is working-tree-modified but not staged/committed. wrangler.jsonc on this branch points to .workers.dev URLs. git status shows " M" for __root.tsx (modified in working tree only).
expecting: If user is testing deployed app, fixing requires deploying. If testing local dev, the fix should already be live via HMR.
next_action: CHECKPOINT — ask user whether they are testing local dev or the deployed workers URL

## Symptoms

expected: /sign-in renders full LoginForm with layout, ShaderAnimation, heading, styled GitHub button
actual: Blank white background with only a small gray rounded pill (unstyled Button) visible. No heading, no shader, no layout.
errors: Not captured from browser console — diagnosed from source diff
reproduction: Run dev server, navigate to /sign-in
started: Regression introduced on rollback-test branch

## Eliminated

- hypothesis: _auth layout route missing (no _auth.tsx)
  evidence: routeTree.gen.ts shows _auth/sign-in parented directly to root — that is correct TanStack Router behavior, no layout file needed
  timestamp: 2026-04-18T00:00:00Z

- hypothesis: CSS import path broken in __root.tsx
  evidence: `import appCss from "../index.css?url"` resolves correctly from src/routes/ to src/index.css
  timestamp: 2026-04-18T00:00:00Z

- hypothesis: auth-server.ts broken by phase 07 changes
  evidence: File reads cleanly — no broken imports or missing exports
  timestamp: 2026-04-18T00:00:00Z

- hypothesis: Tailwind plugin misconfigured
  evidence: vite.config.ts has tailwindcss() plugin; globals.css has @import "tailwindcss" and correct @source directives
  timestamp: 2026-04-18T00:00:00Z

## Evidence

- timestamp: 2026-04-18T00:00:00Z
  checked: git diff master...HEAD -- apps/web/src/routes/__root.tsx
  found: On this branch, <HeadContent /> is wrapped in <head>...</head>. On master it was rendered bare inside <html>.
  implication: TanStack Start's <HeadContent /> already emits the <head> element. The extra wrapper creates malformed HTML — browser discards the duplicate/nested head, stylesheet link never loads, Tailwind styles absent.

- timestamp: 2026-04-18T01:00:00Z
  checked: Current __root.tsx on disk + git status
  found: File shows bare <HeadContent /> (fix applied). But git status shows " M" — modified in working tree, NOT committed or deployed.
  implication: Fix is only on disk. If user tests deployed workers app it won't be there.

- timestamp: 2026-04-18T01:00:00Z
  checked: apps/web/wrangler.jsonc vars section
  found: BETTER_AUTH_URL and VITE_SERVER_URL point to locnative-server.mr-amanijoseph.workers.dev. Web app deployed to locnative-web.mr-amanijoseph.workers.dev.
  implication: If user is visiting the deployed Workers URL, they see stale code. The fix must be committed and deployed via wrangler to take effect there.

- timestamp: 2026-04-18T01:00:00Z
  checked: lsof -i :3001
  found: No process listening on port 3001. Dev server appears to NOT be running.
  implication: User cannot be testing local dev at http://localhost:3001. They are almost certainly testing the deployed Workers app.

## Resolution

root_cause: apps/web/src/routes/__root.tsx wraps <HeadContent /> in an extra <head> tag. TanStack Start's <HeadContent /> already renders the full <head> element including the stylesheet <link>. The double-wrapping produces invalid HTML that causes browsers to drop the CSS link, so no Tailwind styles load — leaving only unstyled native elements (the Button renders as a gray pill).
fix: Remove the <head>...</head> wrapper around <HeadContent /> — render it bare directly inside <html>, restoring the original master structure.
verification: []
files_changed: [apps/web/src/routes/__root.tsx]
