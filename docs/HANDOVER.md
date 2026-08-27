# Handover — address search & performance work

**Last updated:** 2026-08-27
**Branch:** `master`, clean, pushed
**Deployed:** server `08f3cce3`, web `b1aa0937`

Everything below was done for careproviders.com, an Australian care directory
that consumes `/api/v1/addresses/autocomplete`. Their bug reports drove most of
this work and they are the best source of real-world validation — they re-test
promptly and measure carefully.

---

## Start here

```bash
# All guards need a live DB. They exit non-zero on regression.
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')"

node scripts/verify-prefix-index.mjs      # btree opclass, no placeholder sort
node scripts/verify-locality-search.mjs   # 12 suburbs resolve correctly
node scripts/verify-locality-latency.mjs  # skip-scan uses the right index
node scripts/verify-fuzzy-tier.mjs        # zero-match queries return fast
node scripts/verify-unit-query.mjs        # slash-unit plan stays anchored
node scripts/verify-fuzzy-locality.mjs    # typo ranking (has KNOWN_MISS entries)
node scripts/verify-spatial-latency.mjs   # nearby KNN plan

pnpm check-types && pnpm --filter @locnative/database test   # 73 tests
```

`pnpm run deploy` — **not** `pnpm deploy`, which hits pnpm's own builtin and
fails with `ERR_PNPM_NOTHING_TO_DEPLOY`.

---

## Pending — in priority order

### 1. Phase 2 of the performance audit (F2 + F3) — highest value

**Not started.** One change addresses both.

- **F2:** the DB client is Neon's HTTP driver, one fetch per query. A bare
  `SELECT 1` costs **225 ms cold / 24 ms warm**. Two blocking round trips per
  request (auth, then query).
- **F3:** `validateApiKey` runs PBKDF2 at 100 k iterations — **23.8 ms measured**,
  ~15 % of the 153 ms p50, on every keystroke.

**Recommended fix:** cache validated API keys in the Worker with a short TTL
(~60 s). Removes one cold round trip *and* the PBKDF2 cost from ~99 % of
requests. Do **not** simply lower the iteration count — that weakens the hash.
API keys are high-entropy secrets so the offline-cracking threat model differs
from passwords, but caching is the safer fix than reducing work.

Alternative: Neon's pooled/WebSocket driver. Bigger win, broader blast radius —
affects every query in the app.

Details: `docs/audits/2026-08-26-performance-audit.md` F2/F3.

### 2. `population_score` is all-zero — ranking has no popularity signal

**Investigated, not implemented.** Full write-up:
`docs/audits/2026-08-27-population-score-investigation.md`.

The column was designed as the primary suburb-ranking signal and never wired to
a data source — both importers write the literal `0`. This is why fuzzy matching
gets the candidate set right but the order wrong (`sydeny` → SYDENHAM, not
SYDNEY).

Recommendation is ABS population for AU first. **But** nobody has complained
about ranking since the fuzzy fix shipped, so "do nothing" is defensible.
Decide whether it is costing anything before spending on a 16.8 M-row backfill.

If it is ever populated: recreate `idx_addresses_population_score` (dropped in
`drizzle/0020`), re-run `verify-fuzzy-locality.mjs` — some `KNOWN_MISS` entries
should start passing — and `VACUUM` after.

### 3. Remaining audit findings

| ID | Finding | Priority |
|---|---|---|
| F4b | Drop `idx_addresses_country` + `idx_addresses_state` (~4.2 GB, leftmost-prefix duplicates). **Verify with `pg_stat_statements` first** — it was not available when audited. | P1 |
| F5 | Tune per-table autovacuum thresholds. Default `analyze_scale_factor` 0.1 means ~30 M rows must change before autoanalyze fires. `ANALYZE` has been run manually. | P3 |
| F7 | 13 routes fetch in `useEffect`, 0 use TanStack Router loaders → guaranteed client waterfall. This is *perceived* performance; validate against RUM first. | P2 |
| F8 | `parsedQuery` debug field ships to every client. Breaking change — bundle with a deliberate API version bump. | P3 |
| F9 | Suburb queries return 9 fields where 3 suffice (83 % smaller). Do **not** change the default shape. | P3 |
| F10 | HTML document has no `Cache-Control`; TTFB ~1,197 ms deserves its own look. | P3 |
| F11 | `shared_buffers` 2.5 % of heap. **Do not act** — Neon manages it, and F4 is the cheaper lever. | P4 |

### 4. Observability gap

**No RUM is collected.** Core Web Vitals were never measured — TTFB and payload
sizes were used as proxies. Add real-user monitoring before optimising perceived
performance further; F7 in particular should not be actioned on intuition.

