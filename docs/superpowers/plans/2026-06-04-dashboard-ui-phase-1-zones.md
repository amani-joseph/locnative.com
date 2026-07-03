# Dashboard UI — Phase 1: Zones Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dashboard Zones Manager — a session-authed oRPC `zones` domain plus a `/zones` page where users draw/edit polygon geofences on a map, list/delete them, run a point-in-polygon test, and view addresses inside a zone.

**Architecture:** Reuse the Phase 0 foundation. Backend: a new `appRouter.zones` domain (`protectedProcedure`) that calls `requireProjectOwnership` then the shared `zone-queries.ts` functions — the same functions the public API uses, so logic can't drift. Frontend: terra-draw polygon drawing attached to the Phase 0 `<MapCanvas>` via `onMapReady`, the Phase 0 active-project selector for scoping, and oRPC + TanStack Query for data.

**Tech Stack:** oRPC + Drizzle/PostGIS, TanStack Start/Router/Query, MapLibre GL, terra-draw + terra-draw-maplibre-gl-adapter, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-dashboard-ui-geocoding-geofencing-design.md` (Phase 1 section)
**Builds on:** Phase 0 (`docs/superpowers/plans/2026-06-04-dashboard-ui-phase-0-foundation.md`)

## Foundation available from Phase 0 (do not rebuild)
- `apps/web/src/components/map/map-canvas.tsx` — `<MapCanvas onMapReady={(map) => ...} />` (client-only, MapLibre instance via callback).
- `apps/web/src/lib/active-project.ts` — `useActiveProject(ids)` → `{ activeId, select }`; `ActiveProjectSelector` component.
- `packages/api/src/shared/project-ownership.ts` — `requireProjectOwnership(db, projectId, userId): Promise<string>` (throws NOT_FOUND).
- `packages/api/src/shared/zone-queries.ts` — `ZONE_LIMIT`, `countZones`, `isValidPolygon`, `insertZone`, `listZoneRows`, `zonesContainingPoint`, `deleteZoneRow`, type `ZoneRow = Omit<Zone, "geom">`.
- `packages/sdk/src/types.ts` — `ZoneRecord`, `ZoneWithGeometry`, `ZoneContainsResponse`, `ZoneAddressesResponse`.
- oRPC client: `import { orpcClient, orpc } from "@/lib/orpc"` (typed `RouterClient<AppRouter>` + TanStack Query utils).
- `protectedProcedure` from `packages/api/src/procedures.ts` (guarantees `context.session`).

---

## File Map

**Create:**
- `packages/api/src/routers/domains/zones.ts` — session-authed `zonesRouter` (7 procedures)
- `apps/web/src/components/zones/geometry.ts` — pure converters between terra-draw Features and our `GeoJsonPolygon` (+ ring-closing), unit-tested
- `apps/web/src/components/zones/geometry.test.ts`
- `apps/web/src/components/zones/use-zone-draw.ts` — terra-draw lifecycle hook bound to a MapLibre map
- `apps/web/src/components/zones/zone-map.tsx` — `<MapCanvas>` + draw controller + renders existing zones
- `apps/web/src/components/zones/zone-list.tsx` — list panel (select/delete)
- `apps/web/src/components/zones/zone-create-dialog.tsx` — name/description form for a drawn polygon
- `apps/web/src/components/zones/point-test-tool.tsx` — point-in-polygon tester
- `apps/web/src/components/zones/zone-addresses-drawer.tsx` — addresses-in-zone viewer

**Modify:**
- `packages/api/src/shared/zone-queries.ts` — add `listZonesWithGeometry`, `getZoneWithGeometry`, `updateZoneRow`, `addressesInZone`
- `packages/api/src/routers/public/zones.ts` — refactor `zoneGet`/`zoneUpdate`/`zoneAddresses` to delegate to the new shared functions (behavior preserved)
- `packages/api/src/routers/index.ts` — register `zones: zonesRouter`
- `apps/web/src/routes/_protected/zones.tsx` — replace the Phase 0 placeholder with the real page

---

## Task 1: Install terra-draw MapLibre adapter

terra-draw v1 ships adapters as separate packages; only `terra-draw` + `maplibre-gl` were installed in Phase 0.

**Files:** `apps/web/package.json` (via pnpm)

- [ ] **Step 1: Install**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm add terra-draw-maplibre-gl-adapter
```

- [ ] **Step 2: Verify it installed**

```bash
ls -d /Users/mac/Developer/projects/locnative.com/apps/web/node_modules/terra-draw-maplibre-gl-adapter >/dev/null && echo "adapter installed"
```
Expected: `adapter installed`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/package.json pnpm-lock.yaml
git -C /Users/mac/Developer/projects/locnative.com commit -m "build(web): add terra-draw-maplibre-gl-adapter"
```

---

## Task 2: Extend shared zone-queries with get/update/addresses/list-with-geometry

Extract the remaining DB logic so the dashboard router and the public handlers share one implementation. Behavior of the public handlers MUST be preserved.

**Files:**
- Modify: `packages/api/src/shared/zone-queries.ts`
- Modify: `packages/api/src/routers/public/zones.ts`

- [ ] **Step 1: Add four functions to `zone-queries.ts`**

Append to `packages/api/src/shared/zone-queries.ts` (it already imports `addresses`? — it imports only `zones`; add `addresses` to the schema import). Add `import type { GeoJsonPolygon }` is already present. New code:

```typescript
// Add `addresses` to the existing schema import:
// import { type Zone, addresses, zones } from "@locnative/database/schema";

export const ADDRESSES_IN_ZONE_HARD_CAP = 10_000;

