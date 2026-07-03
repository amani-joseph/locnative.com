# Dashboard UI — Phase 0: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared foundation that all later dashboard UI phases depend on — the map component, the session-authed oRPC ownership pattern, extracted shared zone query logic, the active-project selector, and nav/route scaffolding.

**Architecture:** A client-only `<MapCanvas>` (MapLibre GL on MapTiler tiles) reused by zones + devices; a `requireProjectOwnership` helper for session-authed oRPC procedures; shared PostGIS zone functions extracted from the deployed public handlers so the public API and the forthcoming dashboard oRPC router call one implementation (no drift); an active-project selector storing the selected `projectId`; and sidebar nav + placeholder routes for the four feature pages.

**Tech Stack:** TanStack Start + React 19, MapLibre GL JS, terra-draw (installed now, wired in Phase 1), oRPC, Drizzle ORM, Zod, Vitest, MapTiler free tiles.

**Spec:** `docs/superpowers/specs/2026-06-04-dashboard-ui-geocoding-geofencing-design.md`

## Scoping refinements vs. the spec (deliberate, not gaps)

- **Device-logic extraction → Phase 4.** The spec lists "device upsert/crossings" extraction under Phase 0. There is no consumer until Phase 4, so to avoid speculative refactoring of shipped code, only **zone** query logic is extracted here (Phase 1 consumes it immediately). Phase 4 extracts the device logic alongside its first consumer.
- **terra-draw draw-mode wiring → Phase 1.** Phase 0's `<MapCanvas>` renders the basemap + GeoJSON layers and exposes the map instance via `onMapReady(map)`. Polygon draw/edit (terra-draw) is layered on the map instance in Phase 1, where it has a consumer. terra-draw is installed here so Phase 1 has no dependency step.

---

## File Map

**Create:**
- `apps/web/src/components/map/map-canvas.tsx` — client-only MapLibre map (basemap + GeoJSON layers + `onMapReady`)
- `apps/web/src/components/map/map-style.ts` — pure helper building the MapTiler style URL (testable)
- `apps/web/src/components/map/map-style.test.ts` — unit tests for the style helper
- `packages/api/src/shared/project-ownership.ts` — `requireProjectOwnership(db, projectId, userId)`
- `packages/api/src/shared/project-ownership.test.ts` — unit tests (fake db)
- `packages/api/src/shared/zone-queries.ts` — extracted, auth-free zone DB functions
- `apps/web/src/lib/active-project.ts` — active-project store (localStorage + React hook)
- `apps/web/src/lib/active-project.test.ts` — unit tests for the pure store logic
- `apps/web/src/components/active-project-selector.tsx` — project picker dropdown
- `apps/web/src/routes/_protected/zones.tsx` — placeholder (renders MapCanvas to prove foundation)
- `apps/web/src/routes/_protected/webhooks.tsx` — placeholder
- `apps/web/src/routes/_protected/batch.tsx` — placeholder
- `apps/web/src/routes/_protected/devices.tsx` — placeholder

**Modify:**
- `packages/env/src/web.ts` — add `VITE_MAPTILER_KEY`
- `apps/web/package.json` — add `maplibre-gl`, `terra-draw`
- `packages/api/src/routers/public/zones.ts` — refactor handlers to call `zone-queries.ts`
- `apps/web/src/components/app-shared.tsx` — add "Geocoding" nav group

---

## Task 1: MapTiler env var

**Files:**
- Modify: `packages/env/src/web.ts`

- [ ] **Step 1: Add the client env var**

Edit `packages/env/src/web.ts` to add `VITE_MAPTILER_KEY` as an optional client var (optional so existing dev/CI without the key still boots; map components handle absence):

```typescript
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		VITE_MAPTILER_KEY: z.string().optional(),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
```

- [ ] **Step 2: Document the key for local dev**

Append to `apps/web/.env` (and note in any `.env.example` if present) a commented line so developers know to set it:

```
# MapTiler free-tier key for dashboard maps (https://cloud.maptiler.com/account/keys/)
VITE_MAPTILER_KEY=
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add packages/env/src/web.ts apps/web/.env
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(env): add optional VITE_MAPTILER_KEY for dashboard maps"
```

---

