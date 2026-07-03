# API Endpoint Audit — Final Confirmation (all fixes live)

**Date:** 2026-06-15
**Target:** Production — `https://api.locnative.com` (Worker version `e8a5b166`, master `373fd8c`)
**Method:** N=10 warm → p50/p95, cold (first call) separate; nearby radius curve N=3; temporary project-scoped key (minted in-sandbox, scoped to project `d3946e1d`, revoked after). No secrets recorded.
**Baselines:** `api-endpoint-audit-2026-06-14.md` (stale prod, pre-fix) and `…-postdeploy-comparison.md`.

## Verdict: ✅ all audited issues resolved. No timeouts, no 500s, no hangs.

---

## Full results

### Address / geocoding (API key)

| Endpoint | Original audit | Now (cold / p50 / p95) | Status |
|----------|---------------|------------------------|--------|
| `autocomplete` | p95 **1785ms** | 124 / 131 / 147 ms | ✅ |
| `autocomplete` typo ("Bourke Stret") | (silently broken→slow ILIKE) | 216 / 177 / 182 ms, **returns matches** | ✅ typo tolerance restored |
| `geocode` valid ("10 Bourke St") | ok | 144 / 129 / 167 ms | ✅ |
| **`geocode` POI no-match** ("Sydney Opera House") | **>30s hang** | **404 in 166–263 ms** (fresh & repeat) | ✅ **fixed** |
| **`nearby` r=2000** | **9,426 ms** | 1428 / 139 / 155 ms | ✅ **fixed** |
| **`nearby` r=5000** | **16,656 ms** | 142 / 143 / 144 ms | ✅ **fixed** |
| **`nearby` Melbourne r=1000** | **TIMEOUT >25s** | 766 / 136 / 142 ms | ✅ **fixed** |
| `nearby` r=100 / 500 / 1000 | 116 / 207 / 385 | 133 / 133 / 140 ms | ✅ flat across radius |
| `reverse` | cold 3055 | 141 / 130 / 150 ms | ✅ |
| `addresses/{id}` | 112 | 128 / 124 / 134 ms | ✅ |
| `regions` | 110 (empty) | 146 / 131 / 136 ms (still empty `{}`) | ⚪ data gap (A5, unchanged) |
| `routing/directions` | 113 | 209 / 133 / 138 ms | ✅ |

### Project-scoped (API key) & tiles

| Endpoint | Now (cold / p50 / p95) | Status |
|----------|------------------------|--------|
| `zones` (list) | 127 / 131 / 134 | ✅ |
| `zones/{id}` | 129 / 128 / 130 | ✅ |
| `zones/{id}/addresses` | 1591 / 168 / 185 (50 rows) | ✅ (cold spike only) |
| `zones/contains` | 132 / 132 / 139 | ✅ |
| `devices/{id}/zones` | 136 / 125 / 139 | ✅ |
| `webhooks` (list) | 175 / 129 / 144 | ✅ |
| `geocode/batch/{jobId}` poll | 141 / 127 / 136 | ✅ |
| `geocode/batch/{jobId}/results` | 175 / 167 / 177 | ✅ |
| `tiles/v1/{z}/{x}/{y}` | 118 / 92 / 117 | ✅ |

### Session surface (`/rpc/*`, cookie)

| Endpoint | Original p95 | Now p50 / p95 | Status |
|----------|--------------|---------------|--------|
| `dashboard.getStats` | 1084 | 75 / 105 | ✅ |
| `projects.list` | 3196 | 74 / 78 | ✅ |
| `apiKeys.list` | 93 | 89 / 93 | ✅ |

---

## Fix → confirmation map

| Fix | Issue | Confirmed |
|-----|-------|-----------|
| **A1** geography KNN (`<->`) | nearby/reverse >25s hang | ✅ all radii + cold regions < 1.5s |
| **A2/geocode** `prefixSearch` uppercase btree `LIKE` | prefix ILIKE seq-scan | ✅ valid geocode ~130ms |
| **Operator fix** `<%%`→`<%` | tier-3 threw → slow `ilikeFallback` (~24s, broke fuzzy) | ✅ POI no-match 166–263ms; typo matching works |
| **A4 removed** | pooled-driver 500s in workerd | ✅ no 500s on hot path |
| **A3** `projects.list` `Promise.all` | sequential round-trip / 3.2s p95 | ✅ p95 78ms |

## Residual / unchanged (not regressions)
- **`regions` returns `{}`** — table has 0 rows; data-ingestion task (A5), never in code scope.
- **Cold first-touch spikes** (nearby cold 1428ms, zones/{id}/addresses cold 1591ms, Melbourne cold 766ms) — Neon cold-cache, same class across all endpoints; warm is ~130–185ms.
- Out-of-band (prior notes): Stripe in **test mode** in prod; pre-existing API keys invalid after the scrypt→PBKDF2 hashing migration (new keys work).

### Reproduction
Production over HTTPS, owner session cookie to mint a temporary project-scoped key (revoked after). N=10 warm (radius curve N=3), p50/p95 nearest-rank, 20–35s per-request abort. Neither key nor token recorded.
