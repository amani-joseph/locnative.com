# Mapping, Geocoding & Geofencing — Design Spec

**Date:** 2026-06-04  
**Status:** Approved — ready for planning  
**Approach:** Polygon-first (shared spatial layer)

---

## Goal

Extend the Locnative API platform with three interconnected capability clusters that share a single PostGIS polygon data model:

1. **Forward geocoding + batch** — complete the geocoding surface (address text → coordinates, async bulk jobs)
2. **Developer-defined geofencing** — CRUD polygon zones, point-in-polygon, addresses-within-zone, entry/exit webhooks
3. **Location context enrichment** — enrich geocoded responses with zone membership

All new endpoints are key-authenticated, usage-tracked, and scoped to projects — consistent with the existing platform pattern.

---

## Context

### What exists today

| Endpoint | Status |
|---|---|
| `GET /api/v1/addresses/autocomplete` | Live — tiered fuzzy search (prefix → trigram → levenshtein → phonetic) |
| `GET /api/v1/addresses/nearby` | Live — ST_DWithin radius search |
| `GET /api/v1/addresses/reverse` | Live — lat/lng → nearest address (200m window) |
| `GET /api/v1/addresses/{id}` | Live — fetch by ID |

**Data:** AU G-NAF address dataset. PostGIS geometry column on `addresses` table with GiST index.  
**Stack:** TanStack Start (web), Cloudflare Workers (server/API), Postgres/Neon, Drizzle ORM, oRPC.  
**Known issue:** `addresses.latitude` and `addresses.longitude` are `real` (float32 — ~6 decimal places). All new spatial columns use `double precision`.

---

## Data Model

### New tables

#### `zones`
```sql
id              integer PK (generated always)
project_id      integer NOT NULL  FK → projects.id
name            varchar(255) NOT NULL
description     text
geom            geometry(Polygon, 4326) NOT NULL  -- GiST indexed
metadata        jsonb                             -- developer-supplied tags
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```
Index: `idx_zones_project_id` on `project_id`, `idx_zones_geom` GIST on `geom`.

#### `device_zone_state`
```sql
project_id      integer NOT NULL  FK → projects.id
device_id       varchar(255) NOT NULL
zone_ids        integer[] NOT NULL DEFAULT '{}'   -- current containing zone IDs
latitude        double precision NOT NULL
longitude       double precision NOT NULL
updated_at      timestamptz NOT NULL
PRIMARY KEY (project_id, device_id)
```

#### `webhook_subscriptions`
```sql
id              integer PK (generated always)
project_id      integer NOT NULL  FK → projects.id
zone_id         integer           FK → zones.id   -- NULL = all project zones
url             text NOT NULL
events          text[] NOT NULL                   -- ["entry", "exit"]
secret_enc      text NOT NULL                     -- AES-256-GCM encrypted HMAC key
active          boolean NOT NULL DEFAULT true
failing         boolean NOT NULL DEFAULT false    -- set after 3 delivery failures
created_at      timestamptz NOT NULL DEFAULT now()
```

#### `batch_geocode_jobs`
```sql
id              uuid PK DEFAULT gen_random_uuid()
project_id      integer NOT NULL  FK → projects.id
api_key_id      integer NOT NULL  FK → api_keys.id
status          text NOT NULL                     -- pending | processing | completed | failed
input_count     integer NOT NULL
processed_count integer NOT NULL DEFAULT 0
results_r2_key  text                              -- set when status=completed
error           text                              -- set when status=failed
created_at      timestamptz NOT NULL DEFAULT now()
completed_at    timestamptz
```

### Existing table migration
Migrate `addresses.latitude` and `addresses.longitude` from `real` to `double precision` in a dedicated migration.

---

## API Surface

All endpoints require API key authentication (`X-API-Key` header) and increment usage counters via the existing `usageMiddleware`.

### Geocoding

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/addresses/geocode` | Forward geocode — address string → best match with lat/lng |

**Query params (unstructured):** `q` (required, min 5 chars), `country`, `state`.  
**Query params (structured):** `structured=true`, `street` (required), `locality` (required), `state`, `postcode` — skips fuzzy entirely, uses exact equality on indexed fields. Returns 400 if `structured=true` but `street` or `locality` missing.

### Batch Geocoding

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/geocode/batch` | Submit list of address strings → returns `jobId` |
| `GET` | `/api/v1/geocode/batch/{jobId}` | Poll status; when complete, returns pre-signed R2 download URL (1h TTL) |

Constraints: max 1,000 addresses per job. Queue consumer processes in batches of 10.

### Zones

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/zones` | Create zone — GeoJSON Polygon body |
| `GET` | `/api/v1/zones` | List zones for project (paginated, max 100/page) |
| `GET` | `/api/v1/zones/{id}` | Fetch zone with GeoJSON geometry |
| `PUT` | `/api/v1/zones/{id}` | Update name, description, or geometry |
| `DELETE` | `/api/v1/zones/{id}` | Delete zone; cascades to webhook subscriptions |
| `POST` | `/api/v1/zones/contains` | Which project zones contain `{lat, lng}`? |
| `GET` | `/api/v1/zones/{id}/addresses` | AU addresses inside zone — paginated, max 500/page, capped at 10k total with `truncated` flag |

Zone limit: 500 zones per project (configurable per plan tier).

### Devices

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/devices/{deviceId}/location` | Push lat/lng update — triggers boundary check + webhook dispatch |
| `GET` | `/api/v1/devices/{deviceId}/zones` | Current zone membership for device |