export interface ZoneWithGeometryRow {
	id: number;
	projectId: string;
	name: string;
	description: string | null;
	metadata: Record<string, unknown> | null;
	geometry: GeoJsonPolygon;
	createdAt: string;
	updatedAt: string;
}

/** All zones for a project, geometry included as GeoJSON (for map rendering). */
export async function listZonesWithGeometry(
	db: Database,
	projectId: string
): Promise<ZoneWithGeometryRow[]> {
	const result = await db.execute(sql`
		SELECT id, project_id AS "projectId", name, description, metadata,
		       ST_AsGeoJSON(geom)::json AS geometry,
		       created_at AS "createdAt", updated_at AS "updatedAt"
		FROM zones
		WHERE project_id = ${projectId}
		ORDER BY created_at DESC
	`);
	return result.rows as unknown as ZoneWithGeometryRow[];
}

/** One zone with geometry, scoped to the project. Null if not found. */
export async function getZoneWithGeometry(
	db: Database,
	projectId: string,
	zoneId: number
): Promise<ZoneWithGeometryRow | null> {
	const result = await db.execute(sql`
		SELECT id, project_id AS "projectId", name, description, metadata,
		       ST_AsGeoJSON(geom)::json AS geometry,
		       created_at AS "createdAt", updated_at AS "updatedAt"
		FROM zones
		WHERE id = ${zoneId} AND project_id = ${projectId}
		LIMIT 1
	`);
	return (result.rows[0] as unknown as ZoneWithGeometryRow) ?? null;
}

/** Update mutable fields of a zone. Returns false if the zone isn't owned. */
export async function updateZoneRow(
	db: Database,
	projectId: string,
	zoneId: number,
	patch: {
		name?: string;
		description?: string;
		geometry?: GeoJsonPolygon;
		metadata?: Record<string, unknown>;
	}
): Promise<boolean> {
	const sets: ReturnType<typeof sql>[] = [];
	if (patch.name !== undefined) {
		sets.push(sql`name = ${patch.name}`);
	}
	if (patch.description !== undefined) {
		sets.push(sql`description = ${patch.description}`);
	}
	if (patch.metadata !== undefined) {
		sets.push(sql`metadata = ${JSON.stringify(patch.metadata)}::jsonb`);
	}
	if (patch.geometry !== undefined) {
		sets.push(
			sql`geom = ST_GeomFromGeoJSON(${JSON.stringify(patch.geometry)})`
		);
	}
	sets.push(sql`updated_at = now()`);

	const result = await db.execute(sql`
		UPDATE zones SET ${sql.join(sets, sql`, `)}
		WHERE id = ${zoneId} AND project_id = ${projectId}
		RETURNING id
	`);
	return result.rows.length > 0;
}

export interface ZoneAddressRow {
	id: number;
	country: string;
	state: string;
	locality: string;
	postcode: string;
	streetName: string;
	streetType: string | null;
	numberFirst: string | null;
	numberLast: string | null;
	buildingName: string | null;
	flatType: string | null;
	flatNumber: string | null;
	longitude: number;
	latitude: number;
}

export interface ZoneAddressesResult {
	results: ZoneAddressRow[];
	count: number;
	truncated: boolean;
}

/**
 * Addresses within a zone (ST_Within), paginated, capped at
 * ADDRESSES_IN_ZONE_HARD_CAP total. Assumes the caller already verified
 * the zone belongs to the project.
 */
export async function addressesInZone(
	db: Database,
	projectId: string,
	zoneId: number,
	page: number,
	limit: number
): Promise<ZoneAddressesResult> {
	const offset = (page - 1) * limit;
	if (offset >= ADDRESSES_IN_ZONE_HARD_CAP) {
		return { results: [], count: 0, truncated: true };
	}
	const effectiveLimit = Math.min(limit, ADDRESSES_IN_ZONE_HARD_CAP - offset);

	const rows = await db
		.select({
			id: addresses.id,
			country: addresses.country,
			state: addresses.state,
			locality: addresses.locality,
			postcode: addresses.postcode,
			streetName: addresses.streetName,
			streetType: addresses.streetType,
			numberFirst: addresses.numberFirst,
			numberLast: addresses.numberLast,
			buildingName: addresses.buildingName,
			flatType: addresses.flatType,
			flatNumber: addresses.flatNumber,
			longitude: addresses.longitude,
			latitude: addresses.latitude,
		})
		.from(addresses)
		.innerJoin(zones, sql`ST_Within(${addresses.geom}, ${zones.geom})`)
		.where(and(eq(zones.id, zoneId), eq(zones.projectId, projectId)))
		.limit(effectiveLimit)
		.offset(offset);

	const truncated = offset + rows.length >= ADDRESSES_IN_ZONE_HARD_CAP;
	return { results: rows as ZoneAddressRow[], count: rows.length, truncated };
}
```

> Verify the existing import line in `zone-queries.ts` and add `addresses` to it. The file already imports `and, eq, sql` from `drizzle-orm` — reuse those.

- [ ] **Step 2: Refactor the three public handlers to delegate**

In `packages/api/src/routers/public/zones.ts`, add to the existing `zone-queries` import: `addressesInZone, getZoneWithGeometry, updateZoneRow`, and `isValidPolygon` (already imported). Then:

**`zoneGet`** — replace the inline `db.execute(...ST_AsGeoJSON...)` body with:
```typescript
.handler(async ({ input, context }) => {
	const ctx = context as typeof context & AuthContext;
	const projectId = requireProjectId(ctx.validatedApiKey.projectId);
	const zone = await getZoneWithGeometry(context.db, projectId, input.id);
	if (!zone) {
		throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
	}
	return zone;
});
```

**`zoneUpdate`** — preserve its current behavior (verify ownership, validate geometry if provided, update). Replace the body with:
```typescript
.handler(async ({ input, context }) => {
	const ctx = context as typeof context & AuthContext;
	const projectId = requireProjectId(ctx.validatedApiKey.projectId);
	if (input.geometry && !(await isValidPolygon(context.db, input.geometry))) {
		throw new ORPCError("UNPROCESSABLE_CONTENT", {
			message: "Provided geometry is not a valid polygon.",
		});
	}
	const updated = await updateZoneRow(context.db, projectId, input.id, {
		name: input.name,
		description: input.description,
		geometry: input.geometry,
		metadata: input.metadata,
	});
	if (!updated) {
		throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
	}
	return { success: true };
});
```
> Check the CURRENT `zoneUpdate` return value first. If it returns something other than `{ success: true }`, preserve whatever it returns. Match it exactly.

**`zoneAddresses`** — replace the body (ownership check + ST_Within query) with:
```typescript
.handler(async ({ input, context }) => {
	const ctx = context as typeof context & AuthContext;
	const projectId = requireProjectId(ctx.validatedApiKey.projectId);
	const { id, page, limit } = input;
	const out = await addressesInZone(context.db, projectId, id, page, limit);
	return { ...out, query: { id, page, limit } };
});
```
> The current handler returns `{ results, count, truncated, query: { id, page, limit } }`. Confirm and preserve that exact shape. Note: the public handler did an explicit ownership pre-check returning NOT_FOUND for a missing zone; `addressesInZone` instead returns empty results for a non-owned/missing zone (the WHERE clause filters by projectId). If preserving the NOT_FOUND behavior matters, keep the existing ownership pre-check in the handler before calling `addressesInZone`. Preserve existing behavior — re-read the current handler and keep its NOT_FOUND path if present.

- [ ] **Step 3: Type-check**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm check-types 2>&1 | grep -v "api-explorer.ts(204" | grep -i error || echo "no new errors"
```
Expected: `no new errors`.

