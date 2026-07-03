import { zones } from "@locnative/database/schema";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import {
	addressesInZone,
	countZones,
	deleteZoneRow,
	getZoneWithGeometry,
	insertZone,
	isValidPolygon,
	listZoneRows,
	updateZoneRow,
	ZONE_LIMIT,
	zonesContainingPoint,
} from "../../shared/zone-queries.ts";
import {
	apiKeyAuth,
	usageMiddleware,
	type ValidatedApiKey,
} from "../public-middleware.ts";
import { geoJsonPolygonSchema as geoJsonPolygonSchemaImpl } from "./zones-schema.ts";

export type { GeoJsonPolygon } from "./zones-schema.ts";
export const geoJsonPolygonSchema = geoJsonPolygonSchemaImpl;

// ---------------------------------------------------------------------------
// Helper: cast context to include validatedApiKey
// ---------------------------------------------------------------------------

interface AuthContext {
	validatedApiKey: ValidatedApiKey;
}

/** Assert projectId is non-null (all project-scoped API keys must have one). */
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

export const zoneCreate = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.create"))
	.route({
		method: "POST",
		path: "/api/v1/zones",
		summary: "Create a zone",
		tags: ["zones"],
	})
	.input(
		z.object({
			name: z.string().min(1).max(255),
			description: z.string().optional(),
			geometry: geoJsonPolygonSchemaImpl,
			metadata: z.record(z.string(), z.unknown()).optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);

		// Zone limit check
		const count = await countZones(context.db, projectId);
		if (count >= ZONE_LIMIT) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Zone limit reached (500). Delete unused zones to create new ones.",
			});
		}

		// Polygon validation
		const isValid = await isValidPolygon(context.db, input.geometry);
		if (!isValid) {
			throw new ORPCError("UNPROCESSABLE_CONTENT", {
				message: "Provided geometry is not a valid polygon.",
			});
		}

		const row = await insertZone(context.db, projectId, input);
		if (!row) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to create zone.",
			});
		}

		return row;
	});

export const zoneList = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.list"))
	.route({
		method: "GET",
		path: "/api/v1/zones",
		summary: "List zones",
		tags: ["zones"],
	})
	.input(
		z.object({
			page: z.coerce.number().int().min(1).default(1),
			limit: z.coerce.number().int().min(1).max(100).default(20),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);

		const offset = (input.page - 1) * input.limit;
		const rows = await listZoneRows(context.db, projectId, input.limit, offset);

		return { zones: rows, count: rows.length, page: input.page };
	});

export const zoneGet = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.get"))
	.route({
		method: "GET",
		path: "/api/v1/zones/{id}",
		summary: "Get a zone by ID",
		tags: ["zones"],
	})
	.input(z.object({ id: z.coerce.number().int().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
		const zone = await getZoneWithGeometry(context.db, projectId, input.id);
		if (!zone) {
			throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
		}
		return zone;
	});

export const zoneUpdate = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.update"))
	.route({
		method: "PUT",
		path: "/api/v1/zones/{id}",
		summary: "Update a zone",
		tags: ["zones"],
	})
	.input(
		z.object({
			id: z.coerce.number().int().min(1),
			name: z.string().min(1).max(255).optional(),
			description: z.string().optional(),
			geometry: geoJsonPolygonSchemaImpl.optional(),
			metadata: z.record(z.string(), z.unknown()).optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);

		// 1. Ownership pre-check FIRST (preserves NOT_FOUND precedence)
		const existing = await getZoneWithGeometry(context.db, projectId, input.id);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
		}

		// 2. Geometry validation (only after ownership confirmed)
		if (input.geometry && !(await isValidPolygon(context.db, input.geometry))) {
			throw new ORPCError("UNPROCESSABLE_CONTENT", {
				message: "Provided geometry is not a valid polygon.",
			});
		}

		// 3. Update
		await updateZoneRow(context.db, projectId, input.id, {
			name: input.name,
			description: input.description,
			geometry: input.geometry,
			metadata: input.metadata,
		});

		// 4. Return the 7-field row (no geometry) — fetch fresh and strip geometry
		const updated = await getZoneWithGeometry(context.db, projectId, input.id);
		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
		}
		const { geometry: _geometry, ...row } = updated;
		return row;
	});

export const zoneDelete = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.delete"))
	.route({
		method: "DELETE",
		path: "/api/v1/zones/{id}",
		summary: "Delete a zone",
		tags: ["zones"],
	})
	.input(z.object({ id: z.coerce.number().int().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);

		const deleted = await deleteZoneRow(context.db, projectId, input.id);
		if (!deleted) {
			throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
		}

		return { success: true };
	});

export const zoneContains = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.contains"))
	.route({
		method: "GET",
		path: "/api/v1/zones/contains",
		summary: "Find zones containing a point",
		tags: ["zones"],
	})
	.input(
		// GET query params arrive as strings — coerce like every other GET handler.
		// Bare z.number() here makes the OpenAPI handler reject every request with 400.
		z.object({
			lat: z.coerce.number().min(-90).max(90),
			lng: z.coerce.number().min(-180).max(180),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
		const { lat, lng } = input;

		const rows = await zonesContainingPoint(context.db, projectId, lat, lng);

		return { zones: rows, count: rows.length, query: { lat, lng } };
	});

export const zoneAddresses = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.addresses"))
	.route({
		method: "GET",
		path: "/api/v1/zones/{id}/addresses",
		summary: "Get addresses within a zone",
		tags: ["zones"],
	})
	.input(
		z.object({
			id: z.coerce.number().int().min(1),
			page: z.coerce.number().int().min(1).default(1),
			limit: z.coerce.number().int().min(1).max(500).default(50),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
		const { id, page, limit } = input;

		// Verify zone ownership
		const zoneRows = await context.db
			.select({ id: zones.id })
			.from(zones)
			.where(and(eq(zones.id, id), eq(zones.projectId, projectId)))
			.limit(1);

		if (zoneRows.length === 0) {
			throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
		}

		const out = await addressesInZone(context.db, projectId, id, page, limit);
		return { ...out, query: { id, page, limit } };
	});
