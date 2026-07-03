# Routing MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Run `pnpm dlx ultracite fix` before each commit.

**Goal:** Add `GET /api/v1/routing/directions` — driving distance, duration, and route geometry between two points (coords or G-NAF address IDs) over a self-hosted OSRM engine, with an SDK method and docs wiring.

**Architecture:** A Docker OSRM service (car profile, AU OSM extract) runs off-Cloudflare and is reachable only by the Worker. A shared query helper resolves inputs to coordinates, calls OSRM over HTTP, and maps the response to the Locnative envelope. A public oRPC route exposes it under `/api/v1/*` with the existing API-key auth + usage middleware. The hand-written SDK gains a `routing` namespace.

**Tech Stack:** TypeScript (ESM, `.ts` import specifiers), oRPC + Zod, Drizzle/Neon, vitest, Docker + OSRM (`osrm-backend`), Fly.io.

**Spec:** `docs/superpowers/specs/2026-06-08-routing-mvp-design.md`
**Wire contract:** `docs/CONTRACT.md` (SDK side).

---

## File structure (target)

| File | Responsibility |
|------|----------------|
| `packages/env/src/server.ts` (modify) | Validate `OSRM_BASE_URL`, `OSRM_AUTH_TOKEN`. |
| `packages/api/src/shared/routing-queries.ts` (create) | Coord parsing, address→coord resolution, OSRM client + response transform, `RoutingError`. |
| `packages/api/src/shared/routing-queries.test.ts` (create) | Units for the above (mock fetch + mock db). |
| `packages/api/src/routers/public/routing.ts` (create) | oRPC route: input schema, input resolution, error mapping. |
| `packages/api/src/routers/public/routing.test.ts` (create) | Handler-level validation + error-mapping tests. |
| `packages/api/src/routers/public-http.ts` (modify) | Register route in `publicHttpRouter`. |
| `apps/server/src/index.ts` (modify) | `endpointKeyFromPath` → `routing_directions`. |
| `packages/sdk/src/resources/routing.ts` (create) | `client.routing.directions(...)`. |
| `packages/sdk/src/client.ts` (modify) | Compose `routing` namespace. |
| `packages/sdk/src/index.ts` (modify) | Export routing types. |
| `packages/sdk/src/client.test.ts` (modify) | Add routing path to coverage guard. |
| `infra/osrm/{Dockerfile,fly.toml,build-graph.sh,README.md}` (create) | OSRM engine + build/deploy/refresh runbook. |
| `apps/web/src/lib/api-explorer-endpoints.ts` (modify) | Frontend catalog entry. |
| `packages/api/src/routers/domains/api-explorer.ts` (modify) | Backend GET-only allowlist entry. |

**Build order:** env → helper → route → registration → SDK → infra → docs/explorer → verify. The helper is the heart; everything else depends on its types.

---

## Task 1: OSRM env config

**Files:**
- Modify: `packages/env/src/server.ts`

- [ ] **Step 1: Add the two vars to the `server` schema.** In `packages/env/src/server.ts`, inside the `server: { ... }` object (after `KEY_ENC_KEY`), add:

```ts
		OSRM_BASE_URL: z.string().url(),
		OSRM_AUTH_TOKEN: z.string().min(1),
```

- [ ] **Step 2: Thread them through `runtimeEnv`.** In the same file, inside `runtimeEnv: { ...process.env, ... }`, add:

```ts
		OSRM_BASE_URL: process.env.OSRM_BASE_URL,
		OSRM_AUTH_TOKEN: process.env.OSRM_AUTH_TOKEN,
```

- [ ] **Step 3: Type-check.**

Run: `pnpm -F @locnative/env check-types` (if no such script, `pnpm -F @locnative/api check-types`)
Expected: PASS.

- [ ] **Step 4: Document the vars for local dev.** Append to the repo `.env` example / `apps/server/.dev.vars` if present (grep first: `git grep -l KEY_ENC_KEY -- '*.vars' '*.env*'`). Add:

```
OSRM_BASE_URL="http://localhost:5000"
OSRM_AUTH_TOKEN="dev-local-token"
```