### Webhook Subscriptions

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/webhooks` | Subscribe a URL to zone entry/exit events |
| `GET` | `/api/v1/webhooks` | List subscriptions for project |
| `DELETE` | `/api/v1/webhooks/{id}` | Remove subscription |

---

## Architecture & Data Flows

### Forward Geocoding
```
GET /addresses/geocode?q=<address>
  → parseUnitAddress()
  → autocompleteAddresses(db, q, { limit: 1, minSimilarity: 0.6 })
  → 404 if no match above threshold
  → return { address, confidence, matchType }
```
Reuses existing query infrastructure. `structured=true` bypasses fuzzy and uses direct field equality with partial index on `(country, state, locality, street_name)`.

### Batch Geocoding
```
POST /geocode/batch → create job (pending) → enqueue to CF Queue → return { jobId }
Queue consumer (batch=10):
  → geocode each address via forward geocode query
  → accumulate results []
  → write JSON to R2 at key: geocode-jobs/{projectId}/{jobId}.json
  → UPDATE job SET status=completed, results_r2_key=..., processed_count=N
GET /geocode/batch/{jobId}
  → if completed: generate pre-signed R2 URL (1h), return with stats
  → if processing: return { status, processed_count, input_count }
  → if failed: return { status, error }
```

### Zone Point-in-Polygon
```
POST /zones/contains { lat, lng }
  → SELECT id, name FROM zones
     WHERE project_id = $1
     AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($lng, $lat), 4326))
  → return matching zones []
```
GiST index on `zones.geom` keeps this fast even at 500 zones/project.

### Device Location → Webhook Delivery
```
POST /devices/{id}/location { lat, lng }
  1. Run ST_Contains across all project zones → current_zone_ids[]
  2. SELECT zone_ids FROM device_zone_state WHERE (project_id, device_id) = ($1, $2)
  3. Diff: entered = current - previous, exited = previous - current
  4. For each crossing: enqueue { event, zone_id, device_id, lat, lng, timestamp } to CF Queue
  5. UPSERT device_zone_state SET zone_ids=current, lat=..., lng=..., updated_at=now()
  6. Return 200 { zones: current_zone_ids }

Queue consumer (webhook delivery):
  1. Lookup matching webhook_subscriptions (zone_id match OR zone_id IS NULL)
  2. POST to subscription.url with body:
     { event: "entry"|"exit", zone: {id, name}, device: {id, lat, lng}, timestamp }
     Header: X-Locnative-Signature: hmac-sha256=<sig>
  3. On 5xx or timeout: retry up to 3× with exponential backoff
  4. After 3 failures: UPDATE webhook_subscriptions SET failing=true (subscription stays active)
```

HMAC signing uses the existing `api-key-crypto` helper (`packages/api/src/api-key-crypto.ts`).

---

## Execution Phases

### Phase 1 — Spatial Foundation (prerequisite for all)
- Drizzle migrations: `zones`, `device_zone_state`, `webhook_subscriptions`, `batch_geocode_jobs`
- `ALTER COLUMN` migration: `addresses.latitude/longitude` real → double precision
- Zone CRUD endpoints (`POST`, `GET`, `PUT`, `DELETE /api/v1/zones`)
- Zone PIP endpoint (`POST /api/v1/zones/contains`)
- Update SDK types

### Phase 2 — Forward Geocoding + Batch
- `GET /api/v1/addresses/geocode` (forward geocode)
- `POST /api/v1/geocode/batch` + `GET /api/v1/geocode/batch/{jobId}`
- Cloudflare Queue binding in `wrangler.jsonc`
- R2 bucket binding + pre-signed URL generation
- Usage tracking for new endpoints

### Phase 3 — Device Tracking + Addresses-in-Zone
- `POST /api/v1/devices/{deviceId}/location`
- `GET /api/v1/devices/{deviceId}/zones`
- `GET /api/v1/zones/{id}/addresses` (ST_Within, paginated, 10k cap)
- Boundary diff logic + queue dispatch

### Phase 4 — Webhook Delivery
- `POST/GET/DELETE /api/v1/webhooks`
- CF Queue consumer Worker for webhook delivery
- HMAC-SHA256 signing on outbound payloads
- Retry logic (3×, exponential backoff)
- `failing` flag on subscriptions after exhausted retries

---

## Edge Cases

| Case | Resolution |
|---|---|
| Self-intersecting or invalid polygon on create | Reject with `ST_IsValid()` check, return 422 with PostGIS error message |
| Device with no prior state | First push: all containing zones = immediate "entry" events |
| Zone covering millions of addresses | `GET /zones/{id}/addresses` capped at 10k; returns `truncated: true` + `total_estimate` |
| Webhook delivery failure after 3 retries | Set `failing=true` on subscription; developer must inspect and re-activate |
| Zone deleted while device is inside it | CASCADE deletes webhook subscriptions; no exit event fired (zone no longer exists) |
| Batch job with partial failures | Individual address errors recorded inline per result row; job still completes |
| Zone limit exceeded | Return 429 with `X-Zone-Limit` and `X-Zone-Count` headers |
| float32 → float64 migration on live table | Non-blocking `ALTER COLUMN` in Postgres; schedule during low-traffic window |

---

## Out of Scope (this spec)

- Location context enrichment via `?zones=true` on existing geocoding endpoints — deferred to Phase 5 (zones must exist and be populated before enrichment is useful)
- Administrative boundary data (AU suburbs, LGAs, SA2) — separate dataset ingestion, future phase
- Global coverage beyond AU G-NAF
- Routing / directions / distance matrix
- Map tile serving
- Real-time sub-second webhook delivery (Durable Objects) — queue-based (~1–3s) is sufficient
- Device location history / replay
