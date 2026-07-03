# Routing MVP — Design Spec

**Date:** 2026-06-08
**Status:** Done — deployed to Fly (`locnative-osrm.fly.dev`) and verified end-to-end in production and via `wrangler dev` (2026-06-09).
**Source:** `docs/competitive-analysis-update-2026-06-08.md` §6 P2 (routing — Mappify parity).

**Goal:** Add a point-A→B routing endpoint to the public API: **road distance, travel
time, and route geometry**, driving profile, over the Australian road network — built on
a **self-hosted OSRM** engine, proxied through the existing Cloudflare Worker API.

This is the first slice of the routing gap. Distance matrix, additional travel profiles,
and isochrones are explicit fast-follows, not part of this slice.

---

## 1. Scope (locked)

**In:**
- A→B **directions**: `distance_m`, `duration_s`, and route **geometry** (GeoJSON LineString).
- **Driving** profile only.
- Coordinate input (`from`/`to` as lat,lng) **and** optional **G-NAF address-ID input**
  (`fromAddressId`/`toAddressId`) resolved to coordinates via the existing address lookup —
  the moat tie-in ("directions between two official AU addresses").
- Australia coverage (Geofabrik `australia-latest`).

**Out (fast-follows / later milestones):**
- Distance **matrix** (N×M) — cheap fast-follow via OSRM's `table` service.
- **Walking / cycling / truck** profiles.
- **Isochrones / reachability** (would favour a later Valhalla migration).
- Turn-by-turn textual instructions (geometry only in MVP).

## 2. Decisions (locked)

- **Engine: self-hosted OSRM**, car profile, MLD pipeline, over an AU OSM extract.
  Chosen over Valhalla (heavier than a driving-only MVP needs) and over a managed
  third-party API (per-request cost + reselling a competitor's non-AU data undercuts the
  self-hosted-AU moat). Valhalla is the documented migration path if multi-modal/truck/
  isochrones become priorities.
- **Hosting: Fly.io** (Docker, cheap, persistent volume for the prebuilt graph) as the
  default. *Revisable* — a small Hetzner/Railway VM or Cloudflare Containers are
  alternatives; this is the project's first always-on non-Cloudflare component.
- **Address-ID input is in the MVP** (optional, alongside coords) — thin add over the
  existing address lookup, and it ties routing to the G-NAF moat.
- **Geometry format: GeoJSON LineString** (consistent with how zones already model
  geometry). Encoded-polyline output is a later option.

## 3. Architecture

Three units, each independently understandable:

### 3.1 OSRM service (the engine)
- Docker container running `osrm-routed` with the **car** profile.
- Graph prebuilt from Geofabrik `australia-latest.osm.pbf` via
  `osrm-extract -p car.lua` → `osrm-partition` → `osrm-customize` (MLD).
- Stateless at request time; the only persistent state is the prebuilt graph on a Fly.io
  volume.
- Exposes OSRM's native HTTP API (`/route/v1/driving/{lon,lat};{lon,lat}`); **not**
  public — reachable only from the Worker (network/secret-gated; see §6).

### 3.2 Worker routing route (the API surface)
- New public oRPC route in `packages/api/src/routers/public/routing.ts`, mounted under
  `/api/v1/*` alongside the existing endpoints (same API-key auth + usage middleware).
- Endpoint: **`GET /api/v1/routing/directions`**
  - Query params: `from`/`to` (`"lat,lng"`) **or** `fromAddressId`/`toAddressId` (number);
    `profile` (default `driving`, only value accepted in MVP).
  - Numeric/coerced params use `z.coerce` (per the known oRPC GET-coercion gotcha that
    previously broke `zones.contains`).
  - Exactly one of {coords, addressId} per endpoint must be provided; mixed/missing →
    `bad_request` with field detail.

### 3.3 Routing query helper (the logic)
- `packages/api/src/shared/routing-queries.ts`: resolves address IDs → coords (reusing the
  address-by-id query), calls OSRM over HTTP, and maps OSRM's response to the Locnative
  envelope. Isolated from the route handler so it's unit-testable with a mocked OSRM.

## 4. Data flow

```
client
  → Worker  (API-key auth, usage recording — existing middleware)
  → resolve input: coords as-is, OR addressId → coords (existing address lookup)
  → OSRM  GET /route/v1/driving/{from};{to}?overview=full&geometries=geojson
  → transform: { distance_m, duration_s, geometry: <GeoJSON LineString>, query: {...} }
  → response (existing error envelope + headers)
```

