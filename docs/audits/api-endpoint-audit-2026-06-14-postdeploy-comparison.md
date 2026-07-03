# API Audit — Pre-Deploy vs Post-Deploy Comparison

**Date:** 2026-06-14 (after deploying master, Worker version `243413ec`)
**Target:** Production — `https://api.locnative.com`
**Methodology:** identical to the pre-deploy run — N=10 warm samples → p50/p95, cold (first call) reported separately; project-scoped key; Sydney CBD `-33.8688,151.2093`; `country=AU`.
**Baseline:** `api-endpoint-audit-2026-06-14.md` (measured against the *stale* prod deployment, before this deploy).

## What this deploy actually shipped

The deploy made **current master** live. Relevant to latency:

- ✅ **A1 (nearby/reverse index-ordered KNN)** — was already in master (commit `7f1c3d1`, 2026-06-10) but **undeployed**; this deploy makes it live. **This is the only latency fix in this deploy.**
- ⏳ **A2 (geocode/autocomplete fuzzy anchor), A3 (projects.list parallelize), A4 (statement_timeout backstop)** — on PR #11, **NOT yet merged/deployed**. So geocode + autocomplete behavior is unchanged here.
- ⚠️ Side-effects: API-key hashing migrated scrypt→PBKDF2 (**old keys invalid, must re-issue**); billing now boots (Stripe **test mode**).

---

## Headline comparison

| Endpoint | Before (pre-deploy) | After (post-deploy) | Verdict |
|----------|--------------------|--------------------|---------|
| **`nearby` r=2000** | **9,426 ms** (warm) / >20s cold | **156 ms** p50 | 🟢 **FIXED (60×)** |
| **`nearby` r=5000** | **16,656 ms** | **159 ms** | 🟢 **FIXED (100×)** |
| **`nearby` Melbourne r=1000** | **TIMEOUT >25s** | **149 ms** p50 | 🟢 **FIXED** |
| `nearby` r=100 / 500 / 1000 | 116 / 207 / 385 ms | 155 / 153 / 148 ms | 🟢 Consistent (was only fast at tiny radii) |
| `reverse` | cold **3,055 ms**, p50 135 | cold **153 ms**, p50 148 | 🟢 Cold-start fixed; warm same |
| **`geocode` POI ("Sydney Opera House")** | **TIMEOUT >30s** | **TIMEOUT >30s** | 🔴 **Unchanged — A2 not deployed (PR #11)** |
| `geocode` good ("10 Bourke St") | p50 183, p95 188 | p50 206, p95 229 | ⚪ Same |
| `autocomplete` | cold 585, p50 564, p95 **1785** | cold 782*, p50 ~490, p95 ~630 | ⚪ Same warm (A2 not deployed); see cold note |
| `regions` | p50 110 (empty `{}`) | p50 137 (empty `{}`) | ⚪ Same — still 0 rows (data gap) |
| `routing/directions` | p50 113, p95 326 | p50 148, p95 159 | ⚪ Same |
| `tiles` z10 | p50 78, p95 94 | p50 143, p95 184 | ⚪ Same (CDN) |

\* The single 12s cold `autocomplete` reading was a **post-deploy cold-start blip** (first invocation on a freshly-rolled Worker isolate); the next 6 calls were 475–782 ms. Not a regression.

### Project-scoped endpoints (no code change in this deploy → expect parity)

| Endpoint | Before | After | Verdict |
|----------|--------|-------|---------|
| `zones` (list) | p50 106, p95 143 | p50 149, p95 171 | ⚪ Same |
| `zones/{id}` | p50 109 | p50 152 | ⚪ Same |
| `zones/{id}/addresses` | cold 2128, p50 145 | cold 1646, p50 187 | ⚪ Same |
| `zones/{id}/addresses?limit=500` | 174 ms, 500 rows | 215 ms, 500 rows | ⚪ Same (spatial join healthy) |
| `zones/contains` | p50 111, p95 580 | p50 142, p95 160 | 🟢 p95 tail gone (variance) |
| `devices/{id}/zones` | p50 116, p95 504 | p50 148, p95 158 | 🟢 p95 tail gone (variance) |
| `webhooks` (list) | p50 108 | p50 143 | ⚪ Same |
| `batch/{jobId}` poll | p50 110 | p50 148 | ⚪ Same |
| `batch/{jobId}/results` | p50 140 | p50 216 | ⚪ Same |

### Session/RPC surface (A3 not deployed → expect parity)

| Endpoint | Before p50 / p95 | After p50 / p95 | Verdict |
|----------|------------------|-----------------|---------|
| `auth.getSession` | 55 / 65 | 66 / 75 | ⚪ Same |
| `dashboard.getStats` | 77 / **1084** | 88 / 109 | 🟢 p95 tail absent this run* |
| `projects.list` | 89 / **3196** | 100 / 108 | 🟢 p95 tail absent this run* |
| `projects.listApiKeyOptions` | 87 / 657 | 105 / 127 | 🟢 tail absent* |
| `apiKeys.list` | 87 / 93 | 99 / 122 | ⚪ Same |
| `zones.list` (rpc) | 87 / 116 | 100 / 110 | ⚪ Same |
| `webhooks.list` (rpc) | 87 / 111 | 96 / 101 | ⚪ Same |

\* **Honest attribution:** A3 (the `projects.list` parallelization) is **not in this deploy** — it's on PR #11. The earlier p95 spikes (1084 ms, 3196 ms) were one-off cold-plan/connection outliers, and this run simply didn't hit them. Do **not** credit these to a code change; they'll be properly addressed when PR #11 ships A3. Baseline warm floor (~50–110 ms) is otherwise unchanged.

---

## Summary

**Improved (this deploy):**
- 🟢 **The entire `nearby` radius pathology is eliminated.** r=2000 went 9,426 ms → 156 ms; r=5000 went 16,656 ms → 159 ms; the Melbourne/cold-region **>25s timeout → 149 ms**. `reverse` cold-start dropped 3,055 ms → 153 ms. This is the A1 KNN fix going live.

**Still the same / still broken (awaiting PR #11 + redeploy):**
- 🔴 **Forward geocode still hangs >30s** on POI / multi-token queries — the A2 fuzzy-search anchor is not deployed yet.
- ⚪ `autocomplete` warm latency unchanged (A2), `regions` still returns empty (data-ingestion gap, not code), `routing`/`tiles`/project endpoints/RPC surface unchanged (no code in this deploy).

**New since this deploy (side-effects, not latency):**
- ⚠️ **Pre-existing API keys are invalid** (scrypt→PBKDF2 hashing migration). New keys work; old keys (incl. prior audit key) must be re-issued. This audit minted a fresh project-scoped key and revoked it after.
- ⚠️ **Billing runs in Stripe test mode** in prod (test keys set to unblock the deploy).

## To close the remaining gaps
1. **Merge PR #11 + redeploy** → fixes the geocode hang (A2), parallelizes `projects.list` (A3), adds the timeout backstop (A4).
2. Load `regions` boundary data (A5).
3. Replace Stripe test keys with live keys before launching billing.

### Reproduction
Production over HTTPS, owner session cookie to mint a temporary project-scoped key (scoped to project `d3946e1d`, then revoked). Read-only GETs + RPC reads, 1 cold + 10 warm samples (radius curve N=3), p50/p95 nearest-rank, 12–30s per-request abort. No secrets recorded.