- [ ] **Step 4: Run existing zone tests**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm vitest run src/routers/public/zones.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add packages/api/src/shared/zone-queries.ts packages/api/src/routers/public/zones.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "refactor(api): extract get/update/addresses/list-with-geometry zone queries"
```

---

## Task 3: Dashboard zones oRPC domain

**Files:**
- Create: `packages/api/src/routers/domains/zones.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create the dashboard zones router**

Create `packages/api/src/routers/domains/zones.ts`. Every procedure is `protectedProcedure`, takes `projectId`, and calls `requireProjectOwnership` before any zone op:

```typescript
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";
import { requireProjectOwnership } from "../../shared/project-ownership.ts";
import {
	addressesInZone,
	countZones,
	deleteZoneRow,
	getZoneWithGeometry,
	insertZone,
	isValidPolygon,
	listZonesWithGeometry,
	updateZoneRow,
	ZONE_LIMIT,
	zonesContainingPoint,
} from "../../shared/zone-queries.ts";
import { geoJsonPolygonSchema } from "../public/zones-schema.ts";

const projectIdInput = z.object({ projectId: z.string().uuid() });

export const zonesRouter = {
	list: protectedProcedure
		.input(projectIdInput)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const zones = await listZonesWithGeometry(context.db, projectId);
			return { zones, count: zones.length };
		}),

	get: protectedProcedure
		.input(projectIdInput.extend({ id: z.number().int().min(1) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const zone = await getZoneWithGeometry(context.db, projectId, input.id);
			if (!zone) {
				throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
			}
			return zone;
		}),

	create: protectedProcedure
		.input(
			projectIdInput.extend({
				name: z.string().min(1).max(255),
				description: z.string().optional(),
				geometry: geoJsonPolygonSchema,
				metadata: z.record(z.string(), z.unknown()).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			if ((await countZones(context.db, projectId)) >= ZONE_LIMIT) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Zone limit reached (500). Delete unused zones to create new ones.",
				});
			}
			if (!(await isValidPolygon(context.db, input.geometry))) {
				throw new ORPCError("UNPROCESSABLE_CONTENT", {
					message: "Provided geometry is not a valid polygon.",
				});
			}
			return await insertZone(context.db, projectId, {
				name: input.name,
				description: input.description,
				geometry: input.geometry,
				metadata: input.metadata,
			});
		}),

	update: protectedProcedure
		.input(
			projectIdInput.extend({
				id: z.number().int().min(1),
				name: z.string().min(1).max(255).optional(),
				description: z.string().optional(),
				geometry: geoJsonPolygonSchema.optional(),
				metadata: z.record(z.string(), z.unknown()).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			if (input.geometry && !(await isValidPolygon(context.db, input.geometry))) {
				throw new ORPCError("UNPROCESSABLE_CONTENT", {
					message: "Provided geometry is not a valid polygon.",
				});
			}
			const updated = await updateZoneRow(context.db, projectId, input.id, {
				name: input.name,
				description: input.description,
				geometry: input.geometry,
				metadata: input.metadata,
			});
			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
			}
			return { success: true };
		}),

	delete: protectedProcedure
		.input(projectIdInput.extend({ id: z.number().int().min(1) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const deleted = await deleteZoneRow(context.db, projectId, input.id);
			if (!deleted) {
				throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
			}
			return { success: true };
		}),

	contains: protectedProcedure
		.input(
			projectIdInput.extend({
				lat: z.number().min(-90).max(90),
				lng: z.number().min(-180).max(180),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const zones = await zonesContainingPoint(
				context.db,
				projectId,
				input.lat,
				input.lng
			);
			return { zones, count: zones.length, query: { lat: input.lat, lng: input.lng } };
		}),

	addresses: protectedProcedure
		.input(
			projectIdInput.extend({
				id: z.number().int().min(1),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(500).default(50),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const zone = await getZoneWithGeometry(context.db, projectId, input.id);
			if (!zone) {
				throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
			}
			const out = await addressesInZone(
				context.db,
				projectId,
				input.id,
				input.page,
				input.limit
			);
			return { ...out, query: { id: input.id, page: input.page, limit: input.limit } };
		}),
};
```