- [ ] **Step 5: Guard the test env (these vars are now REQUIRED).** `serverEnv` (t3-env) validates *all* server vars eagerly when imported, and the API package imports it (`public-middleware.ts`, and Task 3's `routing.ts`). Adding two required vars will break the API test suite unless the test env supplies them. Find how the api tests already satisfy `DATABASE_URL`/`BETTER_AUTH_SECRET`:

Run: `grep -rn "SKIP_ENV_VALIDATION\|setupFiles\|\.env\.test\|OSRM" packages/api/vitest.config.ts packages/api/src 2>/dev/null`

- If `SKIP_ENV_VALIDATION` is used in the test env → nothing to do.
- Otherwise locate the test env source (vitest `setupFiles` / a `.env.test` / inline `process.env` in `vitest.config.ts`) and add:

```ts
process.env.OSRM_BASE_URL ??= "http://localhost:5000";
process.env.OSRM_AUTH_TOKEN ??= "test-token";
```

Then run `pnpm -F @locnative/api test` and confirm the existing suite still passes (no env-validation throw at import).

- [ ] **Step 6: Commit.**

```bash
git add packages/env/src/server.ts
git commit -m "feat(env): add OSRM_BASE_URL and OSRM_AUTH_TOKEN"
```

---

## Task 2: Routing query helper (TDD)

The isolated, testable core: parse coords, resolve address IDs, call OSRM, transform. OSRM speaks `lon,lat`; we speak `lat,lng` — this file owns the conversion.

**Files:**
- Create: `packages/api/src/shared/routing-queries.ts`
- Test: `packages/api/src/shared/routing-queries.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/api/src/shared/routing-queries.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
	fetchOsrmRoute,
	parseLatLng,
	RoutingError,
} from "./routing-queries.ts";

const OSRM_OK = {
	code: "Ok",
	routes: [
		{
			distance: 878_000.4,
			duration: 33_120.7,
			geometry: {
				type: "LineString",
				coordinates: [
					[144.9631, -37.8136],
					[151.2093, -33.8688],
				],
			},
		},
	],
};

const osrmFetch = (status: number, body: unknown): typeof fetch =>
	(() =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			})
		)) as typeof fetch;

describe("parseLatLng", () => {
	it("parses a valid 'lat,lng' string", () => {
		expect(parseLatLng("-37.8136,144.9631")).toEqual({
			lat: -37.8136,
			lng: 144.9631,
		});
	});

	it("returns null for malformed or out-of-range input", () => {
		expect(parseLatLng("not-a-coord")).toBeNull();
		expect(parseLatLng("100,200")).toBeNull();
		expect(parseLatLng("-37.8136")).toBeNull();
	});
});

describe("fetchOsrmRoute", () => {
	it("builds a lon,lat;lon,lat URL with auth header and maps the response", async () => {
		const calls: { url: string; token: string | null }[] = [];
		const fetchImpl = ((input: URL | string, init?: RequestInit) => {
			calls.push({
				url: String(input),
				token: new Headers(init?.headers).get("authorization"),
			});
			return Promise.resolve(
				new Response(JSON.stringify(OSRM_OK), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			);
		}) as typeof fetch;

		const result = await fetchOsrmRoute(
			{ lat: -37.8136, lng: 144.9631 },
			{ lat: -33.8688, lng: 151.2093 },
			{ baseUrl: "http://osrm.test", authToken: "tok", fetchImpl }
		);

		expect(calls[0]?.url).toContain(
			"/route/v1/driving/144.9631,-37.8136;151.2093,-33.8688"
		);
		expect(calls[0]?.url).toContain("geometries=geojson");
		expect(calls[0]?.url).toContain("overview=full");
		expect(calls[0]?.token).toBe("Bearer tok");
		expect(result.distance_m).toBe(878_000);
		expect(result.duration_s).toBe(33_121);
		expect(result.geometry.type).toBe("LineString");
		expect(result.geometry.coordinates).toHaveLength(2);
	});

	it("throws RoutingError(no_route) when OSRM returns NoRoute", async () => {
		const fetchImpl = osrmFetch(200, { code: "NoRoute", routes: [] });
		await expect(
			fetchOsrmRoute(
				{ lat: 0, lng: 0 },
				{ lat: 1, lng: 1 },
				{ baseUrl: "http://osrm.test", authToken: "t", fetchImpl }
			)
		).rejects.toMatchObject({ kind: "no_route" });
	});

	it("throws RoutingError(unavailable) on a non-200 OSRM response", async () => {
		const fetchImpl = osrmFetch(502, {});
		const err = await fetchOsrmRoute(
			{ lat: 0, lng: 0 },
			{ lat: 1, lng: 1 },
			{ baseUrl: "http://osrm.test", authToken: "t", fetchImpl }
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(RoutingError);
		expect((err as RoutingError).kind).toBe("unavailable");
	});
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `pnpm -F @locnative/api test -- routing-queries`
Expected: FAIL ("Cannot find module './routing-queries.ts'").

- [ ] **Step 3: Implement the helper.** Create `packages/api/src/shared/routing-queries.ts`:

```ts
import type { Database } from "@locnative/database";
import { addresses } from "@locnative/database/schema";
import { eq } from "drizzle-orm";

export interface LatLng {
	lat: number;
	lng: number;
}

export interface GeoJsonLineString {
	type: "LineString";
	coordinates: [number, number][];
}

export interface DirectionsResult {
	distance_m: number;
	duration_s: number;
	geometry: GeoJsonLineString;
}

export type RoutingErrorKind = "no_route" | "unavailable";

export class RoutingError extends Error {
	readonly kind: RoutingErrorKind;
	constructor(kind: RoutingErrorKind, message: string) {
		super(message);
		this.name = "RoutingError";
		this.kind = kind;
	}
}

const LAT_MAX = 90;
const LNG_MAX = 180;

/** Parse a `"lat,lng"` string. Returns null when malformed or out of range. */
export function parseLatLng(raw: string): LatLng | null {
	const parts = raw.split(",");
	if (parts.length !== 2) {
		return null;
	}
	const lat = Number(parts[0]);
	const lng = Number(parts[1]);
	if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
		return null;
	}
	if (Math.abs(lat) > LAT_MAX || Math.abs(lng) > LNG_MAX) {
		return null;
	}
	return { lat, lng };
}

