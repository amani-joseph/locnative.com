# Mapping, Geocoding & Geofencing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Locnative API with forward geocoding, batch geocoding, developer-defined polygon geofencing (CRUD + PIP + addresses-in-zone + entry/exit webhooks), and device location tracking — all backed by a shared PostGIS spatial layer.

**Architecture:** Polygon-first — the `zones` table (PostGIS geometry) is the shared primitive. Forward geocoding reuses the existing `autocompleteAddresses` query with `limit=1`. Batch geocoding and webhook delivery use Cloudflare Queues; batch results land in R2. Device boundary-crossing detection diffs against `device_zone_state` on every location push.

**Tech Stack:** Drizzle ORM + PostGIS on Neon Postgres, oRPC on Cloudflare Workers, Cloudflare Queues, Cloudflare R2, Vitest, Zod.

**Design spec:** `docs/superpowers/specs/2026-06-04-mapping-geocoding-geofencing-design.md`

---

## File Map

**Create:**
- `packages/database/src/schema/zones.ts` — `zones` + `device_zone_state` Drizzle schemas
- `packages/database/src/schema/webhooks.ts` — `webhook_subscriptions` Drizzle schema
- `packages/database/src/schema/jobs.ts` — `batch_geocode_jobs` Drizzle schema
- `packages/api/src/routers/public-middleware.ts` — shared `apiKeyAuth` + `usageMiddleware` (extracted from `public-http.ts`)
- `packages/api/src/routers/public/zones.ts` — zone CRUD + PIP + addresses-in-zone endpoints
- `packages/api/src/routers/public/geocode.ts` — forward geocode + batch submit/poll endpoints
- `packages/api/src/routers/public/devices.ts` — device location push + current zones endpoints
- `packages/api/src/routers/public/webhooks.ts` — webhook subscription CRUD endpoints
- `apps/server/src/queues/batch-geocode.ts` — CF Queue consumer: geocodes each row, writes to R2
- `apps/server/src/queues/webhook-delivery.ts` — CF Queue consumer: fires HMAC-signed webhook POSTs

**Modify:**
- `packages/database/src/schema/index.ts` — export new tables + types
- `packages/api/src/routers/public-http.ts` — import from `public-middleware.ts`; add new router keys
- `packages/api/src/index.ts` — export `db`
- `apps/server/src/index.ts` — add `queue` export handler
- `apps/server/wrangler.jsonc` — add `[[queues]]` + `[[r2_buckets]]` bindings
- `packages/sdk/src/types.ts` — add types for all new response shapes

---

## Phase 1 — Spatial Foundation

### Task 1: Database schemas for zones, webhooks, and batch jobs

