import {
	webhookDeliveryAttempts,
	webhookSubscriptions,
} from "@locnative/database/schema";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";
import { encryptSecret, generateWebhookSecret } from "../../secret-crypto.ts";
import { requireProjectOwnership } from "../../shared/project-ownership.ts";
import { reactivateWebhook } from "../../shared/webhook-queries.ts";

const projectIdInput = z.object({ projectId: z.string().uuid() });

export const webhooksRouter = {
	list: protectedProcedure
		.input(projectIdInput)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const rows = await context.db
				.select({
					id: webhookSubscriptions.id,
					url: webhookSubscriptions.url,
					events: webhookSubscriptions.events,
					zoneId: webhookSubscriptions.zoneId,
					active: webhookSubscriptions.active,
					failing: webhookSubscriptions.failing,
					createdAt: webhookSubscriptions.createdAt,
				})
				.from(webhookSubscriptions)
				.where(eq(webhookSubscriptions.projectId, projectId));
			return { webhooks: rows, count: rows.length };
		}),

	create: protectedProcedure
		.input(
			projectIdInput.extend({
				url: z.string().url(),
				events: z
					.array(z.enum(["entry", "exit"]))
					.min(1)
					.default(["entry", "exit"]),
				zoneId: z.number().int().positive().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const secret = generateWebhookSecret();
			const secretEnc = encryptSecret(secret);
			const [sub] = await context.db
				.insert(webhookSubscriptions)
				.values({
					projectId,
					zoneId: input.zoneId ?? null,
					url: input.url,
					events: input.events,
					secretEnc,
					active: true,
					failing: false,
				})
				.returning({
					id: webhookSubscriptions.id,
					url: webhookSubscriptions.url,
					events: webhookSubscriptions.events,
					zoneId: webhookSubscriptions.zoneId,
					active: webhookSubscriptions.active,
					createdAt: webhookSubscriptions.createdAt,
				});
			if (!sub) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create webhook.",
				});
			}
			// Return plaintext secret ONCE — never stored, never retrievable again
			return { ...sub, secret };
		}),

	delete: protectedProcedure
		.input(projectIdInput.extend({ id: z.number().int().min(1) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const result = await context.db
				.delete(webhookSubscriptions)
				.where(
					and(
						eq(webhookSubscriptions.id, input.id),
						eq(webhookSubscriptions.projectId, projectId)
					)
				)
				.returning({ id: webhookSubscriptions.id });
			if (result.length === 0) {
				throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
			}
			return { success: true };
		}),

	reactivate: protectedProcedure
		.input(projectIdInput.extend({ id: z.number().int().min(1) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const ok = await reactivateWebhook(context.db, projectId, input.id);
			if (!ok) {
				throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
			}
			return { success: true };
		}),

	deliveries: protectedProcedure
		.input(
			projectIdInput.extend({
				id: z.number().int().min(1),
				limit: z.number().int().min(1).max(100).default(25),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			// Verify the subscription belongs to the project
			const [sub] = await context.db
				.select({ id: webhookSubscriptions.id })
				.from(webhookSubscriptions)
				.where(
					and(
						eq(webhookSubscriptions.id, input.id),
						eq(webhookSubscriptions.projectId, projectId)
					)
				)
				.limit(1);
			if (!sub) {
				throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
			}
			const attempts = await context.db
				.select({
					id: webhookDeliveryAttempts.id,
					event: webhookDeliveryAttempts.event,
					zoneId: webhookDeliveryAttempts.zoneId,
					deviceId: webhookDeliveryAttempts.deviceId,
					statusCode: webhookDeliveryAttempts.statusCode,
					ok: webhookDeliveryAttempts.ok,
					attempt: webhookDeliveryAttempts.attempt,
					error: webhookDeliveryAttempts.error,
					createdAt: webhookDeliveryAttempts.createdAt,
				})
				.from(webhookDeliveryAttempts)
				.where(eq(webhookDeliveryAttempts.subscriptionId, input.id))
				.orderBy(desc(webhookDeliveryAttempts.createdAt))
				.limit(input.limit);
			return { attempts, count: attempts.length };
		}),
};
