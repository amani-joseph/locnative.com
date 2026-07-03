import { webhookSubscriptions, zones } from "@locnative/database/schema";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import { encryptSecret, generateWebhookSecret } from "../../secret-crypto.ts";
import { reactivateWebhook } from "../../shared/webhook-queries.ts";
import { validateWebhookUrl } from "../../shared/webhook-url.ts";
import {
	apiKeyAuth,
	usageMiddleware,
	type ValidatedApiKey,
} from "../public-middleware.ts";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

interface AuthContext {
	validatedApiKey: ValidatedApiKey;
}

function requireProjectId(projectId: string | null): string {
	if (!projectId) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "This API key is not scoped to a project.",
		});
	}
	return projectId;
}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

export const createWebhook = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("webhooks.create"))
	.route({
		method: "POST",
		path: "/api/v1/webhooks",
		summary: "Subscribe to zone events",
		tags: ["webhooks"],
	})
	.input(
		z.object({
			url: z.string().url(),
			events: z
				.array(z.enum(["entry", "exit"]))
				.min(1)
				.default(["entry", "exit"]),
			zoneId: z.number().int().positive().optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);

		// SSRF guard: reject private/loopback/internal targets and require https.
		const urlError = validateWebhookUrl(input.url, { requireHttps: true });
		if (urlError) {
			throw new ORPCError("BAD_REQUEST", { message: urlError });
		}

		// If zoneId provided, verify it belongs to this project
		if (input.zoneId) {
			const [zone] = await context.db
				.select({ id: zones.id })
				.from(zones)
				.where(and(eq(zones.id, input.zoneId), eq(zones.projectId, projectId)))
				.limit(1);
			if (!zone) {
				throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
			}
		}

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
	});

export const listWebhooks = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("webhooks.list"))
	.route({
		method: "GET",
		path: "/api/v1/webhooks",
		summary: "List webhook subscriptions",
		tags: ["webhooks"],
	})
	.input(z.object({}))
	.handler(async ({ context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
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
		return { results: rows, count: rows.length };
	});

export const deleteWebhook = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("webhooks.delete"))
	.route({
		method: "DELETE",
		path: "/api/v1/webhooks/{id}",
		summary: "Delete webhook subscription",
		tags: ["webhooks"],
	})
	.input(z.object({ id: z.coerce.number().int().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
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
		return { id: input.id, deleted: true };
	});

export const reactivateWebhookEndpoint = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("webhooks.reactivate"))
	.route({
		method: "POST",
		path: "/api/v1/webhooks/{id}/reactivate",
		summary: "Reactivate a failing webhook subscription",
		tags: ["webhooks"],
	})
	.input(z.object({ id: z.coerce.number().int().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
		const ok = await reactivateWebhook(context.db, projectId, input.id);
		if (!ok) {
			throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
		}
		return { id: input.id, reactivated: true };
	});
