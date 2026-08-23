---
task_id: 260823-pcq
status: planned
date: 2026-08-23
---

# Quick Task 260823-pcq: Fix bare AU postcode queries in /addresses/autocomplete

## Problem

`search_text` is a single concatenated column, number-first:
`number_first … street_name … locality state postcode country`.

`autocompleteAddresses()` runs `prefixSearch()` first for every query, matching
`search_text LIKE 'QUERY%'`. For `q=4118` the only rows whose text *starts*
with 4118 are those where `number_first = 4118` — a street number. The postcode
sits at the tail and is unreachable by a prefix match.

Worse, `prefixSearch` returns early on any non-empty result, so those spurious
street-number hits actively suppress the fuzzy tiers.

Triage: docs/bugs/2026-08-23-postcode-autocomplete.md

## Approach

Add a postcode-anchored branch ahead of `prefixSearch`, with fall-through.

### Task 1 — `postcode-query.ts` (new, pure)

`barePostcode(query, country): string | null`

- Returns the normalized postcode only when the whole trimmed query is a bare
  postcode AND the country's format matches.
- Country-gated: AU/DE/FR/ES/IT = 4-5 digit per-country rule; NZ/ZA/CH/AT/BE 4;
  US 5. **Never applies when country is undefined** — a bare number with no
  country stays a street-number query, preserving current behavior.
- Pure function, unit-testable without a DB, matching `query-tokens.ts`.

### Task 2 — `postcodeSearch()` in `autocomplete.ts`

```sql
SELECT DISTINCT ON (locality, state) …
FROM addresses
WHERE postcode = $1 AND country = $2 [AND state = $3]
ORDER BY locality, state, <tiebreak>
LIMIT $n
```

- Uses existing `idx_addresses_country_state_postcode`.
- `DISTINCT ON (locality, state)` → one row per suburb, not 10 rows of one street.
- Postgres requires leading ORDER BY to match DISTINCT ON, so distance/ranking
  ordering is applied in an outer query over the deduped set.

### Task 3 — Wire into `autocompleteAddresses`

Insert after `filterClauses` is built, before `prefixSearch`:

```ts
const postcode = barePostcode(searchInput, effectiveCountry);
if (postcode) {
  const rows = await postcodeSearch(...);
  if (rows.length > 0) return { results: rows, parsedQuery: parsed };
  // fall through — never early-return empty
}
```

### Task 4 — Tests

Unit tests for `barePostcode` covering: AU 4-digit hit; no-country → null;
US 5-digit; wrong length for country; non-bare (`"4118 Browns Plains"`) → null;
whitespace; non-digits.

## Out of scope

- The Tier-1 `ILIKE` timeout issue (separate defect, needs EXPLAIN — see triage).
- A dedicated `/localities` endpoint (reporter's Option 3, larger change).

## Verification

- `pnpm --filter @locnative/database test`
- `pnpm dlx ultracite check` on changed files
