# Resolved: suburb-name autocomplete

**Re:** careproviders.com report of 2026-08-24 (critical)
**Status:** Fixed, deployed, verified live. 20/20 of your test suburbs pass.

Your analysis was exactly right, including the diagnosis: it is the same
defect as the postcode one, one field over. Deployed and live now.

## Verified against your own test matrix

All 20 suburbs, `country=AU`, live API after deploy:

| Query | Was | Now | Time |
|---|---|---|---|
| sunnybank | 0 | SUNNYBANK QLD 4109 · SUNNYBANK HILLS | 1.8s |
| bondi | 0 | BONDI · BONDI BEACH · BONDI JUNCTION | 372ms |
| carlton | 0 | CARLTON NSW · TAS · **VIC 3053** · NORTH · RIVER | 328ms |
| inala | 0 | INALA QLD 4077 | 213ms |
| chatswood | 0 | CHATSWOOD · CHATSWOOD WEST NSW 2067 | 601ms |
| parramatta | 0 | PARRAMATTA NSW 2150 · PARRAMATTA PARK QLD | 180ms |
| fitzroy | 0 | FITZROY SA · VIC 3065 · CROSSING WA (6) | 516ms |
| glenelg | 0 | GLENELG NSW · SA 5045 · EAST · NORTH (5) | 674ms |
| fremantle | 0 | FREMANTLE WA 6160 | 177ms |
| richmond | 0 | RICHMOND NSW · QLD · SA · TAS · VIC (10) | 1.5s |
| brunswick | 0 | BRUNSWICK VIC 3056 · WA · EAST · WEST (5) | 1.1s |
| cronulla | 0 | CRONULLA NSW 2230 | 315ms |
| ipswich | 0 | IPSWICH QLD 4305 | 330ms |
| caboolture | 0 | CABOOLTURE · CABOOLTURE SOUTH QLD 4510 | 548ms |
| penrith | 0 | PENRITH NSW 2750 | 431ms |
| dandenong | 0 | DANDENONG VIC 3175 · NORTH · SOUTH | 425ms |
| blacktown | 0 | BLACKTOWN NSW 2148 | 431ms |
| **toowong** | timeout >20s | TOOWONG QLD 4066 | **239ms** |
| **newtown** | timeout >20s | NEWTOWN NSW · QLD · VIC | **520ms** |
| manly | 20 (via street) | MANLY NSW · QLD · VALE · WEST (locality) | 509ms |

Your two timeouts are gone. Note manly now matches the *locality* rather
than "MANLY WHARF", so it returns Manly QLD and Manly Vale too.

Your five suggested regression tests all pass, and are now committed as
`scripts/verify-locality-search.mjs` so they run against the database.

## What was wrong

You had it right. `locality` sits mid-string in the number-first
`search_text`, so a prefix match could only ever find a suburb when a street
or building happened to share its name. That is why Manly was the lone pass
and why the coincidence looked like search.

## How it is fixed

A locality-anchored branch runs ahead of the prefix search, matching the
`locality` column directly and returning one row per suburb — deduplicated
by **(suburb, state)**, so `carlton` gives you Carlton VIC 3053, Carlton NSW
and Carlton TAS as separate entries rather than one arbitrary winner.

One implementation note, since it affects what you can rely on: the obvious
`DISTINCT ON` approach was too slow to ship — 3.0s for a `B` prefix and 7.0s
for `S`, because it sorts every matching address row before deduplicating.
Those are exactly the prefixes a typeahead sends first. So the query instead
walks distinct suburb keys directly using a recursive index skip-scan, which
costs in the number of suburbs returned rather than the addresses passed
over. That is what makes short prefixes viable: `su` returns in well under a
second rather than several.

## How to use it

```
GET /addresses/autocomplete?q=sunnybank&country=AU
```

- **`country` is required**, same as the postcode branch.
- **Two characters is enough.** `q=su` returns Subiaco, Success, Suffolk
  Park and so on, so you can query from the second keystroke.
- **Queries containing digits are unaffected** — `12 Smith St` and `4118`
  still take the address and postcode paths respectively.
- **Multi-word and punctuated names work**: `Coffs Harbour`,
  `O'Halloran Hill`.
- Each result is a real address in that suburb, so `locality`, `state`,
  `postcode`, `latitude` and `longitude` are all populated as usual. If you
  only need the suburb, read those fields and ignore `streetAddress`.

You can drop your client-side filtering for suburb queries as well as
postcode ones.

## On the timeouts, and one thing we have not fixed

The `toowong` and `newtown` timeouts were, as you guessed, the same class of
problem — they now return in ~240ms and ~520ms.

Two caveats we would rather state than have you discover:

1. **Cold requests are still slow.** A first-hit query can take 1.5–2.6s,
   and postcode lookups on a cold cache have been measured far worse. We
   have not fixed the underlying cold-start latency. Keep a generous client
   timeout and a single retry.
2. **A separate, unrelated bug**: queries in the slash-unit form
   (`5/120 Main St`) can take *minutes*. We found this while testing and
   confirmed it predates this work — it is not something we introduced, and
   it is not fixed yet. If you send that format anywhere, avoid it for now.
   We are tracking it separately.

## Still not built

The `/localities` endpoint (your Option 3 from last time). Suburb and
postcode search both work through autocomplete now, so it is less urgent —
but if you would rather have a purpose-built locality endpoint that returns
suburbs without address fields attached, say so and we will prioritise it.
