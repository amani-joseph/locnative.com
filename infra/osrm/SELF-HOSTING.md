# OSRM Self-Hosting — Vendor Options & VPS Guide

How to self-host the routing engine on a server **you** control (a plain VPS or bare
metal), plus a comparison of vendors. The Fly.io path is in [`DEPLOY.md`](./DEPLOY.md);
this doc covers everything else.

---

## 1. What OSRM actually needs (sizing anchor)

The work splits into **two phases with very different requirements**:

| Phase | RAM | Disk | CPU | Notes |
|---|---|---|---|---|
| **Build** the graphs (`build-graph.sh`: extract→partition→customize ×3) | ~8 GB peak for the AU extract | ~35–45 GB scratch for car+bike+foot | 2–4 vCPU | One-off + monthly refresh. Can run on a bigger/temporary box. |
| **Serve** (`osrm-routed`, MLD — one per profile) | ~3–4 GB **per profile** → ~10–12 GB for car+bike+foot | ~30–45 GB for all three `.osrm*` sets | 2–4 vCPU | Always-on. Each instance memory-maps its own graph. |

**Key consequence:** you can **build on a beefy/temporary machine (or locally) and serve on
a smaller one** — but serving all three profiles needs **≥16 GB RAM** (each profile
memory-maps its own graph). A 4 vCPU / 16 GB / 60 GB box comfortably serves car+bike+foot
for Australia; drop to one profile if you only need driving.

**Two repo-specific gotchas before you pick a vendor:**

- **Region = Sydney/Melbourne.** Your data is Australian and the Worker calls OSRM
  server-side; hosting OSRM in an AU region keeps that hop ~low latency. Vendors without an
  AU region (e.g. Hetzner) add ~150–250 ms per route call.
- **CPU architecture = amd64.** The repo `Dockerfile` uses
  `ghcr.io/project-osrm/osrm-backend:v5.27.1`, an **amd64** image. On ARM hosts (Oracle
  Ampere, AWS Graviton, etc.) you must build an arm64 OSRM image yourself or use an
  amd64 instance. See §5.

---

## 2. Vendor categories (pick the row that matches your ops appetite)

| Category | Examples | You manage | Best when |
|---|---|---|---|
| **Managed container PaaS** | Fly.io, Railway, Render | Just the Dockerfile + secrets | You want least ops; AU region availability varies (Fly has `syd`). |
| **Raw VPS / cloud VM** | Hetzner, DigitalOcean, Vultr, Linode/Akamai, Oracle, Contabo | OS, Docker, TLS, restarts | Cheapest predictable cost; full control; you run the box. |
| **Hyperscaler managed** | AWS (ECS/Fargate, Lightsail, EC2), GCP Cloud Run/GCE, Azure | IAM + their console | You're already in that cloud / need enterprise compliance. |
| **Bare metal / on-prem** | Hetzner dedicated, your own hardware | Everything | Highest control, lowest per-unit cost at scale, most ops. |

---

## 3. Specific vendors (approximate — verify current pricing/regions)

> Prices are indicative monthly USD for a ~4 vCPU / 8 GB / persistent-disk box, the
> comfortable build-and-serve size. **Always confirm current pricing and AU-region
> availability on the vendor site.**

| Vendor | AU region? | ~Spec & price | Notes |
|---|---|---|---|
| **DigitalOcean** | ✅ SYD1 | 4 GB ~$24, 8 GB ~$48 Droplet | Simple, AU region, block storage add-on. Solid default. |
| **Vultr** | ✅ Sydney + Melbourne | similar to DO | Two AU regions; hourly billing. |
| **Linode / Akamai** | ✅ Sydney | 8 GB ~$48 | Mature, AU region. |
| **Oracle Cloud** | ✅ Sydney + Melbourne | **Always-Free Ampere: 4 OCPU / 24 GB ARM = $0** | Standout cheap/free — but **ARM** (must build arm64 OSRM image, §5). Free tier reclaim risk. |
| **AWS** | ✅ ap-southeast-2 (Syd), -4 (Melb) | Lightsail 8 GB ~$40; or ECS Fargate; EC2 t3.large | Use Lightsail for simplicity, Fargate for serverless containers + EFS for the graph. Priciest but most integrated. |
| **GCP** | ✅ australia-southeast1/2 | e2-standard-2 ~$50 | Cloud Run can't easily hold a 10 GB graph in an ephemeral container → prefer a GCE VM + persistent disk. |
| **Azure** | ✅ Australia East | B2ms/B4ms ~$60+ | If you're already Azure. |
| **Hetzner** | ❌ EU + US only | CPX31 4 vCPU/8 GB ~€15 | **Cheapest by far**, but **no AU region** → adds latency. Fine if latency-tolerant or you front it with caching. |
| **Contabo** | ✅ Sydney (VPS) | 8 GB ~$8–10 | Very cheap; oversold/variable performance — acceptable for a stateless read service. |
| **Railway / Render** | ⚠️ limited | usage-based | Easy container deploys but AU region support is thin (mostly US/EU/SG) → latency. |

**Recommendations:**
- **Easiest managed:** stay on **Fly.io** (`syd`) — you already have `fly.toml`. (See DEPLOY.md.)
- **Best price/perf with AU region + full control:** **DigitalOcean SYD1** or **Vultr Sydney**.
- **Cheapest (free) if you'll do an ARM build:** **Oracle Cloud Always-Free Ampere** in Sydney.
- **Lowest absolute cost, latency-tolerant:** **Hetzner** (EU/US) — only if the extra hop is OK.

---

## 4. Step-by-step: self-host on a raw VPS (Ubuntu 24.04)

