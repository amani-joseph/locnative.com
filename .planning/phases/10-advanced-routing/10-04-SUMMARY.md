---
phase: 10-advanced-routing
plan: 04
status: complete (code + unit tests); live OSRM smoke pending deploy
date: 2026-06-12
---

# 10-04 Summary — Route optimisation (TSP)

## What shipped (all tasks, committed)

| Task | Result |
|------|--------|
| 1 — Confirm D2 | **RESOLVED → OSRM `/trip` (TSP) for v1**, zero new infra. VROOM (true VRP: time windows/capacities/multi-vehicle) deferred to a fast-follow. Recorded in CONTEXT.md D2. |
| 2 — `fetchOsrmTrip` | Calls OSRM `/trip/v1/{profile}/{coords}` (geojson, overview=full, roundtrip/source/destination) → `{ trips, waypoints }` with per-waypoint `waypoint_index` (the optimised tour order). Guards the unsupported open-trip-without-fixed-end combo client-side; maps `NoTrip`/`NotImplemented` → `RoutingError("no_trip")` (→422) vs service → `unavailable` (→500). New `RoutingErrorKind "no_trip"`. |
| 3 — `/api/v1/routing/optimize` | **POST** (D5): `profile` + `waypoints[{lat,lng}|{addressId}]` (min 2, max 50) + `roundtrip`/`source`/`destination`. `resolveOptimizeWaypoint` (exported, unit-tested) resolves each stop; response echoes each input waypoint as `{ input_index, coords, order }`. Registered as `routing.optimize`. |

**Verification:** `pnpm -F @locnative/api test` → **102/102** green; `check-types` clean; ultracite clean.

## SC #5 status
✅ **Code-complete** — `/optimize` returns a near-optimal visiting order (each waypoint's `waypoint_index`) + trip geometry/distance/duration via OSRM `/trip`, handles unsupported combos + `NoTrip` (→422) distinct from service errors (→500), uses the profile-aware bound-fetch client. VROOM explicitly deferred (D2). Live OSRM smoke deferred to deploy.

## Decisions
- **D2 → OSRM `/trip`** (TSP only; VROOM fast-follow).
- **D5 (optimize) → POST** — stop lists can be long; JSON body validates normally.
- Open trips (`roundtrip=false`) require a fixed end (`source=first` and/or `destination=last`); rejected client-side **before** calling OSRM to give a clear `no_trip` error.
- Waypoint cap **50** (documented) to keep `/trip` responsive.
- POST ⇒ docs-only in the GET-only API-explorer allowlist (`[[api-explorer-proxy-get-only-allowlist]]`).

## Branch note
This plan executed on `feat/routing-multiprofile` after reconciling it (cherry-picked the 10-03 `/match` endpoint + docs from `feat/usage-based-billing`, and restored `isochrone-queries.ts`/`.test.ts` which a branch reorder had left inconsistent — see the `fix(api): restore complete isochrone-queries` commit). See `[[shared-main-dir-concurrent-agents]]`.

## Follow-ups
- Live smoke post-deploy: `POST /api/v1/routing/optimize` with 3–4 Melbourne stops → expect reordered `waypoints` + a trip geometry.
- SDK `routing.optimize` method + types → plan **10-05** (final Phase 10 plan: SDK for matrix/isochrone/match/optimize).
- Shares the OSRM-deploy dependency (foot/bike graphs + volume migration) with 10-01/10-02/10-03.
