# Team Route MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static `/team` route into a functional multi-member team workspace — create/rename/delete teams, invite by email via Resend, accept invites, and manage members — backed by the existing custom `teams`/`team_members`/`team_invitations` tables.

**Architecture:** A new oRPC domain router `teams` (mirroring `projects.ts`) exposes the operations; all DB logic lives in small pure functions that take a `db` handle so they can be unit-tested with a mock db (the repo's established pattern, see `projects.test.ts`). Invitation email templates + the Resend send call move into `packages/auth/src/invitations.ts`. The half-wired, table-less BetterAuth `organization` plugin is removed. The frontend `/team` route renders each team the user belongs to as its own section; a new `/invite/$id` route handles email-bound acceptance.

**Tech Stack:** TypeScript, oRPC (`@orpc/server`), Drizzle ORM, Neon Postgres, Zod, Resend, TanStack Start/Router, React 19, vitest.

## Global Constraints

- Indent with **tabs**; **double quotes**; self-closing elements; sorted Tailwind classes (Ultracite/Biome — run `pnpm dlx ultracite fix` before committing).
- **Named exports** only (except React route component default patterns). No barrel files.
- Relative imports in server/lib `.ts` files include the **`.ts` extension** (e.g. `import { foo } from "./bar.ts"`).
- Intra-app web imports use `@/`; shared packages use `@locnative/...`.
- Type-only imports use `import type`.
- No `console.log`, `debugger`, `alert` in committed code.
- Roles are exactly `"owner" | "admin" | "member"`.
- Invite link format: `${WEB_BASE_URL}/invite/<invitationId>` (strip any trailing slash on `WEB_BASE_URL`).
- Invite expiry: 72 hours.
- Tests run with `pnpm -C packages/api test` (vitest). Run a single file with `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`.

---

## File Structure

**Created**
- `packages/auth/src/invitations.ts` — invite email templates + `buildInviteUrl` + `sendInvitationEmail` (Resend). Importable as `@locnative/auth/invitations`.
- `packages/api/src/routers/domains/teams.ts` — pure team logic functions + `teamsRouter`.
- `packages/api/src/routers/domains/teams.test.ts` — unit tests for the pure logic.
- `apps/web/src/routes/invite.$id.tsx` — invite acceptance landing route.

**Modified**
- `packages/auth/src/index.ts` — remove the `organization()` plugin (+ its import) and the now-unused invite template functions (moved to `invitations.ts`).
- `packages/api/src/routers/index.ts` — register `teams: teamsRouter`.
- `apps/web/src/routes/_protected/team.tsx` — replace all mock data with the real, multi-team-section UI.

---

## Task 1: Relocate invite email helpers into `packages/auth/src/invitations.ts`

Pure refactor + a `sendInvitationEmail` wrapper so the API package can send invites. No behavior change to existing emails.

**Files:**
- Create: `packages/auth/src/invitations.ts`
- Test: `packages/auth/src/invitations.test.ts`

**Interfaces:**
- Produces:
  - `type InviteTemplateParams = { teamName: string; inviterName: string; inviterEmail: string; inviteUrl: string }`
  - `buildInviteHtml(params: InviteTemplateParams): string`
  - `buildInviteText(params: Omit<InviteTemplateParams, "inviterEmail">): string`
  - `buildInviteUrl(invitationId: string): string`
  - `sendInvitationEmail(params: { to: string; teamName: string; inviterName: string; inviterEmail: string; invitationId: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `packages/auth/src/invitations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildInviteHtml, buildInviteText, buildInviteUrl } from "./invitations.ts";

describe("invite templates", () => {
	it("renders the team and inviter into the HTML body and CTA link", () => {
		const html = buildInviteHtml({
			teamName: "Acme",
			inviterName: "Ada",
			inviterEmail: "ada@example.com",
			inviteUrl: "https://app.example.com/invite/abc",
		});
		expect(html).toContain("Acme");
		expect(html).toContain("Ada");
		expect(html).toContain("https://app.example.com/invite/abc");
	});

	it("includes the raw URL on its own line in the text body", () => {
		const text = buildInviteText({
			teamName: "Acme",
			inviterName: "Ada",
			inviteUrl: "https://app.example.com/invite/abc",
		});
		expect(text).toContain("https://app.example.com/invite/abc");
	});
});
```

> Note: `buildInviteUrl` depends on `serverEnv.WEB_BASE_URL`, which is not set in the test env, so it is intentionally NOT unit-tested here (it is covered by manual end-to-end verification in Task 8). Importing it must not throw at module load.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/auth exec vitest run src/invitations.test.ts`
Expected: FAIL — `Cannot find module "./invitations.ts"`.

- [ ] **Step 3: Create `packages/auth/src/invitations.ts`**

Move the invite template bodies verbatim from `packages/auth/src/index.ts` (lines defining `InviteTemplateParams`, `buildInviteHtml`, `buildInviteText`) and add the URL builder + Resend sender:

```typescript
import { serverEnv } from "@locnative/env/server";
import { Resend } from "resend";

const TRAILING_SLASH_REGEX = /\/$/;

export interface InviteTemplateParams {
	teamName: string;
	inviterName: string;
	inviterEmail: string;
	inviteUrl: string;
}

export function buildInviteHtml({
	teamName,
	inviterName,
	inviterEmail,
	inviteUrl,
}: InviteTemplateParams): string {
	const fontStack = "ui-monospace, 'Courier New', monospace";
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invitation to ${teamName} on Locnative</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;font-family:${fontStack};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 0 24px 0;font-family:${fontStack};font-size:14px;font-weight:600;color:#1a1a1a;letter-spacing:0.02em;">
                Locnative
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 16px 0;font-family:${fontStack};font-size:24px;font-weight:600;line-height:1.3;color:#1a1a1a;">
                ${inviterName} has invited you to join ${teamName} on Locnative
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;font-family:${fontStack};font-size:14px;line-height:1.5;color:#1a1a1a;">
                Click the button below to accept this invitation. This link expires in 72 hours.
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;">
                <a href="${inviteUrl}" style="display:inline-block;background:#dedede;color:#1a1a1a;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:${fontStack};font-size:14px;font-weight:600;">Accept invitation</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 0 0 0;border-top:1px solid #ececec;font-family:${fontStack};font-size:12px;line-height:1.5;color:#6b6b6b;">
                If you weren't expecting this, you can ignore this email. This invitation was sent by ${inviterEmail}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildInviteText({
	teamName,
	inviterName,
	inviteUrl,
}: Omit<InviteTemplateParams, "inviterEmail">): string {
	return [
		`${inviterName} has invited you to join ${teamName} on Locnative.`,
		"",
		"Accept this invitation by opening the link below. It expires in 72 hours.",
		"",
		inviteUrl,
		"",
		"If you weren't expecting this, you can ignore this email.",
	].join("\n");
}

export function buildInviteUrl(invitationId: string): string {
	const base = serverEnv.WEB_BASE_URL.replace(TRAILING_SLASH_REGEX, "");
	return `${base}/invite/${invitationId}`;
}

export async function sendInvitationEmail({
	to,
	teamName,
	inviterName,
	inviterEmail,
	invitationId,
}: {
	to: string;
	teamName: string;
	inviterName: string;
	inviterEmail: string;
	invitationId: string;
}): Promise<void> {
	const resend = new Resend(serverEnv.RESEND_API_KEY);
	const inviteUrl = buildInviteUrl(invitationId);
	await resend.emails.send({
		from: serverEnv.EMAIL_FROM,
		to,
		subject: `${inviterName} invited you to ${teamName} on Locnative`,
		html: buildInviteHtml({ teamName, inviterName, inviterEmail, inviteUrl }),
		text: buildInviteText({ teamName, inviterName, inviteUrl }),
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/auth exec vitest run src/invitations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
pnpm dlx ultracite fix packages/auth/src/invitations.ts packages/auth/src/invitations.test.ts
git add packages/auth/src/invitations.ts packages/auth/src/invitations.test.ts
git commit -m "feat(auth): extract invitation email helpers into invitations.ts"
```

