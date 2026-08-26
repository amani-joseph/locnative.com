# Vector tiles: coverage footprint

Public reference for the basemap tile endpoints. If you are integrating a map
against Locnative, read this first — the coverage footprint is not uniform.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /tiles/v1/{z}/{x}/{y}.mvt` | Vector tiles (Mapbox Vector Tile, protobuf) |
| `GET /tiles/v1/tiles.json` | TileJSON 3.0.0 — bounds, zoom range, attribution |
| `GET /tiles/v1/style.json` | Reference MapLibre dark style using the live TileJSON source |
| `GET /tiles/v1/fonts/{fontstack}/{range}.pbf` | Glyphs |
| `GET /tiles/v1/sprite/dark.{json,png}` | Sprite sheet |
| `GET /tiles/v1/sprite/dark@2x.{json,png}` | Retina sprite sheet |

All responses set `access-control-allow-origin: *`.
Tiles, fonts, sprites, TileJSON and style responses also set explicit
`content-length` and `ETag` headers so browsers and the Cloudflare edge can
cache and revalidate them correctly.

Tile-family responses use split cache headers:

- `cache-control` is tuned for browsers.
- `cdn-cache-control` is tuned for the Cloudflare edge and is intentionally
  longer-lived for immutable tile assets.
- `x-locnative-cache` reports the Worker cache outcome as `HIT`, `MISS`, or
  `REVALIDATED` to make production verification straightforward.

## Coverage

**Global at z0–z6. Australian street-level detail from z7 to z15.**

Tiles are served from two archives, routed by zoom:

- `z <= 6` → a global low-zoom extract. Worldwide coastline, landmass, and
  major features — enough for a zoomed-out map to look like a map.
- `z >= 7` → an Australia-bbox extract with full street-level detail to z15.

Outside Australia above z6 there is no detail data. Those tiles return
**HTTP 200 with a zero-length body** — a valid MVT containing no features.

## Do not rely on 204

Earlier versions returned `204 No Content` for any tile without data. That was
wrong: a 204 is indistinguishable to a renderer from an intentionally empty
tile, so MapLibre marks it loaded, paints nothing, and neither retries nor falls
back to a parent tile. Tiles now always return 200 with a valid (possibly
empty) MVT body.

## Use TileJSON rather than hardcoding tile URLs

Point your source at `tiles.json` instead of an inline `tiles` array:

```js
sources: {
  protomaps: { type: "vector", url: "https://api.locnative.com/tiles/v1/tiles.json" }
}
```

TileJSON advertises `bounds`, `minzoom`, and `maxzoom` from the archives that
are actually deployed, so MapLibre will not request tiles outside coverage, and
your client picks up coverage changes without a redeploy.

## Reference style

`style.json` is a real dark basemap style, not just a placeholder background.
It references the live TileJSON endpoint, glyphs, and sprite so a MapLibre
client can render a complete basemap from a single URL:

```js
new maplibregl.Map({
  container: "map",
  style: "https://api.locnative.com/tiles/v1/style.json",
});
```

## Attribution

Basemap data is Protomaps © OpenStreetMap contributors. The `attribution` field
in TileJSON carries the required notice; display it on your map. This is an ODbL
licence obligation, not a courtesy.

## Operations

The global archive is built and uploaded by
[`apps/server/scripts/build-world-tiles.sh`](../apps/server/scripts/build-world-tiles.sh).
It is optional at runtime: if absent, low-zoom tiles degrade to empty bodies
(with a short cache TTL) and TileJSON falls back to advertising Australia-only
bounds rather than promising coverage that cannot be served.
