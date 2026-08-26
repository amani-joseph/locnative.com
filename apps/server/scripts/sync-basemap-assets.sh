#!/usr/bin/env bash
#
# Download and upload the public basemap fonts + sprite assets, including real
# retina `@2x` sprite files.
#
# Usage: ./sync-basemap-assets.sh [TAG]
#   TAG  basemaps-assets Git tag or branch. Defaults to `main`.
set -euo pipefail

TAG="${1:-main}"
BUCKET="locnative-tiles"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/locnative-basemaps-assets.XXXXXX")"
REPO_DIR="${WORKDIR}/basemaps-assets"

cleanup() {
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

echo "==> Cloning protomaps/basemaps-assets (${TAG})"
git clone --depth 1 --branch "${TAG}" https://github.com/protomaps/basemaps-assets.git "${REPO_DIR}"

FONT_ROOT="${REPO_DIR}/fonts"
SPRITE_ROOT="${REPO_DIR}/sprites/v4"
SPRITES=(
  "dark.json"
  "dark.png"
  "dark@2x.json"
  "dark@2x.png"
)

for sprite in "${SPRITES[@]}"; do
  if [ ! -f "${SPRITE_ROOT}/${sprite}" ]; then
    echo "error: expected sprite asset missing: ${SPRITE_ROOT}/${sprite}" >&2
    exit 1
  fi
done

echo "==> Uploading fonts"
find "${FONT_ROOT}" -name '*.pbf' -print0 | while IFS= read -r -d '' file; do
  key="fonts/${file#${FONT_ROOT}/}"
  pnpm dlx wrangler r2 object put "${BUCKET}/${key}" \
    --file="${file}" \
    --content-type=application/x-protobuf \
    --remote
done

echo "==> Uploading sprites"
for sprite in "${SPRITES[@]}"; do
  content_type="image/png"
  if [[ "${sprite}" == *.json ]]; then
    content_type="application/json"
  fi
  pnpm dlx wrangler r2 object put "${BUCKET}/sprite/${sprite}" \
    --file="${SPRITE_ROOT}/${sprite}" \
    --content-type="${content_type}" \
    --remote
done

echo "==> Done."
echo
echo "Uploaded real 1x and 2x sprite assets:"
printf '  - %s\n' "${SPRITES[@]}"
