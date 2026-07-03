---
phase: 10-advanced-routing
plan: 05
status: complete
date: 2026-06-14
---

# 10-05 Summary — SDK methods for advanced routing

## What shipped (all 3 tasks, committed)

| Task | Result |
|------|--------|
| 1 — Methods + types | `RoutingResource` gains `matrix`, `isochrone`, `match`, `optimize` alongside `directions`, each with mirrored `*Params`/`*Response` types. GET (query): matrix, isochrone. POST (body): match, optimize. `DirectionsParams.profile` widened to `"driving"\|"walking"\|"cycling"`. |
| 2 — Tests | `routing.test.ts` (mirrors `regions.test.ts`) over a mock `Requester`: asserts each method's path/method, GET→query vs POST→body, `originAddressId`→`origin` mapping, `includeRegions` stringification, value pass-through, and the widened `directions` profile. |
| 3 — CHANGELOG | `[Unreleased]` entry for the four methods + widened profile. **No version bump** — publishing is Phase 9's gated path. |

**Verification:** `pnpm -F @locnative/sdk test` → **7/7** green; `check-types` clean; `build` emits dual ESM+CJS dist; `lint:pkg` (publint + attw) all 🟢.

## SC #6 status
✅ **Met** — every new endpoint (matrix, isochrone, match, optimize) has a typed SDK method + tests. `createRouting` was already registered in `client.ts`, so no wiring change was needed.

## Decisions / deviations
- **`IsochronePolygon`** type name (not `GeoJsonPolygon` as the plan suggested) — `zones.ts` already exports `GeoJsonPolygon` and the barrel (`index.ts` `export *`) made the duplicate a `TS2308` collision. Structurally identical; renamed to disambiguate.
- **`isochrone` ergonomics:** added `originAddressId?: number` convenience mapped to the API's single `origin` string; `includeRegions: boolean` is stringified into the query (query values are `string|number|undefined`).
- Matrix `sources`/`destinations` typed as the delimited **string** form to mirror the GET API contract exactly.

## Phase 10 — COMPLETE (code)
All five plans done on `feat/routing-multiprofile`:
- 10-01 matrix + multi-profile + OSRM 3-profile infra
- 10-02 isochrone (ST_ConcaveHull, Neon-verified)
- 10-03 map-matching
- 10-04 optimize (OSRM Trip TSP)
- 10-05 SDK methods ← this plan

## Remaining (not code) — gates the live SCs
1. **OSRM 3-profile deploy cutover** (volume already resized 10→45 GB): rebuild car/bike/foot graphs (~30–60 min), repopulate the Fly volume into the `{car,bike,foot}/` layout, resize machine→16 GB, deploy. Until then walking/cycling routes 5xx and end-to-end smokes can't run.
2. **Live smokes** for all four endpoints (+ `profile=walking`) once OSRM is deployed.
3. **SDK publish** (these methods + version bump) — Phase 9's release path, out of scope here.

## Follow-ups
- API-explorer catalog entries (frontend): matrix/isochrone as GET; match/optimize as POST ⇒ docs-only.