Works for DigitalOcean / Vultr / Linode / Hetzner / Contabo / any plain VM. Uses the repo's
existing `Dockerfile` + `Caddyfile` + `entrypoint.sh`.

### 4.1 Provision

- Create an **amd64** VM (≥16 GB RAM to serve car+bike+foot, or ≥4 GB for a single
  profile; ≥8 GB if building on the box), **Sydney region**, ~60 GB disk, Ubuntu 24.04.
- Point a DNS record at it, e.g. `osrm.locnative.com → <vm-ip>` (needed for TLS in 4.4).
- Open firewall: allow 22, 80, 443; **block 5000/5001–5003 from the public** (Caddy will
  front it on 443).

### 4.2 Install Docker

```bash
ssh root@<vm-ip>
curl -fsSL https://get.docker.com | sh
```

### 4.3 Get the graph onto the box

Either build on the box (needs ~8 GB RAM):

```bash
git clone <your-repo> && cd <repo>/infra/osrm
./build-graph.sh ./data          # produces data/{car,bike,foot}/australia-latest.osrm*
```

…or build locally / on a temporary big box and copy the artifacts up:

```bash
# from your machine, after running build-graph.sh locally:
scp -r infra/osrm/data/{car,bike,foot} root@<vm-ip>:/opt/osrm/data/
```

### 4.4 Adapt the Caddyfile for TLS (the one repo change)

The committed `Caddyfile` listens on **plain `:5000`** because on Fly, Fly terminates TLS.
On a raw VPS **you** terminate TLS, so serve on your domain over 443. Create a
VPS-specific Caddyfile:

```caddyfile
osrm.locnative.com {
	# `route` forces in-order evaluation so the token gate runs before the
	# profile proxies. Do NOT use bare `handle` blocks here — path routing
	# pre-empts the auth `respond` and silently bypasses the token.
	route {
		@noauth not header Authorization "Bearer {$OSRM_AUTH_TOKEN}"
		respond @noauth "Forbidden" 403

		@car path_regexp ^/[^/]+/v1/car/
		reverse_proxy @car localhost:5001
		@bike path_regexp ^/[^/]+/v1/bike/
		reverse_proxy @bike localhost:5002
		@foot path_regexp ^/[^/]+/v1/foot/
		reverse_proxy @foot localhost:5003

		reverse_proxy localhost:5001
	}
}
```

Caddy auto-provisions a Let's Encrypt cert for the domain. (Keep `entrypoint.sh` and the
`localhost:5001–5003` osrm bindings as-is.)

### 4.5 Run it with restart-on-failure

```bash
docker build -t locnative-osrm -f Dockerfile .   # from infra/osrm with the VPS Caddyfile in place
docker run -d --name osrm \
  --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -e OSRM_AUTH_TOKEN="<your-token>" \
  -v /opt/osrm/data:/data \
  locnative-osrm
```

> Note: the repo `Dockerfile` `EXPOSE 5000` and `entrypoint.sh` start Caddy via the
> Caddyfile. For the TLS Caddyfile above, ensure the container publishes 80+443 (as shown)
> so Caddy can complete the ACME challenge and serve HTTPS. `--restart unless-stopped`
> replaces Fly's `min_machines_running` for resilience.

### 4.6 Smoke-test the engine

```bash
# OK with token:
curl -H "authorization: Bearer <your-token>" \
  "https://osrm.locnative.com/route/v1/driving/144.9631,-37.8136;151.2093,-33.8688?overview=full&geometries=geojson"
# 403 without:
curl -i "https://osrm.locnative.com/route/v1/driving/144.9631,-37.8136;151.2093,-33.8688"
```

### 4.7 Wire the Worker (same as DEPLOY.md Part E)

```bash
cd apps/server
echo "https://osrm.locnative.com" | npx wrangler secret put OSRM_BASE_URL   # no trailing slash
echo "<your-token>"                | npx wrangler secret put OSRM_AUTH_TOKEN
pnpm -F @locnative/server deploy
```

Then run the end-to-end smoke (DEPLOY.md Part F).

---

## 5. ARM hosts (Oracle Ampere, AWS Graviton)

The repo image is amd64. To use a (cheaper/free) ARM box, build an arm64 OSRM image:

- On the ARM host, change the `Dockerfile` base to an arm64-capable OSRM. The official
  `osrm-backend` images are amd64; build OSRM from source for arm64, **or** run an
  amd64 instance instead and skip this. For a free Oracle Ampere box the source build is a
  one-time cost; for simplicity, an amd64 VPS avoids it entirely.
- Everything else (Caddy, entrypoint, volume, secrets) is identical.

---

## 6. Operations

- **Restarts:** `--restart unless-stopped` (Docker) or a systemd unit wrapping the
  `docker run`. The container already self-terminates if `osrm-routed` dies (entrypoint
  `trap`), so the restart policy brings it back.
- **Monthly graph refresh:** re-run `build-graph.sh`, copy the new
  `{car,bike,foot}/australia-latest.osrm*` sets over the old, `docker restart osrm`. (Brief
  downtime — or build into a second dir and swap.)
- **Backups:** the graph is reproducible from OSM, so no backup needed — just keep
  `build-graph.sh`.
- **Monitoring:** hit `/route/v1/driving/...` from an uptime checker with the token; alert
  on non-`Ok`.

---

## 7. Decision shortcut

- Want least ops, already have `fly.toml` → **Fly.io** (DEPLOY.md).
- Want a cheap AU box you control → **DigitalOcean SYD1 / Vultr Sydney**, follow §4.
- Want it free and willing to do an ARM build → **Oracle Cloud Ampere (Sydney)**, §4 + §5.
- Cost above all, latency-tolerant → **Hetzner**, §4 (accept the non-AU hop).
