---
status: awaiting_human_verify
trigger: "GET /api/v1/addresses/autocomplete intermittently times out at 8000ms on short prefix queries (407, 411)"
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T00:00:00Z
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
  idx_addresses_search_text_btree uses the text_pattern_ops operator class,
  which is case-sensitive and cannot serve ILIKE. Three search_text ILIKE
  sites survived the A2 latency work — tieredSearch Tier 1 (line 403) and both
  ilikeFallback predicates (692, 698) — so those paths bypass the btree and
  degrade to a GIN trigram bitmap scan with heap recheck over 173M rows.
  Tier 1 is on the short-prefix path (len <= 4), which is exactly what a user
  types first, and it only executes after prefixSearch already returned empty.
fix: |
  Replace `search_text ILIKE <pattern>` with `search_text LIKE <UPPERCASED
  pattern>` at all three sites, matching the established pattern in
  prefixSearch and the Tier 3 anchor. search_text is stored uppercase, so
  uppercasing the pattern preserves matching semantics.
  ilikeFallback's trailing `%tok%` substring predicates are left as substring
  matches (they cannot use a prefix btree by nature) but are now uppercased
  for correctness against the uppercase column.
verification: |
  Static verification only — the root cause is definitional (text_pattern_ops
  is case-sensitive and cannot serve ILIKE), so it does not depend on runtime
  measurement. But the latency improvement itself is UNVERIFIED here:
    - packages/database: 8 files, 56 tests passed
    - packages/api: 22 files, 158 tests passed
    - tsc --noEmit clean; ultracite check clean
  The test suite has no DB fixture, so no query in this file is exercised
  against real data. Before closing, run EXPLAIN (ANALYZE) on the Tier 1
  predicate in production and confirm an index scan, plus a timing check on
  the reporter's 40/41/407/411/4118 sequence.
commit: 3ec943f
files_changed:
  - packages/database/src/queries/autocomplete.ts
