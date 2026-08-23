---
task_id: 260823-pcq
status: complete
date: 2026-08-23
commit: 2c771db
---

# Quick Task 260823-pcq: Summary

## What changed

| File | Change |
|---|---|
| `postcode-query.ts` | New. `barePostcode(query, country)` — pure, country-gated postcode detection. |
| `postcode-query.test.ts` | New. 9 unit tests. |
| `autocomplete.ts` | New `postcodeSearch()`; branch wired in ahead of `prefixSearch`. |
| `index.ts` | Export `barePostcode`. |

## Design decisions

**Country-gated detection.** `barePostcode` returns null when country is
absent or unrecognised. Without a country there is no way to distinguish a
postcode from a street number, so unscoped queries keep today's behaviour
exactly. Countries with alphanumeric postcodes (GB, CA, NL) are deliberately
excluded — a bare numeric string cannot be a complete postcode there.

**Fall-through, never early-return-empty.** If the postcode branch finds no
rows the code continues into the existing pipeline, so a numeric query that
is genuinely a street number is unaffected.

**DISTINCT ON in a subquery.** Postgres requires DISTINCT ON's leading
ORDER BY to match its expressions, which conflicts with distance/ranking
ordering. The dedupe runs inside a subquery; the caller's ranking is applied
outside it.

## Verification

- `pnpm --filter @locnative/database test` → 8 files, 56 tests passed
- `pnpm --filter @locnative/api test` → 22 files, 158 tests passed
- `pnpm --filter @locnative/database exec tsc --noEmit` → clean
- `pnpm dlx ultracite check` on all 4 changed files → clean

Note: `autocompleteAddresses` was at cognitive complexity 20/20 before this
change. The first draft pushed it to 21; the branch was flattened to stay
within the limit rather than suppressing the rule. The function is at the
ceiling — the next change to it will likely need a real extraction.

## Not verified

No end-to-end run against production data. The SQL is unexercised by tests
(the suite has no DB fixture — all existing query tests are pure-function).
`postcodeSearch` should be confirmed against a real postcode before the fix
is announced to the reporter.

## Follow-ups not taken

1. **Tier-1 ILIKE timeout** (the report's secondary issue). `tieredSearch`
   Tier 1 uses `search_text ILIKE '407%'` while `prefixSearch` deliberately
   uses uppercase `LIKE` because ILIKE does not use the text_pattern_ops
   btree. Likely the cause of the 8s timeouts. Needs EXPLAIN to confirm.
2. **Locality endpoint** (reporter's Option 3) — better long-term shape for
   this consumer than autocomplete.
