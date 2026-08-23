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

Caddy listens on `:5000` (the public port Fly routes to) and enforces a bearer
token on every request. `osrm-routed` binds exclusively to `localhost:5001` and
is never reachable directly from outside the container.

Set the token once as a Fly secret:

    fly secrets set OSRM_AUTH_TOKEN=<your-token>

Caddy reads it via `{$OSRM_AUTH_TOKEN}` at runtime and returns HTTP 403 for any
request whose `Authorization` header does not match `Bearer <token>`.

The Worker reads `OSRM_BASE_URL` + `OSRM_AUTH_TOKEN` from env
(see `packages/env/src/server.ts`).

## Refresh cadence

OSM drifts. Rebuild monthly: re-run build-graph.sh, redeploy. Automate later.

## Smoke test

    curl -H "authorization: Bearer $OSRM_AUTH_TOKEN" \
      "$OSRM_BASE_URL/route/v1/driving/144.9631,-37.8136;151.2093,-33.8688?overview=full&geometries=geojson"

Expect `code: "Ok"` and a `routes[0]` with distance/duration/geometry.
