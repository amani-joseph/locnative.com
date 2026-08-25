# Resolved: suburb autocomplete latency

**Re:** careproviders.com latency report, 2026-08-25
**Status:** Fix identified and applied; index build completing. Please re-run
your benchmark and tell us what you see.

Thank you for this report — the measurements made it straightforward, and the
detail that mattered most was one you flagged almost in passing: that
two-character prefixes were the most exposed. That was the tell.

Your read was close. You described it as "a cold index scan that is usually
fast and occasionally falls off a cliff." It was a cold index scan — but the
underlying problem was structural, not just cache warmth, which is why it never
settled down on its own.

## What was actually wrong

The suburb lookup filters on `country` and scans a range of `locality`. **No
index carried both columns in that order.** There were two near-misses:

- One index led with `locality` but carried no `country` column at all.
- Another carried `country` but placed `state` before `locality`, so a locality
  range could not be used as a scan key.

So every Australian suburb query walked index entries for **every country in
the dataset** and discarded the ones that did not match. Australia is roughly
**6% of the table** — the United States alone is about 44%, with Italy, France
and Germany also ahead of AU. Around 94% of the pages read on each of your
queries were for addresses in other countries.

Concretely, a two-character prefix touched **70,445 buffer pages to return 8
rows**, discarding ~820 non-matching rows at every step of the scan.

This explains each of your observations:

| You observed | Cause |
|---|---|
| Cold 3x warm | Cold requests page in mostly-irrelevant index pages |
| 2-char prefixes worst (`sp` >20s, `br` 3.1s) | Widest range, most foreign rows discarded |
| `limit` made no difference | Cost was in the scan, not in rows returned |
| Slow then instantly fast | Second request hit an already-warmed cache |
| Not query shape | Correct — it was never about the digits |

## The fix

A new index on `(country, locality, state)`: country as an equality prefix,
locality as the range key, state available for ordering.

We validated the shape on a 16.8M-row Australian subset before touching
production:

| Prefix | Before | After |
|---|---|---|
| `sp` | 3085 ms | **31 ms** |
| `o` | 3085 ms | **23 ms** |
| `br` | 1363 ms | **25 ms** |
| `ch` | 190 ms | **25 ms** |
| `sunnybank` | — | **27 ms** |

The important property is not the headline number but the **flatness**: cost no
longer scales with how broad the prefix is. That is what closes your cold/warm
gap, because the cost was never really about warmth — it was about how much
irrelevant data each query had to walk.

Built with `CREATE INDEX CONCURRENTLY`, so there was no downtime and no need to
pause your traffic. We measured reads at 46 ms during the build.

**One caveat on the numbers above, stated plainly:** they were measured on a
16.8M-row Australian subset with the new index, not on the production table.
They establish that the index shape is correct and that cost stops scaling with
prefix breadth. Production figures will differ — the table is ten times larger,
and your requests cross a network we do not control. We would rather give you
the provenance than present validated numbers as if they were production ones.
Your re-test is what will settle it.

## What we would like from you

**Please re-run your 20-locality cold benchmark and tell us what you see.**
Specifically:

1. **Cold p50 and p90.** Your target was a cold p90 under ~800 ms. We expect to
   be well inside that, but your numbers are measured through the network from
   your infrastructure, and ours are not — yours are the ones that count.
2. **Whether the multi-second tail is gone.** This is the one we most want
   confirmed. We believe the tail was the same root cause at its worst, but we
   never reproduced your specific `sp` >20s observation from our side, so we
   cannot claim with certainty that it is eliminated — only that its most
   likely cause is. If you see *any* multi-second response, please send the
   query and timestamp and we will trace it.
3. **Whether you can now drop the debounce**, which you mentioned was the
   practical goal.

If the numbers hold up, you may also want to revisit two of your workarounds:
the 10-minute response cache is still worth keeping, but the `limit` reduction
from 20 to 8 was compensating for our slowness rather than yours, and the
`limit` asymmetry you noticed should be gone.

## On the traces you asked for

You asked us to pull server-side traces for `q=4127` and `q=sp` around
2026-08-25. We did not need them in the end — the query plans showed the cause
directly, and it was reproducible on demand rather than intermittent. If you
still see outliers after this change, that offer stands and traces become the
right next step.

## Still open

**Cold-start latency on the wider API.** Separate from this fix, a first
request against a completely cold cache can still be slower than a warm one.
This change removes the large, structural part of that for suburb search; it
does not eliminate cold-start entirely. If your re-test shows a residual gap,
that is the next thing we would look at.