- [ ] **Step 2: Register in `appRouter`**

Edit `packages/api/src/routers/index.ts` to import and register the router:

```typescript
import { zonesRouter } from "./domains/zones.ts";

export const appRouter = {
	apiExplorer: apiExplorerRouter,
	apiKeys: apiKeysRouter,
	auth: authRouter,
	dashboard: dashboardRouter,
	projects: projectsRouter,
	zones: zonesRouter,
};
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm check-types 2>&1 | grep -v "api-explorer.ts(204" | grep -i error || echo "no new errors"
```
Expected: `no new errors`.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add packages/api/src/routers/domains/zones.ts packages/api/src/routers/index.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(api): add session-authed dashboard zones oRPC domain"
```

---

## Task 4: Geometry converters (pure, tested)

terra-draw emits GeoJSON `Feature` objects; our API wants a bare `GeoJsonPolygon` (`{ type, coordinates }`) with a closed ring. These converters isolate that logic so it's testable without a map.

**Files:**
- Create: `apps/web/src/components/zones/geometry.ts`
- Create: `apps/web/src/components/zones/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/zones/geometry.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { closeRing, featureToPolygon, type DrawFeature } from "./geometry.ts";

const openRing: [number, number][] = [
	[151.2, -33.8],
	[151.3, -33.8],
	[151.3, -33.9],
	[151.2, -33.9],
];
const closedRing: [number, number][] = [...openRing, [151.2, -33.8]];

describe("closeRing", () => {
	it("appends the first coord when the ring is open", () => {
		expect(closeRing(openRing)).toEqual(closedRing);
	});
	it("leaves an already-closed ring unchanged", () => {
		expect(closeRing(closedRing)).toEqual(closedRing);
	});
});

describe("featureToPolygon", () => {
	it("extracts a closed Polygon from a terra-draw Feature", () => {
		const feature: DrawFeature = {
			type: "Feature",
			properties: {},
			geometry: { type: "Polygon", coordinates: [closedRing] },
		};
		expect(featureToPolygon(feature)).toEqual({
			type: "Polygon",
			coordinates: [closedRing],
		});
	});
	it("closes an open ring coming from the draw tool", () => {
		const feature: DrawFeature = {
			type: "Feature",
			properties: {},
			geometry: { type: "Polygon", coordinates: [openRing] },
		};
		expect(featureToPolygon(feature)).toEqual({
			type: "Polygon",
			coordinates: [closedRing],
		});
	});
	it("returns null for a non-polygon feature", () => {
		const feature = {
			type: "Feature",
			properties: {},
			geometry: { type: "Point", coordinates: [151.2, -33.8] },
		} as unknown as DrawFeature;
		expect(featureToPolygon(feature)).toBeNull();
	});
});
```

- [ ] **Step 2: Run it — expect FAIL (module missing)**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/components/zones/geometry.test.ts
```

- [ ] **Step 3: Implement `geometry.ts`**

```typescript
import type { GeoJsonPolygon } from "@locnative/api/routers/public/zones-schema";

export interface DrawFeature {
	type: "Feature";
	properties: Record<string, unknown>;
	geometry: {
		type: string;
		coordinates: unknown;
	};
}

/** Ensure a linear ring is closed (first coord repeated at the end). */
export function closeRing(ring: [number, number][]): [number, number][] {
	if (ring.length === 0) {
		return ring;
	}
	const first = ring[0];
	const last = ring[ring.length - 1];
	if (first[0] === last[0] && first[1] === last[1]) {
		return ring;
	}
	return [...ring, first];
}

/** Convert a terra-draw Polygon Feature into our API's GeoJsonPolygon. */
export function featureToPolygon(feature: DrawFeature): GeoJsonPolygon | null {
	if (feature.geometry.type !== "Polygon") {
		return null;
	}
	const rings = feature.geometry.coordinates as [number, number][][];
	return {
		type: "Polygon",
		coordinates: rings.map(closeRing),
	};
}

/** Build a terra-draw-compatible Feature from a stored polygon (for editing). */
export function polygonToFeature(
	polygon: GeoJsonPolygon,
	id?: string
): DrawFeature & { id?: string } {
	return {
		...(id ? { id } : {}),
		type: "Feature",
		properties: { mode: "polygon" },
		geometry: { type: "Polygon", coordinates: polygon.coordinates },
	};
}
```

> If `@locnative/api/routers/public/zones-schema` is not resolvable as an import path from the web app, fall back to a local structural type: `export type GeoJsonPolygon = { type: "Polygon"; coordinates: [number, number][][] }`. Check the api package `exports` map first; the package exposes `./*` → `./src/*.ts`, so `@locnative/api/routers/public/zones-schema` should resolve. Report which form you used.

- [ ] **Step 4: Run the test — expect PASS (5 tests)**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/components/zones/geometry.test.ts
```

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/zones/geometry.ts apps/web/src/components/zones/geometry.test.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add zone geometry converters (terra-draw <-> GeoJsonPolygon)"
```

---

## Task 5: Zone map with terra-draw drawing

**Files:**
- Create: `apps/web/src/components/zones/use-zone-draw.ts`
- Create: `apps/web/src/components/zones/zone-map.tsx`

- [ ] **Step 1: Implement the draw hook**

