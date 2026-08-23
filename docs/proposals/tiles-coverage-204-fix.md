# Vector tiles: 204 outside Australia — assessment & fix plan

**Reporter:** careproviders.com, 22 Aug 2026
**Verdict:** Report is accurate. Root cause confirmed in source. Not a bug in their client.

## Root cause

`apps/server/src/tiles.ts:9` — `const PMTILES_KEY = "australia.pmtiles"`.

The archive was built in `docs/superpowers/plans/2026-06-05-zones-map-ux.md` (Step 2) as a
deliberate **AU-bbox extract** of the Protomaps global build. The tileset is Australia-only
*by construction*. There is no global data behind the endpoint to serve.

`tiles.ts:141` then returns a bare `204 No Content` whenever `getZxy()` misses. The reporter's
analysis of the consequence is exactly right: MapLibre treats 204 as "tile loaded, intentionally
empty" — no retry, no parent-tile fallback, no error. Hence `areTilesLoaded: true` with a blank
viewport, and at z2 fifteen of sixteen tiles blank.

So there are two independent defects:
1. **Coverage** — the data genuinely stops at the AU bbox.
2. **Signalling** — nothing tells the client where coverage ends. No TileJSON, no bounds in the
   style, and a 204 that is indistinguishable from a legitimately empty tile.

Their four requests map cleanly onto these. Requests 2–4 are the signalling fix and are cheap.
Request 1 is the coverage fix and is the only one with real cost.

## Assessment of each request

| # | Request | Verdict |
|---|---------|---------|
| 2 | 200 + empty MVT instead of 204 | **Do it.** Correct, ~5 lines. But note: an empty tile still paints nothing. This fixes *ambiguity*, not the blank map. |
| 3 | Publish TileJSON at `/tiles/v1/tiles.json` | **Do it — this is the real fix for AU-only.** `bounds`/`minzoom`/`maxzoom` stop MapLibre requesting out-of-coverage tiles at all. |
| 4 | Document the footprint | **Do it.** Cheapest item; would have prevented the whole investigation. |
| 1 | Global tiles at z0–z6 | **Do it, scoped to a low-zoom world extract.** See below. |

### On request 1 — the important nuance

The reporter frames this as "even coastline and ocean only". That is the right instinct and it is
worth being precise about why: **a low-zoom world extract is small.** Global Protomaps z0–z6 is on
the order of tens of MB, versus ~0.3–1.5 GB for the AU extract at z15. Serving a global basemap at
low zoom is therefore nearly free in storage, and it is what makes a zoomed-out map look like a map.

This does **not** mean promising global coverage. The correct product position is:
**global basemap at low zoom, Australian detail at high zoom.** TileJSON should still advertise
that honestly rather than implying worldwide street-level data.

## Recommended fix, in landing order

### Phase 1 — Signalling (no data changes, ship first)

Fixes the ambiguity and lets a correctly-configured client avoid blank tiles immediately.

1. **`tiles.ts`: return 200 + empty body on tile miss.** Replace the `204` at `tiles.ts:141` with a
   zero-length `200` carrying `content-type: application/x-protobuf`. A zero-byte MVT is a valid
   protobuf (an empty FeatureCollection), so renderers accept it.
2. **Add `GET /tiles/v1/tiles.json`.** Do *not* hardcode the bounds — `pmtiles` v4 exposes
   `archive.getHeader()` returning `minLon/minLat/maxLon/maxLat/minZoom/maxZoom` (verified in
   `pmtiles@4.4.1` typings). Generate TileJSON 3.0.0 from the live header so it can never drift
   from the archive that is actually deployed. Include `attribution` (Protomaps/OSM — currently
   missing, and an OSM licence obligation) and cache it hard.
3. **Point the web style at TileJSON.** `apps/web/src/components/map/map-style.ts:44` inlines
   `tiles: [...]` + `maxzoom`. Switch the source to `{ type: "vector", url: ".../tiles.json" }` so
   our own dashboard inherits bounds too, and drops the hardcoded `MAX_ZOOM = 15`.
4. **Optionally add `/tiles/v1/style.json`** (also 404 today) so third parties get a working
   MapLibre style without hand-authoring one. Cheap, and it is the natural companion to TileJSON.

### Phase 2 — Coverage (the visible fix)

5. **Build a global z0–z6 extract** from the same Protomaps build used for the AU archive, and
   store it as a second R2 object (e.g. `world-z0-z6.pmtiles`).
6. **Route by zoom in `handleTileRequest`:** `z <= 6` → world archive; `z > 6` → AU archive. Keep
   one `PMTiles` instance per archive. Note the current code constructs a fresh `PMTiles` per
   request (`tiles.ts:135`) with the cache disabled — worth hoisting to module scope while touching
   this, since directory lookups are currently re-fetched from R2 on every tile.
7. **Update TileJSON** to advertise the union: `bounds` world, `minzoom: 0`, `maxzoom: 15`, and use
   the `description` field to state plainly that detail above z6 is Australia-only.

### Phase 3 — Documentation

8. **Publish the coverage footprint** in the public API docs and in the TileJSON `description`:
   global at z0–z6, Australian street-level detail to z15. State it on the tiles endpoint page so
   the next integrator reads it before opening an investigation.

## Reply to the reporter

Worth telling them: their diagnosis was correct, requests 2–4 land first as a signalling fix, and
the low-zoom world basemap follows. They offered a HAR and style JSON — not needed, the cause is
confirmed in our source.

## Notes / open decisions

- **Is AU-only intentional as a product position?** The plan doc treats it as an implementation
  convenience, not a stated product boundary. If Locnative intends to expand beyond AU
  (cf. `docs/proposals/country-coverage-expansion-datasets.md`), the zoom-routing design in
  Phase 2 generalises to per-region archives.
- **Cache headers on empty tiles.** Currently `immutable, max-age=86400`. Fine, but if coverage
  is about to change, consider a shorter TTL on misses so newly-covered tiles are not pinned blank
  in edge/browser caches for a day after Phase 2 lands.
