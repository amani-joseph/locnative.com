# Research Brief: Zones Manager Dashboard UI

Design-research brief for the **Zones Manager** dashboard surface (developer-defined
geofence polygons). Read-only research; no source files changed.

Decision A (settled): the dashboard calls **new session-authed oRPC procedures added to
`appRouter`**, NOT the public `/api/v1` API. The public router
(`packages/api/src/routers/public/zones.ts`) authenticates by API key + project; the
dashboard authenticates by session and must scope zones to the signed-in user's
project(s).

---

## Endpoints / Data (shipped public API)

Source: `packages/api/src/routers/public/zones.ts`,
`packages/api/src/routers/public/zones-schema.ts`, `packages/sdk/src/types.ts`.

All public procedures use `apiKeyAuth` + `usageMiddleware` and resolve `projectId` from
the validated API key (`requireProjectId`). Behaviors to replicate:

| Proc | Method/Path | Input | Output | Notes |
|------|-------------|-------|--------|-------|
| `zoneCreate` | POST `/api/v1/zones` | `{ name(1-255), description?, geometry: Polygon, metadata? }` | `ZoneRecord` (no geometry) | **500-zone limit** per project -> `FORBIDDEN`. `ST_IsValid(ST_GeomFromGeoJSON())` check -> `UNPROCESSABLE_CONTENT` if invalid. Geom inserted via `ST_GeomFromGeoJSON`. |
| `zoneList` | GET `/api/v1/zones` | `{ page>=1 default 1, limit 1-100 default 20 }` | `{ zones: ZoneRecord[], count, page }` | Offset pagination. **No geometry returned** in list (lightweight). No total count returned. |
| `zoneGet` | GET `/api/v1/zones/{id}` | `{ id }` | `ZoneWithGeometry` (`ST_AsGeoJSON(geom)::json`) | `NOT_FOUND` if not in project. This is the only read that returns geometry. |
| `zoneUpdate` | PUT `/api/v1/zones/{id}` | `{ id, name?, description?, geometry?, metadata? }` | `ZoneRecord` | Ownership verified first. If `geometry` supplied, re-runs `ST_IsValid`. Raw SQL `UPDATE ... ST_GeomFromGeoJSON` path when geometry present; Drizzle update otherwise. |
| `zoneDelete` | DELETE `/api/v1/zones/{id}` | `{ id }` | `{ success: true }` | `NOT_FOUND` if not owned. |
| `zoneContains` | GET `/api/v1/zones/contains` | `{ lat -90..90, lng -180..180 }` | `ZoneContainsResponse { zones: ZoneRecord[], count, query: {lat,lng} }` | Point-in-polygon: finds all zones in project containing the point. |
| `zoneAddresses` | GET `/api/v1/zones/{id}/addresses` | `{ id, page>=1 default 1, limit 1-500 default 50 }` | `ZoneAddressesResponse { results[], count, truncated, query }` | `ST_Within(address.geom, zone.geom)` inner join. **HARD_CAP = 10,000**: if `offset >= 10000` returns empty + `truncated:true`; limit clamped so total never exceeds cap; `truncated` true when `offset+rows >= cap`. |

### GeoJSON Polygon format (`geoJsonPolygonSchema`)

```
{ type: "Polygon", coordinates: ring[] }   // coordinates: number[][][]
ring = [lng, lat][]    // min 4 pairs, FIRST === LAST (closed ring), tuple [number, number]
```

- Coordinates are `[longitude, latitude]` (GeoJSON order), NOT `[lat, lng]`.
- **Closed-ring rule** is enforced client-side by zod and server-side by PostGIS
  `ST_IsValid`. The map UI must auto-close the ring (append first vertex) before submit.
- `metadata` is an arbitrary `Record<string, unknown>` (jsonb).

### Address record shape (from `ZoneAddressesResponse`)
`id, country, state, locality, postcode, streetName, streetType, numberFirst,
numberLast, buildingName, flatType, flatNumber, latitude, longitude`.

---

## oRPC procedures to add (session-authed, in `appRouter`)

Add a new `zonesRouter` (`packages/api/src/routers/domains/zones.ts`) registered in
`packages/api/src/routers/index.ts` as `zones: zonesRouter`. Use `protectedProcedure`
(`packages/api/src/procedures.ts`), which guarantees `context.session.user.id`.

**Project scoping (critical):** the public API trusts the API key's `projectId`. The
dashboard has no API key in context, so every zones procedure must take a `projectId`
input and verify ownership: `projects.userId === context.session.user.id` (pattern from
`projects.ts` -> `assignApiKey`). Reject otherwise. Consider a shared
`requireOwnedProject(db, userId, projectId)` helper.

Procedures (proxy the same DB/PostGIS logic, re-using `geoJsonPolygonSchema`):