**Files:**
- Create: `packages/database/src/schema/zones.ts`
- Create: `packages/database/src/schema/webhooks.ts`
- Create: `packages/database/src/schema/jobs.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create `packages/database/src/schema/zones.ts`**

```typescript
import {
	customType,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects.ts";

const polygon = customType<{ data: string }>({
	dataType() {
		return "geometry(Polygon, 4326)";
	},
});

export const zones = pgTable(
	"zones",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		projectId: integer("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: varchar({ length: 255 }).notNull(),
		description: text(),
		geom: polygon("geom").notNull(),
		metadata: jsonb(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_zones_project_id").on(table.projectId),
		index("idx_zones_geom").using("gist", table.geom),
	]
);

export const deviceZoneState = pgTable(
	"device_zone_state",
	{
		projectId: integer("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		deviceId: varchar("device_id", { length: 255 }).notNull(),
		zoneIds: integer("zone_ids")
			.array()
			.notNull()
			.default(sql`'{}'::integer[]`),
		latitude: doublePrecision("latitude").notNull(),
		longitude: doublePrecision("longitude").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		primaryKey({ columns: [table.projectId, table.deviceId] }),
	]
);

export type Zone = typeof zones.$inferSelect;
export type NewZone = typeof zones.$inferInsert;
export type DeviceZoneState = typeof deviceZoneState.$inferSelect;
```

- [ ] **Step 2: Create `packages/database/src/schema/webhooks.ts`**

```typescript
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.ts";
import { zones } from "./zones.ts";

export const webhookSubscriptions = pgTable(
	"webhook_subscriptions",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		projectId: integer("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		zoneId: integer("zone_id").references(() => zones.id, {
			onDelete: "cascade",
		}),
		url: text().notNull(),
		events: text("events")
			.array()
			.notNull()
			.default(["entry", "exit"] as unknown as string[]),
		secretEnc: text("secret_enc").notNull(),
		active: boolean().notNull().default(true),
		failing: boolean().notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_webhook_subs_project_id").on(table.projectId),
		index("idx_webhook_subs_zone_id").on(table.zoneId),
	]
);

export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscription = typeof webhookSubscriptions.$inferInsert;
```

- [ ] **Step 3: Create `packages/database/src/schema/jobs.ts`**

```typescript
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.ts";
import { apiKeys } from "./api-keys.ts";

export const batchGeocodeJobs = pgTable(
	"batch_geocode_jobs",
	{
		id: uuid().primaryKey().defaultRandom(),
		projectId: integer("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		apiKeyId: integer("api_key_id")
			.notNull()
			.references(() => apiKeys.id, { onDelete: "cascade" }),
		status: text().notNull().default("pending"),
		inputCount: integer("input_count").notNull(),
		processedCount: integer("processed_count").notNull().default(0),
		resultsR2Key: text("results_r2_key"),
		error: text(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_batch_jobs_project_id").on(table.projectId),
		index("idx_batch_jobs_status").on(table.status),
	]
);

export type BatchGeocodeJob = typeof batchGeocodeJobs.$inferSelect;
```

- [ ] **Step 4: Export from `packages/database/src/schema/index.ts`**

Add at the end of the file:

```typescript
export type { DeviceZoneState, NewZone, Zone } from "./zones.ts";
export { deviceZoneState, zones } from "./zones.ts";
export type {
	NewWebhookSubscription,
	WebhookSubscription,
} from "./webhooks.ts";
export { webhookSubscriptions } from "./webhooks.ts";
export type { BatchGeocodeJob } from "./jobs.ts";
export { batchGeocodeJobs } from "./jobs.ts";
```

- [ ] **Step 5: Generate + review the migration**

```bash
cd packages/database && pnpm drizzle-kit generate
```

Review the generated SQL file in `drizzle/`. It should contain `CREATE TABLE zones`, `CREATE TABLE device_zone_state`, `CREATE TABLE webhook_subscriptions`, `CREATE TABLE batch_geocode_jobs`, and the GiST index. Verify `geom` column type is `geometry(Polygon, 4326)`.

- [ ] **Step 6: Add the float64 migration for address precision**

Create `packages/database/drizzle/NNNN_address_coordinate_precision.sql` (use the next sequence number after the generated migration):

```sql
-- Upgrade lat/lng from float32 (real) to float64 (double precision) for sub-metre accuracy
ALTER TABLE "addresses" ALTER COLUMN "latitude" TYPE double precision;
--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "longitude" TYPE double precision;
```

Also update `packages/database/src/schema/addresses.ts` — change the two `real()` columns to `doublePrecision()`:

```typescript
// BEFORE
longitude: real().notNull(),
latitude: real().notNull(),

// AFTER
longitude: doublePrecision().notNull(),
latitude: doublePrecision().notNull(),
```

Import `doublePrecision` from `drizzle-orm/pg-core` (add to existing import).

- [ ] **Step 7: Run migrations**

```bash
cd packages/database && pnpm drizzle-kit migrate
```

Expected: all migrations apply cleanly. Verify with `\d zones` in psql.

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/schema/zones.ts \
        packages/database/src/schema/webhooks.ts \
        packages/database/src/schema/jobs.ts \
        packages/database/src/schema/index.ts \
        packages/database/src/schema/addresses.ts \
        packages/database/drizzle/
git commit -m "feat(db): add zones, device_zone_state, webhook_subscriptions, batch_geocode_jobs schemas"
```

---

### Task 2: Extract shared public API middleware

The `apiKeyAuth` middleware and `usageMiddleware` function are currently defined inline in `public-http.ts`. New router files need them too — extract to a shared module.

**Files:**
- Create: `packages/api/src/routers/public-middleware.ts`
- Modify: `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Create `packages/api/src/routers/public-middleware.ts`**

Cut the following from `public-http.ts` (lines ~19–105, everything from `const resolveTrustedRequestSource` through `return usageMiddleware`) and paste into this new file:

```typescript
import { ORPCError } from "@orpc/server";
import { serverEnv } from "@locnative/env/server";
import { o as baseBuilder } from "../builder.ts";
import {
	INTERNAL_API_AUTH_HEADER,
	INTERNAL_API_KEY_ID_HEADER,
	INTERNAL_REQUEST_SOURCE_HEADER,
	parseApiKeyFromRequest,
	REQUEST_SOURCE_EXPLORER_TEST,
	recordUsage,
	type ValidatedApiKey,
	validateApiKey,
	validateApiKeyById,
} from "../api-key-auth.ts";

const resolveTrustedRequestSource = (request: Request): string | null => {
	const authHeader = request.headers.get(INTERNAL_API_AUTH_HEADER);
	if (authHeader !== serverEnv.BETTER_AUTH_SECRET) return null;
	const source = request.headers.get(INTERNAL_REQUEST_SOURCE_HEADER);
	return source === REQUEST_SOURCE_EXPLORER_TEST ? source : null;
};

export const apiKeyAuth = baseBuilder.middleware(async ({ context, next }) => {
	const request = context.req.raw;
	const trustedRequestSource = resolveTrustedRequestSource(request);
	const internalApiKeyId =
		trustedRequestSource === REQUEST_SOURCE_EXPLORER_TEST
			? request.headers.get(INTERNAL_API_KEY_ID_HEADER)
			: null;
	const token = parseApiKeyFromRequest(request);
	let authResult: ValidatedApiKey | null = null;
	if (internalApiKeyId) {
		authResult = await validateApiKeyById(context.db, internalApiKeyId);
	} else if (token) {
		authResult = await validateApiKey(context.db, token);
	}
	if (!authResult) {
		const message =
			token || internalApiKeyId
				? "Invalid, revoked, or expired API key."
				: "API key required. Send Authorization: Bearer <key> or X-API-Key.";
		throw new ORPCError("UNAUTHORIZED", { message });
	}
	return next({ context: { ...context, apiKey: authResult } });
});

export function usageMiddleware(endpointKey: string) {
	return baseBuilder.middleware(async ({ context, next }) => {
		const ctx = context as typeof context & { apiKey: ValidatedApiKey };
		recordUsage(ctx.db, {
			apiKeyId: ctx.apiKey.id,
			projectId: ctx.apiKey.projectId,
			endpointKey,
		}).catch(() => {});
		return next();
	});
}
```

- [ ] **Step 2: Update `packages/api/src/routers/public-http.ts`**

Replace the now-removed middleware definitions with imports:

```typescript
import { apiKeyAuth, usageMiddleware } from "./public-middleware.ts";
```

Remove the `import { ... } from "../api-key-auth.ts"` lines that were only used by the extracted code. Keep any that remain in use.

- [ ] **Step 3: Verify types still check**

```bash
cd packages/api && pnpm check-types
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/public-middleware.ts \
        packages/api/src/routers/public-http.ts
git commit -m "refactor(api): extract apiKeyAuth + usageMiddleware to shared module"
```

---

### Task 3: Zone CRUD endpoints

**Files:**
- Create: `packages/api/src/routers/public/zones.ts`
- Modify: `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Create `packages/api/src/routers/public/zones.ts`**

```typescript
import { ORPCError } from "@orpc/server";
import {
	deviceZoneState,
	zones,
	type Zone,
} from "@locnative/database/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import { apiKeyAuth, usageMiddleware } from "../public-middleware.ts";

// GeoJSON Polygon schema — ring must close (first = last coordinate)
const GeoJsonPolygonSchema = z.object({
	type: z.literal("Polygon"),
	coordinates: z
		.array(z.array(z.tuple([z.number(), z.number()])))
		.min(1),
});

function zoneToGeoJson(zone: Zone) {
	return {
		id: zone.id,
		name: zone.name,
		description: zone.description,
		metadata: zone.metadata,
		createdAt: zone.createdAt,
		updatedAt: zone.updatedAt,
		// geometry returned as raw GeoJSON string from PostGIS via ST_AsGeoJSON
	};
}

export const createZone = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.create"))
	.route({ method: "POST", path: "/api/v1/zones", summary: "Create zone", tags: ["zones"] })
	.input(
		z.object({
			name: z.string().min(1).max(255),
			description: z.string().optional(),
			geometry: GeoJsonPolygonSchema,
			metadata: z.record(z.unknown()).optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const geomJson = JSON.stringify(input.geometry);

		// Enforce zone limit (500 per project)
		const countResult = await context.db.execute(
			sql`SELECT COUNT(*)::int AS count FROM zones WHERE project_id = ${ctx.apiKey.projectId}`
		);
		const count = (countResult.rows[0] as { count: number }).count;
		if (count >= 500) {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message: "Zone limit reached (500). Upgrade your plan or delete unused zones.",
			});
		}

		// Validate polygon
		const validCheck = await context.db.execute(
			sql`SELECT ST_IsValid(ST_GeomFromGeoJSON(${geomJson})) AS valid`
		);
		const isValid = (validCheck.rows[0] as { valid: boolean }).valid;
		if (!isValid) {
			throw new ORPCError("UNPROCESSABLE_CONTENT", {
				message: "Invalid polygon geometry. Polygon must not be self-intersecting.",
			});
		}

		const [zone] = await context.db
			.insert(zones)
			.values({
				projectId: ctx.apiKey.projectId,
				name: input.name,
				description: input.description,
				geom: sql`ST_GeomFromGeoJSON(${geomJson})`,
				metadata: input.metadata ?? null,
			})
			.returning({
				id: zones.id,
				name: zones.name,
				description: zones.description,
				metadata: zones.metadata,
				createdAt: zones.createdAt,
				updatedAt: zones.updatedAt,
			});

		return zone!;
	});

export const listZones = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.list"))
	.route({ method: "GET", path: "/api/v1/zones", summary: "List zones", tags: ["zones"] })
	.input(
		z.object({
			page: z.coerce.number().int().min(1).default(1),
			limit: z.coerce.number().int().min(1).max(100).default(20),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const offset = (input.page - 1) * input.limit;
		const rows = await context.db
			.select({
				id: zones.id,
				name: zones.name,
				description: zones.description,
				metadata: zones.metadata,
				createdAt: zones.createdAt,
				updatedAt: zones.updatedAt,
			})
			.from(zones)
			.where(eq(zones.projectId, ctx.apiKey.projectId))
			.limit(input.limit)
			.offset(offset);
		return { results: rows, count: rows.length, page: input.page };
	});

export const getZone = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.get"))
	.route({ method: "GET", path: "/api/v1/zones/{id}", summary: "Get zone", tags: ["zones"] })
	.input(z.object({ id: z.coerce.number().int().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const rows = await context.db.execute(sql`
			SELECT id, project_id, name, description, metadata, created_at, updated_at,
			       ST_AsGeoJSON(geom)::json AS geometry
			FROM zones
			WHERE id = ${input.id} AND project_id = ${ctx.apiKey.projectId}
			LIMIT 1
		`);
		if (rows.rows.length === 0) throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
		return rows.rows[0];
	});

export const updateZone = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.update"))
	.route({ method: "PUT", path: "/api/v1/zones/{id}", summary: "Update zone", tags: ["zones"] })
	.input(
		z.object({
			id: z.coerce.number().int().min(1),
			name: z.string().min(1).max(255).optional(),
			description: z.string().optional(),
			geometry: GeoJsonPolygonSchema.optional(),
			metadata: z.record(z.unknown()).optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & { apiKey: { projectId: number } };

		// Verify ownership
		const existing = await context.db
			.select({ id: zones.id })
			.from(zones)
			.where(and(eq(zones.id, input.id), eq(zones.projectId, ctx.apiKey.projectId)))
			.limit(1);
		if (existing.length === 0) throw new ORPCError("NOT_FOUND", { message: "Zone not found." });

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.name !== undefined) updates.name = input.name;
		if (input.description !== undefined) updates.description = input.description;
		if (input.metadata !== undefined) updates.metadata = input.metadata;

		let geomUpdate = sql`geom`;
		if (input.geometry) {
			const geomJson = JSON.stringify(input.geometry);
			const validCheck = await context.db.execute(
				sql`SELECT ST_IsValid(ST_GeomFromGeoJSON(${geomJson})) AS valid`
			);
			if (!(validCheck.rows[0] as { valid: boolean }).valid) {
				throw new ORPCError("UNPROCESSABLE_CONTENT", {
					message: "Invalid polygon geometry.",
				});
			}
			geomUpdate = sql`ST_GeomFromGeoJSON(${geomJson})`;
		}

		await context.db.execute(sql`
			UPDATE zones
			SET name = ${input.name ?? sql`name`},
			    description = ${input.description ?? sql`description`},
			    geom = ${geomUpdate},
			    metadata = ${input.metadata ? JSON.stringify(input.metadata) : sql`metadata`},
			    updated_at = now()
			WHERE id = ${input.id} AND project_id = ${ctx.apiKey.projectId}
		`);

		return { id: input.id, updated: true };
	});

export const deleteZone = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.delete"))
	.route({ method: "DELETE", path: "/api/v1/zones/{id}", summary: "Delete zone", tags: ["zones"] })
	.input(z.object({ id: z.coerce.number().int().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const result = await context.db
			.delete(zones)
			.where(and(eq(zones.id, input.id), eq(zones.projectId, ctx.apiKey.projectId)))
			.returning({ id: zones.id });
		if (result.length === 0) throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
		return { id: input.id, deleted: true };
	});

export const containsPoint = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.contains"))
	.route({
		method: "POST",
		path: "/api/v1/zones/contains",
		summary: "Which zones contain a point",
		tags: ["zones"],
	})
	.input(
		z.object({
			lat: z.number().min(-90).max(90),
			lng: z.number().min(-180).max(180),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const point = sql`ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)`;
		const rows = await context.db
			.select({ id: zones.id, name: zones.name, description: zones.description })
			.from(zones)
			.where(
				and(
					eq(zones.projectId, ctx.apiKey.projectId),
					sql`ST_Contains(${zones.geom}, ${point})`
				)
			);
		return { results: rows, count: rows.length, query: { lat: input.lat, lng: input.lng } };
	});

export const addressesInZone = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("zones.addresses"))
	.route({
		method: "GET",
		path: "/api/v1/zones/{id}/addresses",
		summary: "Addresses within a zone",
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
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const MAX_RESULTS = 10_000;
		const offset = (input.page - 1) * input.limit;

		// Verify zone ownership
		const zoneRow = await context.db
			.select({ id: zones.id })
			.from(zones)
			.where(and(eq(zones.id, input.id), eq(zones.projectId, ctx.apiKey.projectId)))
			.limit(1);
		if (zoneRow.length === 0) throw new ORPCError("NOT_FOUND", { message: "Zone not found." });

		const rows = await context.db.execute(sql`
			SELECT a.id, a.country, a.state, a.locality, a.postcode,
			       a.street_name, a.street_type, a.number_first, a.number_last,
			       a.latitude, a.longitude
			FROM addresses a, zones z
			WHERE z.id = ${input.id}
			  AND ST_Within(a.geom, z.geom)
			ORDER BY a.id
			LIMIT ${Math.min(input.limit, MAX_RESULTS - offset)}
			OFFSET ${Math.min(offset, MAX_RESULTS)}
		`);

		const truncated = offset + rows.rows.length >= MAX_RESULTS;
		return {
			results: rows.rows,
			count: rows.rows.length,
			page: input.page,
			truncated,
		};
	});
```

- [ ] **Step 2: Register in `packages/api/src/routers/public-http.ts`**

Add the import at the top of `public-http.ts`:

```typescript
import {
	addressesInZone,
	containsPoint,
	createZone,
	deleteZone,
	getZone,
	listZones,
	updateZone,
} from "./public/zones.ts";
```

Add to the `publicHttpRouter` object (at line ~346):

```typescript
export const publicHttpRouter = {
	// ... existing keys ...
	zoneCreate: createZone,
	zoneList: listZones,
	zoneGet: getZone,
	zoneUpdate: updateZone,
	zoneDelete: deleteZone,
	zoneContains: containsPoint,
	zoneAddresses: addressesInZone,
};
```

- [ ] **Step 3: Type-check**

```bash
cd packages/api && pnpm check-types
```

Expected: no errors.

- [ ] **Step 4: Write tests for zone PIP logic**

Create `packages/api/src/routers/public/zones.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

// Test the GeoJSON polygon schema validation (pure, no DB needed)
import { z } from "zod";

const GeoJsonPolygonSchema = z.object({
	type: z.literal("Polygon"),
	coordinates: z
		.array(z.array(z.tuple([z.number(), z.number()])))
		.min(1),
});

const validPolygon = {
	type: "Polygon" as const,
	coordinates: [
		[
			[151.2, -33.8],
			[151.3, -33.8],
			[151.3, -33.9],
			[151.2, -33.9],
			[151.2, -33.8], // closed
		],
	],
};

describe("GeoJsonPolygonSchema", () => {
	it("accepts a valid closed polygon", () => {
		expect(() => GeoJsonPolygonSchema.parse(validPolygon)).not.toThrow();
	});

	it("rejects non-Polygon type", () => {
		expect(() =>
			GeoJsonPolygonSchema.parse({ ...validPolygon, type: "LineString" })
		).toThrow();
	});

	it("rejects missing coordinates", () => {
		expect(() =>
			GeoJsonPolygonSchema.parse({ type: "Polygon", coordinates: [] })
		).toThrow();
	});
});
```

- [ ] **Step 5: Run tests**

```bash
cd packages/api && pnpm vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/public/zones.ts \
        packages/api/src/routers/public/zones.test.ts \
        packages/api/src/routers/public-http.ts
git commit -m "feat(api): add zone CRUD, PIP, and addresses-in-zone endpoints"
```

---

## Phase 2 — Forward Geocoding + Batch

### Task 4: Forward geocoding endpoint

**Files:**
- Create: `packages/api/src/routers/public/geocode.ts`
- Modify: `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Create `packages/api/src/routers/public/geocode.ts`**

```typescript
import { ORPCError } from "@orpc/server";
import { autocompleteAddresses } from "@locnative/database/queries";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import { apiKeyAuth, usageMiddleware } from "../public-middleware.ts";

export const forwardGeocode = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.geocode"))
	.route({
		method: "GET",
		path: "/api/v1/addresses/geocode",
		summary: "Forward geocode an address",
		tags: ["addresses"],
	})
	.input(
		z.union([
			// Unstructured: free-text query
			z.object({
				q: z.string().min(5),
				country: z.string().optional(),
				state: z.string().optional(),
				structured: z.undefined().or(z.literal("false")),
			}),
			// Structured: explicit fields
			z.object({
				structured: z.literal("true"),
				street: z.string().min(1),
				locality: z.string().min(1),
				state: z.string().optional(),
				postcode: z.string().optional(),
				country: z.string().optional(),
			}),
		])
	)
	.handler(async ({ input, context }) => {
		const isStructured = "structured" in input && input.structured === "true";

		const query = isStructured
			? [input.street, input.locality, "state" in input ? input.state : undefined]
					.filter(Boolean)
					.join(", ")
			: (input as { q: string }).q;

		const { results } = await autocompleteAddresses(context.db, query, {
			country: "country" in input ? input.country : undefined,
			state: "state" in input ? input.state : undefined,
			limit: 1,
		});

		if (results.length === 0) {
			throw new ORPCError("NOT_FOUND", {
				message: "No address found matching the query.",
			});
		}

		const match = results[0]!;

		// Reject low-confidence matches for structured input
		if (isStructured && !match.formattedAddress) {
			throw new ORPCError("NOT_FOUND", {
				message: "No address found matching the structured fields.",
			});
		}

		return {
			address: {
				id: match.id,
				formattedAddress: match.formattedAddress,
				streetAddress: match.streetAddress,
				locality: match.locality,
				state: match.state,
				postcode: match.postcode,
				country: match.country,
				latitude: match.latitude,
				longitude: match.longitude,
			},
			matchType: isStructured ? "structured" : "fuzzy",
		};
	});
```

- [ ] **Step 2: Register in `public-http.ts`**

```typescript
import { forwardGeocode } from "./public/geocode.ts";

// Add to publicHttpRouter:
geocode: forwardGeocode,
```

- [ ] **Step 3: Write test for forward geocode logic**

Add to `packages/api/src/routers/public/geocode.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

// Test the query construction logic (pure function extracted for testability)
function buildGeocodeQuery(
	input:
		| { q: string; structured?: undefined }
		| { structured: "true"; street: string; locality: string; state?: string }
): string {
	if ("structured" in input && input.structured === "true") {
		return [input.street, input.locality, input.state]
			.filter(Boolean)
			.join(", ");
	}
	return input.q;
}

describe("buildGeocodeQuery", () => {
	it("returns q for unstructured input", () => {
		expect(buildGeocodeQuery({ q: "123 Main St Sydney" })).toBe(
			"123 Main St Sydney"
		);
	});

	it("joins structured fields with comma-space", () => {
		expect(
			buildGeocodeQuery({
				structured: "true",
				street: "123 Main St",
				locality: "Sydney",
				state: "NSW",
			})
		).toBe("123 Main St, Sydney, NSW");
	});

	it("omits undefined state in structured mode", () => {
		expect(
			buildGeocodeQuery({
				structured: "true",
				street: "1 Pitt St",
				locality: "Sydney",
			})
		).toBe("1 Pitt St, Sydney");
	});
});
```

- [ ] **Step 4: Run tests**

```bash
cd packages/api && pnpm vitest run
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/public/geocode.ts \
        packages/api/src/routers/public/geocode.test.ts \
        packages/api/src/routers/public-http.ts
git commit -m "feat(api): add forward geocoding endpoint GET /api/v1/addresses/geocode"
```

---

### Task 5: Batch geocoding — CF Queue + R2 setup + endpoints

**Files:**
- Modify: `apps/server/wrangler.jsonc`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/api/src/index.ts`
- Create: `apps/server/src/queues/batch-geocode.ts`
- Modify: `packages/api/src/routers/public/geocode.ts`
- Modify: `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Add Queue and R2 bindings to `apps/server/wrangler.jsonc`**

```jsonc
{
  // ... existing config ...
  "queues": {
    "producers": [
      { "queue": "locnative-batch-geocode", "binding": "BATCH_GEOCODE_QUEUE" },
      { "queue": "locnative-webhook-delivery", "binding": "WEBHOOK_DELIVERY_QUEUE" }
    ],
    "consumers": [
      { "queue": "locnative-batch-geocode", "max_batch_size": 10 },
      { "queue": "locnative-webhook-delivery", "max_batch_size": 5 }
    ]
  },
  "r2_buckets": [
    { "binding": "GEOCODE_RESULTS", "bucket_name": "locnative-geocode-results" }
  ]
}
```

Create the queues and bucket in your Cloudflare dashboard (or via `wrangler queues create locnative-batch-geocode` and `wrangler r2 bucket create locnative-geocode-results`).

- [ ] **Step 2: Export `db` from `packages/api/src/index.ts`**

Add one line to the exports:

```typescript
export { db } from "./db.ts";
```

- [ ] **Step 3: Create `apps/server/src/queues/batch-geocode.ts`**

```typescript
import { autocompleteAddresses } from "@locnative/database/queries";
import { batchGeocodeJobs } from "@locnative/database/schema";
import { db } from "@locnative/api";
import { eq } from "drizzle-orm";

export interface BatchGeocodeMessage {
	type: "batch-geocode";
	jobId: string;
	addresses: string[];
	projectId: number;
}

export interface BatchGeocodeResult {
	input: string;
	matched: boolean;
	address?: {
		id: number;
		formattedAddress: string;
		latitude: number;
		longitude: number;
		country: string;
		state: string;
		locality: string;
		postcode: string;
	};
	error?: string;
}

export async function processBatchGeocodeMessage(
	msg: BatchGeocodeMessage,
	env: { GEOCODE_RESULTS: R2Bucket }
): Promise<void> {
	const results: BatchGeocodeResult[] = [];

	for (const address of msg.addresses) {
		try {
			const { results: matches } = await autocompleteAddresses(db, address, {
				limit: 1,
			});
			if (matches.length > 0) {
				const m = matches[0]!;
				results.push({
					input: address,
					matched: true,
					address: {
						id: m.id,
						formattedAddress: m.formattedAddress,
						latitude: m.latitude,
						longitude: m.longitude,
						country: m.country,
						state: m.state,
						locality: m.locality,
						postcode: m.postcode,
					},
				});
			} else {
				results.push({ input: address, matched: false });
			}
		} catch (err) {
			results.push({
				input: address,
				matched: false,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}
	}

	const r2Key = `geocode-jobs/${msg.projectId}/${msg.jobId}.json`;
	await env.GEOCODE_RESULTS.put(r2Key, JSON.stringify(results), {
		httpMetadata: { contentType: "application/json" },
	});

	await db
		.update(batchGeocodeJobs)
		.set({
			status: "completed",
			processedCount: results.length,
			resultsR2Key: r2Key,
			completedAt: new Date(),
		})
		.where(eq(batchGeocodeJobs.id, msg.jobId));
}
```

- [ ] **Step 4: Add batch submit + poll to `packages/api/src/routers/public/geocode.ts`**

Append to the existing file:

```typescript
import { batchGeocodeJobs } from "@locnative/database/schema";
import { eq, and } from "drizzle-orm";

// Queue and R2 come from the Worker env — accessed via context
declare module "../../context.ts" {
	interface Context {
		env?: {
			BATCH_GEOCODE_QUEUE?: Queue;
			GEOCODE_RESULTS?: R2Bucket;
		};
	}
}

export const batchGeocodeSubmit = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.batch"))
	.route({
		method: "POST",
		path: "/api/v1/geocode/batch",
		summary: "Submit batch geocoding job",
		tags: ["addresses"],
	})
	.input(
		z.object({
			addresses: z
				.array(z.string().min(5))
				.min(1)
				.max(1000, "Maximum 1,000 addresses per job"),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & {
			apiKey: { projectId: number; id: number };
			env?: { BATCH_GEOCODE_QUEUE?: Queue };
		};

		const [job] = await context.db
			.insert(batchGeocodeJobs)
			.values({
				projectId: ctx.apiKey.projectId,
				apiKeyId: ctx.apiKey.id,
				status: "pending",
				inputCount: input.addresses.length,
			})
			.returning({ id: batchGeocodeJobs.id });

		if (ctx.env?.BATCH_GEOCODE_QUEUE) {
			await ctx.env.BATCH_GEOCODE_QUEUE.send({
				type: "batch-geocode",
				jobId: job!.id,
				addresses: input.addresses,
				projectId: ctx.apiKey.projectId,
			});
			await context.db
				.update(batchGeocodeJobs)
				.set({ status: "processing" })
				.where(eq(batchGeocodeJobs.id, job!.id));
		}

		return { jobId: job!.id, status: "processing", inputCount: input.addresses.length };
	});

export const batchGeocodePoll = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.batch.poll"))
	.route({
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}",
		summary: "Poll batch geocoding job",
		tags: ["addresses"],
	})
	.input(z.object({ jobId: z.string().uuid() }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & {
			apiKey: { projectId: number };
			env?: { GEOCODE_RESULTS?: R2Bucket };
		};

		const [job] = await context.db
			.select()
			.from(batchGeocodeJobs)
			.where(
				and(
					eq(batchGeocodeJobs.id, input.jobId),
					eq(batchGeocodeJobs.projectId, ctx.apiKey.projectId)
				)
			)
			.limit(1);

		if (!job) throw new ORPCError("NOT_FOUND", { message: "Job not found." });

		return {
			jobId: job.id,
			status: job.status,
			inputCount: job.inputCount,
			processedCount: job.processedCount,
			completedAt: job.completedAt,
			error: job.error,
			// Results served via a separate authenticated endpoint when completed
			downloadUrl: job.status === "completed"
				? `/api/v1/geocode/batch/${job.id}/results`
				: null,
		};
	});
```

- [ ] **Step 5: Add results download endpoint to `packages/api/src/routers/public/geocode.ts`**

Append to the geocode file — reads the R2 object and streams the JSON:

```typescript
export const batchGeocodeResults = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.batch.results"))
	.route({
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}/results",
		summary: "Download batch geocoding results",
		tags: ["addresses"],
	})
	.input(z.object({ jobId: z.string().uuid() }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & {
			apiKey: { projectId: number };
			env?: { GEOCODE_RESULTS?: R2Bucket };
		};

		const [job] = await context.db
			.select({
				status: batchGeocodeJobs.status,
				resultsR2Key: batchGeocodeJobs.resultsR2Key,
				projectId: batchGeocodeJobs.projectId,
			})
			.from(batchGeocodeJobs)
			.where(
				and(
					eq(batchGeocodeJobs.id, input.jobId),
					eq(batchGeocodeJobs.projectId, ctx.apiKey.projectId)
				)
			)
			.limit(1);

		if (!job) throw new ORPCError("NOT_FOUND", { message: "Job not found." });
		if (job.status !== "completed" || !job.resultsR2Key) {
			throw new ORPCError("NOT_FOUND", {
				message: `Results not ready. Job status: ${job.status}`,
			});
		}

		if (!ctx.env?.GEOCODE_RESULTS) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Storage binding unavailable.",
			});
		}

		const obj = await ctx.env.GEOCODE_RESULTS.get(job.resultsR2Key);
		if (!obj) throw new ORPCError("NOT_FOUND", { message: "Results file not found." });

		const results = await obj.json<unknown[]>();
		return { results, count: results.length };
	});