/** Resolve a G-NAF address id to coordinates. Returns null if not found. */
export async function resolveAddressCoords(
	db: Database,
	id: number
): Promise<LatLng | null> {
	const rows = await db
		.select({ latitude: addresses.latitude, longitude: addresses.longitude })
		.from(addresses)
		.where(eq(addresses.id, id))
		.limit(1);
	const row = rows[0];
	if (!row) {
		return null;
	}
	return { lat: row.latitude, lng: row.longitude };
}

interface OsrmOptions {
	authToken: string;
	baseUrl: string;
	fetchImpl: typeof fetch;
}

interface OsrmResponse {
	code: string;
	routes?: {
		distance: number;
		duration: number;
		geometry: GeoJsonLineString;
	}[];
}

/** Call OSRM's driving route service and map the result to our envelope. */
export async function fetchOsrmRoute(
	from: LatLng,
	to: LatLng,
	options: OsrmOptions
): Promise<DirectionsResult> {
	// OSRM coordinate order is lon,lat (not lat,lng).
	const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
	const url = new URL(
		`/route/v1/driving/${coords}`,
		options.baseUrl
	);
	url.searchParams.set("overview", "full");
	url.searchParams.set("geometries", "geojson");

	let response: Response;
	try {
		response = await options.fetchImpl(url, {
			headers: { authorization: `Bearer ${options.authToken}` },
		});
	} catch (error) {
		throw new RoutingError(
			"unavailable",
			`OSRM request failed: ${(error as Error).message}`
		);
	}

	if (!response.ok) {
		throw new RoutingError(
			"unavailable",
			`OSRM returned status ${response.status}`
		);
	}

	const body = (await response.json()) as OsrmResponse;
	const route = body.code === "Ok" ? body.routes?.[0] : undefined;
	if (!route) {
		throw new RoutingError(
			"no_route",
			"No drivable route between the given points."
		);
	}

	return {
		distance_m: Math.round(route.distance),
		duration_s: Math.round(route.duration),
		geometry: route.geometry,
	};
}
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm -F @locnative/api test -- routing-queries`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/shared/routing-queries.ts packages/api/src/shared/routing-queries.test.ts
git commit -m "feat(api): routing query helper — coord parsing, OSRM client, transform"
```

