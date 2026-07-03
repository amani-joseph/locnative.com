import { apiKeys, projects } from "@locnative/database";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";
import { decryptSecret } from "../../secret-crypto.ts";
import {
	createApiKeyRecord,
	listActiveApiKeyRowsForUser,
	serializeApiKey,
} from "./api-keys-shared.ts";

const createApiKeyInputSchema = z.object({
	name: z.string().min(1).max(128),
});

const revokeApiKeyInputSchema = z.object({
	id: z.string().uuid(),
});

const revealApiKeyInputSchema = z.object({
	id: z.string().uuid(),
});

export const apiKeysRouter = {
	list: protectedProcedure.handler(async ({ context }) => {
		const authUserId = context.session.user.id;
		const rows = await listActiveApiKeyRowsForUser(context.db, authUserId);
		const assignedProjectIds = rows
			.map((row) => row.projectId)
			.filter((projectId): projectId is string => Boolean(projectId));
		const assignedProjects =
			assignedProjectIds.length > 0
				? await context.db
						.select({
							id: projects.id,
							name: projects.name,
						})
						.from(projects)
						.where(eq(projects.userId, authUserId))
				: [];
		const projectNameById = new Map(
			assignedProjects.map((project) => [project.id, project.name])
		);

		return rows.map((row) =>
			serializeApiKey(
				row,
				row.projectId ? (projectNameById.get(row.projectId) ?? null) : null
			)
		);
	}),
	create: protectedProcedure
		.input(createApiKeyInputSchema)
		.handler(async ({ context, input }) => {
			const authUserId = context.session.user.id;
			return await createApiKeyRecord(context.db, {
				userId: authUserId,
				name: input.name,
				projectId: null,
			});
		}),
	reveal: protectedProcedure
		.input(revealApiKeyInputSchema)
		.handler(async ({ context, input }): Promise<{ key: string | null }> => {
			const authUserId = context.session.user.id;
			const [row] = await context.db
				.select({ secretCiphertext: apiKeys.secretCiphertext })
				.from(apiKeys)
				.where(
					and(
						eq(apiKeys.id, input.id),
						eq(apiKeys.userId, authUserId),
						isNull(apiKeys.revokedAt)
					)
				)
				.limit(1);

			if (!row) {
				throw new Error("API key not found or revoked");
			}
			// Keys created before encryption-at-rest have no ciphertext and are not
			// recoverable; signal that to the client so it can prompt a rotation.
			if (!row.secretCiphertext) {
				return { key: null };
			}
			return { key: decryptSecret(row.secretCiphertext) };
		}),
	revoke: protectedProcedure
		.input(revokeApiKeyInputSchema)
		.handler(async ({ context, input }) => {
			const authUserId = context.session.user.id;
			const updated = await context.db
				.update(apiKeys)
				.set({ revokedAt: new Date(), projectId: null })
				.where(
					and(
						eq(apiKeys.id, input.id),
						eq(apiKeys.userId, authUserId),
						isNull(apiKeys.revokedAt)
					)
				)
				.returning({ id: apiKeys.id });

			if (updated.length === 0) {
				throw new Error("API key not found or already revoked");
			}

			return { ok: true as const };
		}),
};