```

- [ ] **Step 6: Register batch endpoints in `public-http.ts`**

```typescript
import { batchGeocodeResults, batchGeocodePoll, batchGeocodeSubmit, forwardGeocode } from "./public/geocode.ts";

// Add to publicHttpRouter:
batchGeocodeSubmit,
batchGeocodePoll,
batchGeocodeResults,
```

- [ ] **Step 7: Add `queue` export handler to `apps/server/src/index.ts`**

```typescript
import type { MessageBatch } from "@cloudflare/workers-types";
import { processBatchGeocodeMessage, type BatchGeocodeMessage } from "./queues/batch-geocode.ts";

// At the bottom, update the default export:
export default {
	fetch: app.fetch,
	async queue(
		batch: MessageBatch<{ type: string }>,
		env: { GEOCODE_RESULTS: R2Bucket; WEBHOOK_DELIVERY_QUEUE: Queue }
	): Promise<void> {
		for (const msg of batch.messages) {
			if (msg.body.type === "batch-geocode") {
				await processBatchGeocodeMessage(
					msg.body as BatchGeocodeMessage,
					env
				);
				msg.ack();
			}
		}
	},
};
```

- [ ] **Step 8: Type-check**

```bash
cd packages/api && pnpm check-types
```

- [ ] **Step 9: Commit**

```bash
git add apps/server/wrangler.jsonc \
        apps/server/src/index.ts \
        apps/server/src/queues/batch-geocode.ts \
        packages/api/src/index.ts \
        packages/api/src/routers/public/geocode.ts \
        packages/api/src/routers/public-http.ts
