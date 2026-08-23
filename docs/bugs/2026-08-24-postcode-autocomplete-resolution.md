# Resolved: postcode autocomplete + prefix-query latency

**Re:** Bug report of 2026-08-23, `/api/v1/addresses/autocomplete`
**Status:** Fixed and verified against production data.

Thanks for the report — the diagnosis in it was correct, and the control
cases you included (name-only works, name+postcode works, reverse geocode
works) are what made it quick to confirm. Two separate defects, both fixed.

---

## 1. Postcode-only queries — fixed

### What was wrong

`search_text`, the column autocomplete matches against, is a single
concatenated string built number-first:

```
number_first … street_name … locality state postcode country
```

Every query ran a prefix match, `search_text LIKE 'QUERY%'`. For `q=4118`
the only rows whose text *starts* with `4118` are those whose **street
number** is 4118 — hence "4118 MURRINGO ROAD, YOUNG NSW 2594". The postcode
sits at the tail of the string and a prefix match could never reach it.

One detail not visible from outside: the prefix search returned early as
soon as it found any row. So those wrong street-number matches also
suppressed the fuzzy search tiers that might otherwise have surfaced the
postcode. That is why over-fetching to `limit=20` gave you 0 of 20 usable
rows — the correct records were never in the candidate set, so no amount of
client-side filtering could recover them. Your read on that was right.

### How it is fixed

A postcode-anchored branch now runs *before* the prefix search. When `q` is
nothing but a postcode and `country` is supplied, it matches the `postcode`
column directly and returns **one row per locality** — deduplicated by
suburb, so you get the suburb list rather than ten rows of one street.

This is your Option 1. If the postcode branch finds nothing, the request
falls through to the existing pipeline unchanged, so genuine numeric street
queries still work exactly as before.

### How to use it

```
GET /api/v1/addresses/autocomplete?q=4118&country=AU
Authorization: Bearer <key>
```

**`country` is required for this.** Postcode formats are country-specific,
and without a country a bare number is still treated as a street number.
This is deliberate: it keeps existing behaviour intact for callers who
search numeric street numbers without a country filter. If you send
`q=4118` with no `country`, you will get the old street-number behaviour.

`state` still works as an additional filter if you want it, but you should
not need it — the postcode already determines the state.

Verified against production, every case from your report's table:

| Query | Returns |
|---|---|
| `4118` | BROWNS PLAINS · FORESTDALE · HERITAGE PARK · HILLCREST · REGENTS PARK (all QLD) |
| `4077` | DOOLANDELLA · DURACK · INALA · RICHLANDS (all QLD) |
| `2026` | BONDI · BONDI BEACH · NORTH BONDI · TAMARAMA (all NSW) |
| `3053` | CARLTON (VIC) |

Supported for countries with all-numeric postcodes (AU, NZ, US, DE, FR, and
others). Countries with alphanumeric postcodes — GB, CA, NL — are not
covered, because a bare numeric string cannot be a complete postcode there.

### On your Options 2 and 3

We did not add a `postcode=` parameter (Option 2) or a `/localities`
endpoint (Option 3). Option 1 solves your case without adding API surface.
Option 3 is still the better long-term shape for a directory like yours, and
it is on our list — if the response shape here proves awkward in practice,
tell us and that moves up.

---

## 2. The intermittent timeouts — a real bug, partly fixed

You were right that this was not a rate limit. There was a genuine indexing
defect, though the picture is more specific than either of us assumed, and
we want to be straight with you about what it does and does not explain.

### What was wrong

The index backing prefix search is declared with the `text_pattern_ops`
operator class, which is case-sensitive. Three query paths were still
written with case-insensitive `ILIKE`, which cannot always use that index.

Measured on production:

| Query | Time |
|---|---|
| `ILIKE 'brow%'` | **>25s** (statement timeout) |
| `LIKE 'BROWNS%'` | **~11ms** cold, 0.2ms warm |

All three paths now use case-sensitive matching against an uppercased
pattern. We added an automated check that asserts the query *plan* — not
just the result — so this cannot silently regress again. It has regressed
twice before, because our unit tests never looked at a query plan.

### The honest caveat

The alphabetic case above is dramatic. But your reported timeouts were on
**numeric** prefixes (`40`, `41`, `407`, `411`, `4118`), and when we measured
those specifically, they were *already* fast — around 0.24ms — because
Postgres can derive a safe index range from digits even under `ILIKE`.

**So this fix likely does not, on its own, fully explain your timeouts.**
Something else is contributing. Our leading candidate is cold-cache latency:
the postcode query above took 6.3s on a completely cold cache before
settling to 0.5–1.3s, and 33ms once warm. A cold hit could plausibly reach
your 8s client timeout. We are investigating this separately.

Two things that would help us pin it down:

1. **Request IDs or timestamps** for a few of the timed-out calls, so we can
   match them against our logs and see whether they were cold-start or
   queued.
2. Whether the timeouts cluster after a period of inactivity, which would
   point at cold start rather than concurrency.

### On rate limits

To answer the question directly: there is no per-key concurrency limit that
manifests as a hang. If you exceed a rate limit you get a `429`, not a
stall. So pacing your requests should not be necessary — though debouncing
keystrokes is still worth doing to reduce load and cost on both sides.

---

## What we would still recommend on your side

Your current approach — over-fetch, then discard rows whose postcode does
not match — is no longer necessary for postcode queries and can be removed.
With `country=AU` set, the rows you get back are the localities in that
postcode, so filtering them is redundant.

Keep a client-side timeout, but consider raising it above 8s or retrying
once on timeout, at least until we close out the cold-start question above.

---

## Summary

| Issue | Status |
|---|---|
| Postcode-only queries return unrelated addresses | **Fixed and verified** |
| Wrong results suppressing correct ones | **Fixed** (early-return removed for this path) |
| Alphabetic prefix queries hitting an unindexed scan | **Fixed and verified** |
| Your specific numeric-prefix timeouts | **Partly addressed — investigation open** |
| Locality/postcode endpoint | Not built; still on the roadmap |

Happy to keep the thread open on the timeout question — request IDs would
move that along faster than anything else.
