---
phase: 10-advanced-routing
plan: 01
status: code-complete (tasks 1-5); deploy-verification deferred
date: 2026-06-12
---

# 10-01 Summary — Multi-profile + matrix foundation

## What shipped (Tasks 1–4, committed)

| Task | Commit | Result |
|------|--------|--------|
| 1 — Profile-aware OSRM client | `eb13502` | `osrmRequest()` shared helper (route\|table service); `RoutingProfile` driving\|walking\|cycling → OSRM car\|foot\|bike; `fetchOsrmRoute(from,to,opts,profile="driving")` |
| 2 — `fetchOsrmTable` | `958c332` | N×M matrix via `/table/v1/{profile}/...?annotations=duration,distance`; returns row-major `durations`/`distances` (+ resolved `sources`/`destinations`); null cells preserved; non-Ok → `RoutingError(unavailable)` |
| 3 — Multi-profile `directions` | `96c76d8` / `ec19759` | `profile` input widened from `z.literal("driving")` to `z.enum([...])`, forwarded to `fetchOsrmRoute` |
| 4 — `/api/v1/routing/matrix` | `ec19759` | GET endpoint; `sources`/`destinations` as `|`-delimited `lat,lng`-or-addressId lists; profile enum; capped 25/side; registered as `routing.matrix` in `public-http.ts` |

**Verification:** `pnpm -F @locnative/api test` → 90/90 green; `check-types` clean; ultracite clean.

## Success criteria status
- **SC #1 (`/matrix`)** — ✅ met (unit-tested vs mocked OSRM `/table`; OSRM `/table` backend live).
- **SC #2 (walking/cycling)** — ✅ **OSRM side met** — foot/bike graphs deployed and serving (verified `/route/v1/{foot,bike}/` → 200 publicly). Worker→OSRM end-to-end via the public API pending a `wh_` key smoke.

## Deviations from plan
1. **`driving` → `car` in the OSRM URL.** The existing `routing-queries.test.ts` asserted `/route/v1/driving/`; the plan's `must_haves` require the driving→car mapping (Caddy routes on the `car|foot|bike` segment). Updated that one assertion to `/route/v1/car/`. Safe on the current single-graph server (the profile segment is vestigial there) and required for the Task 5 multi-backend Caddy front.
2. **`no_route` message** generalised from "No drivable route…" to "No route … for this profile" (now multi-profile). No test asserts the string.
3. **Test level.** The codebase has **no oRPC procedure harness** (every public router tests pure extracted helpers, e.g. `resolveDirectionsInput`). Followed that convention: exported and unit-tested `parseMatrixSides` (empty/oversize → BAD_REQUEST) and `resolveMatrixPoints` (coord parse, addressId→coords, not-found→404, bad token→400), plus a `fetchOsrmRoute` cycling→`/route/v1/bike/` test. The handler's `RoutingError → 500` mapping is identical to the already-deployed `directions` path. Full HTTP-level assertions (live 2×2, OSRM-down 500) deferred to the post-deploy smoke step.
4. **Matrix method = GET** (D5 left "GET if modest, else POST"). Chose GET with delimited strings for parity with the existing public surface + API explorer; 25/side cap keeps the URL bounded and coords ≤ OSRM `--max-table-size` 100. No `z.number()` on any GET param (all strings/enum) — `z.coerce` pitfall avoided.

## Task 5 — multi-profile OSRM (D1 resolved = (a))
**User chose: all three profiles on one host.** Committed (`958b8a8`):
- `build-graph.sh` builds car/bike/foot into `data/{car,bike,foot}/australia-latest.osrm*`.
- `entrypoint.sh` runs three `osrm-routed` instances on `:5001/:5002/:5003`.
- `Caddyfile` routes `/{service}/v1/{car|bike|foot}/` by path segment behind the bearer gate; default → car.
- `fly.toml` bumped to `performance-4x` / `16gb` (three graphs mmap ~10–12 GB).
- `osrm-check.sh` / `smoke-test.sh` extended to all three profiles; `SELF-HOSTING.md` / `DEPLOY.md` sizing + paths updated.

**✅ DEPLOYED 2026-06-14 — all three profiles live on `locnative-osrm.fly.dev`.**
- Volume extended 10→45 GB; machine scaled to `performance-4x`/16 GB.
- Graphs built **on the Fly machine** (not locally): AU `osrm-extract` peaks >8 GB and the local 16 GB Mac caps Docker at 7.65 GB → bike/foot OOM-killed locally. Built car (reused existing flat files) + bike + foot into `/data/{car,bike,foot}` on the 16 GB Fly box instead. See [[osrm-build-needs-16gb-build-on-fly]].
- Deployed the 3-profile image; **verified publicly**: car/bike/foot all route (HTTP 200 `code:Ok`) with auth; no-auth → 403.
- Two issues hit + fixed during cutover:
  1. **bike/foot appeared down right after deploy** — false alarm; the larger graphs (5 G/4.3 G) just take ~1–2 min to load before `osrm-routed` binds its port. No OOM (MemAvailable ~7.8 G steady).
  2. **Caddy auth bypass** — the `handle @car/@bike/@foot` blocks let path routing pre-empt the bearer-token `respond` (no-auth returned 200). Fixed by wrapping the gate + profile proxies in a single `route {}` so the auth check evaluates first in file order (commit `46233e4`). See [[caddy-handle-blocks-bypass-auth]].
- Old flat `/data/australia-latest.osrm*` kept as rollback (volume has space); helper scripts cleaned.

**Remaining:** end-to-end smoke through the public API (`api.locnative.com/api/v1/routing/directions?profile=walking`) needs a `wh_` key — the OSRM service + contract are verified, so this just confirms the Worker→OSRM hop.

## Follow-ups
- SDK `routing.matrix` method + types → plan **10-05**.
- API-explorer catalog entry for `/matrix` (frontend; out of this plan's `files_modified`).