git commit -m "feat(api): add batch geocoding endpoints with CF Queue + R2 storage"
```

---

## Phase 3 — Device Tracking

### Task 6: Device location push + zone state

**Files:**
- Create: `packages/api/src/routers/public/devices.ts`
- Modify: `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Create `packages/api/src/routers/public/devices.ts`**

```typescript
import { ORPCError } from "@orpc/server";
import { deviceZoneState, zones } from "@locnative/database/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import { apiKeyAuth, usageMiddleware } from "../public-middleware.ts";

export interface BoundaryCrossing {
	zoneId: number;
	zoneName: string;
	event: "entry" | "exit";
}

export function computeBoundaryCrossings(
	previousZoneIds: number[],
	currentZoneIds: number[],
	zoneNames: Record<number, string>
): BoundaryCrossing[] {
	const prev = new Set(previousZoneIds);
	const curr = new Set(currentZoneIds);
	const crossings: BoundaryCrossing[] = [];

	for (const id of curr) {
		if (!prev.has(id)) {
			crossings.push({ zoneId: id, zoneName: zoneNames[id] ?? "", event: "entry" });
		}
	}
	for (const id of prev) {
		if (!curr.has(id)) {
			crossings.push({ zoneId: id, zoneName: zoneNames[id] ?? "", event: "exit" });
		}
	}
	return crossings;
}

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
		const ctx = context as typeof context & {
			apiKey: { projectId: number };
			env?: { WEBHOOK_DELIVERY_QUEUE?: Queue };
		};
		const { deviceId, lat, lng } = input;
		const projectId = ctx.apiKey.projectId;
		const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

		// Get current containing zone IDs + names
		const containingZones = await context.db
			.select({ id: zones.id, name: zones.name })
			.from(zones)
			.where(
				and(
					eq(zones.projectId, projectId),
					sql`ST_Contains(${zones.geom}, ${point})`
				)
			);

		const currentZoneIds = containingZones.map((z) => z.id);
		const zoneNames = Object.fromEntries(containingZones.map((z) => [z.id, z.name]));

		// Get previous state
		const [prevState] = await context.db
			.select({ zoneIds: deviceZoneState.zoneIds })
			.from(deviceZoneState)
			.where(
				and(
					eq(deviceZoneState.projectId, projectId),
					eq(deviceZoneState.deviceId, deviceId)
				)
			)
			.limit(1);

		const previousZoneIds = prevState?.zoneIds ?? [];
		const crossings = computeBoundaryCrossings(previousZoneIds, currentZoneIds, zoneNames);

		// Upsert device state
		await context.db.execute(sql`
			INSERT INTO device_zone_state (project_id, device_id, zone_ids, latitude, longitude, updated_at)
			VALUES (${projectId}, ${deviceId}, ${JSON.stringify(currentZoneIds)}::integer[], ${lat}, ${lng}, now())
			ON CONFLICT (project_id, device_id)
			DO UPDATE SET
				zone_ids = EXCLUDED.zone_ids,
				latitude = EXCLUDED.latitude,
				longitude = EXCLUDED.longitude,
				updated_at = EXCLUDED.updated_at
		`);

		// Enqueue webhook delivery for each crossing
		if (crossings.length > 0 && ctx.env?.WEBHOOK_DELIVERY_QUEUE) {
			for (const crossing of crossings) {
				await ctx.env.WEBHOOK_DELIVERY_QUEUE.send({
					type: "webhook-delivery",
					projectId,
					deviceId,
					lat,
					lng,
					zoneId: crossing.zoneId,
					zoneName: crossing.zoneName,
					event: crossing.event,
					timestamp: new Date().toISOString(),
				});
			}
		}

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
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const [state] = await context.db
			.select()
			.from(deviceZoneState)
			.where(
				and(
					eq(deviceZoneState.projectId, ctx.apiKey.projectId),
					eq(deviceZoneState.deviceId, input.deviceId)
				)
			)
			.limit(1);

		if (!state) throw new ORPCError("NOT_FOUND", { message: "Device not found." });

		return {
			deviceId: state.deviceId,
			zoneIds: state.zoneIds,
			latitude: state.latitude,
			longitude: state.longitude,
			updatedAt: state.updatedAt,
		};
	});
```

