#!/usr/bin/env bash
#
# Build and upload the Australia detail archives in separate zoom bands.
#
# Why split the archive?
# - z7-z9 is the heaviest and most user-visible band.
# - isolating it in `australia-z7-z9.pmtiles` gives us a clean pipeline slot for
#   future feature-thinning/cartography work without touching z10-z15.
# - z10-z15 stays in `australia-z10-z15.pmtiles` so higher-detail street tiles
#   can keep their full density and long cache lifetime.
#
# Requires the Go pmtiles CLI: https://github.com/protomaps/go-pmtiles
#
# Usage: ./build-detail-tiles.sh [BUILD_DATE]
#   BUILD_DATE  Protomaps daily build to extract from, as YYYYMMDD.
set -euo pipefail

resolve_latest_build() {
  for offset in $(seq 0 14); do
    local stamp
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
    echo "error: could not resolve a Protomaps build date." >&2
    echo "Pass one explicitly, e.g. ./build-detail-tiles.sh 20260822" >&2
    exit 1
  }
  echo "==> Using build ${BUILD_DATE}"
fi

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "error: pmtiles CLI not found." >&2
  echo "Install: https://github.com/protomaps/go-pmtiles/releases" >&2
  exit 1
fi

SOURCE="https://build.protomaps.com/${BUILD_DATE}.pmtiles"
BUCKET="locnative-tiles"
AUS_BBOX="112.9,-43.7,153.7,-10.6"
MID_OUTPUT="australia-z7-z9.pmtiles"
HIGH_OUTPUT="australia-z10-z15.pmtiles"

echo "==> Extracting Australia z7-z9 band from ${SOURCE}"
pmtiles extract "${SOURCE}" "${MID_OUTPUT}" \
  --bbox="${AUS_BBOX}" \
  --minzoom=7 \
  --maxzoom=9

echo "==> Built ${MID_OUTPUT} ($(du -h "${MID_OUTPUT}" | cut -f1))"
pmtiles show "${MID_OUTPUT}"

echo "==> Extracting Australia z10-z15 band from ${SOURCE}"
pmtiles extract "${SOURCE}" "${HIGH_OUTPUT}" \
  --bbox="${AUS_BBOX}" \
  --minzoom=10 \
  --maxzoom=15

echo "==> Built ${HIGH_OUTPUT} ($(du -h "${HIGH_OUTPUT}" | cut -f1))"
pmtiles show "${HIGH_OUTPUT}"

echo "==> Uploading archives to R2 bucket ${BUCKET}"
pnpm dlx wrangler r2 object put "${BUCKET}/${MID_OUTPUT}" \
  --file="${MID_OUTPUT}" \
  --content-type=application/octet-stream \
  --remote
pnpm dlx wrangler r2 object put "${BUCKET}/${HIGH_OUTPUT}" \
  --file="${HIGH_OUTPUT}" \
  --content-type=application/octet-stream \
  --remote

echo "==> Done."
echo
echo "The tile Worker now prefers:"
echo "  z7-z9   -> ${MID_OUTPUT}"
echo "  z10-z15 -> ${HIGH_OUTPUT}"
echo "and falls back to australia.pmtiles when one of those band archives is absent."
echo
echo "This split is the first step toward reducing z7-z9 payload size: that band"
echo "can now be regenerated or thinned independently without changing street zooms."
