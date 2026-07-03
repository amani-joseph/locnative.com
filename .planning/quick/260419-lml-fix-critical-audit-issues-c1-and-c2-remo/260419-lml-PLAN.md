---
phase: 260419-lml-fix-critical-audit-issues-c1-and-c2-remo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/server/wrangler.jsonc
  - CLAUDE.md
autonomous: true
requirements:
  - C1
  - C2
must_haves:
  truths:
    - "`wrangler dev` no longer exposes `NODE_ENV=production` to the Worker via `process.env`"
    - "`CLAUDE.md` `## Project` section accurately describes auth storage (Postgres via Drizzle, not Convex)"
    - "`CLAUDE.md` Stack constraint reflects the current stack (no Convex)"
    - "Other `CLAUDE.md` managed sections (Technology Stack, Conventions, Architecture, GSD Workflow, Developer Profile) are untouched"
    - "Each fix is a separate, scoped commit (not bundled with unrelated in-flight changes — per audit H1)"
  artifacts:
    - path: "apps/server/wrangler.jsonc"
      provides: "Wrangler config without NODE_ENV in static vars"
      contains: "\"AUTH_COOKIE_DOMAIN\""
    - path: "CLAUDE.md"
      provides: "Updated `## Project` section reflecting Postgres/Drizzle auth storage"
      contains: "Postgres"
  key_links:
    - from: "apps/server/wrangler.jsonc"
      to: "process.env"
      via: "nodejs_compat_populate_process_env flag (unchanged)"
      pattern: "NODE_ENV.*production"
      expected: "absent from vars block"
    - from: "CLAUDE.md `## Project`"
      to: "packages/database/src/schema/auth.ts"
      via: "documented storage layer"
      pattern: "Convex"
      expected: "removed as auth-storage claim; Postgres/Drizzle substituted"
---

<objective>
Fix two critical issues from `.planning/audit/2026-04-19-quick-audit.md`:

- **C1:** Remove `NODE_ENV: "production"` from the static `vars` block in `apps/server/wrangler.jsonc`. Combined with `nodejs_compat_populate_process_env`, this silently flips local `wrangler dev` into production behaviour (cookies, logging, auth paths). Scope is strictly the var removal — do NOT touch the compat flag or add any `[env.production].vars` override (out of scope; user will handle via Cloudflare dashboard if needed).
- **C2:** Update the `## Project` section of `CLAUDE.md` to reflect reality: auth is stored in **Postgres (Neon) via Drizzle** — not Convex. The stack constraint must drop the Convex reference (confirmed absent by audit and by schema file `packages/database/src/schema/auth.ts`). Preserve every other section of `CLAUDE.md` verbatim.

Purpose: Prevent production-path bugs masking in dev (C1) and eliminate a stale constraint that will mislead future sessions (C2).
Output: Two modified files, two separate commits.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/audit/2026-04-19-quick-audit.md
@apps/server/wrangler.jsonc
@CLAUDE.md
@packages/database/src/schema/auth.ts

<interfaces>
<!-- Current state the executor must edit from. -->

Current `apps/server/wrangler.jsonc` vars block (lines 17-22):
```jsonc
"vars": {
    "NODE_ENV": "production",
    "AUTH_COOKIE_DOMAIN": ".locnative.com",
    "BETTER_AUTH_URL": "https://api.locnative.com",
    "WEB_BASE_URL": "https://locnative.com"
},
```

Target state (NODE_ENV line removed, other vars unchanged, compat flags unchanged):
```jsonc
"vars": {
    "AUTH_COOKIE_DOMAIN": ".locnative.com",
    "BETTER_AUTH_URL": "https://api.locnative.com",
    "WEB_BASE_URL": "https://locnative.com"
},
```

Current `CLAUDE.md` `## Project` section (inside `<!-- GSD:project-start -->` / `<!-- GSD:project-end -->` markers):
```markdown
## Project

**Locnative.com — BetterAuth Migration**

Locnative.com is an existing application built on TanStack Start + Convex. This project uses BetterAuth (self-hosted, open-source) for authentication, giving full ownership of auth data and infrastructure. The mydeffo.com-web project serves as architectural inspiration for BetterAuth patterns.

**Core Value:** Users can authenticate seamlessly — login, signup, OAuth, and session persistence must work without disruption.

### Constraints

- **Stack:** Must remain on TanStack Start + Convex — no framework changes
- **Data storage:** Auth data must be stored in Convex (not a separate DB)
- **Feature parity:** Existing auth features must work identically on BetterAuth
- **Zero legacy auth residue:** Full replacement — no legacy auth code or dependency should remain
```

