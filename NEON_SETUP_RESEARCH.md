# Neon Postgres + Drizzle ORM Setup Research

## 1. Required NPM Packages

```bash
# Core packages for the database package
pnpm add @neondatabase/serverless drizzle-orm

# Dev dependencies
pnpm add -D drizzle-kit

# For PostGIS support (geometry types in Drizzle)
pnpm add drizzle-orm  # PostGIS support is built into drizzle-orm/pg-core
# No extra package needed - Drizzle has native geometry/geography column support
```

**Package summary:**
| Package | Purpose |
|---------|---------|
| `@neondatabase/serverless` | Neon's serverless/edge-compatible Postgres driver (uses WebSocket) |
| `drizzle-orm` | TypeScript ORM with full type safety |
| `drizzle-kit` | CLI for migrations, schema push, and Drizzle Studio |
| `@t3-oss/env-core` | Already in your project - use for `DATABASE_URL` validation |
| `dotenv` | Already in your catalog - needed for drizzle-kit CLI |

## 2. Neon Connection Configuration

### Connection string format
```
postgresql://<user>:<password>@<endpoint>.neon.tech/<dbname>?sslmode=require
```

### TypeScript connection setup (`db/index.ts`)
```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// HTTP (query) mode - best for serverless/edge (one-shot queries)
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### Alternative: WebSocket mode (for transactions / interactive sessions)
```typescript
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Required for Node.js (not needed in edge runtimes like CF Workers)
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

**When to use which:**
- **`drizzle-orm/neon-http`** (with `neon()`): Best for serverless functions, edge runtimes, simple queries. Each query is a single HTTP request. No connection pooling needed. Cannot do multi-statement transactions.
- **`drizzle-orm/neon-serverless`** (with `Pool`): Needed for transactions, interactive sessions, or when you need connection pooling. Uses WebSocket under the hood. Add `ws` package for Node.js environments.

## 3. Drizzle ORM Configuration

### `drizzle.config.ts`
```typescript
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",          // migration output directory
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Key CLI commands
```bash
# Generate migrations from schema changes
pnpm drizzle-kit generate

# Apply migrations to database
pnpm drizzle-kit migrate

# Push schema directly (dev only, no migration files)
pnpm drizzle-kit push

# Open Drizzle Studio (GUI)
pnpm drizzle-kit studio
```

## 4. PostGIS on Neon

### Enabling PostGIS
PostGIS is available on all Neon plans. Enable it via SQL:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

You can run this in Neon's SQL Editor, or include it as your first migration.

### Drizzle schema with PostGIS geometry columns

Drizzle ORM has built-in support for PostGIS types via `customType` or the geometry/geography helpers:

```typescript
import { pgTable, serial, text, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// Custom type for PostGIS geometry with SRID 4326 (WGS84 - standard GPS)
const geometry = customType<{
  data: { lat: number; lng: number };
  driverData: string;
}>({
  dataType() {
    return "geometry(Point, 4326)";
  },
  toDriver(value) {
    return sql`ST_SetSRID(ST_MakePoint(${value.lng}, ${value.lat}), 4326)`;
  },
  fromDriver(value) {
    // PostGIS returns WKB hex by default; parse with ST_AsGeoJSON in queries
    // Or handle the raw value depending on your query approach
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return { lat: parsed.coordinates[1], lng: parsed.coordinates[0] };
  },
});

// Example table
export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    coordinates: geometry("coordinates").notNull(),
  },
  (table) => ({
    // Spatial index for fast geo queries
    spatialIdx: index("locations_coordinates_idx").using(
      "gist",
      table.coordinates
    ),
  })
);
```

### Common PostGIS queries with Drizzle
```typescript
import { sql } from "drizzle-orm";

// Find locations within radius (in meters)
const nearby = await db
  .select()
  .from(locations)
  .where(
    sql`ST_DWithin(
      ${locations.coordinates}::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )`
  );

