---
phase: 10-advanced-routing
plan: 02
status: complete (code + unit tests); live OSRM/DB smoke pending deploy
date: 2026-06-12
---

# 10-02 Summary — Reachability isochrones

## What shipped (all 4 tasks, committed)

| Task | Commit | Result |
|------|--------|--------|
| 1 — Probe Neon PostGIS hull (D3) | (investigation) | `SELECT postgis_full_version()` → PostGIS **3.5.0**, **GEOS 3.11.1**. D3 RESOLVED → use **`ST_ConcaveHull`** (no ConvexHull fallback needed). |
| 2 — Sample-point generation (D4) | `2987b7a` | `generateSamplePoints` — 12 bearings × 6 radii = **72 samples** (+origin = 73 ≤ OSRM `/table` cap of 100), equirectangular m→deg. Pure + unit-tested. |
| 3 — Reachable filter + hull + overlap | `1f9ac82` | `reachablePoints` (pure), `hullPolygon` (`ST_ConcaveHull(…, 0.3)` → GeoJSON, `IsochroneError` on <3 pts), `regionsOverlappingIsochrone` (`ST_Intersects`, mirrors `regionsContainingPoint`). |
| 4 — `/api/v1/routing/isochrone` | `55a8d56` | GET endpoint; origin (lat,lng or addressId) + profile + one of `durationSeconds`/`distanceMeters` + optional `includeRegions`/`layers`. Registered as `routing.isochrone`. |

**Verification:** `pnpm -F @locnative/api test` → **100/100** green; `check-types` clean; ultracite clean.

## Decisions resolved
- **D3 → `ST_ConcaveHull`** (GEOS 3.11.1 on Neon — probed live). Concaveness `0.3`.
- **D4 → 12 × 6 = 72 sample points.** Single bounded `/table` call (`sources:[0]`).
- **D5 (isochrone) → GET** (small input); all numeric params via `z.coerce`.
- Budget→radius sizing: per-profile max-speed ceiling (driving 30 / cycling 8 / walking 2.5 m/s) for a duration budget; straight radius for a distance budget — deliberately over-reaches so the hull captures the true boundary.

## Test convention / deferrals
Followed the codebase pattern (pure helpers unit-tested; DB-backed funcs integration-tested like `zone-queries`):
- Unit-tested: `generateSamplePoints`, `reachablePoints`, and `hullPolygon`'s degenerate (<3) guard (proxy db proves no query on that path).
- **Deferred to live smoke** (no oRPC harness / no live DB in vitest): end-to-end Polygon happy path, `includeRegions` overlap, OSRM-down → 500. The `ST_ConcaveHull`/`ST_GeomFromGeoJSON`/`ST_Intersects` SQL is unverified against live PostGIS until a smoke call.

## Follow-ups
- Live smoke once OSRM 3-profile deploy lands: `GET /api/v1/routing/isochrone?origin=-37.8136,144.9631&durationSeconds=600&profile=driving` → expect a GeoJSON Polygon; add `&includeRegions=true`.
- SDK `routing.isochrone` method + types → plan **10-05**.
- API-explorer catalog entry (GET) — frontend, out of this plan's `files_modified`.
- Shares the same OSRM-deploy dependency as 10-01 (foot/bike graphs + volume migration).