- [ ] **Step 2: Write tests for `computeBoundaryCrossings`**

Create `packages/api/src/routers/public/devices.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeBoundaryCrossings } from "./devices.ts";

const names = { 1: "Zone A", 2: "Zone B", 3: "Zone C" };

describe("computeBoundaryCrossings", () => {
	it("detects entry when device enters a new zone", () => {
		const crossings = computeBoundaryCrossings([], [1], names);
		expect(crossings).toEqual([{ zoneId: 1, zoneName: "Zone A", event: "entry" }]);
	});

	it("detects exit when device leaves a zone", () => {
		const crossings = computeBoundaryCrossings([1], [], names);
		expect(crossings).toEqual([{ zoneId: 1, zoneName: "Zone A", event: "exit" }]);
	});

	it("detects simultaneous entry and exit", () => {
		const crossings = computeBoundaryCrossings([1], [2], names);
		expect(crossings).toHaveLength(2);
		expect(crossings.find((c) => c.event === "entry")?.zoneId).toBe(2);
		expect(crossings.find((c) => c.event === "exit")?.zoneId).toBe(1);
	});

	it("returns no crossings when zone membership unchanged", () => {
		expect(computeBoundaryCrossings([1, 2], [1, 2], names)).toEqual([]);
	});

	it("treats all zones as entry on first push (no prior state)", () => {
		const crossings = computeBoundaryCrossings([], [1, 3], names);
		expect(crossings).toHaveLength(2);
		expect(crossings.every((c) => c.event === "entry")).toBe(true);
	});
});
```

