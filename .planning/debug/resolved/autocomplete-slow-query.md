---
status: resolved
trigger: "GET /api/v1/addresses/autocomplete?q=34%20boxg takes 30+ seconds"
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

hypothesis: The ilikeFallback uses `%token%` substring matching which causes full table scans on 60M rows. The try/catch around tieredSearch catches pg_trgm extension errors and falls back to this slow path.
test: Read the ilikeFallback function and confirm it uses substring ILIKE patterns
expecting: `%token%` patterns causing sequential scan
next_action: Fix ilikeFallback to use prefix matching and add a fast prefix-first path before trigram

## Symptoms

expected: Autocomplete responses should return in under 100ms
actual: Requests take 30+ seconds to complete
errors: No errors thrown, just extremely slow response
reproduction: GET /api/v1/addresses/autocomplete?q=34%20boxg
started: After Phase 5 rewrote the autocomplete query with tiered search

## Eliminated

## Evidence

- timestamp: 2026-04-16T00:01:00Z
  checked: ilikeFallback function (lines 344-371)
  found: Uses `%${token}%` substring ILIKE on each token - this forces sequential scan on 60M rows
  implication: This is the direct cause of 30+ second responses

- timestamp: 2026-04-16T00:01:00Z
  checked: tieredSearch try/catch (lines 199-207)
  found: Bare catch block catches ANY error from tieredSearch and falls back to ilikeFallback
  implication: If pg_trgm/fuzzystrmatch extensions aren't enabled, every query hits the slow ILIKE path

- timestamp: 2026-04-16T00:02:00Z
  checked: Tier 3 logic for "34 boxg" (8 chars, hits WIDE_FUZZY_MIN_LEN)
  found: Uses `search_text <%% trimmed::text` which requires pg_trgm extension
  implication: Without pg_trgm, this throws an error, triggering the catch -> ilikeFallback

## Resolution

root_cause: The ilikeFallback function uses `ILIKE '%token%'` substring matching which cannot use any index, causing a full sequential scan on ~60M rows. This fallback is triggered because pg_trgm extensions likely aren't enabled on the Neon database.
fix: |
  1. Added a `prefixSearch()` function that runs BEFORE tieredSearch. Uses `search_text ILIKE 'query%'` which leverages the existing B-tree text_pattern_ops index (migration 0009). This handles exact-prefix matches instantly.
  2. Rewrote `ilikeFallback()` so the first token uses prefix matching (`token%` instead of `%token%`), which is indexable. Additional tokens use substring matching but only on the already-narrowed result set.
  3. The query "34 boxg" now: (a) tries prefix search "34 boxg%" first, (b) if no results, tries trigram, (c) if extensions missing, falls back to "34%" AND "%boxg%" -- the "34%" prefix narrows to a small set before the substring filter runs.
verification: pending human verification
files_changed:
  - packages/database/src/queries/autocomplete.ts

## Resolution (added 2026-08-27)

Superseded and resolved. This April session introduced prefixSearch using
`ILIKE 'query%'`, believing it indexable. It is not: idx_addresses_search_text_btree
is text_pattern_ops (case-sensitive), so ILIKE cannot use it for an alphabetic
prefix and degrades to a full-table trigram scan.

That was corrected in 3ec943f (uppercased case-sensitive LIKE), and the wider
class of unanchored-fuzzy-predicate bugs was closed by:
  - f6f351f  slash-unit path
  - f38dcf6  Tier 2 zero-match hang
  - 6654282  ORDER BY 1 placeholder defeating LIMIT
  - fed3121  structural invariant test preventing recurrence

The original trigger query ("34 boxg") returns normally. No further action.
