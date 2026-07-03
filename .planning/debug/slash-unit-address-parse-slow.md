---
status: verifying
trigger: "Address autocomplete on '5/120 Main St' returns wrong/no matches and is slow"
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED. prefixSearch now tries `search_text ILIKE '120 Main St%'` (number-first form) before the bare `'Main St%'`, hitting the existing B-tree index on the first try.
test: Human verification — type "5/120 Main St", "12A/45 Queen St", "120 Main St" (control), and a garbage string into autocomplete.
expecting: Slash inputs return fast correct results; control input still works; garbage fails gracefully.
next_action: Human verifies against local or deployed autocomplete endpoint

## Symptoms

expected: Input "5/120 Main St" should autocomplete quickly (sub-second) and return unit 5 at 120 Main St. Should match experience of typing "120 Main St".
actual: Inputs with slash-separated unit prefix either miss the index entirely or return wrong matches. Request latency is visibly high.
errors: None reported — silent miss or wrong results.
reproduction: Type "5/120 Main St" into address autocomplete on locnative.com.
started: Long-standing / never worked reliably.

## Eliminated

- hypothesis: Parser (parseUnitAddress) fails to split slash-unit format
  evidence: Regex correctly splits "5/120 Main St" → unitFirst=5, streetFirst=120, street="Main St", streetQuery="Main St". Also handles "12A/45 Queen St" correctly.
  timestamp: 2026-04-17T00:01:00Z

- hypothesis: buildFilterClauses doesn't apply unit/street_number constraints
  evidence: When parsed is non-null, it pushes `flat_number = unitNumber` AND `number_first = streetNumber` clauses. These are correct.
  timestamp: 2026-04-17T00:01:00Z

## Evidence

- timestamp: 2026-04-17T00:01:00Z
  checked: parseUnitAddress regex against "5/120 Main St", "12A/45 Queen St", "5/120"
  found: Parser works correctly — produces streetQuery="Main St", streetNumber="120", unitNumber="5"
  implication: Bug is NOT in the parser

- timestamp: 2026-04-17T00:02:00Z
  checked: search_text column definition in 0004_autocomplete_search.sql
  found: search_text = concat_ws(' ', number_first, number_last, street_name, street_type, street_suffix, building_name, locality, state, postcode, country). flat_number is NOT included.
  implication: For a row with flat_number=5, number_first=120, street_name=Main, search_text = "120 Main St ..." — starts with the street number, NOT the unit

- timestamp: 2026-04-17T00:02:00Z
  checked: prefixSearch in autocomplete.ts (lines 449-471)
  found: Uses `search_text ILIKE '${searchInput}%'` where searchInput = parsed.streetQuery = "Main St"
  implication: Pattern is "Main St%" but search_text starts with "120 Main St" — prefix never matches. Zero results.

- timestamp: 2026-04-17T00:03:00Z
  checked: tieredSearch behavior with streetQuery="Main St" (len=7)
  found: Hits Tier 2 (5-7 chars), runs trigram similarity on "Main St" — generic 7-char string, high false positive rate, likely misses due to threshold or returns unrelated streets named "Main"
  implication: Even when trigram doesn't error, it returns wrong or no results for this generic fragment

- timestamp: 2026-04-17T00:03:00Z
  checked: parsedPathFallback (lines 286-308)
  found: Uses `street_name ILIKE 'Main St%'` — but street_name column is just the name without number. This would match but is missing the number_first equality check from filterClauses (those ARE applied). Actually this should work IF street_name = "Main" and street_type = "St"... but the ILIKE is on street_name alone which might be just "MAIN" without "ST". High false positive risk.
  implication: parsedPathFallback may return results but they are unfiltered by street type, causing wrong matches

- timestamp: 2026-04-17T00:04:00Z
  checked: Latency root cause
  found: prefixSearch returns 0 rows → falls into tieredSearch (Tier 2) → trigram on short "Main St" hits many rows → if pg_trgm not available, throws → ilikeFallback runs `search_text ILIKE 'Main%' AND search_text ILIKE '%St%'` — the second condition is a full scan on 60M rows
  implication: Sequential full-table scan explains the 30+ second latency, consistent with prior session findings

## Resolution

root_cause: |
  Two linked bugs:
  1. CORRECTNESS: prefixSearch uses parsed.streetQuery ("Main St") as the prefix, but search_text starts with the street NUMBER ("120 Main St"). The prefix "Main St%" never matches. The fix is to reconstruct the search_text-compatible prefix: "${streetNumber} ${streetQuery}%" (e.g. "120 Main St%").
  2. LATENCY: When prefix fails, tieredSearch runs trigram on the short generic streetQuery. If pg_trgm throws, ilikeFallback does a `%St%` full-table scan. The fix to (1) causes prefixSearch to return results immediately, bypassing all slow paths entirely.

fix: |
  In autocomplete.ts, when `parsed` is non-null and streetQuery is non-empty:
  - In prefixSearch: try BOTH `search_text ILIKE '${streetQuery}%'` (current) AND `search_text ILIKE '${streetNumber} ${streetQuery}%'` (new). The second form matches search_text which starts with number_first.
  - Alternative cleaner fix: pass `parsed` into prefixSearch and let it build a composite prefix `${parsed.streetNumber} ${parsed.streetQuery}` as the ILIKE operand, replacing the bare streetQuery.
  - parsedPathFallback: street_name ILIKE is fine for narrowing, but add street_type match for accuracy.

verification: awaiting human verification
files_changed:
  - packages/database/src/queries/autocomplete.ts (lines ~449-515: prefixSearch signature extended with optional `parsed` param; number-first prefix branch added; call site at line ~249 updated to pass `parsed`)

## Verification Plan

Test these inputs against the autocomplete endpoint (`GET /api/v1/addresses/autocomplete?q=<input>`):

1. **"5/120 Main St"** — slash-unit input (the bug case)
   - Expected: fast response (<200ms), returns unit 5 at 120 Main St
   - Previously: 0 results or 30+ second latency

2. **"12A/45 Queen St"** — slash-unit with alpha unit suffix
   - Expected: fast response, returns unit 12A at 45 Queen St
   - Previously: same miss as above

3. **"120 Main St"** — control: no unit prefix, must still work
   - Expected: fast response, same results as before the fix
   - Previously: worked fine; must not regress

4. **"zzz999 Fake Blvd"** — obviously wrong input
   - Expected: 0 results, no error, response still fast (prefix scan returns nothing quickly, falls to tiered/ilike with no matches)
   - Previously: slow but returned 0 results