---

## Task 2: Remove the dead BetterAuth `organization` plugin

The plugin's tables (`organization`/`member`/`invitation`) don't exist and its `sendInvitationEmail` can never fire. Removing it deletes a runtime trap and the now-duplicated invite template code.

**Files:**
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new (cleanup only). Confirms `auth` still builds and the `databaseHooks.user.create.after` Personal-team logic is untouched.

- [ ] **Step 1: Remove the plugin import**

In `packages/auth/src/index.ts`, delete the `organization` import. It is currently:

```typescript
import { organization } from "better-auth/plugins";
```

If other plugins are imported from `better-auth/plugins` on the same line, keep those and remove only `organization`.

- [ ] **Step 2: Remove the `plugins: [...]` org block**

Delete the entire `organization({ ... })` entry from the `plugins` array in the `betterAuth({ ... })` config (the block spanning `allowUserToCreateOrganization` through its closing `}),`, including the inline `sendInvitationEmail`). If `organization` was the only plugin, remove the now-empty `plugins: []` key entirely.

- [ ] **Step 3: Remove the orphaned invite template functions**

Delete the `InviteTemplateParams` interface, `buildInviteHtml`, and `buildInviteText` function definitions from `index.ts` (they now live in `invitations.ts`). **Keep** `buildResetPasswordHtml` and any other email helpers still used by remaining hooks. Keep `TRAILING_SLASH_REGEX`, `SLUG_SANITIZE_REGEX`, `SLUG_TRIM_REGEX` only if still referenced after the deletions (the `user.create` hook uses the slug regexes — keep those).

- [ ] **Step 4: Verify the package still typechecks and nothing references the plugin**

Run:
```bash
grep -rn "organization" packages/auth/src apps packages/api/src --include="*.ts" | grep -v node_modules
pnpm -C packages/auth exec tsc --noEmit
```
Expected: the grep returns **no matches** (outside comments/this is fine if zero), and `tsc` exits 0.

- [ ] **Step 5: Run the auth tests and commit**

Run: `pnpm -C packages/auth test`
Expected: PASS (the Task 1 tests still pass).

```bash
pnpm dlx ultracite fix packages/auth/src/index.ts
git add packages/auth/src/index.ts
git commit -m "refactor(auth): remove dead organization plugin and duplicated invite templates"
```

---

## Task 3: Teams router foundation — slug/role helpers, `listMine`, registration

Creates the router file with pure helpers and the read path, and wires it into `appRouter` so the frontend can call it.

**Files:**
- Create: `packages/api/src/routers/domains/teams.ts`
- Create: `packages/api/src/routers/domains/teams.test.ts`
- Modify: `packages/api/src/routers/index.ts`

**Interfaces:**
- Consumes: `protectedProcedure` from `../../procedures.ts`; `context.db`, `context.session.user.id` from oRPC context.
- Produces:
  - `type TeamRole = "owner" | "admin" | "member"`
  - `generateTeamSlug(name: string, seed: string): string`
  - `canManageMembers(role: TeamRole | null): boolean`
  - `resolveTeamRole(db: DatabaseLike, teamId: string, userId: string): Promise<TeamRole | null>`
  - `listTeamsForUser(db: DatabaseLike, userId: string): Promise<TeamWithMembers[]>` where
    `type TeamWithMembers = { team: { id: string; name: string; slug: string }; myRole: TeamRole; members: { userId: string; name: string | null; email: string; role: TeamRole; joinedAt: Date }[]; pendingInvites: { id: string; email: string; role: TeamRole; expiresAt: Date; createdAt: Date }[] }`
  - `teamsRouter` with `listMine: protectedProcedure.handler(...)`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/domains/teams.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { canManageMembers, generateTeamSlug } from "./teams.ts";

describe("generateTeamSlug", () => {
	it("lowercases, replaces non-alphanumerics with dashes, and appends the seed", () => {
		expect(generateTeamSlug("Acme Corp!", "abcd1234")).toBe("acme-corp-abcd1234");
	});

	it("falls back to 'team' when the name has no usable characters", () => {
		expect(generateTeamSlug("!!!", "seed0001")).toBe("team-seed0001");
	});
});