`pg_stat_statements` is also not enabled, which is why F4b is blocked.

### 5. Pre-existing debug sessions (not mine, unverified)

13 open sessions in `.planning/debug/` — auth, sign-in, OAuth, UI flicker,
deploy config. **I did not touch or verify any of these.** They predate this
work and may be stale. Do not assume they are current.

---

## What is done — do not redo

All fixed, deployed, and verified live against production.

| Fix | Commit | Result |
|---|---|---|
| Bare postcode returned wrong addresses | `2c771db` | `4118` → Browns Plains + 4 more |
| `ILIKE` bypassing the btree | `3ec943f` | alpha prefix >25 s → 11 ms |
| Suburb names returned no localities | `c1fbf60` | 1/20 → **20/20** |
| Slash-unit queries | `f6f351f` | 7.7 min → 596 ms |
| `ORDER BY 1` defeating `LIMIT` | `6654282` | 3-digit 20 s → 295 ms |
| Comma forms misrouting | `b52fa56` | `L 2, 12 Smith St…` resolves correctly |
| Zero-match 5–7 char hang | `f38dcf6` | >45 s → ~200 ms |
| Locality index | `ff8a25b` | cold p50 480 → 146 ms |
| Fuzzy suburb matching | `730309f` | `sydeny` → SYDNEY |
| Audit quick wins F1/F4a/F5/F6 | `49e0ede`, `84ca585` | see below |

---

## Things that will bite you

**1. Never write an unanchored fuzzy predicate against `search_text`.**
Four separate production incidents came from this. Every fuzzy predicate must
go through `buildAnchoredFuzzyWhere`. `fuzzy-anchor-invariant.test.ts` enforces
it — and was itself verified by reintroducing each historical bug and confirming
it failed. Run it before touching `autocomplete.ts`.

**2. `ORDER BY 1` is not a no-op.** Postgres reads it as an ordinal column
reference and plans a real sort, so `LIMIT` can no longer short-circuit.
Measured 11 ms → 1,511 ms on one prefix. `buildOrderBy` now returns an empty
fragment instead; the invariant test guards it.

**3. `search_text` needs `LIKE` on an **uppercased** pattern, never `ILIKE`.**
`idx_addresses_search_text_btree` is `text_pattern_ops` (case-sensitive).
Subtlety: `ILIKE` *does* work for purely numeric prefixes — Postgres derives a
range from digits — which is why this defect hid for so long. Alphabetic
prefixes fall off a cliff (>25 s vs 11 ms).

**4. Workers Assets *appends* `_headers` rules; it does not replace.**
My first F1 attempt produced `max-age=0, must-revalidate, public, max-age=31536000, immutable`.
Browsers honour the first `max-age`, so the fix silently did nothing. Use
`! Cache-Control` to clear the inherited value. **Always verify the live header
after changing `_headers`.**

**5. Results-based tests do not catch these bugs.** Every one returned the
*correct rows* — it just took minutes. The cost is in the plan. That is why the
guards assert plan shape (`EXPLAIN`), not just output.

**6. The table has ~307.6 M rows, not 173 M.** The 173 M figure appears in old
comments and is wrong; I propagated it myself before checking. Exact
`count(*)` = 307,584,808, planner estimate accurate to 0.1 %.

---

## Do not "optimise" these

Measured and correct:

- **Tile serving** — correct cache headers, SWR, confirmed CDN HITs, 39–52 ms warm.
- **Map architecture** — `map-canvas.tsx` is 78 lines delegating to vector tiles.
  No markers, no clustering, no GeoJSON. Already scales to 100x because the
  client never receives per-feature data.
- **`nearby`** — 8.2 ms, index-ordered KNN, no sort node.
- **Postcode `DISTINCT ON`** — I tried replacing it with a skip-scan (which won
  big for locality search) and it was **190x slower**: 51 ms → 9,892 ms. A
  postcode is a narrow range with a 4,341:1 row-to-result ratio; the skip-scan
  wins only when ranging over the ordering column. Do not repeat this.
- **Dashboard batching, autocomplete client debounce/cache/abort** — already right.

---

## Open question with careproviders.com

They were asked to re-test after the fuzzy-match and latency fixes and have not
yet replied. Their last report confirmed 20/20 suburbs passing and asked about
the zero-match hang, which is now fixed and deployed but **not yet confirmed
from their side**.

Reports sent (private artifacts — ask the account owner for links if needed):
postcode fix, suburb search, numeric prefix + slash-unit + comma, latency,
zero-match hang.
