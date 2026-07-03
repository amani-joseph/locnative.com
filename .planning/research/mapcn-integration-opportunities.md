# mapcn integration opportunities — locnative.com

Source: https://www.mapcn.dev (docs: /basic-map, /markers, /clusters, /routes, /arcs)
Indexed under ctx sources: `mapcn-home`, `mapcn-docs`, `mapcn-basic-map`, `mapcn-markers`, `mapcn-clusters`, `mapcn-routes`, `mapcn-arcs`.

## What mapcn is
"maps + shadcn" — copy-paste React map components. Built on **MapLibre GL**, styled with **Tailwind**, designed for **shadcn/ui**. Own-your-code, zero lock-in, no API keys (free tiles), theme-aware (auto light/dark), full TypeScript.

Components: **Map** (controlled `viewport`/`onViewportChange`, custom `styles`, 3D, `projection:{type:"globe"}`), **Controls**, **Markers** (DOM-based: `MarkerContent`/`MarkerTooltip`/`MarkerPopup`/`MarkerLabel`), **Popups**, **Routes** (`MapRoute` polylines; docs show live OSRM directions), **Arcs** (`MapArc` origin→destination curves, antimeridian-aware), **Clusters** (`MapClusterLayer` — native MapLibre clustering, `onPointClick`, scales to 10k+ pts), **Advanced** (GeoJSON layers for very large datasets).

## Why it fits this project almost perfectly
- **Same engine.** We already ship `maplibre-gl` (~1.5 MB already in the web bundle). mapcn adds no new map engine and no duplicate dependency.
- **Same design system.** We already use shadcn/ui via `@locnative/ui` + Tailwind v4 → components drop into the UI package and inherit our theme tokens. Dark dashboard ⇒ theme-aware maps are free.
- **Copy-paste model** suits our Cloudflare Workers SSR app and Ultracite/Biome: vendor the files, run `pnpm dlx ultracite fix` to match tabs/double-quotes/sorted-classes.
- **Honest scope:** mapcn is for **displaying/visualizing** geodata, NOT drawing. Keep **terra-draw** for zone editing; use mapcn for everything that *shows* data.
- **Adaptation needed:** examples are Next-flavored (`"use client"`, `next/image`). On TanStack Start drop the directive and swap to `<img>`. Minor.

## Opportunities (ranked by value/effort)

### 1. ⭐ Batch-geocoding results map (HIGH — Clusters)
Phase 3 batch jobs produce thousands of geocoded points, today shown only as a table. Feed the job's results GeoJSON to `MapClusterLayer` → clustered, zoomable map; click a point → popup with matched address + confidence/score. Biggest "wow", isolated, no terra-draw overlap. **Best first slice.**

### 2. Interactive geocoding playground in docs/explorer (HIGH — Map + Marker + Popup)
Ties into the Phase 5 docs/API explorer just shipped. Each forward/reverse geocode example renders a live mapcn `Map` that flies (controlled viewport) to the response and drops a marker with a rich popup. Turns static docs into an interactive try-it playground.

### 3. Devices: live positions + breadcrumb trails (HIGH — Markers/Clusters/Routes)
- Fleet of devices → `MapMarker`s, or `MapClusterLayer` when many.
- A device's location history → `MapRoute` trail with numbered stops.
- Overlay zone polygons and highlight entry/exit events (ties to webhooks).

### 4. Zones display upgrade (MEDIUM — Map base + GeoJSON layers)
Adopt mapcn's themed `Map` + `MapControls` as the shared base primitive; render zone polygons as layers + centroid markers with popups (name, # addresses). The existing "addresses-in-zone" viewer becomes a clustered point layer clipped to the polygon. Keep terra-draw for drawing/editing.

### 5. Marketing hero: Australia coverage on a globe (MEDIUM — Arcs)
Replace/augment the landing hero (already a WebGL map) with `MapArc` on `projection:{type:"globe"}` — arcs sweeping across Australia from a hub. High visual impact for "nationwide geocoding."

### 6. Reverse-geocode / point-in-polygon test tool (LOW–MED — Map + Popup)
The existing point-test tool: click the map to drop a point, popup shows which zone(s) contain it (calls `/zones/contains`).

## Suggested adoption path
1. Vendor `Map` + `Controls` + `Marker` + `Popup` + `Cluster` into `packages/ui/src/components/map/`; run ultracite fix; strip Next-isms.
2. Standardize one tile style — Carto light/dark (free, theme-aware) as default; evaluate MapTiler for richer AU detail.
3. Ship **#1 (batch results cluster map)** as a vertical MVP slice (highest value, no overlap with terra-draw).
4. Then **#2 (docs playground)** and **#3 (devices)**.
5. Refactor existing `MapCanvas`/`ZoneMap` to build on the shared mapcn `Map` primitive for visual consistency; leave editing on terra-draw.

## Caveats / watch-outs
- Copy-paste ⇒ you own maintenance (no auto-updates) — standard shadcn tradeoff we already accept.
- DOM markers are fine for hundreds; use cluster/GeoJSON layers for thousands (mapcn documents this).
- Verify license/attribution of chosen tile provider before production.