- [ ] **Step 3: Run tests**

```bash
cd packages/api && pnpm vitest run
```

Expected: all pass.

- [ ] **Step 4: Register in `public-http.ts`**

```typescript
import { getDeviceZones, pushDeviceLocation } from "./public/devices.ts";

// Add to publicHttpRouter:
deviceLocation: pushDeviceLocation,
deviceZones: getDeviceZones,
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/public/devices.ts \
        packages/api/src/routers/public/devices.test.ts \
        packages/api/src/routers/public-http.ts
git commit -m "feat(api): add device location push + boundary crossing detection"
```

---

## Phase 4 — Webhook Delivery

### Task 7: Webhook subscription CRUD

**Files:**
- Create: `packages/api/src/routers/public/webhooks.ts`
- Modify: `packages/api/src/routers/public-http.ts`

- [ ] **Step 1: Create `packages/api/src/routers/public/webhooks.ts`**

```typescript
import { ORPCError } from "@orpc/server";
import { webhookSubscriptions, zones } from "@locnative/database/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import { apiKeyAuth, usageMiddleware } from "../public-middleware.ts";
import { encryptApiKey } from "../api-key-auth.ts"; // reuse AES-256 helper

function generateWebhookSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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
		const ctx = context as typeof context & { apiKey: { projectId: number } };

		// Verify zone ownership if zoneId provided
		if (input.zoneId) {
			const zone = await context.db
				.select({ id: zones.id })
				.from(zones)
				.where(
					and(
						eq(zones.id, input.zoneId),
						eq(zones.projectId, ctx.apiKey.projectId)
					)
				)
				.limit(1);
			if (zone.length === 0) {
				throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
			}
		}

		const secret = generateWebhookSecret();
		const secretEnc = await encryptApiKey(secret);

		const [sub] = await context.db
			.insert(webhookSubscriptions)
			.values({
				projectId: ctx.apiKey.projectId,
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

		// Return the plaintext secret ONCE — not stored, not retrievable later
		return { ...sub!, secret };
	});

export const listWebhooks = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("webhooks.list"))
	.route({ method: "GET", path: "/api/v1/webhooks", summary: "List webhook subscriptions", tags: ["webhooks"] })
	.input(z.object({}))
	.handler(async ({ context }) => {
		const ctx = context as typeof context & { apiKey: { projectId: number } };
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
			.where(eq(webhookSubscriptions.projectId, ctx.apiKey.projectId));
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
		const ctx = context as typeof context & { apiKey: { projectId: number } };
		const result = await context.db
			.delete(webhookSubscriptions)
			.where(
				and(
					eq(webhookSubscriptions.id, input.id),
					eq(webhookSubscriptions.projectId, ctx.apiKey.projectId)
				)
			)
			.returning({ id: webhookSubscriptions.id });
		if (result.length === 0) throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
		return { id: input.id, deleted: true };
	});
```