Create `apps/web/src/components/zones/use-zone-draw.ts`. It wires terra-draw to a MapLibre map once the map is ready, exposes start/clear/load, and reports finished polygons. terra-draw v1 API: `new TerraDraw({ adapter, modes })`, `.start()`, `.setMode("polygon" | "select")`, `.on("finish", cb)`, `.getSnapshot()`, `.addFeatures()`, `.clear()`.

```typescript
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	featureToPolygon,
	polygonToFeature,
	type DrawFeature,
} from "./geometry.ts";
import type { GeoJsonPolygon } from "@locnative/api/routers/public/zones-schema";

export interface UseZoneDraw {
	startDrawing: () => void;
	stopDrawing: () => void;
	clear: () => void;
	loadPolygon: (polygon: GeoJsonPolygon) => void;
	/** The most recently finished polygon, or null. */
	drawnPolygon: GeoJsonPolygon | null;
	resetDrawn: () => void;
}

export function useZoneDraw(map: MapLibreMap | null): UseZoneDraw {
	// biome-ignore lint/suspicious/noExplicitAny: terra-draw instance type
	const drawRef = useRef<any>(null);
	const [drawnPolygon, setDrawnPolygon] = useState<GeoJsonPolygon | null>(null);

	useEffect(() => {
		if (!map) {
			return;
		}
		let disposed = false;
		Promise.all([
			import("terra-draw"),
			import("terra-draw-maplibre-gl-adapter"),
			import("maplibre-gl"),
		]).then(([terra, adapterMod, maplibre]) => {
			if (disposed) {
				return;
			}
			const { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } = terra;
			const { TerraDrawMapLibreGLAdapter } = adapterMod;
			const draw = new TerraDraw({
				adapter: new TerraDrawMapLibreGLAdapter({
					map,
					// biome-ignore lint/suspicious/noExplicitAny: lib type interop
					lib: (maplibre as any).default ?? maplibre,
				}),
				modes: [new TerraDrawPolygonMode(), new TerraDrawSelectMode()],
			});
			draw.start();
			draw.on("finish", () => {
				const snapshot = draw.getSnapshot() as DrawFeature[];
				const last = snapshot.at(-1);
				if (last) {
					const polygon = featureToPolygon(last);
					if (polygon) {
						setDrawnPolygon(polygon);
					}
				}
			});
			drawRef.current = draw;
		});

		return () => {
			disposed = true;
			if (drawRef.current) {
				drawRef.current.stop();
				drawRef.current = null;
			}
		};
	}, [map]);

	const startDrawing = useCallback(() => {
		drawRef.current?.setMode("polygon");
	}, []);
	const stopDrawing = useCallback(() => {
		drawRef.current?.setMode("select");
	}, []);
	const clear = useCallback(() => {
		drawRef.current?.clear();
		setDrawnPolygon(null);
	}, []);
	const loadPolygon = useCallback((polygon: GeoJsonPolygon) => {
		if (!drawRef.current) {
			return;
		}
		drawRef.current.clear();
		drawRef.current.addFeatures([polygonToFeature(polygon)]);
	}, []);
	const resetDrawn = useCallback(() => setDrawnPolygon(null), []);

	return {
		startDrawing,
		stopDrawing,
		clear,
		loadPolygon,
		drawnPolygon,
		resetDrawn,
	};
}
```

> **terra-draw adapter constructor** differs slightly across 1.x minors. Verify the installed `terra-draw-maplibre-gl-adapter` constructor signature (read its `dist/*.d.ts`). The canonical v1 form is `new TerraDrawMapLibreGLAdapter({ map, lib })` where `lib` is the maplibre-gl module. If the installed version omits `lib`, drop it. Report the exact signature used. The import style `import { useCallback, useEffect, useRef, useState } from "react"` must match repo convention.

- [ ] **Step 2: Implement the ZoneMap component**

Create `apps/web/src/components/zones/zone-map.tsx`. It renders `<MapCanvas>`, captures the map instance, draws existing zones as a GeoJSON layer, and exposes draw controls via the hook to its parent through props (render-prop / callback):

```typescript
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { MapCanvas } from "@/components/map/map-canvas";
import type { ZoneWithGeometryRow } from "@locnative/api/shared/zone-queries";
import { useZoneDraw, type UseZoneDraw } from "./use-zone-draw.ts";

const EXISTING_SRC = "existing-zones";

export interface ZoneMapProps {
	zones: ZoneWithGeometryRow[];
	onReady?: (controls: UseZoneDraw) => void;
}

export function ZoneMap({ zones, onReady }: ZoneMapProps) {
	const [map, setMap] = useState<MapLibreMap | null>(null);
	const draw = useZoneDraw(map);

	useEffect(() => {
		if (map) {
			onReady?.(draw);
		}
	}, [map, draw, onReady]);

	// Render existing zones as a fill+line layer.
	useEffect(() => {
		if (!map) {
			return;
		}
		const fc = {
			type: "FeatureCollection" as const,
			features: zones.map((z) => ({
				type: "Feature" as const,
				properties: { id: z.id, name: z.name },
				geometry: z.geometry,
			})),
		};
		const existing = map.getSource(EXISTING_SRC);
		if (existing) {
			// biome-ignore lint/suspicious/noExplicitAny: GeoJSONSource setData
			(existing as any).setData(fc);
			return;
		}
		// biome-ignore lint/suspicious/noExplicitAny: maplibre source typing
		map.addSource(EXISTING_SRC, { type: "geojson", data: fc } as any);
		map.addLayer({
			id: "existing-zones-fill",
			type: "fill",
			source: EXISTING_SRC,
			paint: { "fill-color": "#6366f1", "fill-opacity": 0.15 },
		});
		map.addLayer({
			id: "existing-zones-line",
			type: "line",
			source: EXISTING_SRC,
			paint: { "line-color": "#6366f1", "line-width": 2 },
		});
	}, [map, zones]);

	return (
		<div style={{ height: 480 }}>
			<MapCanvas onMapReady={setMap} />
		</div>
	);
}
```