---

## Task 3: Public routing route (TDD)

Exposes the helper as `GET /api/v1/routing/directions`, resolving coords-or-addressId and mapping `RoutingError` to the API envelope.

**Files:**
- Create: `packages/api/src/routers/public/routing.ts`
- Test: `packages/api/src/routers/public/routing.test.ts`

- [ ] **Step 1: Write the failing test.** Create `packages/api/src/routers/public/routing.test.ts`. (Mirrors the call-convention used in `regions.test.ts` — read that file first to match how a handler is invoked with a mock context.)

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveDirectionsInput } from "./routing.ts";

describe("resolveDirectionsInput", () => {
	const db = {} as never;

	it("uses coords when from/to provided", async () => {
		const result = await resolveDirectionsInput(db, {
			from: "-37.8136,144.9631",
			to: "-33.8688,151.2093",
		});
		expect(result).toEqual({
			from: { lat: -37.8136, lng: 144.9631 },
			to: { lat: -33.8688, lng: 151.2093 },
		});
	});

	it("throws bad_request when neither coords nor addressId given for an endpoint", async () => {
		await expect(
			resolveDirectionsInput(db, { to: "-33.8688,151.2093" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("throws bad_request when both coords and addressId given", async () => {
		await expect(
			resolveDirectionsInput(db, {
				from: "-37.8,144.9",
				fromAddressId: 5,
				to: "-33.8,151.2",
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("throws bad_request on malformed coords", async () => {
		await expect(
			resolveDirectionsInput(db, { from: "nope", to: "-33.8,151.2" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `pnpm -F @locnative/api test -- routers/public/routing`
Expected: FAIL ("Cannot find module './routing.ts'").

- [ ] **Step 3: Implement the route.** Create `packages/api/src/routers/public/routing.ts`:

```ts
import { ORPCError } from "@orpc/server";
import type { Database } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { z } from "zod";
import { o as baseBuilder } from "../../builder.ts";
import {
	fetchOsrmRoute,
	type LatLng,
	parseLatLng,
	resolveAddressCoords,
	RoutingError,
} from "../../shared/routing-queries.ts";
import { apiKeyAuth, usageMiddleware } from "../public-middleware.ts";

interface DirectionsInput {
	from?: string;
	fromAddressId?: number;
	to?: string;
	toAddressId?: number;
}

/**
 * Resolve one endpoint (origin or destination) to coordinates. Exactly one of
 * { coordString, addressId } must be present.
 */
async function resolveEndpoint(
	db: Database,
	label: string,
	coordString: string | undefined,
	addressId: number | undefined
): Promise<LatLng> {
	if (coordString !== undefined && addressId !== undefined) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Provide either '${label}' coordinates or '${label}AddressId', not both.`,
		});
	}
	if (addressId !== undefined) {
		const coords = await resolveAddressCoords(db, addressId);
		if (!coords) {
			throw new ORPCError("NOT_FOUND", {
				message: `Address ${addressId} not found.`,
			});
		}
		return coords;
	}
	if (coordString !== undefined) {
		const parsed = parseLatLng(coordString);
		if (!parsed) {
			throw new ORPCError("BAD_REQUEST", {
				message: `'${label}' must be a valid "lat,lng" coordinate.`,
			});
		}
		return parsed;
	}
	throw new ORPCError("BAD_REQUEST", {
		message: `Provide '${label}' coordinates or '${label}AddressId'.`,
	});
}

/** Exported for unit testing the input-resolution logic. */
export async function resolveDirectionsInput(
	db: Database,
	input: DirectionsInput
): Promise<{ from: LatLng; to: LatLng }> {
	const from = await resolveEndpoint(
		db,
		"from",
		input.from,
		input.fromAddressId
	);
	const to = await resolveEndpoint(db, "to", input.to, input.toAddressId);
	return { from, to };
}

export const routingDirections = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("routing.directions"))
	.route({
		method: "GET",
		path: "/api/v1/routing/directions",
		summary: "Driving directions between two points",
		tags: ["routing"],
	})
	.input(
		// GET query params arrive as strings — coerce numerics like every other handler.
		z.object({
			from: z.string().optional(),
			to: z.string().optional(),
			fromAddressId: z.coerce.number().int().min(1).optional(),
			toAddressId: z.coerce.number().int().min(1).optional(),
			profile: z.literal("driving").default("driving"),
		})
	)
	.handler(async ({ input, context }) => {
		const { from, to } = await resolveDirectionsInput(context.db, input);
		try {
			const route = await fetchOsrmRoute(from, to, {
				baseUrl: serverEnv.OSRM_BASE_URL,
				authToken: serverEnv.OSRM_AUTH_TOKEN,
				fetchImpl: globalThis.fetch,
			});
			return {
				query: { from, to, profile: input.profile },
				distance_m: route.distance_m,
				duration_s: route.duration_s,
				geometry: route.geometry,
			};
		} catch (error) {
			if (error instanceof RoutingError && error.kind === "no_route") {
				throw new ORPCError("UNPROCESSABLE_CONTENT", { message: error.message });
			}
			if (error instanceof RoutingError) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Routing service unavailable.",
				});
			}
			throw error;
		}
	});
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm -F @locnative/api test -- routers/public/routing`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check the package.**

Run: `pnpm -F @locnative/api check-types`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/api/src/routers/public/routing.ts packages/api/src/routers/public/routing.test.ts
git commit -m "feat(api): GET /api/v1/routing/directions route with input resolution + error mapping"
```

---

## Task 4: Register the route + endpoint key

**Files:**
- Modify: `packages/api/src/routers/public-http.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Import the route.** In `packages/api/src/routers/public-http.ts`, near the other `./public/*` imports (e.g. after the `regionsClassify` import), add:

```ts
import { routingDirections } from "./public/routing.ts";
```

- [ ] **Step 2: Register it in `publicHttpRouter`.** In the same file, inside the `export const publicHttpRouter = { ... }` object, after the `regions: { classify: regionsClassify },` block, add:

```ts
	routing: {
		directions: routingDirections,
	},
```

- [ ] **Step 3: Add the endpoint key mapping.** In `apps/server/src/index.ts`, in `endpointKeyFromPath`, add a branch before the final `return "unknown"` (place it before the broad `/addresses` check since the path is distinct):

```ts
	if (pathname.includes("/routing/directions")) {
		return "routing_directions";
	}
```

- [ ] **Step 4: Type-check both packages.**

Run: `pnpm -F @locnative/api check-types && pnpm -F @locnative/server check-types`
Expected: PASS.

- [ ] **Step 5: Run the API test suite (no regressions).**

Run: `pnpm -F @locnative/api test`
Expected: PASS (all prior + new routing tests).

- [ ] **Step 6: Commit.**

```bash
git add packages/api/src/routers/public-http.ts apps/server/src/index.ts
git commit -m "feat(api): register routing route + usage endpoint key"
```

---

## Task 5: OSRM engine (Docker + Fly.io + runbook)

Infra, not application code. Produces a deployable OSRM service and a documented build/refresh procedure. No unit tests; verification is a manual smoke call.

**Files:**
- Create: `infra/osrm/Dockerfile`
- Create: `infra/osrm/fly.toml`
- Create: `infra/osrm/build-graph.sh`
- Create: `infra/osrm/README.md`

- [ ] **Step 1: Dockerfile.** Create `infra/osrm/Dockerfile`:

```dockerfile
# Serves a prebuilt OSRM car graph. The graph is built separately by
# build-graph.sh and mounted/copied into /data at deploy time.
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1

# Auth is enforced by a lightweight proxy in front (see README); osrm-routed
# itself is bound only to the internal network.
EXPOSE 5000

# /data holds australia-latest.osrm* artifacts (Fly volume or COPY).
WORKDIR /data

CMD ["osrm-routed", "--algorithm", "mld", "/data/australia-latest.osrm", "--max-table-size", "10000"]
```

- [ ] **Step 2: Graph build script.** Create `infra/osrm/build-graph.sh`:

```bash
#!/usr/bin/env bash
# Builds the OSRM car graph from the latest Australia OSM extract.
# Run locally (needs ~8GB RAM, Docker). Outputs australia-latest.osrm* into ./data.
set -euo pipefail

DATA_DIR="${1:-./data}"
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v5.27.1"
EXTRACT_URL="https://download.geofabrik.de/australia-oceania/australia-latest.osm.pbf"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

echo "Downloading Australia OSM extract..."
curl -fSL "$EXTRACT_URL" -o australia-latest.osm.pbf

run() { docker run --rm -v "${PWD}:/data" "$OSRM_IMAGE" "$@"; }

echo "Extracting (car profile)..."
run osrm-extract -p /opt/car.lua /data/australia-latest.osm.pbf
echo "Partitioning..."
run osrm-partition /data/australia-latest.osrm
echo "Customizing..."
run osrm-customize /data/australia-latest.osrm

echo "Done. Artifacts in $DATA_DIR (australia-latest.osrm*)."
```

> Note: `curl`/`wget` are blocked in the agent's own shell by the context-mode rules. This script is **shipped for a human/CI to run**, not executed by the agent. Do not run it from the agent session — just create the file.

- [ ] **Step 3: Fly config.** Create `infra/osrm/fly.toml`:

```toml
app = "locnative-osrm"
primary_region = "syd"

[build]
  dockerfile = "Dockerfile"

[[mounts]]
  source = "osrm_data"
  destination = "/data"

[http_service]
  internal_port = 5000
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1

[[vm]]
  size = "performance-2x"  # AU car MLD graph needs several GB RAM
```

- [ ] **Step 4: Runbook.** Create `infra/osrm/README.md`:

```markdown
# OSRM routing engine (Locnative)

Self-hosted OSRM serving the driving profile over the Australia OSM extract.
Backs `GET /api/v1/routing/directions` (the Worker proxies to it).

## Build the graph (local or CI; needs Docker + ~8GB RAM)

    ./build-graph.sh ./data

Produces `data/australia-latest.osrm*`.

## Deploy (Fly.io)

    fly volumes create osrm_data --region syd --size 10   # first time
    # copy the built graph onto the volume (fly sftp / a one-off machine)
    fly deploy

## Auth

`osrm-routed` has no native auth. The Worker authenticates via a shared
`OSRM_AUTH_TOKEN` checked by a tiny reverse-proxy (or Fly private networking so
only the Worker's egress reaches it). The Worker reads `OSRM_BASE_URL` +
`OSRM_AUTH_TOKEN` from env (see packages/env/src/server.ts).

## Refresh cadence

OSM drifts. Rebuild monthly: re-run build-graph.sh, redeploy. Automate later.

## Smoke test

    curl -H "authorization: Bearer $OSRM_AUTH_TOKEN" \
      "$OSRM_BASE_URL/route/v1/driving/144.9631,-37.8136;151.2093,-33.8688?overview=full&geometries=geojson"

Expect `code: "Ok"` and a `routes[0]` with distance/duration/geometry.
```

- [ ] **Step 5: Make the build script executable + commit.**

```bash
chmod +x infra/osrm/build-graph.sh
git add infra/osrm
git commit -m "feat(infra): OSRM routing engine — Dockerfile, fly config, graph build + runbook"
```

---

## Task 6: SDK routing namespace

**Files:**
- Create: `packages/sdk/src/resources/routing.ts`
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/client.test.ts`

- [ ] **Step 1: Add the routing path to the coverage guard (failing test).** In `packages/sdk/src/client.test.ts`, add to `EXPECTED_PATHS` (after the regions entry):

```ts
	["GET", "/api/v1/routing/directions"],
```

And add the call (after `await c.regions.classify(...)`):

```ts
		await c.routing.directions({ from: "0,0", to: "1,1" });
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `pnpm -F @locnative/sdk test -- client`
Expected: FAIL (`c.routing` is undefined / path not seen).

- [ ] **Step 3: Create the resource.** Create `packages/sdk/src/resources/routing.ts` (mirrors `regions.ts`):

```ts
import type { CallOptions, Requester } from "../shared-types.ts";

export interface DirectionsParams {
	from?: string;
	fromAddressId?: number;
	profile?: "driving";
	to?: string;
	toAddressId?: number;
}

export interface DirectionsGeometry {
	coordinates: [number, number][];
	type: "LineString";
}

export interface DirectionsResponse {
	distance_m: number;
	duration_s: number;
	geometry: DirectionsGeometry;
	query: {
		from: { lat: number; lng: number };
		profile: string;
		to: { lat: number; lng: number };
	};
}

export interface RoutingResource {
	directions(
		params: DirectionsParams,
		options?: CallOptions
	): Promise<DirectionsResponse>;
}

export const createRouting = (request: Requester): RoutingResource => ({
	directions: (params, options) =>
		request<DirectionsResponse>({
			method: "GET",
			path: "/api/v1/routing/directions",
			query: {
				from: params.from,
				to: params.to,
				fromAddressId: params.fromAddressId,
				toAddressId: params.toAddressId,
				profile: params.profile,
			},
			...options,
		}),
});
```

- [ ] **Step 4: Compose it into the client.** In `packages/sdk/src/client.ts`:

Add the import (with the other resource imports):

```ts
import { createRouting, type RoutingResource } from "./resources/routing.ts";
```

Add to the `LocnativeClient` interface (keep alphabetical with siblings):

```ts
	routing: RoutingResource;
```

Add to the returned object in `createLocnativeClient`:

```ts
		routing: createRouting(request),
```

- [ ] **Step 5: Export the types.** In `packages/sdk/src/index.ts`, add with the other resource re-exports:

```ts
export * from "./resources/routing.ts";
```

- [ ] **Step 6: Run the SDK tests.**

Run: `pnpm -F @locnative/sdk test`
Expected: PASS (coverage guard now includes routing).

- [ ] **Step 7: Type-check + build.**

Run: `pnpm -F @locnative/sdk check-types && pnpm -F @locnative/sdk build`
Expected: PASS; `dist/` rebuilt.

- [ ] **Step 8: Commit.**

```bash
git add packages/sdk/src/resources/routing.ts packages/sdk/src/client.ts packages/sdk/src/index.ts packages/sdk/src/client.test.ts
git commit -m "feat(sdk): add routing.directions namespace"
```

---

## Task 7: API explorer + docs wiring

Keep the explorer's backend allowlist and frontend catalog in sync (per the known constraint: the backend `endpointMap` must match the frontend catalog, GET-only proxying).

> **OpenAPI is already covered.** The served OpenAPI 3.1 spec is generated by the `OpenAPIHandler` from `publicHttpRouter`, so registering the route in Task 4 auto-publishes it to the spec — no separate OpenAPI edit needed. The api-explorer catalog below is the additional, hand-maintained surface that must be kept in sync.

**Files:**
- Modify: `apps/web/src/lib/api-explorer-endpoints.ts`
- Modify: `packages/api/src/routers/domains/api-explorer.ts`

- [ ] **Step 1: Read both files to match their exact shapes.**

Run: `sed -n '540,575p' apps/web/src/lib/api-explorer-endpoints.ts` (the regions entry — copy its structure) and `grep -n "regions.classify\|endpointMap" packages/api/src/routers/domains/api-explorer.ts`.

- [ ] **Step 2: Add the frontend catalog entry.** In `apps/web/src/lib/api-explorer-endpoints.ts`, append a new endpoint object after the regions entry, matching the existing object shape:

```ts
	{
		id: "routing.directions",
		method: "GET",
		path: "/api/v1/routing/directions",
		summary: "Driving directions between two points",
		description:
			"Returns driving distance (m), duration (s), and route geometry (GeoJSON LineString) between two points. Accept coordinates (`from`/`to` as `lat,lng`) or G-NAF address IDs (`fromAddressId`/`toAddressId`).",
		params: [
			{
				name: "from",
				type: "string",
				required: false,
				description: "Origin as \"lat,lng\" (or use fromAddressId)",
				example: "-37.8136,144.9631",
			},
			{
				name: "to",
				type: "string",
				required: false,
				description: "Destination as \"lat,lng\" (or use toAddressId)",
				example: "-33.8688,151.2093",
			},
			{
				name: "fromAddressId",
				type: "number",
				required: false,
				description: "Origin G-NAF address id (alternative to from)",
				example: "12345",
			},
			{
				name: "toAddressId",
				type: "number",
				required: false,
				description: "Destination G-NAF address id (alternative to to)",
				example: "67890",
			},
		],
	},
```

- [ ] **Step 3: Add the backend allowlist entry.** In `packages/api/src/routers/domains/api-explorer.ts`, find the `endpointMap` (the object keyed by endpoint id mapping to the public path/handler — locate the `"regions.classify"` key) and add a sibling entry following the exact same shape:

```ts
	"routing.directions": "/api/v1/routing/directions",
```

(Match the value shape the file actually uses — if entries are objects rather than strings, mirror that. Step 1's grep shows the shape.)

- [ ] **Step 4: Run the explorer tests.**

Run: `pnpm -F web test -- api-explorer && pnpm -F @locnative/api test -- api-explorer`
Expected: PASS. (If a test enumerates expected endpoints, update it to include `routing.directions`.)

- [ ] **Step 5: Type-check web.**

Run: `pnpm -F web check-types`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/lib/api-explorer-endpoints.ts packages/api/src/routers/domains/api-explorer.ts
git commit -m "feat(web,api): expose routing.directions in API explorer catalog + allowlist"
```

---

## Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check across the affected packages.**

Run: `pnpm -F @locnative/api check-types && pnpm -F @locnative/server check-types && pnpm -F @locnative/sdk check-types && pnpm -F web check-types`
Expected: PASS for api, server, sdk. (web may still show the pre-existing `globe.tsx` errors — confirm no *new* errors in files this plan touched.)

- [ ] **Step 2: Full test run for the touched packages.**

Run: `pnpm -F @locnative/api test && pnpm -F @locnative/sdk test`
Expected: PASS.

- [ ] **Step 3: Lint.**

Run: `pnpm dlx ultracite fix packages/api/src packages/sdk/src apps/web/src/lib/api-explorer-endpoints.ts infra/osrm`
Expected: no outstanding errors.

- [ ] **Step 4: SDK build + smoke.**

Run: `pnpm -F @locnative/sdk build && pnpm -F @locnative/sdk smoke`
Expected: "Smoke test PASSED".

- [ ] **Step 5: Manual OSRM-backed smoke (requires a deployed/local OSRM).**

With OSRM running and `OSRM_BASE_URL`/`OSRM_AUTH_TOKEN` set, call the running Worker:
`GET /api/v1/routing/directions?from=-37.8136,144.9631&to=-33.8688,151.2093` with a valid API key.
Expected: 200 with plausible `distance_m` (~870km Melbourne→Sydney), `duration_s`, and a non-empty `geometry.coordinates`.

- [ ] **Step 6: Update the spec status.** In `docs/superpowers/specs/2026-06-08-routing-mvp-design.md`, change the header `Status:` to `Implemented (MVP)`. Commit:

```bash
git add docs/superpowers/specs/2026-06-08-routing-mvp-design.md
git commit -m "docs(routing): mark routing MVP design implemented"
```

---

## Notes for the implementing engineer

- **OSRM `lon,lat` order** is the single likeliest bug — `routing-queries.ts` owns the conversion and is unit-tested; never pass `lat,lng` to OSRM.
- **`z.coerce` on GET params** is mandatory here — bare `z.number()` makes the OpenAPI handler 400 every request (this previously broke `zones.contains`).
- **Do not run `build-graph.sh` from the agent session** — it uses `curl` (blocked by context-mode) and needs Docker + ~8GB RAM. It's a human/CI artifact.
- **`neon-http` has no transactions** — not relevant here (routing does only a single-row address read), but don't add multi-statement transactions.
- **Out of scope** (do not build): distance matrix, walking/cycling profiles, isochrones, turn-by-turn text. They are fast-follows.
