# Bug triage: bare postcode query in `/addresses/autocomplete`

**Status:** Confirmed from source. Reporter's root-cause diagnosis is correct.
**Reported:** 2026-08-23

## Confirmation

`search_text` (drizzle/0004_autocomplete_search.sql) is a single concatenated
column, number-first:

```
number_first number_last street_name street_type street_suffix
building_name locality state postcode country
```

`autocompleteAddresses()` (packages/database/src/queries/autocomplete.ts) runs
`prefixSearch()` first for every query, which does:

```sql
search_text LIKE 'QUERY%'
```

For `q=4118` that is `search_text LIKE '4118%'`. The only way a row's
search_text *starts* with 4118 is if `number_first = 4118` — i.e. a street
number. Hence "4118 MURRINGO ROAD, YOUNG NSW 2594". The postcode sits at the
tail of search_text and is unreachable by a prefix match.

This explains every observation in the report:

| Observation | Cause |
|---|---|
| Bare postcode → street numbers | prefix anchor is number_first |
| NSW-dominant results | rural NSW has the high street numbers (4-digit) |
| `q=Browns Plains` works | prefix hits street_name/locality region of the token stream? No — locality follows numbers; it works via tier-2/3 trigram + word_similarity |
| `q=4118 Browns Plains` works | len 8+ → Tier 3 word_similarity path |
| `state=QLD` doesn't help | filter narrows rows, prefix predicate still number-anchored |
| `q=4118 QLD` returns nothing | len 8 → Tier 3, anchorToken() yields "4118", `search_text LIKE '4118%'` anchor, then word_similarity fails |
| limit=20 gives 0 usable | correct rows are not in the candidate set at all, not mis-ranked |

Note also: `prefixSearch` returns early whenever it finds ANY row, so the wrong
street-number matches actively suppress the fuzzy tiers that might have found
the postcode.

## Secondary: timeouts

Prefix queries "40", "41" are rejected client-side (`q` min length 2 passes, but
`autocompleteAddresses` returns [] under len 3 only when unparsed). "407"/"411"
enter Tier 1 (`len <= PREFIX_SEARCH_MAX_LEN=4`) → `search_text ILIKE '407%'`
over a 173M-row table. Per the A2 design note, ILIKE does **not** use the
text_pattern_ops btree — it falls to the GIN trigram index with a large bitmap
heap recheck. That is the cold-cache long tail the reporter sees. Note Tier 1's
predicate is `ILIKE` whereas `prefixSearch` deliberately uses uppercase `LIKE`
for exactly this reason — a likely latent inconsistency worth checking.

## Recommended fix (reporter's Option 1)

In `autocompleteAddresses`, before `prefixSearch`, detect a bare postcode and
branch to a postcode-anchored, locality-grouped query:

- Guard: `/^\d{4}$/` for AU (postcode format is country-specific — gate on
  country, do not apply the AU 4-digit rule globally).
- Query `postcode = $1` using existing `idx_addresses_postcode` /
  `idx_addresses_country_state_postcode`, with `DISTINCT ON (locality, state)`
  so callers get one row per suburb rather than 10 rows of one street.
- Do not early-return empty: if the postcode branch finds nothing, fall through
  to the existing pipeline so non-postcode numeric queries still work.

Option 3 (a locality endpoint) is the better long-term shape for this consumer
but is a larger change; Option 1 unblocks them.
