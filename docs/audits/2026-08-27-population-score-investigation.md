# `population_score` — investigation

**Asked:** where was this meant to come from, and what would it take to fix?
**Status:** Investigation only. Nothing implemented.

---

## What it is

A ranking column on `addresses`, added in `drizzle/0009_tiered_search_extensions.sql`
alongside `admin_level`. Two query paths order on it:

```
autocomplete.ts:199    ORDER BY population_score DESC, admin_level ASC
structured-search.ts:109  rerank.push(population_score DESC)
```

The intent is clear from that ordering: **prefer bigger places**. It is the
signal that should make `sydney` rank Sydney above Sydenham.

## What it actually contains

Zero. For every row.

```
sample of 158,716 rows: 0 non-zero, max = 0
```

## Why — it was never populated by any importer

Both ingest paths write the literal `0`:

```sql
-- scripts/intl/ingest.ts PROMOTE_SQL
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
  0, 5        -- population_score, admin_level
```

`scripts/intl/gb-coverage.ts` does the same and its comment states the
consequence outright:

> *"autocomplete orders `population_score DESC, admin_level ASC`; with all GB
> population_score=0, admin_level is the live tiebreaker"*

So this was **known**, at least for the GB import. The column was designed as
the primary ranking signal, never wired to a data source, and `admin_level`
quietly became the only tiebreaker.

`admin_level` *is* populated (values 5–8), but it encodes record type — real
address (5), place (6), street (7), postcode (8) — not importance. It cannot
distinguish Sydney from Sydenham; both are real addresses at level 5.

## What this costs

Suburb search has **no notion of which places matter**. Ranking within a
match set is effectively arbitrary (currently alphabetical-ish by index order).
Concretely:

| Query | Returns first | Should return |
|---|---|---|
| `sydeny` | SYDENHAM | SYDNEY |
| `perht` | (no match) | PERTH |
| `melb` | MELBA, MELBOURNE… | MELBOURNE |

The fuzzy-matching work shipped on 2026-08-26 got the *candidate set* right.
It cannot get the *order* right without this signal. Every remaining
"wrong suburb first" complaint traces back here.

It is also why the `idx_addresses_population_score` index was dropped
(`drizzle/0020`): indexing a constant has no selectivity. **If the column is
ever populated, that index should be recreated.**

---

## Options

### A. ABS population by locality (AU only) — recommended starting point

The Australian Bureau of Statistics publishes population by SA2/suburb, free
and redistributable under CC-BY 4.0.

- **Coverage:** AU only (~15 k localities). AU is ~6 % of the table but the
  overwhelming majority of traffic.
- **Join key:** locality name + state. Imperfect — duplicate suburb names
  across states are handled by including state, but ABS boundaries do not map
  cleanly 1:1 onto G-NAF localities. Expect ~90–95 % match, with the tail being
  small rural localities where ranking matters least.
- **Update:** set `population_score` per (locality, state), applied to every
  address row in that locality.
- **Effort:** Low–Medium. One-off download, a mapping table, one UPDATE.
- **Risk:** Low. Purely additive to ranking; a null/zero score behaves exactly
  as today.
- **Backfill cost:** an UPDATE touching ~16.8 M AU rows. On this table that is
  a long-running write and will bloat the heap until vacuumed — should be
  batched, and `VACUUM` run afterwards.

### B. GeoNames population (global)

GeoNames publishes populated-place populations worldwide, CC-BY 4.0.

- **Coverage:** global, which matches the table's actual shape (US 44 %, IT/FR/
  DE ahead of AU).
- **Quality:** lower than ABS for AU specifically; GeoNames "population" is
  city-level and sparse for suburbs.
- **Effort:** Medium. Larger dataset, fuzzier name matching across countries.
- **Best used as:** the fallback layer under A — ABS where available, GeoNames
  elsewhere, 0 otherwise.

### C. Query frequency from our own traffic

Rank by what users actually search for, from `api_usage_daily` or a new
counter.

- **Coverage:** grows over time; cold-start problem on day one.
- **Quality:** eventually the best signal — it optimises for *our* users rather
  than for census population, and self-corrects.
- **Risk:** feedback loop. Poorly-ranked suburbs get clicked less, so they rank
  lower still. Needs a floor or exploration term.
- **Effort:** Medium–High, and it needs A or B as a bootstrap.

### D. Do nothing

Defensible. The candidate set is correct; only ordering is wrong, and the
client can re-rank the ≤20 rows it receives however it likes. careproviders.com
has not complained about ranking since the fuzzy fix — they capped their
dropdown at 8 rows for design reasons and are filtering nothing.

Choose this if suburb-search quality is not currently costing anything.

---

## Recommendation

**A now, C later, B only if non-AU traffic grows.**

ABS is the cheapest credible signal and covers the traffic that matters. Query
frequency is strictly better long-term but needs something to bootstrap from,
and its feedback loop needs care.

Two things to decide before starting:

1. **Is suburb ranking actually hurting anyone today?** No user has reported it
   since the fuzzy fix. If the answer is "not yet", this is a P3, not a P1 —
   and the honest thing is to leave it until it costs something.
2. **Scoring shape.** Raw population makes Sydney (5.3 M) swamp everything;
   `log10(population)` compresses sensibly into the integer column. Worth
   deciding before the backfill, since redoing it means another 16.8 M-row
   UPDATE.

## If it is populated

- Recreate `idx_addresses_population_score` (dropped in `drizzle/0020`) —
  it becomes useful the moment the column is non-constant.
- Re-run `scripts/verify-fuzzy-locality.mjs`; several `KNOWN_MISS` entries
  should start passing and the guard will say so.
- `VACUUM` after the backfill.