Response shape:
```jsonc
{
  "query": { "from": { "lat": -37.8136, "lng": 144.9631 }, "to": { "lat": -33.8688, "lng": 151.2093 }, "profile": "driving" },
  "distance_m": 878000,
  "duration_s": 33120,
  "geometry": { "type": "LineString", "coordinates": [[144.96, -37.81], ...] }
}
```

## 5. Error handling

All on the existing API error envelope (`{ error: { code, message, ... } }`):
- Out-of-bounds lat/lng, malformed `from`/`to`, both-coords-and-addressId, or neither →
  `bad_request` (with field detail where available).
- Unknown `addressId` → `not_found`.
- OSRM `NoRoute` / point not snappable to the network → `unprocessable`
  ("No drivable route between the given points").
- OSRM unreachable / 5xx → `internal_error`. (The hardened SDK's retry layer already
  absorbs transient blips; the Worker does not itself retry in this slice.)

## 6. Security & ops

- **OSRM is not publicly exposed.** The Worker reaches it via a configured base URL +
  shared secret header (Fly private networking or an auth header), so only the Worker can
  call it. Env: `OSRM_BASE_URL`, `OSRM_AUTH_TOKEN` (validated in the env package).
- Usage is recorded per API key via the existing usage middleware (new endpoint key
  `routing_directions`).
- **Data refresh:** a documented script rebuilds the OSRM graph from a fresh Geofabrik
  extract and redeploys the container. MVP cadence is **manual/monthly**; automation is a
  later concern.

## 7. SDK & docs (consistency with prior work)

- **SDK:** add a `client.routing.directions(params, options?)` namespace in
  `packages/sdk/src/resources/routing.ts`, following the existing hand-written resource
  pattern; forward-compatible with `docs/CONTRACT.md` (per-request options, typed errors).
  Add it to the coverage-guard test.
- **OpenAPI:** add the endpoint to the served spec.
- **Docs page + API explorer:** add `routing.directions` to the catalog and the backend
  GET-only allowlist (per the known explorer-proxy constraint that the backend
  `endpointMap` must stay in sync with the frontend catalog).

## 8. Testing

- **Unit (routing-queries):** OSRM response → envelope transform; address-ID resolution;
  each error mapping (NoRoute → unprocessable, unknown id → not_found, OSRM down →
  internal_error). OSRM HTTP is mocked.
- **Validation:** coords/addressId mutual-exclusivity, bounds, profile validation.
- **Integration (gated):** against a running OSRM, assert a known Melbourne→Sydney route
  returns plausible distance/duration and a non-empty LineString.
- No live OSRM required for the unit/validation suites.

## 9. File structure (target)

```
infra/osrm/                         # NEW — engine
  Dockerfile                        # osrm-backend + car profile
  fly.toml                          # Fly.io app + volume
  build-graph.sh                    # extract→partition→customize from australia-latest
  README.md                         # build/deploy/refresh runbook
packages/api/src/
  routers/public/routing.ts         # NEW — oRPC route
  routers/public/routing.test.ts    # NEW
  shared/routing-queries.ts         # NEW — OSRM client + transform + address resolution
  shared/routing-queries.test.ts    # NEW
packages/env/src/server.ts          # MODIFIED — OSRM_BASE_URL, OSRM_AUTH_TOKEN
packages/sdk/src/resources/routing.ts  # NEW — SDK namespace (+ coverage test entry)
apps/server/src/index.ts            # MODIFIED — endpointKeyFromPath: routing_directions
apps/web/...                        # MODIFIED — docs page + api-explorer catalog/allowlist
```

## 10. Risks & notes

- **First always-on non-CF component.** OSRM needs a persistent host; introduces a new
  deploy/runbook surface and a graph-refresh chore. Mitigated by keeping it stateless +
  scripted; Fly.io chosen for low cost/ops.
- **Graph staleness.** OSM extract drifts from reality; manual monthly refresh in MVP.
- **Neon cannot run pgRouting** — confirmed driver of the external-engine decision; routing
  is deliberately *not* in-database.
- **Memory footprint.** AU car graph (MLD) is a few GB RAM — size the Fly machine
  accordingly; validate during build.
- **OSRM coordinate order** is `lon,lat` (not `lat,lng`) — a classic bug source; the query
  helper owns the conversion and is unit-tested for it.