Confirmed reality (from `packages/database/src/schema/auth.ts`): BetterAuth tables (`user`, `session`, `account`, `verification`) defined via `drizzle-orm/pg-core` — Postgres, not Convex. Audit (C2) confirms no `convex/` directory and no Convex deps.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove NODE_ENV from wrangler.jsonc vars (C1)</name>
  <files>apps/server/wrangler.jsonc</files>
  <action>
Edit `apps/server/wrangler.jsonc`. In the `"vars"` object (currently lines 17-22), remove the single line `"NODE_ENV": "production",`. Leave the remaining three vars (`AUTH_COOKIE_DOMAIN`, `BETTER_AUTH_URL`, `WEB_BASE_URL`) and every other field (`compatibility_flags` including `nodejs_compat_populate_process_env`, `routes`, `observability`, `dev.port`, etc.) exactly as-is.

Do NOT:
- Touch `compatibility_flags` (leave `nodejs_compat_populate_process_env` in place).
- Add a `[env.production].vars` / `env.production.vars` override block. The user has explicitly deferred this to the Cloudflare dashboard — out of scope.
- Reorder or reformat any other keys.
- Bundle this edit with any other in-flight uncommitted changes (autocomplete fix, brand.html, teams barrel, etc.) — audit H1 explicitly requires scoped commits.

After editing, stage ONLY `apps/server/wrangler.jsonc` and commit with message:
```
fix(server): remove NODE_ENV from wrangler vars to prevent prod path in dev

Combined with nodejs_compat_populate_process_env, the static vars block
was exposing NODE_ENV=production to `wrangler dev`, silently flipping
cookie/logging/auth branches. Per audit C1 (.planning/audit/2026-04-19-quick-audit.md).
```
Reason for the specific scope: per planning constraints, this fix must ship isolated from the other four uncommitted modifications.
  </action>
  <verify>
    <automated>test -f apps/server/wrangler.jsonc &amp;&amp; ! grep -E '"NODE_ENV"[[:space:]]*:[[:space:]]*"production"' apps/server/wrangler.jsonc &amp;&amp; grep -q '"AUTH_COOKIE_DOMAIN"' apps/server/wrangler.jsonc &amp;&amp; grep -q '"nodejs_compat_populate_process_env"' apps/server/wrangler.jsonc</automated>
  </verify>
  <done>
    - `"NODE_ENV": "production"` no longer present anywhere in `apps/server/wrangler.jsonc`.
    - `AUTH_COOKIE_DOMAIN`, `BETTER_AUTH_URL`, `WEB_BASE_URL` still present.
    - `nodejs_compat_populate_process_env` still in `compatibility_flags`.
    - File is valid JSONC (parses as JSON with comments — `node -e "require('fs').readFileSync('apps/server/wrangler.jsonc','utf8')"` + a strip-comments parse succeeds, or `pnpm --filter locnative-server exec wrangler types` / `wrangler deploy --dry-run` does not error on syntax).
    - Single scoped commit created touching only this file.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update CLAUDE.md Project section to reflect Postgres/Drizzle auth (C2)</name>
  <files>CLAUDE.md</files>
  <action>
Edit `CLAUDE.md`. Replace the content **between** the `<!-- GSD:project-start source:PROJECT.md -->` and `<!-- GSD:project-end -->` markers (and nothing else) with:

