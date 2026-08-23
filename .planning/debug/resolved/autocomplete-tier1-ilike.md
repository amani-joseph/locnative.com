---
status: resolved
trigger: "GET /api/v1/addresses/autocomplete intermittently times out at 8000ms on short prefix queries (407, 411)"
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T09:00:00Z
---

## Current Focus

hypothesis: tieredSearch Tier 1 uses `search_text ILIKE 'x%'`. The supporting index idx_addresses_search_text_btree is declared `text_pattern_ops`, a case-sensitive operator class that cannot serve ILIKE. Tier 1 therefore falls to the GIN trigram index (or a seq scan) over 173M rows. Same defect in ilikeFallback's first-token predicate.
test: Inspect the index operator class and every search_text ILIKE site
expecting: text_pattern_ops confirmed case-sensitive; ILIKE sites unable to use it
next_action: Confirm with EXPLAIN (ANALYZE) against production that Tier 1 now uses an index scan on idx_addresses_search_text_btree rather than a bitmap heap scan

## Symptoms

expected: Autocomplete returns in 130-719ms (observed for successful calls)
actual: Intermittent 8000ms client-side timeouts on short prefix queries as the user types
errors: No 429, no error response — the request hangs
reproduction: Rapid prefix sequence 40 / 41 / 407 / 411 / 4118 during typing
started: Reported externally 2026-08-23

## Eliminated

- hypothesis: Per-key concurrency or rate limit manifesting as a hang
  why: Reporter observes no 429; and the ILIKE/index mismatch is sufficient to
       explain a multi-second tail on exactly the short-prefix queries affected.
       (Not exhaustively disproven — see Not Verified in the summary.)

## Evidence

- timestamp: 2026-08-24T00:01:00Z
  checked: drizzle/0009_tiered_search_extensions.sql
  found: idx_addresses_search_text_btree is `USING btree (search_text text_pattern_ops)`
  implication: text_pattern_ops is case-sensitive. It supports LIKE 'X%' but is
               unusable for ILIKE. This is definitional, not incidental.

- timestamp: 2026-08-24T00:02:00Z
  checked: autocomplete.ts:403 (tieredSearch Tier 1)
  found: `search_text ILIKE ${trimmed}%` with the raw (non-uppercased) pattern
  implication: Cannot use the btree. Falls to GIN trigram bitmap + heap recheck
               over 173M rows — the documented ~11s cold path.

- timestamp: 2026-08-24T00:03:00Z
  checked: autocomplete.ts:692,698 (ilikeFallback)
  found: First token `ILIKE 'tok%'`, later tokens `ILIKE '%tok%'`
  implication: Comment claims the first token "can use B-tree index" — it cannot,
               for the same reason. Reached only when tieredSearch throws.

- timestamp: 2026-08-24T00:04:00Z
  checked: prefixSearch (autocomplete.ts:606-670) and Tier 3 anchor (line 480)
  found: Both deliberately uppercase and use case-sensitive LIKE, with comments
         explaining ILIKE would hit the GIN index (~11s cold)
  implication: The correct pattern is already established in this file. Tier 1
               and ilikeFallback were simply missed when A2 applied it.

- timestamp: 2026-08-24T00:05:00Z
  checked: Control flow — reachability of Tier 1
  found: prefixSearch runs first and returns early on any hit, so Tier 1 is
         reached only when prefixSearch found nothing. Both run the same logical
         prefix predicate, so Tier 1's ILIKE re-runs a known-empty prefix as an
         unindexed scan.
  implication: Tier 1 is pure cost on the no-match path — exactly the typing
               cadence the reporter describes.

- timestamp: 2026-08-24T00:06:00Z
  checked: search_text population (drizzle/0004) and prefixSearch comments
  found: search_text is stored uppercase
  implication: Uppercasing the pattern is required for the case-sensitive match
               to be correct, not merely faster.

## Resolution

root_cause: |
  CORRECTED after measuring against production — the initial statement that
  "ILIKE can never use the btree" was too broad.

  idx_addresses_search_text_btree uses text_pattern_ops (case-sensitive). Its
  usability from ILIKE depends on the PREFIX:

    - ALPHABETIC prefix: ILIKE cannot use the index. Measured:
      `ILIKE 'brow%'` and `ILIKE 'BROW%'` both exceed 25s (statement timeout);
      `LIKE 'BROW%'` returns in ~11ms cold / 0.2ms warm.
    - NUMERIC prefix: Postgres DOES derive a range condition from ILIKE
      (~>=~ '407' AND ~<~ '408') because digits are case-invariant, applying
      ~~* as a recheck filter only. Measured ~0.24ms, plan identical to LIKE.

  So the three ILIKE sites were a real defect, but the slow path was alpha
  prefixes (and ilikeFallback's `%tok%` substring predicates, which no prefix
  btree can serve), not the numeric prefixes originally suspected. The
  reporter's numeric timeouts are therefore NOT fully explained by this
  defect — see the open question below.
fix: |
  Replace `search_text ILIKE <pattern>` with `search_text LIKE <UPPERCASED
  pattern>` at all three sites, matching the established pattern in
  prefixSearch and the Tier 3 anchor. search_text is stored uppercase, so
  uppercasing the pattern preserves matching semantics.
  ilikeFallback's trailing `%tok%` substring predicates are left as substring
  matches (they cannot use a prefix btree by nature) but are now uppercased
  for correctness against the uppercase column.
verification: |
  Verified against production via scripts/verify-prefix-index.mjs — all checks
  pass:
    - idx_addresses_search_text_btree confirmed text_pattern_ops
    - LIKE '407%' / '411%' / '4118%' / 'BROWNS%' all use the btree, 0.06-0.27ms
    - alpha ILIKE confirmed unable to use the btree (the regression guard)
    - LIKE and ILIKE return identical row sets for numeric prefixes
  Postcode behaviour also verified end-to-end against production data:
    4118 -> BROWNS PLAINS / FORESTDALE / HERITAGE PARK / HILLCREST / REGENTS PARK
    4077 -> DOOLANDELLA / DURACK / INALA / RICHLANDS
    2026 -> BONDI / BONDI BEACH / NORTH BONDI / TAMARAMA
    3053 -> CARLTON
  Plan is a bitmap index scan on idx_addresses_postcode, 33ms warm.
  Suites: database 56 tests, api 158 tests. tsc clean. ultracite clean.

open_question: |
  The postcode query measured 6.3s on a COLD cache (8,848 shared buffers paged
  in), dropping to 0.5-1.3s warm and 33ms fully warm. A cold hit could still
  approach the reporter's 8s client timeout. Their reported numeric-prefix
  timeouts are not fully explained by the ILIKE defect (numeric prefixes were
  already indexed), so a second contributing factor — cold cache, Neon compute
  cold-start, or connection-level queuing — is likely still present. Worth a
  follow-up session before promising the timeouts are gone.
commit: 3ec943f
files_changed:
  - packages/database/src/queries/autocomplete.ts
