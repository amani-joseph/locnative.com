#!/usr/bin/env bash
# Polls the live routing endpoint until it returns 200 (waiting out the DNS
# negative-cache TTL after IP allocation). Usage: ./poll-smoke.sh wh_<api-key>
set -uo pipefail

API_KEY="${1:?Pass your wh_ API key}"
URL="https://api.locnative.com/api/v1/routing/directions?from=-37.8136,144.9631&to=-33.8688,151.2093"

for i in $(seq 1 16); do
  code=$(curl -s -o /tmp/poll-body.json -w "%{http_code}" "$URL" -H "authorization: Bearer ${API_KEY}")
  ts=$(date +%H:%M:%S)
  if [ "$code" = "200" ]; then
    echo "[$ts] attempt $i: HTTP 200"
    python3 -c "import json;d=json.load(open('/tmp/poll-body.json'));print('distance_m:',d.get('distance_m'),'| duration_s:',d.get('duration_s'),'| geometry_points:',len((d.get('geometry') or {}).get('coordinates',[])))"
    exit 0
  fi
  echo "[$ts] attempt $i: HTTP $code (still waiting on DNS TTL)"
  sleep 30
done
echo "Gave up after 8 min — still not 200."
exit 1