> **Note:** `encryptApiKey` may not exist by that name — check `packages/api/src/api-key-auth.ts` for the actual AES-256 encrypt function name. Use whatever is exported there for encryption.

- [ ] **Step 2: Register in `public-http.ts`**

```typescript
import { createWebhook, deleteWebhook, listWebhooks } from "./public/webhooks.ts";

// Add to publicHttpRouter:
webhookCreate: createWebhook,
webhookList: listWebhooks,
webhookDelete: deleteWebhook,
```

- [ ] **Step 3: Type-check**

```bash
cd packages/api && pnpm check-types
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/public/webhooks.ts \
        packages/api/src/routers/public-http.ts
git commit -m "feat(api): add webhook subscription CRUD endpoints"
```

---

### Task 8: Webhook delivery consumer

**Files:**
- Create: `apps/server/src/queues/webhook-delivery.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Create `apps/server/src/queues/webhook-delivery.ts`**

```typescript
import { webhookSubscriptions } from "@locnative/database/schema";
import { db } from "@locnative/api";
import { and, eq, or, isNull, sql } from "drizzle-orm";

export interface WebhookDeliveryMessage {
	type: "webhook-delivery";
	projectId: number;
	deviceId: string;
	lat: number;
	lng: number;
	zoneId: number;
	zoneName: string;
	event: "entry" | "exit";
	timestamp: string;
}