> Verify `@locnative/api/shared/zone-queries` resolves (api package `exports` maps `./*` → `./src/*.ts`, so `@locnative/api/shared/zone-queries` should work). If not, import the `ZoneWithGeometryRow` type via a local structural type matching the shared one and report it.

- [ ] **Step 3: Type-check**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "zones/" || echo "no zones errors"
```
Expected: `no zones errors`.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/zones/use-zone-draw.ts apps/web/src/components/zones/zone-map.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add terra-draw zone drawing hook + zone map"
```

---

## Task 6: Zones page — list, create, delete

**Files:**
- Create: `apps/web/src/components/zones/zone-list.tsx`
- Create: `apps/web/src/components/zones/zone-create-dialog.tsx`
- Modify: `apps/web/src/routes/_protected/zones.tsx`

- [ ] **Step 1: Implement the zone list panel**

Create `apps/web/src/components/zones/zone-list.tsx`:

```typescript
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { MapPinIcon, TrashIcon } from "lucide-react";
import type { ZoneWithGeometryRow } from "@locnative/api/shared/zone-queries";

export interface ZoneListProps {
	zones: ZoneWithGeometryRow[];
	selectedId: number | null;
	onSelect: (id: number) => void;
	onDelete: (id: number) => void;
}

export function ZoneList({
	zones,
	selectedId,
	onSelect,
	onDelete,
}: ZoneListProps) {
	if (zones.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground text-sm">
					No zones yet. Draw a polygon on the map to create one.
				</CardContent>
			</Card>
		);
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Zones ({zones.length})</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1">
				{zones.map((zone) => (
					<div
						className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
							zone.id === selectedId ? "bg-accent" : "hover:bg-accent/50"
						}`}
						key={zone.id}
					>
						<button
							className="flex flex-1 items-center gap-2 text-left"
							onClick={() => onSelect(zone.id)}
							type="button"
						>
							<MapPinIcon className="size-4 text-muted-foreground" />
							<span className="truncate">{zone.name}</span>
						</button>
						<Button
							aria-label={`Delete ${zone.name}`}
							onClick={() => onDelete(zone.id)}
							size="icon"
							variant="ghost"
						>
							<TrashIcon className="size-4" />
						</Button>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Implement the create dialog**

Create `apps/web/src/components/zones/zone-create-dialog.tsx`:

```typescript
import { Button } from "@locnative/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { useState } from "react";

export interface ZoneCreateDialogProps {
	open: boolean;
	saving: boolean;
	onCancel: () => void;
	onSubmit: (values: { name: string; description?: string }) => void;
}

export function ZoneCreateDialog({
	open,
	saving,
	onCancel,
	onSubmit,
}: ZoneCreateDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	return (
		<Dialog onOpenChange={(o) => !o && onCancel()} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Name your zone</DialogTitle>
					<DialogDescription>
						Give the polygon you drew a name to save it.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="zone-name">Name</Label>
						<Input
							id="zone-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Sydney CBD"
							value={name}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="zone-desc">Description (optional)</Label>
						<Input
							id="zone-desc"
							onChange={(e) => setDescription(e.target.value)}
							value={description}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={onCancel} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={saving || name.trim().length === 0}
						onClick={() =>
							onSubmit({
								name: name.trim(),
								description: description.trim() || undefined,
							})
						}
					>
						{saving ? "Saving…" : "Save zone"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 3: Wire the zones page**

Replace `apps/web/src/routes/_protected/zones.tsx` with the page that ties map + list + create + delete together using the active-project selector and oRPC:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@locnative/ui/components/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActiveProjectSelector } from "@/components/active-project-selector";
import { ZoneCreateDialog } from "@/components/zones/zone-create-dialog";
import { ZoneList } from "@/components/zones/zone-list";
import { ZoneMap } from "@/components/zones/zone-map";
import type { UseZoneDraw } from "@/components/zones/use-zone-draw";
import { useActiveProject } from "@/lib/active-project";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/zones")({
	component: RouteComponent,
});

type ZoneListItem = Awaited<
	ReturnType<typeof orpcClient.zones.list>
>["zones"][number];

function RouteComponent() {
	const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
	const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
	const { activeId, select } = useActiveProject(projectIds);

	const [zones, setZones] = useState<ZoneListItem[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [controls, setControls] = useState<UseZoneDraw | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		orpcClient.projects
			.list()
			.then((rows) => setProjects(rows.map((r) => ({ id: r.id, name: r.name }))))
			.catch(() => toast.error("Failed to load projects."));
	}, []);

	const refreshZones = useCallback(async (projectId: string) => {
		try {
			const res = await orpcClient.zones.list({ projectId });
			setZones(res.zones);
		} catch {
			toast.error("Failed to load zones.");
		}
	}, []);

	useEffect(() => {
		if (activeId) {
			refreshZones(activeId);
		}
	}, [activeId, refreshZones]);

	const drawn = controls?.drawnPolygon ?? null;
	useEffect(() => {
		if (drawn) {
			setDialogOpen(true);
		}
	}, [drawn]);

	const handleSave = async (values: { name: string; description?: string }) => {
		if (!(activeId && drawn)) {
			return;
		}
		setSaving(true);
		try {
			await orpcClient.zones.create({
				projectId: activeId,
				name: values.name,
				description: values.description,
				geometry: drawn,
			});
			toast.success("Zone created.");
			setDialogOpen(false);
			controls?.clear();
			controls?.resetDrawn();
			await refreshZones(activeId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create zone.");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: number) => {
		if (!activeId) {
			return;
		}
		try {
			await orpcClient.zones.delete({ projectId: activeId, id });
			toast.success("Zone deleted.");
			await refreshZones(activeId);
		} catch {
			toast.error("Failed to delete zone.");
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<ActiveProjectSelector
					activeId={activeId}
					onSelect={select}
					projects={projects}
				/>
				<Button
					onClick={() => controls?.startDrawing()}
					disabled={!(activeId && controls)}
				>
					Draw zone
				</Button>
			</div>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
				<ZoneMap onReady={setControls} zones={zones} />
				<ZoneList
					onDelete={handleDelete}
					onSelect={setSelectedId}
					selectedId={selectedId}
					zones={zones}
				/>
			</div>
			<ZoneCreateDialog
				onCancel={() => {
					setDialogOpen(false);
					controls?.clear();
					controls?.resetDrawn();
				}}
				onSubmit={handleSave}
				open={dialogOpen}
				saving={saving}
			/>
		</div>
	);
}
```

