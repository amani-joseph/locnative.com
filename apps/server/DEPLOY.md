# Deploy Runbook — Geocoding/Geofencing Feature

Finish steps for shipping the geocoding/geofencing feature (zones, forward + batch
geocoding, device tracking, webhooks) to `api.locnative.com`.

- **Code state:** complete + reviewed, commits `57e51ca..7644bda`
- **Worker:** `locnative-server` (Cloudflare account `mr.amanijoseph@gmail.com` / `6f1770fecd1b32d5c1ff88073728ff60`)
- **Spec / plan:** `docs/superpowers/specs/2026-06-04-mapping-geocoding-geofencing-design.md`, `docs/superpowers/plans/2026-06-04-mapping-geocoding-geofencing.md`

---

## ⛔ Blocker — resolve before anything else

The Neon project is **at its 10 GB storage limit** (11 GB used; `addresses` = 16.8M rows / ~11 GB).
Postgres rejects all new file allocation, so even `CREATE TABLE` fails:

```
could not extend file because project size limit (10240 MB) has been exceeded
```

**Action:** raise the Neon storage limit above 10 GB. The 4 new tables need only a few MB,
so a small bump is enough. Until this is done, none of the steps below will work and the
feature endpoints will throw at runtime (their tables don't exist).

---

## Step 1 — Apply the tables-only migration

The migration `packages/database/drizzle/0010_gorgeous_cardiac.sql` is **tables-only**
(the `addresses` float64 ALTER was intentionally removed — see "Deferred" below).

> ⚠️ Do **not** use `drizzle-kit migrate` — its `pg` (TCP) driver hangs against Neon from
> CI/local here. Use the Neon **HTTP** driver instead.

From `packages/database/` with `DATABASE_URL` set (it's in `.env`):

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const fs = require('fs'); const crypto = require('crypto');
require('dotenv').config();
const sql = neon(process.env.DATABASE_URL);
(async () => {
  const raw = fs.readFileSync('drizzle/0010_gorgeous_cardiac.sql','utf8');
  const stmts = raw.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  for (let i=0;i<stmts.length;i++){
    try { await sql.query(stmts[i]); console.log('OK',i+1); }
    catch(e){ if(/already exists/i.test(e.message)){console.log('SKIP',i+1);} else {throw e;} }
  }
  // Record so drizzle-kit won't try to re-run it
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await sql.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  const ex = await sql.query('SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash=\$1',[hash]);
  if(ex.length===0) await sql.query('INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES (\$1,\$2)',[hash,1780537255818]);
  console.log('DONE');
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
"
```

**Verify:**

```bash
node -e "
const { neon } = require('@neondatabase/serverless'); require('dotenv').config();
const sql = neon(process.env.DATABASE_URL);
sql.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('zones','device_zone_state','webhook_subscriptions','batch_geocode_jobs') ORDER BY table_name\").then(r=>console.log(r.map(x=>x.table_name)));
"
# Expect: [ 'batch_geocode_jobs', 'device_zone_state', 'webhook_subscriptions', 'zones' ]
```

---

## Step 2 — Create Cloudflare resources

The worker bindings in `wrangler.jsonc` reference these — `wrangler deploy` fails if absent.
(Note: the current OAuth token shows only `workers (write)` scope; if these error with a
permissions message, add Queues + R2 scopes to the token / API token.)

```bash
cd apps/server
npx wrangler queues create locnative-batch-geocode
npx wrangler queues create locnative-webhook-delivery
npx wrangler r2 bucket create locnative-geocode-results
```

---

## Step 3 — Set the KEY_ENC_KEY secret

Webhook secret encryption (`packages/api/src/secret-crypto.ts`) needs a 32-byte hex key.
It is **not** in `.dev.vars` and must be set as a Worker secret.

```bash
cd apps/server
openssl rand -hex 32          # generate; store the value in your secret manager
npx wrangler secret put KEY_ENC_KEY   # paste the value when prompted
```

Other server secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`)
are already set on the live worker — only `KEY_ENC_KEY` is new.

---

## Step 4 — Deploy

```bash
cd apps/server
npx wrangler deploy --dry-run   # optional: re-validate bundle (last run: 589 KB gzip, OK)
npx wrangler deploy             # pushes live to api.locnative.com
```

---

## Step 5 — Smoke test

With a valid API key (`Authorization: Bearer wh_...` or `X-API-Key`):

```bash
# Forward geocode (no new tables needed — sanity that deploy is healthy)
curl "https://api.locnative.com/api/v1/addresses/geocode?q=1%20Macquarie%20St%20Sydney" -H "X-API-Key: $KEY"

# Create a zone (exercises the new tables)
curl -X POST "https://api.locnative.com/api/v1/zones" -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"test","geometry":{"type":"Polygon","coordinates":[[[151.2,-33.8],[151.3,-33.8],[151.3,-33.9],[151.2,-33.9],[151.2,-33.8]]]}}'

# Point-in-polygon
curl "https://api.locnative.com/api/v1/zones/contains?lat=-33.85&lng=151.25" -H "X-API-Key: $KEY"
```

---

## Deferred — `addresses` lat/lng → double precision

Dropped from `0010` on purpose. The original ALTER:

```sql
ALTER TABLE "addresses" ALTER COLUMN "longitude" SET DATA TYPE double precision;
ALTER TABLE "addresses" ALTER COLUMN "latitude"  SET DATA TYPE double precision;
```

- It rewrites the whole 16.8M-row table → needs **~11 GB temporary headroom** and **locks the
  table** during the rewrite (downtime on autocomplete/reverse).
- Purely a precision improvement (float32 ≈ 6 decimals → float64). **No new feature depends on it.**
- Run only in a maintenance window, well after the storage bump, with monitoring.
- If/when applied, also restore `doublePrecision` for these two columns in
  `packages/database/src/schema/addresses.ts` to keep schema and DB in sync.

---

## Endpoints shipped by this deploy

| Method | Path |
|--------|------|
| GET | `/api/v1/addresses/geocode` (forward) |
| POST/GET | `/api/v1/geocode/batch`, `/api/v1/geocode/batch/{jobId}`, `/api/v1/geocode/batch/{jobId}/results` |
| POST/GET/PUT/DELETE | `/api/v1/zones`, `/api/v1/zones/{id}` |
| GET | `/api/v1/zones/contains`, `/api/v1/zones/{id}/addresses` |
| POST/GET | `/api/v1/devices/{deviceId}/location`, `/api/v1/devices/{deviceId}/zones` |
| POST/GET/DELETE | `/api/v1/webhooks`, `/api/v1/webhooks/{id}` |

Async workers: `batch-geocode` (R2 results) and `webhook-delivery` (HMAC-signed, 3 retries)
run via the `queue` handler in `apps/server/src/index.ts`.