1. `zones.list` -> `{ projectId, page?, limit? }` -> paginated `ZoneRecord[]`. Recommend
   also returning a **total count** (extra `count(*)`) so the UI can show pagination and
   the "X / 500" limit indicator without a second call.
2. `zones.get` -> `{ projectId, id }` -> `ZoneWithGeometry` (needed to render/edit polygon).
3. `zones.create` -> `{ projectId, name, description?, geometry, metadata? }` -> 500-limit
   + `ST_IsValid` checks identical to public.
4. `zones.update` -> `{ projectId, id, name?, description?, geometry?, metadata? }`.
5. `zones.delete` -> `{ projectId, id }` -> `{ success }`.
6. `zones.contains` -> `{ projectId, lat, lng }` -> zones containing the point (test tool).
7. `zones.addresses` -> `{ projectId, id, page?, limit? }` -> addresses in zone + 10k
   truncation.

Refactor opportunity: extract the shared zone/PostGIS logic (limit check, ST_IsValid,
geom SQL, addresses query) into a helper module imported by BOTH the public router and
the new domain router, so behavior cannot drift. The only difference is auth + how
`projectId` is resolved.

---

## Map library comparison + recommendation

No map library is installed today. `apps/web/package.json` has only three.js / @react-three
(globe visuals) and recharts. We need polygon **draw + edit** on a real basemap.

Stack constraint: **TanStack Start (SSR)**. All these libs touch `window`/`document` and
must render client-only — load via dynamic import in a `useEffect`/client guard, or a
`ClientOnly` boundary. None are SSR-safe out of the box.

| Option | Bundle (approx, gzip) | Polygon draw/edit | Basemap / tile cost | SSR / TanStack Start | Reuse for device tracking |
|--------|----------------------|-------------------|---------------------|----------------------|---------------------------|
| **Leaflet + leaflet-draw / Geoman** | ~42KB leaflet + ~10-30KB plugin | Mature. `leaflet-draw` (older, jQuery-era patterns) or **@geoman-io/leaflet-geoman-free** (modern, MIT, draw+edit+drag+cut). Raster tiles. | Free OSM raster tiles (usage-policy limited) or MapTiler/Stadia raster free tier. No token strictly required for OSM demo tiles. | Client-only; simplest to wrap. No WebGL. | Good for markers/polylines; raster only, no smooth vector zoom. |
| **MapLibre GL JS + @mapbox/mapbox-gl-draw** | ~210KB maplibre + ~40KB draw | Vector. Mapbox GL Draw works with MapLibre (community-supported); supports polygon draw/edit/vertex. Or **terra-draw** (modern, adapter-based, MIT). | Free: MapTiler free tier, Protomaps, or self-host. Vector tiles need a style URL; MapTiler free key or OSM-based open styles. No paid token. | Client-only; WebGL; needs `import("maplibre-gl")` dynamic. Heavier but fine. | **Best** — vector tiles, smooth pan/zoom, custom layers, clustering, live marker updates for device tracking. |
| **Mapbox GL JS (+ Mapbox GL Draw)** | ~230KB+ | Best-in-class draw/edit (first-party). | **Paid access token + per-load billing.** | Same client-only constraints. | Excellent, but cost + vendor lock-in. |

**Recommendation: MapLibre GL JS + a modern draw tool (terra-draw, or
@mapbox/mapbox-gl-draw) with MapTiler's free vector tiles (key in env).** It is
open-source, has no paid token (unlike Mapbox), gives vector rendering and a layer model
that a shared `<MapCanvas>` can reuse for live device-tracking markers/heatmaps later,
and its GeoJSON-native draw output maps directly onto our `Polygon` schema. The cost is
bundle size (~250KB) and mandatory client-only loading — acceptable for an authed
dashboard. If bundle size or simplicity dominates and device tracking stays marker-only,
**Leaflet + Geoman** is the lighter fallback.

Either way: build one `<MapCanvas>` component (client-only, dynamic import, accepts
GeoJSON layers + an optional draw mode) so Zones and future device-tracking share it.

---

## Components needed

Conventions from `apps/web/src/routes/_protected/api-keys.tsx` and
`apps/web/src/lib/orpc.ts`:
- Route: `createFileRoute("/_protected/zones")({ component: RouteComponent })`.
- Data: `orpcClient.zones.<proc>(...)`; prefer the `orpc` TanStack Query utils
  (`createTanstackQueryUtils`) with `useQuery`/`useMutation` for cache invalidation
  (api-keys.tsx currently uses manual `useState`/`useEffect` + `orpcClient` directly —
  acceptable, but react-query is cleaner for create/update/delete + refetch).
- UI: shadcn from `@locnative/ui/components/*` (Card, Button, Badge, Dialog, Input,
  Label, Skeleton already used). Icons from `lucide-react`. Toasts via `sonner`.