```markdown
<!-- GSD:project-start source:PROJECT.md -->
## Project

**Locnative.com — BetterAuth Migration**

Locnative.com is an existing application built on TanStack Start. Authentication uses BetterAuth (self-hosted, open-source), with auth data persisted to **Postgres (Neon) via Drizzle ORM** — see `packages/database/src/schema/auth.ts`. The mydeffo.com-web project serves as architectural inspiration for BetterAuth patterns.

> Note: An earlier plan scoped auth storage to Convex. That direction was abandoned due to complexity; there is no `convex/` directory and no Convex dependency in the repo.

**Core Value:** Users can authenticate seamlessly — login, signup, OAuth, and session persistence must work without disruption.

### Constraints

- **Stack:** TanStack Start on the web app, Cloudflare Workers (`apps/server`) on the API — no framework changes.
- **Data storage:** Auth data is stored in Postgres on Neon, managed via Drizzle migrations (`packages/database/drizzle/*`).
- **Feature parity:** Existing auth features must work identically on BetterAuth.
- **Zero legacy auth residue:** Full replacement — no legacy auth code or dependency should remain.
<!-- GSD:project-end -->
```

Preserve **exactly as-is** every other section in the file (outside the two markers):
- `<!-- GSD:stack-start ... -->` … `<!-- GSD:stack-end -->` (Technology Stack)
- `<!-- GSD:conventions-start ... -->` … `<!-- GSD:conventions-end -->` (Conventions)
- `<!-- GSD:architecture-start ... -->` … `<!-- GSD:architecture-end -->` (Architecture)
- `<!-- GSD:workflow-start ... -->` … `<!-- GSD:workflow-end -->` (GSD Workflow Enforcement)
- `<!-- GSD:profile-start -->` … `<!-- GSD:profile-end -->` (Developer Profile)
- All blank lines between sections.

Do NOT:
- Rewrite or reorder any non-`## Project` section.
- Remove the GSD comment markers (automation depends on them).
- Re-introduce Convex as the auth store anywhere.

After editing, stage ONLY `CLAUDE.md` and commit with message:
```
docs: correct CLAUDE.md project section — auth is Postgres/Drizzle, not Convex

The prior text claimed auth lived in Convex. The codebase uses BetterAuth
with Drizzle-managed Postgres (Neon); no Convex deps remain. Per audit C2
(.planning/audit/2026-04-19-quick-audit.md).
```
  </action>
  <verify>
    <automated>grep -q "Postgres (Neon) via Drizzle" CLAUDE.md &amp;&amp; ! grep -E "TanStack Start \+ Convex" CLAUDE.md &amp;&amp; ! grep -E "Auth data must be stored in Convex" CLAUDE.md &amp;&amp; grep -q "GSD:project-start source:PROJECT.md" CLAUDE.md &amp;&amp; grep -q "GSD:project-end" CLAUDE.md &amp;&amp; grep -q "GSD:workflow-start" CLAUDE.md &amp;&amp; grep -q "GSD:profile-end" CLAUDE.md &amp;&amp; grep -q "Ultracite" .claude/CLAUDE.md 2>/dev/null || true</automated>
  </verify>
  <done>
    - `## Project` section no longer claims Convex is the auth store.
    - New text names Postgres (Neon) + Drizzle and references `packages/database/src/schema/auth.ts`.
    - All other GSD-managed sections (`stack`, `conventions`, `architecture`, `workflow`, `profile`) unchanged — both their content and their begin/end markers present.
    - Single scoped commit created touching only `CLAUDE.md`.
  </done>
</task>

</tasks>

<verification>
After both tasks:

1. `git log --oneline -n 3` shows two new commits, one per fix, each touching only its single file.
2. `git status` still shows the other unrelated in-flight changes (`apps/web/public/brand.html`, `packages/database/src/index.ts`, `packages/database/src/queries/autocomplete.ts`, worktree pointer) as **untouched** — this plan must not sweep them up.
3. `grep -R "NODE_ENV.*production" apps/server/wrangler.jsonc` returns nothing.
4. `grep -R "Convex" CLAUDE.md` returns at most the historical-note line ("An earlier plan scoped auth storage to Convex…") — never as an active constraint.
5. JSONC still parses (e.g., `pnpm --filter locnative-server exec wrangler deploy --dry-run --outdir=/tmp/wrangler-check` parses config without syntax error, or a lightweight `node -e` strip-comments parse succeeds).
</verification>

<success_criteria>
- C1 resolved: `NODE_ENV` gone from static `vars`; compat flag preserved; `wrangler dev` will no longer receive `process.env.NODE_ENV==='production'` from config.
- C2 resolved: `CLAUDE.md` `## Project` section accurately names Postgres/Drizzle; Convex constraint retired; every other section byte-identical.
- Two focused commits on `master`, scoped to a single file each, with messages referencing the audit IDs.
- No collateral changes to the other four in-flight modifications listed in audit H1.
</success_criteria>

<output>
After completion, create `.planning/quick/260419-lml-fix-critical-audit-issues-c1-and-c2-remo/260419-lml-SUMMARY.md` documenting:
- The two commits' SHAs.
- Confirmation that audit H1's other four in-flight changes remain separately uncommitted (for the user to address next).
- Any deviations from the plan.
</output>
