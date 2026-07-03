import { db, decryptSecret, validateWebhookUrl } from "@locnative/api";
import {
	webhookDeliveryAttempts,
	webhookSubscriptions,
} from "@locnative/database/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { hmacSign } from "./hmac.ts";

export interface WebhookDeliveryMessage {
	deviceId: string;
	event: "entry" | "exit";
	lat: number;
	lng: number;
	projectId: string;
	timestamp: string;
	type: "webhook-delivery";
	zoneId: number;
	zoneName: string;
}

const MAX_ATTEMPTS = 3;
const DELIVERY_TIMEOUT_MS = 10_000;

async function deliverOnce(
	url: string,
	body: string,
	signature: string,
	attempt: number
): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Locnative-Signature": signature,
				"X-Locnative-Attempt": String(attempt),
			},
			body,
			signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
		});
		return {
			ok: res.ok,
			statusCode: res.status,
			error: res.ok ? null : `HTTP ${res.status}`,
		};
	} catch (err) {
		return {
			ok: false,
			statusCode: null,
			error: err instanceof Error ? err.message : "Request failed",
		};
	}
}

export async function processWebhookDeliveryMessage(
	msg: WebhookDeliveryMessage
): Promise<void> {
	// Find matching subscriptions: same project, active, not failing,
	// zone-specific (zoneId match) OR project-wide (zoneId null),
	// and subscribed to this event type.
	const subs = await db
		.select()
		.from(webhookSubscriptions)
		.where(
			and(
				eq(webhookSubscriptions.projectId, msg.projectId),
				eq(webhookSubscriptions.active, true),
				eq(webhookSubscriptions.failing, false),
				or(
					eq(webhookSubscriptions.zoneId, msg.zoneId),
					isNull(webhookSubscriptions.zoneId)
				),
				sql`${msg.event} = ANY(${webhookSubscriptions.events})`
			)
		);

	const payload = JSON.stringify({
		event: msg.event,
		zone: { id: msg.zoneId, name: msg.zoneName },
		device: { id: msg.deviceId, lat: msg.lat, lng: msg.lng },
		timestamp: msg.timestamp,
	});

	// allSettled isolates per-subscription failures: a DB error on one sub must
	// not reject the whole batch, which would let CF Queue re-deliver the message
	// and double-fire webhooks to subs that already succeeded.
	await Promise.allSettled(
		subs.map(async (sub) => {
			let secret: string;
			try {
				secret = decryptSecret(sub.secretEnc);
			} catch {
				// Corrupt secret — cannot sign; mark failing and log attempt.
				await db
					.update(webhookSubscriptions)
					.set({ failing: true })
					.where(eq(webhookSubscriptions.id, sub.id));
				await db.insert(webhookDeliveryAttempts).values({
					subscriptionId: sub.id,
					event: msg.event,
					zoneId: msg.zoneId,
					deviceId: msg.deviceId,
					statusCode: null,
					ok: false,
					attempt: 0,
					error: "decrypt failed",
				});
				return;
			}

			// Defense-in-depth SSRF re-check: block private/internal targets and
			// any legacy rows created before create-time validation existed.
			const urlError = validateWebhookUrl(sub.url);
			if (urlError) {
				await db
					.update(webhookSubscriptions)
					.set({ failing: true })
					.where(eq(webhookSubscriptions.id, sub.id));
				await db.insert(webhookDeliveryAttempts).values({
					subscriptionId: sub.id,
					event: msg.event,
					zoneId: msg.zoneId,
					deviceId: msg.deviceId,
					statusCode: null,
					ok: false,
					attempt: 0,
					error: urlError,
				});
				return;
			}

			const signature = await hmacSign(secret, payload);

			let delivered = false;
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				const outcome = await deliverOnce(sub.url, payload, signature, attempt);
				await db.insert(webhookDeliveryAttempts).values({
					subscriptionId: sub.id,
					event: msg.event,
					zoneId: msg.zoneId,
					deviceId: msg.deviceId,
					statusCode: outcome.statusCode,
					ok: outcome.ok,
					attempt,
					error: outcome.error,
				});
				if (outcome.ok) {
					delivered = true;
					break;
				}
			}

			if (!delivered) {
				await db
					.update(webhookSubscriptions)
					.set({ failing: true })
					.where(eq(webhookSubscriptions.id, sub.id));
			}
		})
	);
}
