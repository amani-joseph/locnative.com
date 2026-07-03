import { deviceZoneState, zones } from "@locnative/database/schema";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import {
	apiKeyAuth,
	usageMiddleware,
	type ValidatedApiKey,
} from "../public-middleware.ts";
import { computeBoundaryCrossings as computeBoundaryCrossingsImpl } from "./boundary-crossings.ts";

export type { BoundaryCrossing } from "./boundary-crossings.ts";
export const computeBoundaryCrossings = computeBoundaryCrossingsImpl;

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

export const pushDeviceLocation = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("devices.location"))
	.route({
		method: "POST",
		path: "/api/v1/devices/{deviceId}/location",
		summary: "Push device location update",
		tags: ["devices"],
	})
	.input(
		z.object({
			deviceId: z.string().min(1).max(255),
			lat: z.number().min(-90).max(90),
			lng: z.number().min(-180).max(180),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context &
			AuthContext & {
				// biome-ignore lint/suspicious/noExplicitAny: Queue type from @cloudflare/workers-types not in this package's tsconfig
				env?: { WEBHOOK_DELIVERY_QUEUE?: any };
			};
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
		const { deviceId, lat, lng } = input;

		const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

		// Zones currently containing the point.
		const containingZones = await context.db
			.select({ id: zones.id })
			.from(zones)
			.where(
				and(
					eq(zones.projectId, projectId),
					sql`ST_Contains(${zones.geom}, ${point})`
				)
			);
		const currentZoneIds = containingZones.map((z) => z.id);

		// Previous membership. The neon-http driver has no interactive
		// transactions / row locks (db.transaction() throws), so this is a
		// read-then-write rather than a locked `SELECT ... FOR UPDATE`. That is
		// safe here: the state write below is idempotent (zone_ids derive from
		// the point, not from prevZoneIds), so there is no lost update. Only the
		// crossing diff for two *simultaneous* pushes of the same device could
		// race, which is acceptable for location pings.
		const [prev] = await context.db
			.select({ zoneIds: deviceZoneState.zoneIds })
			.from(deviceZoneState)
			.where(
				and(
					eq(deviceZoneState.projectId, projectId),
					eq(deviceZoneState.deviceId, deviceId)
				)
			)
			.limit(1);
		const prevZoneIds: number[] = prev?.zoneIds ?? [];

		// Zone names for the union of previous + current ids so exit crossings
		// get real names, not "".
		const allZoneIds = Array.from(new Set([...prevZoneIds, ...currentZoneIds]));
		const zoneNames: Record<number, string> = {};
		if (allZoneIds.length > 0) {
			const named = await context.db
				.select({ id: zones.id, name: zones.name })
				.from(zones)
				.where(
					and(eq(zones.projectId, projectId), inArray(zones.id, allZoneIds))
				);
			for (const z of named) {
				zoneNames[z.id] = z.name;
			}
		}

		const crossings = computeBoundaryCrossingsImpl(
			prevZoneIds,
			currentZoneIds,
			zoneNames
		);

		// Enqueue webhooks BEFORE advancing persisted state. If the enqueue
		// throws we never write the new membership, so the next push re-detects
		// the same crossing (at-least-once — no silently dropped events). The
		// only residual failure mode is a *duplicate* delivery if the upsert
		// below fails after a successful enqueue, and webhook consumers are
		// expected to be idempotent (deliveries are HMAC-signed).
		if (crossings.length > 0 && ctx.env?.WEBHOOK_DELIVERY_QUEUE) {
			await Promise.all(
				crossings.map((crossing) =>
					ctx.env?.WEBHOOK_DELIVERY_QUEUE?.send({
						type: "webhook-delivery",
						projectId,
						deviceId,
						lat,
						lng,
						zoneId: crossing.zoneId,
						zoneName: crossing.zoneName,
						event: crossing.event,
						timestamp: new Date().toISOString(),
					})
				)
			);
		}

		// Advance persisted membership (idempotent single-statement upsert).
		await context.db
			.insert(deviceZoneState)
			.values({
				projectId,
				deviceId,
				zoneIds: currentZoneIds,
				latitude: lat,
				longitude: lng,
			})
			.onConflictDoUpdate({
				target: [deviceZoneState.projectId, deviceZoneState.deviceId],
				set: {
					zoneIds: currentZoneIds,
					latitude: lat,
					longitude: lng,
					updatedAt: new Date(),
				},
			});

		return { zones: currentZoneIds, crossings };
	});

export const getDeviceZones = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("devices.zones"))
	.route({
		method: "GET",
		path: "/api/v1/devices/{deviceId}/zones",
		summary: "Current zone membership for a device",
		tags: ["devices"],
	})
	.input(z.object({ deviceId: z.string().min(1).max(255) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);

		const [state] = await context.db
			.select()
			.from(deviceZoneState)
			.where(
				and(
					eq(deviceZoneState.projectId, projectId),
					eq(deviceZoneState.deviceId, input.deviceId)
				)
			)
			.limit(1);

		if (!state) {
			throw new ORPCError("NOT_FOUND", { message: "Device not found." });
		}

		return {
			deviceId: state.deviceId,
			zoneIds: state.zoneIds,
			latitude: state.latitude,
			longitude: state.longitude,
			updatedAt: state.updatedAt,
		};
	});
