# Phase 08: Teams — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** Approved design brief — `/Users/mac/.claude/plans/i-would-like-to-cheeky-tower.md` (treated as PRD Express Path input)

<domain>
## Phase Boundary

Turn the static `/team` route into a functional multi-user workspace. Scope:

- Users can create Teams, rename them, and (owners only) delete them.
- Users can invite members by email via **Resend**; invitees receive a link, sign up or sign in, and join the team.
- Every member accepted into a team gets **one auto-generated team-scoped API key** that authorizes requests against any project in that team.
- Projects move from user-owned to team-owned. Existing users get an auto-created "Personal" team; their projects + keys are reassigned to it.
- Secrets are stored encrypted-at-rest so the owning member can re-view/copy them.
- Removing or leaving a team causes that member's key to fail at the API-key auth middleware (no cascade delete).
- Phase depends on Phase 07 (Extract auth into its own package) landing first — Teams wiring lives in `@locnative/auth`.
</domain>

<decisions>
## Implementation Decisions

### Teams engine
- **Locked:** Use BetterAuth `organization` plugin (server + `organizationClient` on the client). Alias "organization" → "team" in UI copy.
- **Locked:** Roles are `owner`, `admin`, `member`.
- **Locked:** `admin` has everything `owner` has **except** delete team and transfer ownership.

### Ownership & migration
- **Locked:** All projects belong to a team. Add `projects.teamId` (uuid, FK → teams, `onDelete: "cascade"`).
- **Locked:** Replace `uq_projects_user_slug` with `uq_projects_team_slug` on `(teamId, slug)`.
- **Locked:** One-shot backfill script (`packages/database/scripts/backfill-personal-teams.ts`): for every existing user, create a team named `"<user>'s Personal"`, add them as `owner`, reassign their `projects` + `apiKeys` to it.
- **Locked:** Personal team is hidden from the UI team switcher until the user has ≥2 teams.

### Auth hooks (BetterAuth)
- **Locked:** `databaseHooks.user.create.after` → auto-create "Personal" team and add the new user as `owner`; set it as the active organization.
- **Locked:** Organization plugin `afterAcceptInvitation` (or equivalent) → auto-generate the new member's team-scoped API key and set the team as their active organization.

### Email (invitations)
- **Locked:** Use `resend` SDK. New required env vars: `RESEND_API_KEY`, `EMAIL_FROM`.
- **Locked:** Invitation link format: `${WEB_BASE_URL}/invite/<invitationId>`.
- **Locked:** Minimal HTML + text template; send via `packages/auth/src/index.ts`'s `organization({ sendInvitationEmail })` hook.

### API key lifecycle (team-scoped)
- **Locked:** Add `apiKeys.teamId` (uuid, FK → teams, `onDelete: "cascade"`, NOT NULL after backfill).
- **Locked:** Keep `apiKeys.userId` — on auto-gen keys, it is the member who owns the key.
- **Locked:** Auto-generated keys are **team-scoped** (`projectId IS NULL`) — they authorize requests against *any* project within that team. Owner/admin may additionally create **project-scoped** keys (`projectId = <id>`) for specific members.
- **Locked:** Members do NOT self-create keys. Only owner/admin can create additional keys or revoke any key.
- **Locked:** On member leave/removal, keys are **not revoked or deleted** — `api-key-auth.ts` rejects them because membership no longer exists.

### Secret storage
- **Locked:** Add `apiKeys.secretCiphertext` (text, nullable) and `apiKeys.secretIv` (text, nullable).
- **Locked:** Keep `apiKeys.secretHash` + `apiKeys.secretSalt` for constant-time auth verification.
- **Locked:** Encrypt with AES-256-GCM using a new env var `KEY_ENC_KEY` (32-byte hex).
- **Locked:** New helper at `apps/web/src/lib/api-key-crypto.ts` exporting `encryptSecret(plaintext) → { ciphertext, iv }` and `decryptSecret({ ciphertext, iv }) → string`.
- **Locked:** Legacy keys (pre-migration) have null ciphertext and remain "view-once".

### Secret visibility
- **Locked:** Members can view + copy the raw secret of **their own** key only.
- **Locked:** Other team members see only metadata (name, suffix, last-used, usage counts).
- **Locked:** A new server fn `revealApiKeySecret(id)` decrypts on demand — returns 403 if caller is not the key's owner.

### API-key authentication middleware
- **Locked:** `apps/web/src/lib/api-key-auth.ts` — after the scrypt hash match succeeds, look up `team_members` for `(apiKey.teamId, apiKey.userId)`. If no active row, return `null` (401). Timing-safe behavior preserved.

### UI
- **Locked:** Replace mock data in `apps/web/src/routes/_protected/team.tsx` with real `useListOrganizations`, `useActiveOrganization`, server-fn-driven member + invitation lists.
- **Locked:** New route `apps/web/src/routes/invite.$id.tsx` — reads invitation, prompts sign-in if needed, calls `acceptInvitation`, redirects to `/team`.
- **Locked:** Team switcher added to `apps/web/src/components/app-sidebar.tsx` (or equivalent nav).
- **Locked:** `apps/web/src/routes/_protected/projects.tsx` and `apps/web/src/routes/_protected/api-keys.tsx` updated to pass active `teamId` into server functions.

### Pattern adherence
- **Locked:** Server code follows the existing `createServerFn` + Zod `inputValidator` pattern in `apps/web/src/lib/api-keys-server.ts` — NOT oRPC.
- **Locked:** File naming: kebab-case filenames, camelCase functions, PascalCase components, tabs, double quotes, `.ts` extension in relative imports.