New pieces:
1. `<MapCanvas>` — client-only map wrapper (shared, reusable). Props: zone layers, active
   draw/edit mode, onPolygonComplete(geometry), onVertexEdit.
2. `ZonesPage` route — two-pane layout: map (left/main) + zone list/detail (right/side).
3. `ZoneList` — Card rows: name, description, address-count badge, edit/delete actions.
   Pagination controls. Limit indicator "X / 500".
4. `ZoneEditorDialog` / side panel — name, description, metadata (key-value editor),
   draw/edit polygon on map; Save -> create/update mutation.
5. `DeleteZoneDialog` — confirmation (shadcn Dialog), destructive Button.
6. `ContainsTool` — lat/lng inputs + "Test point" -> `zones.contains`; drops a marker and
   highlights matching zones.
7. `ZoneAddressesPanel` — paginated table of addresses in a zone; "truncated" banner at
   10k.
8. `ProjectSelector` — since zones are project-scoped, the page needs a project picker
   (reuse `projects.list`). Empty/no-project state routes user to create a project first.

---

## UX flow

1. Page loads -> resolve current project (ProjectSelector defaults to first project).
2. `zones.list` populates the list and renders existing polygons on the map.
3. **Create:** "New zone" -> enter draw mode -> click vertices on map -> double-click /
   close to finish (auto-close ring) -> editor panel for name/description -> Save ->
   `zones.create` -> toast success, refetch, polygon persists.
4. **Edit:** select a zone -> `zones.get` for geometry -> editable vertices on map +
   editable fields -> Save -> `zones.update`.
5. **Delete:** trash icon -> confirm dialog -> `zones.delete` -> remove layer, toast.
6. **Test a coordinate:** ContainsTool -> enter or click-to-pick lat/lng ->
   `zones.contains` -> marker + highlight matching zones, list which zones contain it.
7. **View addresses:** "View addresses" on a zone -> paginated table; banner if
   `truncated` (>10k addresses, advise narrowing the polygon).

States:
- **Empty (no zones):** map centered on a default/region view + "Draw your first zone" CTA.
- **No project:** prompt to create a project first.
- **Loading:** Skeleton rows (matches api-keys.tsx `KeysLoadingSkeleton` pattern).
- **500-zone limit:** show "X / 500" counter; disable "New zone" at 500 with tooltip
  explaining the limit + delete-to-free message (mirrors API's FORBIDDEN copy).

---

## Edge cases

- **Coordinate order:** GeoJSON is `[lng, lat]`; many map APIs hand back `[lat, lng]`.
  Normalize before submit. Single most likely bug.
- **Closed ring:** UI must append the first vertex as the last; zod rejects open rings.
- **Invalid/self-intersecting polygon:** server `ST_IsValid` -> `UNPROCESSABLE_CONTENT`.
  Validate client-side too and surface a friendly toast; consider live invalid-geometry
  feedback while drawing.
- **Minimum 4 coordinate pairs** (3 distinct + closing) — block save on degenerate shapes.
- **List returns no geometry / no total count** — must call `zones.get` per-zone to render
  on map, or add geometry to a bulk list endpoint (see Open Questions). N calls is wasteful.
- **10k address truncation** — clearly communicate it's a cap, not the true total.
- **500 limit race** — counter may be stale; handle the FORBIDDEN error from create.
- **Project isolation** — every procedure MUST verify project ownership against
  `session.user.id`; a missing check would leak/allow cross-tenant zone access.
- **SSR** — map must not import at module top level; guard for `window`.
- **Multi-ring polygons / holes** — schema allows multiple rings (interior holes). Decide
  whether the draw UI supports holes (most simple draw tools don't).

---

## Open questions

1. **Bulk geometry for map render:** `zones.list` returns no geometry. Add a
   `zones.list` variant (or a `zones.geojson` endpoint) returning all zones as a GeoJSON
   FeatureCollection so the map renders in one call, instead of N `zones.get` calls? (Watch
   payload size at up to 500 zones.)
2. **Map library final call + basemap provider:** confirm MapLibre + MapTiler free tier
   (needs an API key in env) vs. self-hosted/Protomaps vs. the lighter Leaflet+Geoman
   path. Who provisions the tile key and what's the budget?
3. **Multi-project scoping:** does the page operate on one project at a time (selector) or
   show zones across all of a user's projects? Affects procedure inputs and counts.
4. Should the dashboard support **polygon holes / multi-ring** zones, or restrict the
   draw UI to a single simple ring?
5. **Metadata editing UX:** free-form JSON editor vs. structured key-value rows?
6. Should we **refactor shared zone logic** into a helper now (public + domain routers) or
   duplicate it for the first pass?
7. **react-query adoption:** standardize the new page on `orpc` TanStack Query utils
   (cleaner) even though api-keys.tsx uses manual fetch? Recommend yes.