- [ ] **Step 4: Build to confirm compile + route**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -15
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/zones/zone-list.tsx apps/web/src/components/zones/zone-create-dialog.tsx apps/web/src/routes/_protected/zones.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): zones page with map drawing, list, create, delete"
```

---

## Task 7: Point-in-polygon tester

**Files:**
- Create: `apps/web/src/components/zones/point-test-tool.tsx`
- Modify: `apps/web/src/routes/_protected/zones.tsx`

- [ ] **Step 1: Implement the tester**

Create `apps/web/src/components/zones/point-test-tool.tsx`:

```typescript
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { useState } from "react";

export interface PointTestResult {
	zones: { id: number; name: string }[];
}

export interface PointTestToolProps {
	testing: boolean;
	result: PointTestResult | null;
	onTest: (lat: number, lng: number) => void;
}

export function PointTestTool({ testing, result, onTest }: PointTestToolProps) {
	const [lat, setLat] = useState("-33.87");
	const [lng, setLng] = useState("151.21");

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Test a point</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="flex gap-2">
					<div className="flex-1 space-y-1">
						<Label htmlFor="test-lat">Lat</Label>
						<Input id="test-lat" onChange={(e) => setLat(e.target.value)} value={lat} />
					</div>
					<div className="flex-1 space-y-1">
						<Label htmlFor="test-lng">Lng</Label>
						<Input id="test-lng" onChange={(e) => setLng(e.target.value)} value={lng} />
					</div>
				</div>
				<Button
					className="w-full"
					disabled={testing}
					onClick={() => onTest(Number(lat), Number(lng))}
					size="sm"
				>
					{testing ? "Testing…" : "Check zones"}
				</Button>
				{result ? (
					<p className="text-muted-foreground text-sm">
						{result.zones.length === 0
							? "Point is in no zones."
							: `In: ${result.zones.map((z) => z.name).join(", ")}`}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Wire it into the zones page**

In `apps/web/src/routes/_protected/zones.tsx`, add state + handler and render `<PointTestTool>` in the right column under `<ZoneList>`:

```typescript
// add import
import { PointTestTool, type PointTestResult } from "@/components/zones/point-test-tool";

// add state inside RouteComponent
const [testing, setTesting] = useState(false);
const [testResult, setTestResult] = useState<PointTestResult | null>(null);

const handleTest = async (lat: number, lng: number) => {
	if (!activeId || Number.isNaN(lat) || Number.isNaN(lng)) {
		return;
	}
	setTesting(true);
	try {
		const res = await orpcClient.zones.contains({ projectId: activeId, lat, lng });
		setTestResult({ zones: res.zones.map((z) => ({ id: z.id, name: z.name })) });
	} catch {
		toast.error("Point test failed.");
	} finally {
		setTesting(false);
	}
};

// render under ZoneList in the right column (wrap both in a div with space-y-4):
// <PointTestTool onTest={handleTest} result={testResult} testing={testing} />
```

- [ ] **Step 3: Build**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -10
```
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/zones/point-test-tool.tsx apps/web/src/routes/_protected/zones.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add point-in-polygon tester to zones page"
```

---

## Task 8: Addresses-in-zone viewer

**Files:**
- Create: `apps/web/src/components/zones/zone-addresses-drawer.tsx`
- Modify: `apps/web/src/routes/_protected/zones.tsx`

- [ ] **Step 1: Implement the drawer**

Create `apps/web/src/components/zones/zone-addresses-drawer.tsx` using the shadcn Sheet:

```typescript
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@locnative/ui/components/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";

export interface ZoneAddressItem {
	id: number;
	streetName: string;
	locality: string;
	state: string;
	postcode: string;
}

export interface ZoneAddressesDrawerProps {
	open: boolean;
	zoneName: string;
	loading: boolean;
	truncated: boolean;
	addresses: ZoneAddressItem[];
	onClose: () => void;
}

export function ZoneAddressesDrawer({
	open,
	zoneName,
	loading,
	truncated,
	addresses,
	onClose,
}: ZoneAddressesDrawerProps) {
	return (
		<Sheet onOpenChange={(o) => !o && onClose()} open={open}>
			<SheetContent className="w-[480px] sm:max-w-[480px]">
				<SheetHeader>
					<SheetTitle>Addresses in {zoneName}</SheetTitle>
					<SheetDescription>
						{loading
							? "Loading…"
							: `${addresses.length} shown${truncated ? " (capped at 10,000)" : ""}`}
					</SheetDescription>
				</SheetHeader>
				<div className="mt-4 overflow-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Street</TableHead>
								<TableHead>Locality</TableHead>
								<TableHead>Postcode</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{addresses.map((a) => (
								<TableRow key={a.id}>
									<TableCell>{a.streetName}</TableCell>
									<TableCell>
										{a.locality} {a.state}
									</TableCell>
									<TableCell>{a.postcode}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 2: Wire it into the zones page**

In `apps/web/src/routes/_protected/zones.tsx`, add a "View addresses" affordance. Pass an `onViewAddresses` callback to `<ZoneList>` (add a button per row in `zone-list.tsx` next to delete — a `ListIcon` button calling `onViewAddresses(zone.id)`), and on the page:

```typescript
import { ZoneAddressesDrawer, type ZoneAddressItem } from "@/components/zones/zone-addresses-drawer";

const [addrOpen, setAddrOpen] = useState(false);
const [addrLoading, setAddrLoading] = useState(false);
const [addrItems, setAddrItems] = useState<ZoneAddressItem[]>([]);
const [addrTruncated, setAddrTruncated] = useState(false);
const [addrZoneName, setAddrZoneName] = useState("");

const handleViewAddresses = async (id: number) => {
	if (!activeId) {
		return;
	}
	setAddrZoneName(zones.find((z) => z.id === id)?.name ?? "");
	setAddrOpen(true);
	setAddrLoading(true);
	try {
		const res = await orpcClient.zones.addresses({ projectId: activeId, id, page: 1, limit: 100 });
		setAddrItems(
			res.results.map((r) => ({
				id: r.id,
				streetName: r.streetName,
				locality: r.locality,
				state: r.state,
				postcode: r.postcode,
			}))
		);
		setAddrTruncated(res.truncated);
	} catch {
		toast.error("Failed to load addresses.");
	} finally {
		setAddrLoading(false);
	}
};
```

Add `onViewAddresses` to `ZoneListProps` and a `ListIcon` button per row in `zone-list.tsx`. Render `<ZoneAddressesDrawer ... />` at the end of the page JSX.

- [ ] **Step 3: Build**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -10
```
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/zones/zone-addresses-drawer.tsx apps/web/src/components/zones/zone-list.tsx apps/web/src/routes/_protected/zones.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add addresses-in-zone viewer to zones page"
```

---

## Task 9: Edit existing zones

**Files:**
- Modify: `apps/web/src/components/zones/zone-list.tsx`
- Modify: `apps/web/src/routes/_protected/zones.tsx`

- [ ] **Step 1: Add an edit affordance + load geometry into the draw tool**

In `zone-list.tsx`, add an `onEdit?: (id: number) => void` prop and a pencil (`PencilIcon`) button per row.

In the page, implement edit: load the zone's geometry into the draw tool, switch to a "save edit" flow that calls `zones.update`:

```typescript
import { PencilIcon } from "lucide-react"; // (in zone-list.tsx)

// page state
const [editingId, setEditingId] = useState<number | null>(null);

const handleEdit = (id: number) => {
	const zone = zones.find((z) => z.id === id);
	if (!(zone && controls)) {
		return;
	}
	setEditingId(id);
	controls.loadPolygon(zone.geometry);
	controls.stopDrawing(); // select mode so vertices are editable
	toast.info("Edit the polygon, then click Save edit.");
};

const handleSaveEdit = async () => {
	if (!(activeId && editingId && controls?.drawnPolygon)) {
		toast.error("Move a vertex to change the shape before saving.");
		return;
	}
	try {
		await orpcClient.zones.update({
			projectId: activeId,
			id: editingId,
			geometry: controls.drawnPolygon,
		});
		toast.success("Zone updated.");
		setEditingId(null);
		controls.clear();
		controls.resetDrawn();
		await refreshZones(activeId);
	} catch (err) {
		toast.error(err instanceof Error ? err.message : "Failed to update zone.");
	}
};
```

Render a "Save edit" button (visible when `editingId !== null`) in the page header next to "Draw zone". Pass `onEdit={handleEdit}` to `<ZoneList>`.

> terra-draw's select mode emits `finish`/`change` events when vertices move, which updates `controls.drawnPolygon` via the hook's existing `finish` listener. If select-mode edits don't fire `finish` in the installed terra-draw version, also subscribe to the `"change"` event in `use-zone-draw.ts` and update `drawnPolygon` from the snapshot's edited feature. Verify and adjust the hook if needed; report any change.

- [ ] **Step 2: Build**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -10
```
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/zones/zone-list.tsx apps/web/src/components/zones/use-zone-draw.ts apps/web/src/routes/_protected/zones.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): edit existing zone geometry on the map"
```

---

## Done — Phase 1 complete

Verifiable end state:
- `appRouter.zones` exposes typed, session-authed, ownership-checked `list/get/create/update/delete/contains/addresses`, all delegating to the shared `zone-queries` functions (one implementation shared with the public API).
- `/zones` page: select a project, draw a polygon → name it → save; see zones rendered on the map + in a list; delete; edit geometry; test a point for containment; view addresses inside a zone (capped at 10k with a truncation note).
- The 500-zone limit and invalid-polygon errors surface as toasts.

Unblocks: Phase 4 (devices) reuses `<MapCanvas>` + the existing-zones rendering pattern; Phases 2/3/5 remain independent.

## Notes for Phase 4 (carry-forward)
- The existing-zones GeoJSON layer logic in `zone-map.tsx` is a candidate to generalize into a reusable "render GeoJSON layer" helper when devices also needs to overlay zones. Don't pre-extract; do it when Phase 4 consumes it.
- terra-draw adapter/version specifics discovered here should be reused as-is by any later map drawing.