describe("canManageMembers", () => {
	it("allows owner and admin, denies member and null", () => {
		expect(canManageMembers("owner")).toBe(true);
		expect(canManageMembers("admin")).toBe(true);
		expect(canManageMembers("member")).toBe(false);
		expect(canManageMembers(null)).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: FAIL — `Cannot find module "./teams.ts"`.

- [ ] **Step 3: Create `packages/api/src/routers/domains/teams.ts` foundation**

```typescript
import {
	teamInvitations,
	teamMembers,
	teams,
	users,
} from "@locnative/database";
import { and, eq, inArray } from "drizzle-orm";
import type { Context } from "../../context.ts";
import { protectedProcedure } from "../../procedures.ts";

type DatabaseLike = Context["db"];

export type TeamRole = "owner" | "admin" | "member";

const SLUG_SANITIZE_REGEX = /[^a-z0-9]+/g;
const SLUG_TRIM_REGEX = /^-+|-+$/g;

export function generateTeamSlug(name: string, seed: string): string {
	const base = name
		.toLowerCase()
		.replace(SLUG_SANITIZE_REGEX, "-")
		.replace(SLUG_TRIM_REGEX, "");
	return `${base || "team"}-${seed}`;
}

export function canManageMembers(role: TeamRole | null): boolean {
	return role === "owner" || role === "admin";
}

export async function resolveTeamRole(
	db: DatabaseLike,
	teamId: string,
	userId: string
): Promise<TeamRole | null> {
	const [row] = await db
		.select({ role: teamMembers.role })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
		.limit(1);
	return (row?.role as TeamRole | undefined) ?? null;
}

export type TeamMemberView = {
	userId: string;
	name: string | null;
	email: string;
	role: TeamRole;
	joinedAt: Date;
};

export type TeamInviteView = {
	id: string;
	email: string;
	role: TeamRole;
	expiresAt: Date;
	createdAt: Date;
};

export type TeamWithMembers = {
	team: { id: string; name: string; slug: string };
	myRole: TeamRole;
	members: TeamMemberView[];
	pendingInvites: TeamInviteView[];
};

export async function listTeamsForUser(
	db: DatabaseLike,
	userId: string
): Promise<TeamWithMembers[]> {
	const memberships = await db
		.select({
			teamId: teams.id,
			name: teams.name,
			slug: teams.slug,
			myRole: teamMembers.role,
		})
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(eq(teamMembers.userId, userId));

	const teamIds = memberships.map((m) => m.teamId);
	if (teamIds.length === 0) {
		return [];
	}

	const memberRows = await db
		.select({
			teamId: teamMembers.teamId,
			userId: teamMembers.userId,
			role: teamMembers.role,
			joinedAt: teamMembers.createdAt,
			name: users.name,
			email: users.email,
		})
		.from(teamMembers)
		.innerJoin(users, eq(users.id, teamMembers.userId))
		.where(inArray(teamMembers.teamId, teamIds));

	const inviteRows = await db
		.select({
			id: teamInvitations.id,
			teamId: teamInvitations.teamId,
			email: teamInvitations.email,
			role: teamInvitations.role,
			expiresAt: teamInvitations.expiresAt,
			createdAt: teamInvitations.createdAt,
		})
		.from(teamInvitations)
		.where(
			and(
				inArray(teamInvitations.teamId, teamIds),
				eq(teamInvitations.status, "pending")
			)
		);

	return memberships.map((m) => ({
		team: { id: m.teamId, name: m.name, slug: m.slug },
		myRole: m.myRole as TeamRole,
		members: memberRows
			.filter((r) => r.teamId === m.teamId)
			.map((r) => ({
				userId: r.userId,
				name: r.name,
				email: r.email,
				role: r.role as TeamRole,
				joinedAt: r.joinedAt,
			})),
		pendingInvites: inviteRows
			.filter((r) => r.teamId === m.teamId)
			.map((r) => ({
				id: r.id,
				email: r.email,
				role: r.role as TeamRole,
				expiresAt: r.expiresAt,
				createdAt: r.createdAt,
			})),
	}));
}

export const teamsRouter = {
	listMine: protectedProcedure.handler(async ({ context }) => {
		return await listTeamsForUser(context.db, context.session.user.id);
	}),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the router**

In `packages/api/src/routers/index.ts`, add the import and the `appRouter` entry (keep alphabetical-ish ordering consistent with the file):

```typescript
import { teamsRouter } from "./domains/teams.ts";
```

and inside `appRouter`:

```typescript
	teams: teamsRouter,
```

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm -C packages/api exec tsc --noEmit`
Expected: exits 0.

```bash
pnpm dlx ultracite fix packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts packages/api/src/routers/index.ts
git add packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts packages/api/src/routers/index.ts
git commit -m "feat(api): add teams router with listMine and role/slug helpers"
```

---

## Task 4: Team lifecycle — `create`, `rename`, `delete`

**Files:**
- Modify: `packages/api/src/routers/domains/teams.ts`
- Modify: `packages/api/src/routers/domains/teams.test.ts`

**Interfaces:**
- Consumes: `generateTeamSlug`, `resolveTeamRole`, `canManageMembers`, `TeamRole`, `DatabaseLike` from Task 3.
- Produces:
  - `createTeamForUser(db, args: { userId: string; name: string }): Promise<{ id: string; name: string; slug: string }>`
  - `renameTeam(db, args: { teamId: string; name: string }): Promise<{ id: string; name: string }>`
  - `deleteTeamForOwner(db, args: { teamId: string }): Promise<{ id: string }>` — throws `ORPCError("CONFLICT")` if the team owns any project.
  - Router procedures `create`, `rename`, `delete`.

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/routers/domains/teams.test.ts`:

```typescript
import { ORPCError } from "@orpc/server";
import { deleteTeamForOwner } from "./teams.ts";

function dbWithProjectCount(count: number) {
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve(count > 0 ? [{ id: "p1" }] : []),
				}),
			}),
		}),
		delete: () => ({ where: () => Promise.resolve() }),
	} as unknown as Parameters<typeof deleteTeamForOwner>[0];
}

