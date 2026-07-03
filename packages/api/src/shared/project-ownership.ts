import type { Database } from "@locnative/database";
import { projects } from "@locnative/database/schema";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Verify the given project belongs to the session user (and is not archived).
 * Returns the projectId on success; throws ORPCError NOT_FOUND otherwise.
 * Use at the top of every session-authed, project-scoped dashboard procedure.
 */
export async function requireProjectOwnership(
	db: Database,
	projectId: string,
	userId: string
): Promise<string> {
	const rows = await db
		.select({ id: projects.id })
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.archivedAt)
			)
		)
		.limit(1);

	if (rows.length === 0) {
		throw new ORPCError("NOT_FOUND", {
			message: "Project not found or you do not have access to it.",
		});
	}
	return projectId;
}
