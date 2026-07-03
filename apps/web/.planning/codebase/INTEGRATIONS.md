# External Integrations

**Analysis Date:** 2026-04-12

## APIs & External Services

**Convex (Realtime Backend):**
- Purpose: Realtime backend-as-a-service (schema currently empty, wired for future use)
- SDK: `convex`, `@convex-dev/react-query`
- Auth: `VITE_CONVEX_URL` (client env var)
- Config: `../../packages/backend/convex/convex.config.ts`
- Schema: `../../packages/backend/convex/schema.ts` (empty `defineSchema({})`)
- Integration: `ConvexBetterAuthProvider` wraps app in `src/routes/__root.tsx`
- Dev command: `convex dev` (from `@locnative/backend` package)
- Session tokens fetched from Better Auth for server-side auth

**Locnative Locations API (Self-hosted):**
- Purpose: Core product - address geocoding and lookup API
- Endpoints served from `src/routes/api/v1/addresses/`:
  - `GET /api/v1/addresses/autocomplete` - Text search with country/state filters (`src/routes/api/v1/addresses/autocomplete.ts`)
  - `GET /api/v1/addresses/nearby` - Proximity search with PostGIS ST_DWithin (`src/routes/api/v1/addresses/nearby.ts`)
  - `GET /api/v1/addresses/reverse` - Reverse geocoding within 200m (`src/routes/api/v1/addresses/reverse.ts`)
  - `GET /api/v1/addresses/:id` - Lookup by ID (`src/routes/api/v1/addresses/$id.ts`)
- Auth: API key via `Authorization: Bearer <key>` or `X-API-Key` header
- API key validation: scrypt hash comparison in `src/lib/api-key-auth.ts`
- Middleware wrapper: `src/lib/with-api-key.ts` (handles auth + usage tracking)
- Key format: `wh_<uuid>_<secret>`

## Data Storage

**Databases:**

**Neon PostgreSQL (Primary):**
- Driver: `@neondatabase/serverless` (HTTP-based, serverless-compatible)
- ORM: Drizzle ORM via `drizzle-orm/neon-http`
- Connection: `DATABASE_URL` env var (validated in `../../packages/env/src/server.ts`)
- Client factory: `../../packages/database/src/client.ts` (`createDb()`)
- Singleton accessor: `src/lib/db.ts` (`getDb()`)
- PostGIS extension required for spatial queries (`geometry(Point, 4326)`)

**Tables:**
- `addresses` - Core address data with geospatial columns (`../../packages/database/src/schema/addresses.ts`)
  - Fields: country, state, locality, postcode, street components, lat/lng, geom (PostGIS Point), gnaf_pid
  - Indexes: country, state, postcode, locality, street, gnaf_pid
- `api_keys` - API key storage with scrypt hashes (`../../packages/database/src/schema/api-keys.ts`)
  - Fields: user_id, name, secret_hash, secret_salt, display_suffix, timestamps
- `api_usage_daily` - Per-key daily usage tracking (`../../packages/database/src/schema/api-keys.ts`)
  - Fields: api_key_id (FK), user_id, usage_date, endpoint, request_count
  - Upsert pattern: ON CONFLICT increment request_count

**Convex (Realtime):**
- Currently empty schema - provisioned for future realtime features
- Config: `../../packages/backend/convex/schema.ts`

**File Storage:**
- Static assets in `public/` directory (brand assets, resources)
- No cloud file storage integration detected

**Caching:**
- None detected (no Redis, Memcached, or in-memory cache layer)

## Authentication & Identity

**Better Auth (Primary Auth Provider):**
- SDK: `better-auth`, `@convex-dev/better-auth`
- Client provider: `ConvexBetterAuthProvider` in `src/routes/__root.tsx`
- Server auth helpers: `getToken()` / `getSession()` via `src/lib/auth-server.ts`
- Auth proxy route: `/api/auth/$`
- Convex auth integration: `../../packages/backend/convex/auth.ts`
- Env vars:
  - `VITE_CONVEX_SITE_URL` (client-safe site URL used by auth server)
  - `BETTER_AUTH_SECRET` (server-side)

**API Key Auth (API Routes):**
- Custom implementation in `src/lib/api-key-auth.ts`
- scrypt-based secret hashing (N=16384, r=8, p=1, keylen=64)
- Timing-safe comparison to prevent timing attacks
- Keys tied to application user IDs (`user_id` column)
- Token format: `wh_<uuid>_<base64url-secret>`
- Accepted via: `Authorization: Bearer <token>` or `X-API-Key: <token>` headers
- Usage tracking: daily per-key per-endpoint request counts

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Bugsnag, or similar)

**Logs:**
- No structured logging framework detected
- API usage tracking via `api_usage_daily` table (daily aggregates per endpoint)

**Analytics:**
- `web-vitals` 5.x installed (dev dependency) for client performance metrics
- Dashboard route exists at `src/routes/_protected/dashboard.tsx`
- Analytics route exists at `src/routes/_protected/analytics.tsx`

## CI/CD & Deployment

**Hosting:**
- Not explicitly configured in analyzed files
- TanStack Start requires Node.js runtime (not static hosting)

**CI Pipeline:**
- Turborepo for build orchestration
- Ultracite/Biome for lint/format checks (`pnpm dlx ultracite check`)

**Monorepo Build:**
- `turbo dev` - Run all dev servers
- `turbo build` - Build all packages
- `turbo -F web dev` - Run web app only
- `turbo -F @locnative/backend dev` - Run Convex backend only

## Environment Configuration

**Required env vars:**
- `VITE_CONVEX_URL` - Convex deployment URL (client)
- `VITE_CONVEX_SITE_URL` - Better Auth site URL (client-safe)
- `DATABASE_URL` - Neon PostgreSQL connection string (server)
- `BETTER_AUTH_SECRET` - Better Auth secret (server)

**Env var validation:**
- Client vars: `../../packages/env/src/web.ts` (Zod + @t3-oss/env-core, `VITE_` prefix)
- Server vars: `../../packages/env/src/server.ts` (Zod + @t3-oss/env-core)

**Secrets location:**
- `apps/web/.env` file (gitignored)
- Convex env vars set via `npx convex env set`

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## PostGIS Spatial Functions Used

The API routes use PostGIS functions via Drizzle `sql` template literals:
- `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` - Create geography points
- `ST_DWithin(geom, point, radius)` - Proximity filter (meters)
- `ST_Distance(geom, point)` - Distance calculation (meters)
- SRID 4326 (WGS 84) coordinate system

---

*Integration audit: 2026-04-12*