describe("deleteTeamForOwner", () => {
	it("blocks deletion when the team still owns projects", async () => {
		await expect(
			deleteTeamForOwner(dbWithProjectCount(1), { teamId: "t1" })
		).rejects.toBeInstanceOf(ORPCError);
	});

	it("deletes the team when it owns no projects", async () => {
		const result = await deleteTeamForOwner(dbWithProjectCount(0), {
			teamId: "t1",
		});
		expect(result).toEqual({ id: "t1" });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: FAIL — `deleteTeamForOwner` is not exported.

- [ ] **Step 3: Implement the lifecycle functions and procedures**

Add to the top imports of `teams.ts`:

```typescript
import { ORPCError } from "@orpc/server";
import { projects } from "@locnative/database";
import { z } from "zod";
```

Add the pure functions (after `listTeamsForUser`):

```typescript
function randomSeed(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export async function createTeamForUser(
	db: DatabaseLike,
	{ userId, name }: { userId: string; name: string }
): Promise<{ id: string; name: string; slug: string }> {
	const trimmed = name.trim().replace(/\s+/g, " ");
	const [team] = await db
		.insert(teams)
		.values({ name: trimmed, slug: generateTeamSlug(trimmed, randomSeed()) })
		.returning({ id: teams.id, name: teams.name, slug: teams.slug });
	if (!team) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to create team.",
		});
	}
	await db.insert(teamMembers).values({ teamId: team.id, userId, role: "owner" });
	return team;
}

export async function renameTeam(
	db: DatabaseLike,
	{ teamId, name }: { teamId: string; name: string }
): Promise<{ id: string; name: string }> {
	const trimmed = name.trim().replace(/\s+/g, " ");
	const [row] = await db
		.update(teams)
		.set({ name: trimmed, updatedAt: new Date() })
		.where(eq(teams.id, teamId))
		.returning({ id: teams.id, name: teams.name });
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Team not found." });
	}
	return row;
}

export async function deleteTeamForOwner(
	db: DatabaseLike,
	{ teamId }: { teamId: string }
): Promise<{ id: string }> {
	const existingProjects = await db
		.select({ id: projects.id })
		.from(projects)
		.where(eq(projects.teamId, teamId))
		.limit(1);
	if (existingProjects.length > 0) {
		throw new ORPCError("CONFLICT", {
			message:
				"This team still owns projects. Move or delete them before deleting the team.",
		});
	}
	await db.delete(teams).where(eq(teams.id, teamId));
	return { id: teamId };
}
```

Add the procedures inside `teamsRouter` (a helper keeps gating DRY — add it above `teamsRouter`):

```typescript
async function requireManager(
	db: DatabaseLike,
	teamId: string,
	userId: string
): Promise<TeamRole> {
	const role = await resolveTeamRole(db, teamId, userId);
	if (!role) {
		throw new ORPCError("NOT_FOUND", { message: "Team not found." });
	}
	if (!canManageMembers(role)) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have permission to manage this team.",
		});
	}
	return role;
}
```

```typescript
	create: protectedProcedure
		.input(z.object({ name: z.string().trim().min(1).max(128) }))
		.handler(async ({ context, input }) => {
			return await createTeamForUser(context.db, {
				userId: context.session.user.id,
				name: input.name,
			});
		}),

	rename: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				name: z.string().trim().min(1).max(128),
			})
		)
		.handler(async ({ context, input }) => {
			await requireManager(context.db, input.teamId, context.session.user.id);
			return await renameTeam(context.db, {
				teamId: input.teamId,
				name: input.name,
			});
		}),

	delete: protectedProcedure
		.input(z.object({ teamId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const role = await resolveTeamRole(
				context.db,
				input.teamId,
				context.session.user.id
			);
			if (role !== "owner") {
				throw new ORPCError("FORBIDDEN", {
					message: "Only the team owner can delete a team.",
				});
			}
			return await deleteTeamForOwner(context.db, { teamId: input.teamId });
		}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm -C packages/api exec tsc --noEmit` → exits 0.

```bash
pnpm dlx ultracite fix packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts
git add packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts
git commit -m "feat(api): add team create/rename/delete with projects guard"
```

---

## Task 5: Invitations — `invite`, `resendInvite`, `revokeInvite`, `getInvite`

**Files:**
- Modify: `packages/api/src/routers/domains/teams.ts`
- Modify: `packages/api/src/routers/domains/teams.test.ts`

**Interfaces:**
- Consumes: Task 3/4 helpers; `sendInvitationEmail` from `@locnative/auth/invitations`.
- Produces:
  - `createInvitation(db, args: { teamId: string; email: string; role: TeamRole; invitedBy: string; now: Date }): Promise<{ id: string; email: string; role: TeamRole; expiresAt: Date }>` — throws `ORPCError("CONFLICT")` if the email is already a member or has a pending invite.
  - `getInvitationForLanding(db, args: { invitationId: string; now: Date }): Promise<{ teamName: string; invitedEmail: string; role: TeamRole; status: string; expired: boolean } | null>`
  - Router procedures `invite`, `resendInvite`, `revokeInvite`, `getInvite`.

- [ ] **Step 1: Write the failing test**

Append to `teams.test.ts`:

```typescript
import { createInvitation } from "./teams.ts";

const INVITE_NOW = new Date("2026-06-20T00:00:00Z");

function inviteDb(opts: { memberExists: boolean; pendingExists: boolean }) {
	let selectCall = 0;
	const inserted: Record<string, unknown>[] = [];
	const db = {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => ({
						limit: () =>
							Promise.resolve(opts.memberExists ? [{ id: "m1" }] : []),
					}),
				}),
				where: () => ({
					limit: () => {
						selectCall += 1;
						return Promise.resolve(opts.pendingExists ? [{ id: "i1" }] : []);
					},
				}),
			}),
		}),
		insert: () => ({
			values: (v: Record<string, unknown>) => ({
				returning: () => {
					inserted.push(v);
					return Promise.resolve([
						{
							id: "new-invite",
							email: v.email,
							role: v.role,
							expiresAt: v.expiresAt,
						},
					]);
				},
			}),
		}),
	} as unknown as Parameters<typeof createInvitation>[0];
	return { db, inserted, selectCall: () => selectCall };
}

describe("createInvitation", () => {
	it("rejects when the email is already a member", async () => {
		const { db } = inviteDb({ memberExists: true, pendingExists: false });
		await expect(
			createInvitation(db, {
				teamId: "t1",
				email: "joe@example.com",
				role: "member",
				invitedBy: "owner1",
				now: INVITE_NOW,
			})
		).rejects.toBeInstanceOf(ORPCError);
	});

	it("rejects when a pending invite already exists", async () => {
		const { db } = inviteDb({ memberExists: false, pendingExists: true });
		await expect(
			createInvitation(db, {
				teamId: "t1",
				email: "joe@example.com",
				role: "member",
				invitedBy: "owner1",
				now: INVITE_NOW,
			})
		).rejects.toBeInstanceOf(ORPCError);
	});

	it("inserts a pending invite expiring 72h from now", async () => {
		const { db, inserted } = inviteDb({
			memberExists: false,
			pendingExists: false,
		});
		const result = await createInvitation(db, {
			teamId: "t1",
			email: "Joe@Example.com",
			role: "member",
			invitedBy: "owner1",
			now: INVITE_NOW,
		});
		expect(result.id).toBe("new-invite");
		expect(inserted[0].email).toBe("joe@example.com");
		expect(inserted[0].status).toBe("pending");
		const expiresAt = inserted[0].expiresAt as Date;
		expect(expiresAt.getTime() - INVITE_NOW.getTime()).toBe(72 * 60 * 60 * 1000);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: FAIL — `createInvitation` not exported.

- [ ] **Step 3: Implement invitation logic + procedures**

Add to imports in `teams.ts`:

```typescript
import { sendInvitationEmail } from "@locnative/auth/invitations";
```

Add constants + functions:

```typescript
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const inviteRoleSchema = z.enum(["admin", "member"]);

export async function createInvitation(
	db: DatabaseLike,
	{
		teamId,
		email,
		role,
		invitedBy,
		now,
	}: {
		teamId: string;
		email: string;
		role: TeamRole;
		invitedBy: string;
		now: Date;
	}
): Promise<{ id: string; email: string; role: TeamRole; expiresAt: Date }> {
	const normalizedEmail = email.trim().toLowerCase();

	const existingMember = await db
		.select({ id: teamMembers.id })
		.from(teamMembers)
		.innerJoin(users, eq(users.id, teamMembers.userId))
		.where(and(eq(teamMembers.teamId, teamId), eq(users.email, normalizedEmail)))
		.limit(1);
	if (existingMember.length > 0) {
		throw new ORPCError("CONFLICT", {
			message: "That person is already a member of this team.",
		});
	}

	const existingInvite = await db
		.select({ id: teamInvitations.id })
		.from(teamInvitations)
		.where(
			and(
				eq(teamInvitations.teamId, teamId),
				eq(teamInvitations.email, normalizedEmail),
				eq(teamInvitations.status, "pending")
			)
		)
		.limit(1);
	if (existingInvite.length > 0) {
		throw new ORPCError("CONFLICT", {
			message: "An invitation for that email is already pending.",
		});
	}

	const [invite] = await db
		.insert(teamInvitations)
		.values({
			teamId,
			email: normalizedEmail,
			role,
			invitedBy,
			status: "pending",
			expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
		})
		.returning({
			id: teamInvitations.id,
			email: teamInvitations.email,
			role: teamInvitations.role,
			expiresAt: teamInvitations.expiresAt,
		});
	if (!invite) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to create invitation.",
		});
	}
	return { ...invite, role: invite.role as TeamRole };
}

export async function getInvitationForLanding(
	db: DatabaseLike,
	{ invitationId, now }: { invitationId: string; now: Date }
): Promise<{
	teamName: string;
	invitedEmail: string;
	role: TeamRole;
	status: string;
	expired: boolean;
} | null> {
	const [row] = await db
		.select({
			email: teamInvitations.email,
			role: teamInvitations.role,
			status: teamInvitations.status,
			expiresAt: teamInvitations.expiresAt,
			teamName: teams.name,
		})
		.from(teamInvitations)
		.innerJoin(teams, eq(teams.id, teamInvitations.teamId))
		.where(eq(teamInvitations.id, invitationId))
		.limit(1);
	if (!row) {
		return null;
	}
	return {
		teamName: row.teamName,
		invitedEmail: row.email,
		role: row.role as TeamRole,
		status: row.status,
		expired: row.expiresAt.getTime() < now.getTime(),
	};
}
```

Add procedures inside `teamsRouter`. `invite` sends the email after the row is created; a send failure should surface so the UI can prompt "Resend," but must not duplicate the row:

```typescript
	invite: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				email: z.string().trim().email(),
				role: inviteRoleSchema,
			})
		)
		.handler(async ({ context, input }) => {
			await requireManager(context.db, input.teamId, context.session.user.id);
			const invite = await createInvitation(context.db, {
				teamId: input.teamId,
				email: input.email,
				role: input.role,
				invitedBy: context.session.user.id,
				now: new Date(),
			});
			const [team] = await context.db
				.select({ name: teams.name })
				.from(teams)
				.where(eq(teams.id, input.teamId))
				.limit(1);
			await sendInvitationEmail({
				to: invite.email,
				teamName: team?.name ?? "your team",
				inviterName: context.session.user.name ?? context.session.user.email,
				inviterEmail: context.session.user.email,
				invitationId: invite.id,
			});
			return invite;
		}),

	resendInvite: protectedProcedure
		.input(z.object({ invitationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const [invite] = await context.db
				.select({
					id: teamInvitations.id,
					teamId: teamInvitations.teamId,
					email: teamInvitations.email,
					status: teamInvitations.status,
				})
				.from(teamInvitations)
				.where(eq(teamInvitations.id, input.invitationId))
				.limit(1);
			if (!invite || invite.status !== "pending") {
				throw new ORPCError("NOT_FOUND", {
					message: "No pending invitation found.",
				});
			}
			await requireManager(context.db, invite.teamId, context.session.user.id);
			await context.db
				.update(teamInvitations)
				.set({ expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
				.where(eq(teamInvitations.id, invite.id));
			const [team] = await context.db
				.select({ name: teams.name })
				.from(teams)
				.where(eq(teams.id, invite.teamId))
				.limit(1);
			await sendInvitationEmail({
				to: invite.email,
				teamName: team?.name ?? "your team",
				inviterName: context.session.user.name ?? context.session.user.email,
				inviterEmail: context.session.user.email,
				invitationId: invite.id,
			});
			return { id: invite.id };
		}),

	revokeInvite: protectedProcedure
		.input(z.object({ invitationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const [invite] = await context.db
				.select({
					id: teamInvitations.id,
					teamId: teamInvitations.teamId,
				})
				.from(teamInvitations)
				.where(eq(teamInvitations.id, input.invitationId))
				.limit(1);
			if (!invite) {
				throw new ORPCError("NOT_FOUND", { message: "Invitation not found." });
			}
			await requireManager(context.db, invite.teamId, context.session.user.id);
			await context.db
				.update(teamInvitations)
				.set({ status: "revoked" })
				.where(eq(teamInvitations.id, invite.id));
			return { id: invite.id };
		}),

	getInvite: publicProcedure
		.input(z.object({ invitationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			return await getInvitationForLanding(context.db, {
				invitationId: input.invitationId,
				now: new Date(),
			});
		}),
```

Add `publicProcedure` to the procedures import:

```typescript
import { protectedProcedure, publicProcedure } from "../../procedures.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm -C packages/api exec tsc --noEmit` → exits 0.

```bash
pnpm dlx ultracite fix packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts
git add packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts
git commit -m "feat(api): add team invitations (invite/resend/revoke/getInvite) with Resend"
```

---

## Task 6: Membership — `acceptInvite`, `changeRole`, `removeMember`, `leave`

**Files:**
- Modify: `packages/api/src/routers/domains/teams.ts`
- Modify: `packages/api/src/routers/domains/teams.test.ts`

**Interfaces:**
- Consumes: Task 3–5 helpers.
- Produces:
  - `acceptInvitation(db, args: { invitationId: string; userId: string; userEmail: string; now: Date }): Promise<{ teamId: string }>` — throws on missing/non-pending (`NOT_FOUND`), expired (`CONFLICT`), email mismatch (`FORBIDDEN`).
  - `countOwners(db, teamId: string): Promise<number>`
  - `changeMemberRole(db, args: { teamId: string; targetUserId: string; role: TeamRole }): Promise<{ userId: string; role: TeamRole }>` — blocks demoting the last owner.
  - `removeTeamMember(db, args: { teamId: string; targetUserId: string }): Promise<{ userId: string }>` — blocks removing the last owner.
  - Router procedures `acceptInvite`, `changeRole`, `removeMember`, `leave`.

- [ ] **Step 1: Write the failing test**

Append to `teams.test.ts`:

```typescript
import { acceptInvitation, changeMemberRole } from "./teams.ts";

function acceptDb(invite: {
	email: string;
	status: string;
	expiresAt: Date;
	teamId: string;
} | null) {
	const inserted: Record<string, unknown>[] = [];
	const updated: Record<string, unknown>[] = [];
	const db = {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve(invite ? [invite] : []),
				}),
			}),
		}),
		insert: () => ({
			values: (v: Record<string, unknown>) => ({
				onConflictDoNothing: () => {
					inserted.push(v);
					return Promise.resolve();
				},
			}),
		}),
		update: () => ({
			set: (v: Record<string, unknown>) => ({
				where: () => {
					updated.push(v);
					return Promise.resolve();
				},
			}),
		}),
	} as unknown as Parameters<typeof acceptInvitation>[0];
	return { db, inserted, updated };
}

const ACCEPT_NOW = new Date("2026-06-20T00:00:00Z");
const FUTURE = new Date("2026-06-22T00:00:00Z");
const PAST = new Date("2026-06-19T00:00:00Z");

describe("acceptInvitation", () => {
	it("rejects when the signed-in email does not match the invite", async () => {
		const { db } = acceptDb({
			email: "joe@example.com",
			status: "pending",
			expiresAt: FUTURE,
			teamId: "t1",
		});
		await expect(
			acceptInvitation(db, {
				invitationId: "i1",
				userId: "u1",
				userEmail: "someone-else@example.com",
				now: ACCEPT_NOW,
			})
		).rejects.toBeInstanceOf(ORPCError);
	});

	it("rejects an expired invitation", async () => {
		const { db } = acceptDb({
			email: "joe@example.com",
			status: "pending",
			expiresAt: PAST,
			teamId: "t1",
		});
		await expect(
			acceptInvitation(db, {
				invitationId: "i1",
				userId: "u1",
				userEmail: "joe@example.com",
				now: ACCEPT_NOW,
			})
		).rejects.toBeInstanceOf(ORPCError);
	});

	it("adds the member and marks the invite accepted on success", async () => {
		const { db, inserted, updated } = acceptDb({
			email: "joe@example.com",
			status: "pending",
			expiresAt: FUTURE,
			teamId: "t1",
		});
		const result = await acceptInvitation(db, {
			invitationId: "i1",
			userId: "u1",
			userEmail: "Joe@Example.com",
			now: ACCEPT_NOW,
		});
		expect(result).toEqual({ teamId: "t1" });
		expect(inserted[0]).toMatchObject({ teamId: "t1", userId: "u1" });
		expect(updated[0]).toMatchObject({ status: "accepted" });
	});
});

function ownerCountDb(ownerCount: number) {
	return {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve([{ count: ownerCount }]),
			}),
		}),
		update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
	} as unknown as Parameters<typeof changeMemberRole>[0];
}

describe("changeMemberRole", () => {
	it("blocks demoting the last owner", async () => {
		await expect(
			changeMemberRole(ownerCountDb(1), {
				teamId: "t1",
				targetUserId: "u1",
				role: "member",
			})
		).rejects.toBeInstanceOf(ORPCError);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: FAIL — `acceptInvitation` / `changeMemberRole` not exported.

- [ ] **Step 3: Implement membership logic + procedures**

Add `count` + `ne`/`sql` imports to the drizzle import in `teams.ts`:

```typescript
import { and, count, eq, inArray, ne } from "drizzle-orm";
```

Add functions:

```typescript
export async function countOwners(
	db: DatabaseLike,
	teamId: string
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "owner")));
	return Number(row?.count ?? 0);
}

export async function acceptInvitation(
	db: DatabaseLike,
	{
		invitationId,
		userId,
		userEmail,
		now,
	}: { invitationId: string; userId: string; userEmail: string; now: Date }
): Promise<{ teamId: string }> {
	const [invite] = await db
		.select({
			email: teamInvitations.email,
			status: teamInvitations.status,
			expiresAt: teamInvitations.expiresAt,
			teamId: teamInvitations.teamId,
			role: teamInvitations.role,
		})
		.from(teamInvitations)
		.where(eq(teamInvitations.id, invitationId))
		.limit(1);

	if (!invite || invite.status !== "pending") {
		throw new ORPCError("NOT_FOUND", {
			message: "This invitation is no longer valid.",
		});
	}
	if (invite.expiresAt.getTime() < now.getTime()) {
		throw new ORPCError("CONFLICT", { message: "This invitation has expired." });
	}
	if (invite.email.toLowerCase() !== userEmail.trim().toLowerCase()) {
		throw new ORPCError("FORBIDDEN", {
			message: `This invitation was sent to ${invite.email}.`,
		});
	}

	await db
		.insert(teamMembers)
		.values({ teamId: invite.teamId, userId, role: invite.role })
		.onConflictDoNothing();
	await db
		.update(teamInvitations)
		.set({ status: "accepted" })
		.where(eq(teamInvitations.id, invitationId));

	return { teamId: invite.teamId };
}

export async function changeMemberRole(
	db: DatabaseLike,
	{
		teamId,
		targetUserId,
		role,
	}: { teamId: string; targetUserId: string; role: TeamRole }
): Promise<{ userId: string; role: TeamRole }> {
	if (role !== "owner" && (await countOwners(db, teamId)) <= 1) {
		const [current] = await db
			.select({ role: teamMembers.role })
			.from(teamMembers)
			.where(
				and(
					eq(teamMembers.teamId, teamId),
					eq(teamMembers.userId, targetUserId)
				)
			)
			.limit(1);
		if (current?.role === "owner") {
			throw new ORPCError("CONFLICT", {
				message: "A team must keep at least one owner.",
			});
		}
	}
	await db
		.update(teamMembers)
		.set({ role })
		.where(
			and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
		);
	return { userId: targetUserId, role };
}

export async function removeTeamMember(
	db: DatabaseLike,
	{ teamId, targetUserId }: { teamId: string; targetUserId: string }
): Promise<{ userId: string }> {
	const [current] = await db
		.select({ role: teamMembers.role })
		.from(teamMembers)
		.where(
			and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
		)
		.limit(1);
	if (!current) {
		throw new ORPCError("NOT_FOUND", { message: "Member not found." });
	}
	if (current.role === "owner" && (await countOwners(db, teamId)) <= 1) {
		throw new ORPCError("CONFLICT", {
			message: "A team must keep at least one owner.",
		});
	}
	await db
		.delete(teamMembers)
		.where(
			and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
		);
	return { userId: targetUserId };
}
```

> The `changeMemberRole` test path that throws never reaches the `update`, so the simplified `ownerCountDb` mock (which returns the count first) exercises the guard. The success path is covered by the end-to-end verification in Task 7.

Add procedures inside `teamsRouter`:

```typescript
	acceptInvite: protectedProcedure
		.input(z.object({ invitationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			return await acceptInvitation(context.db, {
				invitationId: input.invitationId,
				userId: context.session.user.id,
				userEmail: context.session.user.email,
				now: new Date(),
			});
		}),

	changeRole: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				userId: z.string(),
				role: z.enum(["owner", "admin", "member"]),
			})
		)
		.handler(async ({ context, input }) => {
			await requireManager(context.db, input.teamId, context.session.user.id);
			return await changeMemberRole(context.db, {
				teamId: input.teamId,
				targetUserId: input.userId,
				role: input.role,
			});
		}),

	removeMember: protectedProcedure
		.input(z.object({ teamId: z.string().uuid(), userId: z.string() }))
		.handler(async ({ context, input }) => {
			await requireManager(context.db, input.teamId, context.session.user.id);
			return await removeTeamMember(context.db, {
				teamId: input.teamId,
				targetUserId: input.userId,
			});
		}),

	leave: protectedProcedure
		.input(z.object({ teamId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const role = await resolveTeamRole(
				context.db,
				input.teamId,
				context.session.user.id
			);
			if (!role) {
				throw new ORPCError("NOT_FOUND", { message: "Team not found." });
			}
			return await removeTeamMember(context.db, {
				teamId: input.teamId,
				targetUserId: context.session.user.id,
			});
		}),
```

> `ne` is imported for forward use; if Biome flags it as unused after this task, remove it from the import. (It is referenced by neither helper here — drop it to keep the lint clean: import only `and, count, eq, inArray`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/api exec vitest run src/routers/domains/teams.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Full API test run, typecheck, commit**

Run: `pnpm -C packages/api test` → all green.
Run: `pnpm -C packages/api exec tsc --noEmit` → exits 0.

```bash
pnpm dlx ultracite fix packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts
git add packages/api/src/routers/domains/teams.ts packages/api/src/routers/domains/teams.test.ts
git commit -m "feat(api): add accept/changeRole/removeMember/leave with last-owner guards"
```

---

## Task 7: Rewrite the `/team` route UI

Replace the mock with real data: one `teams.listMine` call rendering each team as a section, with invite/manage dialogs. Mirrors the data + mutation pattern in `apps/web/src/routes/_protected/api-keys.tsx` (direct `orpcClient` calls + `useState`/`useEffect`/`useCallback` + `sonner` toasts).

**Files:**
- Modify: `apps/web/src/routes/_protected/team.tsx` (full rewrite)

**Interfaces:**
- Consumes: `orpcClient.teams.listMine | create | rename | delete | invite | resendInvite | revokeInvite | changeRole | removeMember | leave` from Task 3–6.

- [ ] **Step 1: Replace the file contents**

Write `apps/web/src/routes/_protected/team.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@locnative/ui/components/avatar";
import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { MailIcon, ShieldIcon, UserPlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/team")({
	component: RouteComponent,
});

