#!/usr/bin/env bash
#
# Build and upload the global low-zoom basemap archive (z0-z6).
#
# This is the companion to the Australia extract. Low zooms hold very few tiles
# (z0-z6 is 5461 tiles worldwide), so the global archive is tens of MB, versus
# ~0.3-1.5 GB for the AU archive at z15. That is what makes global low-zoom
# coverage cheap enough to serve unconditionally.
#
# Requires the Go pmtiles CLI: https://github.com/protomaps/go-pmtiles
#
# Usage:  ./build-world-tiles.sh [BUILD_DATE]
#   BUILD_DATE  Protomaps daily build to extract from, as YYYYMMDD.
#               Defaults to the most recent build that actually exists, probing
#               backwards from today, so this script does not go stale.
set -euo pipefail

# Resolve the newest available daily build rather than pinning a date that rots.
resolve_latest_build() {
  for offset in $(seq 0 14); do
    local stamp
    # BSD (macOS) and GNU date take different flags for relative dates.
    stamp="$(date -u -v-"${offset}"d +%Y%m%d 2>/dev/null \
      || date -u -d "${offset} days ago" +%Y%m%d)"
    if curl -sfI "https://build.protomaps.com/${stamp}.pmtiles" >/dev/null 2>&1; then
      echo "${stamp}"
      return 0
    fi
  done
  return 1
}

if [ $# -ge 1 ]; then
  BUILD_DATE="$1"
else
  echo "==> Resolving latest Protomaps build..."
  BUILD_DATE="$(resolve_latest_build)" || {
    echo "error: could not reach build.protomaps.com to resolve a build date." >&2
    echo "Pass one explicitly, e.g. ./build-world-tiles.sh 20260822" >&2
    exit 1
  }
  echo "==> Using build ${BUILD_DATE}"
fi

SOURCE="https://build.protomaps.com/${BUILD_DATE}.pmtiles"
OUTPUT="world-z0-z6.pmtiles"
BUCKET="locnative-tiles"
MAX_ZOOM=6

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "error: pmtiles CLI not found." >&2
  echo "Install: https://github.com/protomaps/go-pmtiles/releases" >&2
  exit 1
fi

echo "==> Extracting z0-${MAX_ZOOM} worldwide from ${SOURCE}"
# No --bbox: we want the whole world. Only the zoom range is limited.
pmtiles extract "${SOURCE}" "${OUTPUT}" --maxzoom="${MAX_ZOOM}"

echo "==> Built ${OUTPUT} ($(du -h "${OUTPUT}" | cut -f1))"

echo "==> Verifying archive header"
pmtiles show "${OUTPUT}"

echo "==> Uploading to R2 bucket ${BUCKET}"
# Large uploads: wrangler streams this; expect a few minutes.
pnpm dlx wrangler r2 object put "${BUCKET}/${OUTPUT}" \
  --file="${OUTPUT}" \
  --content-type=application/octet-stream \
  --remote

echo "==> Done."
echo
echo "The tile Worker picks this up with no redeploy: it routes z<=${MAX_ZOOM} to"
echo "${OUTPUT} and serves higher zooms from australia.pmtiles."
echo "Verify:  curl -s -o /dev/null -w '%{http_code} %{size_download}\\n' \\"
echo "           https://api.locnative.com/tiles/v2/2/0/0.mvt"
echo "Expect a 200 with a non-zero body (previously 204, zero bytes)."
