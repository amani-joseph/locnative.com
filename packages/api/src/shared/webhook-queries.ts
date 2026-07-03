import type { Database } from "@locnative/database";
import { webhookSubscriptions } from "@locnative/database/schema";
import { and, eq } from "drizzle-orm";

/** Clear the `failing` flag on a subscription. Returns false if not owned. */
export async function reactivateWebhook(
	db: Database,
	projectId: string,
	subscriptionId: number
): Promise<boolean> {
	const result = await db
		.update(webhookSubscriptions)
		.set({ failing: false })
		.where(
			and(
				eq(webhookSubscriptions.id, subscriptionId),
				eq(webhookSubscriptions.projectId, projectId)
			)
		)
		.returning({ id: webhookSubscriptions.id });
	return result.length > 0;
}