type TeamList = Awaited<ReturnType<typeof orpcClient.teams.listMine>>;
type TeamEntry = TeamList[number];

function initialsOf(nameOrEmail: string): string {
	return nameOrEmail
		.split(/[\s@.]+/)
		.filter(Boolean)
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
	if (role === "owner" || role === "admin") {
		return "default";
	}
	if (role === "member") {
		return "secondary";
	}
	return "outline";
}

function InviteDialog({
	teamId,
	onDone,
}: {
	teamId: string;
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [submitting, setSubmitting] = useState(false);

	const submit = async () => {
		setSubmitting(true);
		try {
			await orpcClient.teams.invite({ teamId, email: email.trim(), role });
			toast.success(`Invitation sent to ${email.trim()}`);
			setEmail("");
			setRole("member");
			setOpen(false);
			onDone();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not send invitation"
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button size="sm">
						<UserPlusIcon className="size-4" />
						Invite member
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite a team member</DialogTitle>
					<DialogDescription>
						They'll get an email with a link to join. The invite expires in 72
						hours.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="invite-email">Email</Label>
						<Input
							id="invite-email"
							onChange={(e) => setEmail(e.target.value)}
							placeholder="teammate@example.com"
							type="email"
							value={email}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="invite-role">Role</Label>
						<Select
							onValueChange={(v) => setRole(v as "member" | "admin")}
							value={role}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">Member</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={submitting || email.trim().length === 0}
						onClick={submit}
					>
						{submitting ? "Sending…" : "Send invite"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CreateTeamDialog({ onDone }: { onDone: () => void }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const submit = async () => {
		setSubmitting(true);
		try {
			await orpcClient.teams.create({ name: name.trim() });
			toast.success(`Created ${name.trim()}`);
			setName("");
			setOpen(false);
			onDone();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not create team");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button variant="outline">Create team</Button>} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create a team</DialogTitle>
					<DialogDescription>
						Teams let you share projects and API keys with others.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="team-name">Team name</Label>
					<Input
						id="team-name"
						onChange={(e) => setName(e.target.value)}
						placeholder="Acme Inc."
						value={name}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={submitting || name.trim().length === 0}
						onClick={submit}
					>
						{submitting ? "Creating…" : "Create team"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function TeamSection({
	entry,
	currentUserId,
	onChanged,
}: {
	entry: TeamEntry;
	currentUserId: string | undefined;
	onChanged: () => void;
}) {
	const canManage = entry.myRole === "owner" || entry.myRole === "admin";

	const removeMember = async (userId: string) => {
		try {
			await orpcClient.teams.removeMember({ teamId: entry.team.id, userId });
			toast.success("Member removed");
			onChanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not remove member");
		}
	};

	const revokeInvite = async (invitationId: string) => {
		try {
			await orpcClient.teams.revokeInvite({ invitationId });
			toast.success("Invitation revoked");
			onChanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not revoke invite");
		}
	};

	const resendInvite = async (invitationId: string) => {
		try {
			await orpcClient.teams.resendInvite({ invitationId });
			toast.success("Invitation resent");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not resend invite");
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle className="flex items-center gap-2">
							<ShieldIcon className="size-5" />
							{entry.team.name}
						</CardTitle>
						<CardDescription>
							{entry.members.length} member
							{entry.members.length === 1 ? "" : "s"} · you are{" "}
							{entry.myRole}
						</CardDescription>
					</div>
					{canManage && (
						<InviteDialog onDone={onChanged} teamId={entry.team.id} />
					)}
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<div className="divide-y">
					{entry.members.map((member) => {
						const display = member.name ?? member.email;
						const isSelf = member.userId === currentUserId;
						return (
							<div
								className="flex items-center justify-between py-3 first:pt-0"
								key={member.userId}
							>
								<div className="flex items-center gap-3">
									<Avatar className="size-9">
										<AvatarFallback className="text-xs">
											{initialsOf(display)}
										</AvatarFallback>
									</Avatar>
									<div>
										<p className="font-medium text-sm">
											{display}
											{isSelf && (
												<span className="ml-1.5 text-muted-foreground text-xs">
													(you)
												</span>
											)}
										</p>
										<p className="text-muted-foreground text-xs">
											{member.email}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-3">
									<Badge variant={roleBadgeVariant(member.role)}>
										{member.role}
									</Badge>
									{canManage && !isSelf && (
										<Button
											onClick={() => removeMember(member.userId)}
											size="sm"
											variant="ghost"
										>
											Remove
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>

				{entry.pendingInvites.length > 0 && (
					<div className="flex flex-col gap-2">
						<p className="flex items-center gap-2 font-medium text-sm">
							<MailIcon className="size-4" />
							Pending invitations
						</p>
						{entry.pendingInvites.map((invite) => (
							<div
								className="flex items-center justify-between rounded-md border px-4 py-3"
								key={invite.id}
							>
								<div>
									<p className="font-medium text-sm">{invite.email}</p>
									<p className="text-muted-foreground text-xs">
										Invited as {invite.role}
									</p>
								</div>
								{canManage && (
									<div className="flex gap-2">
										<Button
											onClick={() => resendInvite(invite.id)}
											size="sm"
											variant="outline"
										>
											Resend
										</Button>
										<Button
											onClick={() => revokeInvite(invite.id)}
											size="sm"
											variant="ghost"
										>
											Revoke
										</Button>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function RouteComponent() {
	const { data: session } = useSession();
	const [teams, setTeams] = useState<TeamList>([]);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		try {
			const result = await orpcClient.teams.listMine();
			setTeams(result);
		} catch {
			toast.error("Could not load your teams");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">Teams</h1>
					<p className="text-muted-foreground text-sm">
						Manage your teams, members, and invitations
					</p>
				</div>
				<CreateTeamDialog onDone={load} />
			</div>

			{loading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			) : (
				teams.map((entry) => (
					<TeamSection
						currentUserId={session?.user?.id}
						entry={entry}
						key={entry.team.id}
						onChanged={load}
					/>
				))
			)}
		</div>
	);
}
```

> The `Select`, `Dialog`, etc. imports must match the UI package's actual export paths. If `@locnative/ui/components/select` does not exist, check `packages/ui/src/components/` and adjust the import (the project uses Base UI-wrapped shadcn primitives). `DialogTrigger`'s `render` prop pattern follows the existing usage in `api-keys.tsx` — if that file uses `asChild` instead, match it.

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: exits 0. (Fix any UI import-path mismatches flagged here against `packages/ui/src/components/`.)

- [ ] **Step 3: Manual verification**

Run the app (`pnpm dev`), sign in, open `/team`. Expected:
- Your auto-created Personal team renders as a section with you listed as `owner`.
- "Create team" creates a new section.
- "Invite member" (visible only as owner/admin) sends an email and adds a Pending Invitation row; re-inviting the same email shows the dedupe error toast.
- "Remove" on a member (not yourself) removes them; trying to leave yourself as the sole owner shows the last-owner error.

- [ ] **Step 4: Commit**

```bash
pnpm dlx ultracite fix apps/web/src/routes/_protected/team.tsx
git add apps/web/src/routes/_protected/team.tsx
git commit -m "feat(web): real team route with members, invites, and management"
```

---

## Task 8: Invite acceptance route `/invite/$id`

**Files:**
- Create: `apps/web/src/routes/invite.$id.tsx`

**Interfaces:**
- Consumes: `orpcClient.teams.getInvite | acceptInvite` from Task 5/6; `useSession`, `signOut` from `@/lib/auth-client`.

- [ ] **Step 1: Create the route**

Write `apps/web/src/routes/invite.$id.tsx`:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { signOut, useSession } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/invite/$id")({
	component: RouteComponent,
});

type Invite = Awaited<ReturnType<typeof orpcClient.teams.getInvite>>;

function RouteComponent() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { data: session, isPending: sessionPending } = useSession();
	const [invite, setInvite] = useState<Invite>(null);
	const [loading, setLoading] = useState(true);
	const [accepting, setAccepting] = useState(false);

	const load = useCallback(async () => {
		try {
			const result = await orpcClient.teams.getInvite({ invitationId: id });
			setInvite(result);
		} catch {
			setInvite(null);
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		void load();
	}, [load]);

	const accept = async () => {
		setAccepting(true);
		try {
			await orpcClient.teams.acceptInvite({ invitationId: id });
			toast.success("You've joined the team");
			await navigate({ to: "/team" });
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not accept invitation"
			);
		} finally {
			setAccepting(false);
		}
	};

	if (loading || sessionPending) {
		return (
			<div className="mx-auto max-w-md p-6">
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	if (!invite || invite.status !== "pending" || invite.expired) {
		const reason = !invite
			? "This invitation could not be found."
			: invite.expired
				? "This invitation has expired."
				: invite.status === "accepted"
					? "This invitation has already been accepted."
					: "This invitation is no longer active.";
		return (
			<InviteShell title="Invitation unavailable" description={reason}>
				<Button render={<Link to="/team">Go to your teams</Link>} />
			</InviteShell>
		);
	}

	const sessionEmail = session?.user?.email;
	const emailMatches =
		sessionEmail?.toLowerCase() === invite.invitedEmail.toLowerCase();

	if (!session) {
		return (
			<InviteShell
				description={`You've been invited to join ${invite.teamName} as ${invite.role}. Sign in as ${invite.invitedEmail} to accept.`}
				title={`Join ${invite.teamName}`}
			>
				<Button
					render={
						<Link
							search={{ redirect: `/invite/${id}` }}
							to="/sign-in"
						>
							Sign in to accept
						</Link>
					}
				/>
			</InviteShell>
		);
	}

	if (!emailMatches) {
		return (
			<InviteShell
				description={`This invitation is for ${invite.invitedEmail}, but you're signed in as ${sessionEmail}. Sign out and sign in with the invited address.`}
				title="Wrong account"
			>
				<Button onClick={() => signOut()} variant="outline">
					Sign out
				</Button>
			</InviteShell>
		);
	}

	return (
		<InviteShell
			description={`You've been invited to join ${invite.teamName} as ${invite.role}.`}
			title={`Join ${invite.teamName}`}
		>
			<Button disabled={accepting} onClick={accept}>
				{accepting ? "Joining…" : `Join ${invite.teamName}`}
			</Button>
		</InviteShell>
	);
}

function InviteShell({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mx-auto flex min-h-svh max-w-md items-center p-6">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent>{children}</CardContent>
			</Card>
		</div>
	);
}
```

> Verify the sign-in route path and its `search`/redirect contract against the existing `apps/web/src/routes` auth pages — adjust `to="/sign-in"` and the `search` shape to whatever the project's sign-in route accepts. If the sign-in route doesn't support a `redirect` search param, drop `search` and just link to it.

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: exits 0 (after the generated route tree picks up the new file — restart the dev server / let the router plugin regenerate `routeTree.gen.ts` if needed).

- [ ] **Step 3: Manual verification (end-to-end)**

1. As an owner, invite `you+test@yourdomain` to a team.
2. Open the emailed link in a private window → prompted to sign in as the invited email.
3. Sign up/in with that email → "Join <team>" → Accept → lands on `/team` as a member.
4. Open the same link signed in as a different account → "Wrong account" message.
5. Let an invite expire (or revoke it) → "Invitation unavailable."

- [ ] **Step 4: Commit**

```bash
pnpm dlx ultracite fix apps/web/src/routes/invite.\$id.tsx
git add apps/web/src/routes/invite.\$id.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add /invite/:id email-bound acceptance route"
```

---

## Setup Required Before Invites Send (ops)

These are environment prerequisites, not code tasks — confirm before the end-to-end verification in Tasks 7–8:

- `RESEND_API_KEY` and `EMAIL_FROM` (a Resend-verified sender) must be set as `apps/server` Wrangler secrets and in local `.env`.
- `WEB_BASE_URL` must point at the web origin so invite links resolve.

---

## Self-Review

**Spec coverage:**
- Custom-tables + oRPC engine → Tasks 3–6. ✅
- Remove org plugin / reuse email helpers → Tasks 1–2. ✅
- No global active team; teams as sections → Task 7. ✅
- Roles owner/admin/member + gating → `requireManager`/`resolveTeamRole` across Tasks 3–6, UI gating Task 7. ✅
- Invite bound to email → `acceptInvitation` mismatch guard (Task 6) + UI (Task 8). ✅
- Guards: last-owner (Task 6), dedupe (Task 5), 72h expiry (Tasks 5/6), members can leave (Task 6 `leave`). ✅
- `/team` rewrite (Task 7) and `/invite/$id` (Task 8). ✅
- Deferred items (scoped keys, encryption, api-key-auth membership check) intentionally excluded. ✅

**Placeholder scan:** No TBD/TODO; all code steps include full code and concrete commands. ✅

**Type consistency:** `TeamRole`, `TeamWithMembers`/`TeamEntry`, `resolveTeamRole`, `requireManager`, `createInvitation`, `acceptInvitation`, `changeMemberRole`, `removeTeamMember`, `getInvitationForLanding` names are used consistently across tasks and match the router procedure call sites consumed by the frontend (`orpcClient.teams.*`). ✅

**Known verification-time risks (flagged inline):** UI component import paths (`select`, `Dialog` `render` vs `asChild`), the sign-in route's redirect-search contract, and whether `context.session.user` exposes `name` — each has an inline note telling the implementer what to check against the existing codebase.
```
