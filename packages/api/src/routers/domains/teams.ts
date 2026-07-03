import { sendInvitationEmail } from "@locnative/auth/invitations";
import {
	projects,
	teamInvitations,
	teamMembers,
	teams,
	users,
} from "@locnative/database";
import { ORPCError } from "@orpc/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../../context.ts";
import { protectedProcedure, publicProcedure } from "../../procedures.ts";

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

export function canAssignRole(
	callerRole: TeamRole,
	targetCurrentRole: TeamRole | null,
	newRole: TeamRole
): boolean {
	if (callerRole === "owner") {
		return true;
	}
	if (callerRole !== "admin") {
		return false;
	}
	// admins cannot grant owner or modify an owner
	return newRole !== "owner" && targetCurrentRole !== "owner";
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

export interface TeamMemberView {
	email: string;
	joinedAt: Date;
	name: string | null;
	role: TeamRole;
	userId: string;
}

export interface TeamInviteView {
	createdAt: Date;
	email: string;
	expiresAt: Date;
	id: string;
	role: TeamRole;
}

export interface TeamWithMembers {
	members: TeamMemberView[];
	myRole: TeamRole;
	pendingInvites: TeamInviteView[];
	team: { id: string; name: string; slug: string };
}

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
	await db
		.insert(teamMembers)
		.values({ teamId: team.id, userId, role: "owner" });
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
		.where(
			and(eq(teamMembers.teamId, teamId), eq(users.email, normalizedEmail))
		)
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
		throw new ORPCError("CONFLICT", {
			message: "This invitation has expired.",
		});
	}
	if (invite.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
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

export const teamsRouter = {
	listMine: protectedProcedure.handler(async ({ context }) => {
		return await listTeamsForUser(context.db, context.session.user.id);
	}),

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
			const callerRole = await requireManager(
				context.db,
				input.teamId,
				context.session.user.id
			);
			if (callerRole !== "owner") {
				const targetRole = await resolveTeamRole(
					context.db,
					input.teamId,
					input.userId
				);
				if (!canAssignRole(callerRole, targetRole, input.role)) {
					throw new ORPCError("FORBIDDEN", {
						message:
							input.role === "owner"
								? "Only an owner can grant the owner role."
								: "Only an owner can change an owner's role.",
					});
				}
			}
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
			return await removeTeamMember(context.db, {
				teamId: input.teamId,
				targetUserId: context.session.user.id,
			});
		}),
};