## Task 2: Install map dependencies

**Files:**
- Modify: `apps/web/package.json` (via pnpm)

- [ ] **Step 1: Install**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm add maplibre-gl terra-draw
```

- [ ] **Step 2: Verify they resolve**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && node -e "console.log(require.resolve('maplibre-gl/package.json')); console.log(require.resolve('terra-draw/package.json'))"
```
Expected: two resolved paths printed, no error.

- [ ] **Step 3: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/package.json pnpm-lock.yaml
git -C /Users/mac/Developer/projects/locnative.com commit -m "build(web): add maplibre-gl and terra-draw dependencies"
```

---

## Task 3: MapCanvas component + style helper

**Files:**
- Create: `apps/web/src/components/map/map-style.ts`
- Create: `apps/web/src/components/map/map-style.test.ts`
- Create: `apps/web/src/components/map/map-canvas.tsx`

- [ ] **Step 1: Write the failing test for the style helper**

Create `apps/web/src/components/map/map-style.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildMapStyleUrl, FALLBACK_STYLE } from "./map-style.ts";

describe("buildMapStyleUrl", () => {
	it("builds a MapTiler streets style URL with the key", () => {
		expect(buildMapStyleUrl("abc123")).toBe(
			"https://api.maptiler.com/maps/streets-v2/style.json?key=abc123"
		);
	});

	it("returns the fallback raster-OSM style object when key is missing", () => {
		expect(buildMapStyleUrl(undefined)).toEqual(FALLBACK_STYLE);
	});

	it("returns the fallback when key is an empty string", () => {
		expect(buildMapStyleUrl("")).toEqual(FALLBACK_STYLE);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/components/map/map-style.test.ts
```
Expected: FAIL — cannot find module `./map-style.ts`.

- [ ] **Step 3: Implement the style helper**

Create `apps/web/src/components/map/map-style.ts`:

```typescript
/**
 * MapLibre style resolution. With a MapTiler key we use their vector "streets"
 * style; without one we fall back to a free raster OpenStreetMap style so maps
 * still render in dev/CI that hasn't set the key.
 */

export type MapStyle = string | object;

/** A self-contained raster style using OSM tiles — no API key required. */
export const FALLBACK_STYLE = {
	version: 8,
	sources: {
		osm: {
			type: "raster",
			tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
			tileSize: 256,
			attribution: "© OpenStreetMap contributors",
		},
	},
	layers: [{ id: "osm", type: "raster", source: "osm" }],
} as const;

export function buildMapStyleUrl(maptilerKey: string | undefined): MapStyle {
	if (!maptilerKey) {
		return FALLBACK_STYLE;
	}
	return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/components/map/map-style.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the MapCanvas component**

Create `apps/web/src/components/map/map-canvas.tsx`. It mounts MapLibre only on the client (guards `typeof window`), imports the CSS, renders provided GeoJSON layers, and calls `onMapReady` with the map instance so callers (Phase 1 zones, Phase 4 devices) can attach draw tools / markers:

```typescript
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { env } from "@locnative/env/web";
import { buildMapStyleUrl } from "./map-style.ts";

export interface MapCanvasProps {
	/** [lng, lat] */
	center?: [number, number];
	zoom?: number;
	/** Called once the map has loaded; attach layers/markers/draw here. */
	onMapReady?: (map: MapLibreMap) => void;
	className?: string;
}

// Sydney CBD default
const DEFAULT_CENTER: [number, number] = [151.2093, -33.8688];
const DEFAULT_ZOOM = 10;

export function MapCanvas({
	center = DEFAULT_CENTER,
	zoom = DEFAULT_ZOOM,
	onMapReady,
	className,
}: MapCanvasProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<MapLibreMap | null>(null);

	useEffect(() => {
		if (typeof window === "undefined" || !containerRef.current) {
			return;
		}
		let cancelled = false;
		let map: MapLibreMap | null = null;

		// Dynamic import keeps maplibre out of the SSR bundle.
		import("maplibre-gl").then(({ Map: MapCtor }) => {
			if (cancelled || !containerRef.current) {
				return;
			}
			map = new MapCtor({
				container: containerRef.current,
				style: buildMapStyleUrl(env.VITE_MAPTILER_KEY) as never,
				center,
				zoom,
			});
			mapRef.current = map;
			map.on("load", () => {
				if (!cancelled && map) {
					onMapReady?.(map);
				}
			});
		});

		return () => {
			cancelled = true;
			map?.remove();
			mapRef.current = null;
		};
		// Mount-once: center/zoom changes after mount are driven via the map instance.
		// biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-once
	}, []);

	return (
		<div
			className={className}
			ref={containerRef}
			style={{ width: "100%", height: "100%", minHeight: 360 }}
		/>
	);
}
```

- [ ] **Step 6: Type-check**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm dlx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "map-canvas\|map-style" || echo "no map errors"
```
Expected: `no map errors`.

- [ ] **Step 7: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/map/
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add client-only MapCanvas + style helper (MapTiler/OSM fallback)"
```

---

## Task 4: requireProjectOwnership helper

**Files:**
- Create: `packages/api/src/shared/project-ownership.ts`
- Create: `packages/api/src/shared/project-ownership.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/shared/project-ownership.test.ts`. It uses a tiny fake matching the Drizzle select chain shape the function uses:

```typescript
import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { requireProjectOwnership } from "./project-ownership.ts";

function fakeDb(rows: Array<{ id: string }>) {
	return {
		select() {
			return {
				from() {
					return {
						where() {
							return { limit: async () => rows };
						},
					};
				},
			};
		},
	} as never;
}

describe("requireProjectOwnership", () => {
	it("resolves with the projectId when the user owns the project", async () => {
		const db = fakeDb([{ id: "proj-1" }]);
		await expect(
			requireProjectOwnership(db, "proj-1", "user-1")
		).resolves.toBe("proj-1");
	});

	it("throws NOT_FOUND when no matching project row exists", async () => {
		const db = fakeDb([]);
		await expect(
			requireProjectOwnership(db, "proj-x", "user-1")
		).rejects.toBeInstanceOf(ORPCError);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm vitest run src/shared/project-ownership.test.ts
```
Expected: FAIL — cannot find module `./project-ownership.ts`.

- [ ] **Step 3: Implement the helper**

Create `packages/api/src/shared/project-ownership.ts`:

```typescript
import { ORPCError } from "@orpc/server";
import type { Database } from "@locnative/database";
import { projects } from "@locnative/database/schema";
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm vitest run src/shared/project-ownership.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add packages/api/src/shared/project-ownership.ts packages/api/src/shared/project-ownership.test.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(api): add requireProjectOwnership helper for session-authed procedures"
```

---

## Task 5: Extract shared zone query functions + refactor public handlers

This removes drift risk: the deployed public zone handlers and the Phase 1 dashboard router will both call one implementation. Behavior must be preserved exactly.

**Files:**
- Create: `packages/api/src/shared/zone-queries.ts`
- Modify: `packages/api/src/routers/public/zones.ts`

- [ ] **Step 1: Create the shared zone-queries module**

Create `packages/api/src/shared/zone-queries.ts`. These are auth-free, project-scoped functions (caller supplies an already-verified `projectId`). Copy the exact SQL/logic currently in `public/zones.ts` so behavior is identical:

```typescript
import type { Database } from "@locnative/database";
import { addresses, zones } from "@locnative/database/schema";
import { and, eq, sql } from "drizzle-orm";
import type { GeoJsonPolygon } from "../routers/public/zones-schema.ts";

export const ZONE_LIMIT = 500;
export const ADDRESSES_IN_ZONE_HARD_CAP = 10_000;

export async function countZones(
	db: Database,
	projectId: string
): Promise<number> {
	const rows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(zones)
		.where(eq(zones.projectId, projectId));
	return rows[0]?.count ?? 0;
}

export async function isValidPolygon(
	db: Database,
	geometry: GeoJsonPolygon
): Promise<boolean> {
	const geomJson = JSON.stringify(geometry);
	const result = await db.execute(
		sql`SELECT ST_IsValid(ST_GeomFromGeoJSON(${geomJson})) AS valid`
	);
	return Boolean((result.rows[0] as { valid: boolean } | undefined)?.valid);
}

export interface ZoneRow {
	id: number;
	projectId: string;
	name: string;
	description: string | null;
	metadata: unknown;
	createdAt: Date;
	updatedAt: Date;
}

export async function insertZone(
	db: Database,
	projectId: string,
	input: {
		name: string;
		description?: string;
		geometry: GeoJsonPolygon;
		metadata?: Record<string, unknown>;
	}
): Promise<ZoneRow> {
	const geomJson = JSON.stringify(input.geometry);
	const [row] = await db
		.insert(zones)
		.values({
			projectId,
			name: input.name,
			// biome-ignore lint/suspicious/noExplicitAny: SQL expression for geometry column
			geom: sql`ST_GeomFromGeoJSON(${geomJson})` as any,
			...(input.description !== undefined && { description: input.description }),
			...(input.metadata !== undefined && { metadata: input.metadata }),
		})
		.returning({
			id: zones.id,
			projectId: zones.projectId,
			name: zones.name,
			description: zones.description,
			metadata: zones.metadata,
			createdAt: zones.createdAt,
			updatedAt: zones.updatedAt,
		});
	return row as ZoneRow;
}

export async function listZoneRows(
	db: Database,
	projectId: string
): Promise<ZoneRow[]> {
	return (await db
		.select({
			id: zones.id,
			projectId: zones.projectId,
			name: zones.name,
			description: zones.description,
			metadata: zones.metadata,
			createdAt: zones.createdAt,
			updatedAt: zones.updatedAt,
		})
		.from(zones)
		.where(eq(zones.projectId, projectId))) as ZoneRow[];
}

export async function zonesContainingPoint(
	db: Database,
	projectId: string,
	lat: number,
	lng: number
): Promise<Array<{ id: number; name: string }>> {
	const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
	return (await db
		.select({ id: zones.id, name: zones.name })
		.from(zones)
		.where(
			and(
				eq(zones.projectId, projectId),
				sql`ST_Contains(${zones.geom}, ${point})`
			)
		)) as Array<{ id: number; name: string }>;
}

export async function deleteZoneRow(
	db: Database,
	projectId: string,
	zoneId: number
): Promise<boolean> {
	const deleted = await db
		.delete(zones)
		.where(and(eq(zones.id, zoneId), eq(zones.projectId, projectId)))
		.returning({ id: zones.id });
	return deleted.length > 0;
}
```

> Note: only the functions Phase 1 needs are extracted (create, list, contains, delete, validation, count). `update` and `addressesInZone` stay inline in `public/zones.ts` for now and are extracted in Phase 1 when its dashboard router consumes them — keeping this task a focused, behavior-preserving change.

- [ ] **Step 2: Refactor `public/zones.ts` create handler to use the shared functions**

In `packages/api/src/routers/public/zones.ts`, replace the inline body of the `zoneCreate` handler's count + validation + insert with calls to the shared functions. Add the import:

```typescript
import {
	countZones,
	deleteZoneRow,
	insertZone,
	isValidPolygon,
	listZoneRows,
	ZONE_LIMIT,
	zonesContainingPoint,
} from "../../shared/zone-queries.ts";
```

Then the `zoneCreate` handler becomes:

```typescript
.handler(async ({ input, context }) => {
	const ctx = context as typeof context & AuthContext;
	const projectId = requireProjectId(ctx.validatedApiKey.projectId);

	if ((await countZones(context.db, projectId)) >= ZONE_LIMIT) {
		throw new ORPCError("FORBIDDEN", {
			message: "Zone limit reached (500). Delete unused zones to create new ones.",
		});
	}
	if (!(await isValidPolygon(context.db, input.geometry))) {
		throw new ORPCError("UNPROCESSABLE_CONTENT", {
			message: "Provided geometry is not a valid polygon.",
		});
	}
	const zone = await insertZone(context.db, projectId, input);
	return zone;
});
```

Also refactor the `zoneList`, `zoneContains`, and `zoneDelete` handlers to call `listZoneRows`, `zonesContainingPoint`, and `deleteZoneRow` respectively, preserving their existing response shapes (map the rows to the same output the handlers returned before). Leave `zoneGet`, `zoneUpdate`, and `zoneAddresses` unchanged.

- [ ] **Step 3: Type-check the api package**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm check-types 2>&1 | grep -v "api-explorer.ts(204" | grep -i error || echo "no new errors"
```
Expected: `no new errors` (only the known pre-existing api-explorer.ts:204 error may appear and is filtered out).

- [ ] **Step 4: Run existing zone tests (no regression)**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm vitest run src/routers/public/zones.test.ts
```
Expected: PASS (existing schema tests unchanged).

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add packages/api/src/shared/zone-queries.ts packages/api/src/routers/public/zones.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "refactor(api): extract shared zone query functions; public handlers delegate to them"
```

---

## Task 6: Active-project store + selector

**Files:**
- Create: `apps/web/src/lib/active-project.ts`
- Create: `apps/web/src/lib/active-project.test.ts`
- Create: `apps/web/src/components/active-project-selector.tsx`

- [ ] **Step 1: Write the failing test for the pure store logic**

Create `apps/web/src/lib/active-project.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import {
	ACTIVE_PROJECT_STORAGE_KEY,
	readStoredProjectId,
	resolveActiveProjectId,
	writeStoredProjectId,
} from "./active-project.ts";

describe("active-project store", () => {
	beforeEach(() => {
		globalThis.localStorage?.clear?.();
	});

	it("resolveActiveProjectId prefers the stored id when it is still valid", () => {
		const ids = ["a", "b", "c"];
		expect(resolveActiveProjectId("b", ids)).toBe("b");
	});

	it("resolveActiveProjectId falls back to the first id when stored is missing", () => {
		expect(resolveActiveProjectId(null, ["a", "b"])).toBe("a");
	});

	it("resolveActiveProjectId falls back to first id when stored id no longer exists", () => {
		expect(resolveActiveProjectId("gone", ["a", "b"])).toBe("a");
	});

	it("resolveActiveProjectId returns null when there are no projects", () => {
		expect(resolveActiveProjectId("a", [])).toBeNull();
	});

	it("write then read round-trips via localStorage", () => {
		writeStoredProjectId("xyz");
		expect(readStoredProjectId()).toBe("xyz");
		expect(ACTIVE_PROJECT_STORAGE_KEY).toBe("locnative.activeProjectId");
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/lib/active-project.test.ts
```
Expected: FAIL — cannot find module `./active-project.ts`.

- [ ] **Step 3: Implement the store**

Create `apps/web/src/lib/active-project.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";

export const ACTIVE_PROJECT_STORAGE_KEY = "locnative.activeProjectId";

export function readStoredProjectId(): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
}

export function writeStoredProjectId(projectId: string): void {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
}

/** Choose the active project: stored id if still present, else first, else null. */
export function resolveActiveProjectId(
	storedId: string | null,
	availableIds: string[]
): string | null {
	if (availableIds.length === 0) {
		return null;
	}
	if (storedId && availableIds.includes(storedId)) {
		return storedId;
	}
	return availableIds[0] ?? null;
}

/** React hook: tracks the active projectId given the user's project ids. */
export function useActiveProject(availableIds: string[]) {
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		setActiveId(resolveActiveProjectId(readStoredProjectId(), availableIds));
	}, [availableIds]);

	const select = useCallback((projectId: string) => {
		writeStoredProjectId(projectId);
		setActiveId(projectId);
	}, []);

	return { activeId, select };
}
```

> If `useCallback`/`useEffect` import from `react` triggers a lint rule about import style, match the repo convention (`import { useCallback, useEffect, useState } from "react";`). Fix the import to that exact form.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/lib/active-project.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the selector component**

Create `apps/web/src/components/active-project-selector.tsx`:

```typescript
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";

export interface ProjectOption {
	id: string;
	name: string;
}

export interface ActiveProjectSelectorProps {
	projects: ProjectOption[];
	activeId: string | null;
	onSelect: (projectId: string) => void;
}

export function ActiveProjectSelector({
	projects,
	activeId,
	onSelect,
}: ActiveProjectSelectorProps) {
	if (projects.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No projects yet.</p>
		);
	}
	return (
		<Select onValueChange={onSelect} value={activeId ?? undefined}>
			<SelectTrigger className="w-56">
				<SelectValue placeholder="Select a project" />
			</SelectTrigger>
			<SelectContent>
				{projects.map((project) => (
					<SelectItem key={project.id} value={project.id}>
						{project.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

- [ ] **Step 6: Type-check**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm dlx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "active-project" || echo "no active-project errors"
```
Expected: `no active-project errors`.

- [ ] **Step 7: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/lib/active-project.ts apps/web/src/lib/active-project.test.ts apps/web/src/components/active-project-selector.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add active-project store + selector"
```

---

## Task 7: Sidebar nav group + placeholder routes

**Files:**
- Modify: `apps/web/src/components/app-shared.tsx`
- Create: `apps/web/src/routes/_protected/zones.tsx`
- Create: `apps/web/src/routes/_protected/webhooks.tsx`
- Create: `apps/web/src/routes/_protected/batch.tsx`
- Create: `apps/web/src/routes/_protected/devices.tsx`

- [ ] **Step 1: Add the "Geocoding" nav group**

In `apps/web/src/components/app-shared.tsx`, add the new icons to the lucide import (`MapIcon`, `WebhookIcon`, `LayersIcon`, `NavigationIcon`) and insert a new group after "Workspace":

```typescript
	{
		label: "Geocoding",
		items: [
			{ title: "Zones", path: "/zones", icon: <MapIcon /> },
			{ title: "Webhooks", path: "/webhooks", icon: <WebhookIcon /> },
			{ title: "Batch", path: "/batch", icon: <LayersIcon /> },
			{ title: "Devices", path: "/devices", icon: <NavigationIcon /> },
		],
	},
```

- [ ] **Step 2: Create the Zones placeholder route (proves the MapCanvas foundation)**

Create `apps/web/src/routes/_protected/zones.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { MapCanvas } from "@/components/map/map-canvas";

export const Route = createFileRoute("/_protected/zones")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Zones</CardTitle>
				<CardDescription>
					Geofence management is coming in the next phase. Map foundation below.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div style={{ height: 420 }}>
					<MapCanvas />
				</div>
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 3: Create the three remaining placeholder routes**

Create `apps/web/src/routes/_protected/webhooks.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";

export const Route = createFileRoute("/_protected/webhooks")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Webhooks</CardTitle>
				<CardDescription>Coming in a later phase.</CardDescription>
			</CardHeader>
		</Card>
	);
}
```

Create `apps/web/src/routes/_protected/batch.tsx` (identical but `CardTitle` "Batch geocoding"):

```typescript
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";

export const Route = createFileRoute("/_protected/batch")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Batch geocoding</CardTitle>
				<CardDescription>Coming in a later phase.</CardDescription>
			</CardHeader>
		</Card>
	);
}
```

Create `apps/web/src/routes/_protected/devices.tsx` (identical but `CardTitle` "Devices"):

```typescript
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";

export const Route = createFileRoute("/_protected/devices")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Devices</CardTitle>
				<CardDescription>Coming in a later phase.</CardDescription>
			</CardHeader>
		</Card>
	);
}
```

- [ ] **Step 4: Build to confirm routes register + bundle compiles**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -15
```
Expected: build succeeds; the TanStack router plugin regenerates `routeTree.gen.ts` with the four new routes (no route-not-found or type errors).

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/app-shared.tsx apps/web/src/routes/_protected/zones.tsx apps/web/src/routes/_protected/webhooks.tsx apps/web/src/routes/_protected/batch.tsx apps/web/src/routes/_protected/devices.tsx apps/web/src/routeTree.gen.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add Geocoding nav group + placeholder routes (zones renders MapCanvas)"
```

---

## Done — Phase 0 foundation complete

Verifiable end state:
- `VITE_MAPTILER_KEY` recognized; maps fall back to OSM raster without it.
- `<MapCanvas>` renders a basemap client-side and exposes the map via `onMapReady`.
- `requireProjectOwnership` enforces session-user project ownership (unit-tested).
- Public zone handlers delegate to `shared/zone-queries.ts`; existing tests pass; no new type errors.
- Active-project store + selector (unit-tested) ready for all feature pages.
- Sidebar shows Zones/Webhooks/Batch/Devices; `/zones` proves the map foundation live.

Unblocks: Phase 1 (zones) immediately; Phases 2/3/5 after merge; Phase 4 after Phase 1.