// Get distance between point and locations
const withDistance = await db
  .select({
    id: locations.id,
    name: locations.name,
    distance: sql<number>`ST_Distance(
      ${locations.coordinates}::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    )`.as("distance"),
  })
  .from(locations)
  .orderBy(sql`distance`);
```

### Neon PostGIS notes
- PostGIS version on Neon tracks the latest stable release
- All PostGIS functions (ST_Distance, ST_DWithin, ST_Contains, etc.) work normally
- Spatial indexes (GiST) are supported and recommended for performance
- The `geography` cast (::geography) uses meters for distance; `geometry` uses the SRID's units

## 5. Shared Database Package Structure in pnpm Monorepo

### Recommended structure: `packages/database/`

```
packages/database/
  ├── package.json
  ├── tsconfig.json
  ├── drizzle.config.ts
  ├── drizzle/                  # Generated migrations
  │   ├── 0000_init.sql
  │   └── meta/
  ├── src/
  │   ├── index.ts              # Main export: db instance + schema
  │   ├── client.ts             # Neon connection + drizzle instance
  │   ├── schema/
  │   │   ├── index.ts          # Re-exports all tables
  │   │   ├── locations.ts      # PostGIS-enabled tables
  │   │   └── users.ts          # Example table
  │   └── types.ts              # Inferred types (InferSelectModel, etc.)
  └── .env                      # DATABASE_URL (gitignored)
```

### `packages/database/package.json`
```json
{
  "name": "@locnative/database",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@neondatabase/serverless": "^1.0.0",
    "drizzle-orm": "^0.39.0"
  },
  "devDependencies": {
    "@locnative/config": "workspace:*",
    "drizzle-kit": "^0.30.0",
    "dotenv": "catalog:",
    "typescript": "^5"
  }
}
```

### `packages/database/src/client.ts`
```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export const createDb = (databaseUrl: string) => {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
};

export type Database = ReturnType<typeof createDb>;
```

### `packages/database/src/index.ts`
```typescript
export { createDb, type Database } from "./client";
export * from "./schema";
export * from "./types";
```

### `packages/database/src/types.ts`
```typescript
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { locations } from "./schema";

export type Location = InferSelectModel<typeof locations>;
export type NewLocation = InferInsertModel<typeof locations>;
```

### Add env validation in `packages/env/`

Add a new server env export (`packages/env/src/server.ts`):
```typescript
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.url().startsWith("postgresql://"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

Then export from package.json:
```json
{
  "exports": {
    "./web": "./src/web.ts",
    "./server": "./src/server.ts"
  }
}
```

### Consuming from `apps/web/` (TanStack Start)
```typescript
// In a server function or API route
import { createDb } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { locations } from "@locnative/database/schema";

const db = createDb(serverEnv.DATABASE_URL);

// Use in server functions
const allLocations = await db.select().from(locations);
```

### pnpm workspace catalog addition
Add to `pnpm-workspace.yaml`:
```yaml
catalog:
  "@neondatabase/serverless": ^1.0.0
  drizzle-orm: ^0.39.0
```

## 6. Coexistence with Convex

Neon/Drizzle and Convex serve different purposes and coexist well:
- **Convex** (`packages/backend/`): Real-time data, reactive queries, auth-integrated mutations
- **Neon/Drizzle** (`packages/database/`): Geospatial queries (PostGIS), relational data that benefits from SQL, analytics, or data that needs standard Postgres compatibility

They share no runtime dependencies. The web app imports from both as needed. Use Convex for real-time UI state and Neon for geo-heavy queries that benefit from PostGIS spatial indexes.

## 7. Version Notes (as of early 2025)

- `@neondatabase/serverless` v1.x is the latest stable line
- `drizzle-orm` v0.39.x is current; v1.0 has not yet been released
- `drizzle-kit` v0.30.x matches the current ORM version
- Neon supports PostGIS 3.4+ on Postgres 16+
- The `neon-http` driver is the recommended default; only use `neon-serverless` (WebSocket) when you need transactions