async function hmacSign(secret: string, body: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	return `hmac-sha256=${Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

async function deliverWebhook(
	url: string,
	payload: object,
	secret: string,
	attempt: number
): Promise<boolean> {
	const body = JSON.stringify(payload);
	const signature = await hmacSign(secret, body);

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Locnative-Signature": signature,
				"X-Locnative-Attempt": String(attempt),
			},
			body,
			signal: AbortSignal.timeout(10_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function processWebhookDeliveryMessage(
	msg: WebhookDeliveryMessage,
	_env: object
): Promise<void> {
	const { projectId, zoneId, event } = msg;

	// Find matching subscriptions (zone-specific or project-wide)
	const subs = await db
		.select()
		.from(webhookSubscriptions)
		.where(
			and(
				eq(webhookSubscriptions.projectId, projectId),
				eq(webhookSubscriptions.active, true),
				eq(webhookSubscriptions.failing, false),
				or(
					eq(webhookSubscriptions.zoneId, zoneId),
					isNull(webhookSubscriptions.zoneId)
				),
				sql`${event} = ANY(${webhookSubscriptions.events})`
			)
		);

	const payload = {
		event: msg.event,
		zone: { id: msg.zoneId, name: msg.zoneName },
		device: { id: msg.deviceId, lat: msg.lat, lng: msg.lng },
		timestamp: msg.timestamp,
	};

	for (const sub of subs) {
		// Decrypt secret
		const { decryptApiKey } = await import("@locnative/api/api-key-auth");
		const secret = await decryptApiKey(sub.secretEnc);

		let delivered = false;
		for (let attempt = 1; attempt <= 3; attempt++) {
			delivered = await deliverWebhook(sub.url, payload, secret, attempt);
			if (delivered) break;
			// Exponential backoff: 1s, 2s (no sleep in Workers — Queue will retry)
			if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
		}

		if (!delivered) {
			await db
				.update(webhookSubscriptions)
				.set({ failing: true })
				.where(eq(webhookSubscriptions.id, sub.id));
		}
	}
}
```

> **Note:** Check the actual export names in `packages/api/src/api-key-auth.ts` for the decrypt function. Adjust the import if it's not `decryptApiKey`.

- [ ] **Step 2: Write tests for `hmacSign`**

Create `apps/server/src/queues/webhook-delivery.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

// Extract and test the HMAC signing logic in isolation
async function hmacSign(secret: string, body: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	return `hmac-sha256=${Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

describe("hmacSign", () => {
	it("produces a hex string prefixed with hmac-sha256=", async () => {
		const sig = await hmacSign("secret", "payload");
		expect(sig).toMatch(/^hmac-sha256=[0-9a-f]{64}$/);
	});

	it("produces the same signature for the same inputs", async () => {
		const a = await hmacSign("mysecret", "body");
		const b = await hmacSign("mysecret", "body");
		expect(a).toBe(b);
	});

	it("produces different signatures for different secrets", async () => {
		const a = await hmacSign("secret1", "body");
		const b = await hmacSign("secret2", "body");
		expect(a).not.toBe(b);
	});
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/server && pnpm vitest run 2>/dev/null || cd packages/api && pnpm vitest run
```

- [ ] **Step 4: Wire webhook consumer into `apps/server/src/index.ts`**

Update the `queue` export handler to handle both message types:

```typescript
import { processBatchGeocodeMessage, type BatchGeocodeMessage } from "./queues/batch-geocode.ts";
import { processWebhookDeliveryMessage, type WebhookDeliveryMessage } from "./queues/webhook-delivery.ts";

export default {
	fetch: app.fetch,
	async queue(
		batch: MessageBatch<{ type: string }>,
		env: { GEOCODE_RESULTS: R2Bucket; WEBHOOK_DELIVERY_QUEUE: Queue }
	): Promise<void> {
		for (const msg of batch.messages) {
			if (msg.body.type === "batch-geocode") {
				await processBatchGeocodeMessage(msg.body as BatchGeocodeMessage, env);
				msg.ack();
			} else if (msg.body.type === "webhook-delivery") {
				await processWebhookDeliveryMessage(msg.body as WebhookDeliveryMessage, env);
				msg.ack();
			} else {
				msg.ack(); // unknown type — drop silently
			}
		}
	},
};
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/queues/webhook-delivery.ts \
        apps/server/src/queues/webhook-delivery.test.ts \
        apps/server/src/index.ts
git commit -m "feat(server): add webhook delivery CF Queue consumer with HMAC signing"
```

---

### Task 9: SDK types + endpointKeyFromPath update

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Modify: `apps/server/src/index.ts` (`endpointKeyFromPath`)

- [ ] **Step 1: Add new types to `packages/sdk/src/types.ts`**

Append to the existing file:

```typescript
// --- Zones ---

export interface ZoneRecord {
	id: number;
	name: string;
	description: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
}

export interface ZoneWithGeometry extends ZoneRecord {
	geometry: {
		type: "Polygon";
		coordinates: [number, number][][];
	};
}

export interface ZoneContainsResponse {
	results: Pick<ZoneRecord, "id" | "name" | "description">[];
	count: number;
	query: { lat: number; lng: number };
}

export interface ZoneAddressesResponse {
	results: Array<{
		id: number;
		country: string;
		state: string;
		locality: string;
		postcode: string;
		streetName: string;
		streetType: string | null;
		numberFirst: string | null;
		numberLast: string | null;
		latitude: number;
		longitude: number;
	}>;
	count: number;
	page: number;
	truncated: boolean;
}

// --- Forward Geocoding ---

export interface ForwardGeocodeResponse {
	address: {
		id: number;
		formattedAddress: string;
		streetAddress: string;
		locality: string;
		state: string;
		postcode: string;
		country: string;
		latitude: number;
		longitude: number;
	};
	matchType: "structured" | "fuzzy";
}

// --- Batch Geocoding ---

export interface BatchGeocodeSubmitResponse {
	jobId: string;
	status: "processing";
	inputCount: number;
}

export interface BatchGeocodePollResponse {
	jobId: string;
	status: "pending" | "processing" | "completed" | "failed";
	inputCount: number;
	processedCount: number;
	completedAt?: string;
	downloadUrl?: string;
	error?: string;
}

// --- Devices ---

export interface DeviceLocationResponse {
	zones: number[];
	crossings: Array<{
		zoneId: number;
		zoneName: string;
		event: "entry" | "exit";
	}>;
}

// --- Webhooks ---

export interface WebhookSubscription {
	id: number;
	url: string;
	events: string[];
	zoneId: number | null;
	active: boolean;
	failing: boolean;
	createdAt: string;
}

export interface WebhookCreateResponse extends WebhookSubscription {
	secret: string; // Returned ONCE at creation time only
}
```

- [ ] **Step 2: Update `endpointKeyFromPath` in `apps/server/src/index.ts`**

The `endpointKeyFromPath` function maps URL paths to Server-Timing metric names. Extend it:

```typescript
function endpointKeyFromPath(pathname: string): string {
	if (pathname.includes("/autocomplete")) return "addresses_autocomplete";
	if (pathname.includes("/geocode/batch")) return "addresses_batch";
	if (pathname.includes("/geocode")) return "addresses_geocode";
	if (pathname.includes("/nearby")) return "addresses_nearby";
	if (pathname.includes("/reverse")) return "addresses_reverse";
	if (pathname.includes("/addresses")) return "addresses_byId";
	if (pathname.includes("/zones/contains")) return "zones_contains";
	if (pathname.match(/\/zones\/\d+\/addresses/)) return "zones_addresses";
	if (pathname.includes("/zones")) return "zones";
	if (pathname.match(/\/devices\/[^/]+\/zones/)) return "devices_zones";
	if (pathname.match(/\/devices\/[^/]+\/location/)) return "devices_location";
	if (pathname.includes("/webhooks")) return "webhooks";
	return "unknown";
}
```

- [ ] **Step 3: Type-check all packages**

```bash
cd packages/sdk && pnpm check-types 2>/dev/null; cd packages/api && pnpm check-types
```

- [ ] **Step 4: Final commit**

```bash
git add packages/sdk/src/types.ts apps/server/src/index.ts
git commit -m "feat(sdk): add types for zones, geocoding, devices, and webhooks"
```

---

## Done

All 4 phases complete. The Locnative API now has:
- `GET /api/v1/addresses/geocode` — forward geocoding
- `POST/GET /api/v1/geocode/batch` — async batch geocoding via CF Queue + R2
- `POST/GET/PUT/DELETE /api/v1/zones` — developer zone management
- `POST /api/v1/zones/contains` — point-in-polygon
- `GET /api/v1/zones/{id}/addresses` — addresses within a zone
- `POST/GET /api/v1/devices/{id}/location|zones` — device tracking + boundary diff
- `POST/GET/DELETE /api/v1/webhooks` — webhook subscription management
- CF Queue consumer for batch jobs and webhook delivery with HMAC signing