### Claude's Discretion
- Exact shape of the Resend HTML email template (use Tailwind-based layout with the project's brand tokens).
- Internal structure of `teams-server.ts` / `team-members-server.ts` / `team-invites-server.ts` (split as plans deem useful).
- Exact `crypto.createCipheriv` nonce/IV size (use 12-byte IV for GCM — standard).
- Team switcher UI component (reuse an existing shadcn `select` or `dropdown-menu`).
- Exact roles granted by the BetterAuth `ac` (access control) layer for `admin` — derive from the "owner minus delete/transfer" constraint.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project conventions
- `apps/web/CLAUDE.md` — naming, import rules, server-fn pattern, `.ts` extension rule in relative imports, tabs + double quotes, `cn()` usage.
- `.claude/CLAUDE.md` — Ultracite / Biome code standards (React 19+ `ref as prop`, arrow functions for callbacks, `for...of` over `.forEach`, no `console.log`).

### Approved design brief
- `/Users/mac/.claude/plans/i-would-like-to-cheeky-tower.md` — full phase plan with architecture diagram, verification steps, and open-question answers. The source of truth for this phase.

### Existing auth + DB patterns (must mirror)
- `packages/auth/src/index.ts` — current BetterAuth server config; add `organization()` plugin here.
- `apps/web/src/lib/auth-client.ts` — current auth client; add `organizationClient()`.
- `packages/database/src/schema/api-keys.ts` — current key schema (hash + salt); extend with `teamId`, `secretCiphertext`, `secretIv`.
- `packages/database/src/schema/projects.ts` — current project schema; extend with `teamId`, swap unique index.
- `packages/database/src/schema/auth.ts` — BetterAuth auth tables (users, sessions, accounts, verifications).
- `packages/database/src/schema/index.ts` — schema barrel; must export new team tables.
- `apps/web/src/lib/api-keys-server.ts` — reference pattern for server fns (Zod + scrypt hashing + Drizzle).
- `apps/web/src/lib/api-key-auth.ts` — API-key validation middleware; add membership check here.
- `apps/web/src/routes/_protected/team.tsx` — current mock UI being replaced.
- `apps/web/src/routes/_protected/api-keys.tsx`, `apps/web/src/routes/_protected/projects.tsx` — downstream consumers that need `teamId` threading.
- `packages/env/src/server.ts` — new env vars go here (`RESEND_API_KEY`, `EMAIL_FROM`, `KEY_ENC_KEY`).

### Upstream reference (architectural inspiration)
- `/Users/mac/Developer/projects/mydeffo.com-web/packages/auth/` — mirror for Phase 07 auth package; any team plugin wiring patterns adopted there should be matched once Phase 07 lands.

### Phase-07 dependency
- `.planning/phases/07-extract-auth-into-its-own-package/` — Phase 08 assumes `@locnative/auth` (from Phase 07) is the home for BetterAuth server + client. Plans MUST import from that package, not from `packages/api`.

</canonical_refs>

<specifics>
## Specific Ideas

- **Team switcher UX:** dropdown in the sidebar showing active team name + a divider + other teams + "Create team…" action. When `teams.length < 2` and the user has only their Personal team, hide the whole switcher.
- **Invite dialog:** single dialog on `/team` with email + role select (`member` default, `admin` allowed for owners). Submit → `inviteMember` → toast + optimistic row in "Pending Invitations".
- **Auto-key display:** the freshly auto-generated key's plaintext is shown ONCE in a success toast/modal on invite acceptance (`/invite/:id` → `/team?newKey=<id>`). The encrypted secret remains viewable later via `revealApiKeySecret` (owner of key only).
- **Rate limits:** `inviteMember` should ride on BetterAuth's existing rate limiter; no new middleware needed.
- **Email template:** keep it minimal — team name, inviter name, single CTA button linking to `${WEB_BASE_URL}/invite/<invitationId>`.
- **DB column adds on existing tables:** write as nullable first, backfill, then add NOT NULL via a follow-up migration in the same phase (`teamId` on both `projects` and `apiKeys`).

## Verification end-to-end (owner → invite → accept → API call → removal)

1. Sign up User A → Personal team auto-created (hidden in switcher).
2. User A creates "Acme" team → now switcher visible with Personal + Acme.
3. User A creates project `demo` in Acme.
4. User A invites `joe+test@…` → Resend fires; invite row appears Pending.
5. Joe opens link in incognito → sign up → redirected to `/team` as active Acme member.
6. Joe's auto-key is shown once on landing; Joe copies it.
7. `curl /api/v1/addresses/autocomplete?q=Sydney -H "Authorization: Bearer <joes-key>"` → 200.
8. User A removes Joe from Acme.
9. Re-run the curl → 401 (membership check rejects).
10. User A re-invites Joe; acceptance → new auto-key generated.
</specifics>

<deferred>
## Deferred Ideas

- Billing / seat limits.
- SSO-enforced team membership.
- Per-project role overrides (read-only on one project, write on another).
- Transfer team ownership UI (DB-only for now if needed).
- "Rotate all team keys" bulk action (possible follow-up after any member removal).
- Support for inviting users who don't have an account yet beyond what BetterAuth provides natively — BetterAuth's organization plugin handles this; rely on its defaults.
</deferred>

---

*Phase: 08-teams-creation-email-invitations-resend-and-auto-generated-per-member-api-keys-scoped-to-the-team*
*Context gathered: 2026-04-18 via PRD Express Path (approved design brief)*
