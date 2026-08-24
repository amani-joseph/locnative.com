---
status: investigating
trigger: "\"L 2, 5/120 Main St\" returns unrelated addresses (2 L'Estrange Street) and takes 2.5s warm / 17.7s cold"
created: 2026-08-24T10:00:00Z
updated: 2026-08-24T10:00:00Z
---

## Current Focus

hypothesis: parseFreeformAddress returns confidence:"high" for any comma-containing input, which diverts the query to structuredAutocomplete before parseUnitAddress ever runs. For a level+unit address it also mangles the string, so the structured path searches for the wrong thing and returns confident wrong results.
test: Compare parseFreeformAddress output and timings for the comma and non-comma forms of the same address
expecting: comma form -> high confidence + mangled `cleaned`; non-comma form -> low confidence, correct unit path
next_action: Decide whether parseFreeformAddress should treat a leading level/unit token as disqualifying for the "high confidence" structured path

## Symptoms

expected: "L 2, 5/120 Main St" resolves like "5/120 Main St" (no AU match) or to the real unit
actual: returns 5 unrelated rows, e.g. "2 L'ESTRANGE STREET, CONDOBOLIN NSW 2877"
errors: none — HTTP 200 with confidently wrong data
reproduction: autocompleteAddresses(db, "L 2, 5/120 Main St", { country: "AU" })
started: unknown; predates the 2026-08-24 slash-unit work

## Evidence

- timestamp: 2026-08-24T10:01:00Z
  checked: parseFreeformAddress on both forms
  found: |
    "L 2, 5/120 Main St" -> confidence: high, cleaned: "2 L 5/120 MAIN ST"
    "5/120 Main St"      -> confidence: low,  cleaned: "5/120 MAIN ST"
  implication: The comma alone flips confidence to high. The cleaned string has
               also been reordered into "2 L 5/120 MAIN ST", which is not a real
               address — the level token "L 2" became "2 L".

- timestamp: 2026-08-24T10:02:00Z
  checked: autocompleteAddresses control flow (autocomplete.ts ~line 300)
  found: confidence === "high" runs structuredAutocomplete BEFORE parseUnitAddress
  implication: The unit-address path is never reached for comma forms, so the
               slash-unit anchoring fix does not apply to them.

- timestamp: 2026-08-24T10:03:00Z
  checked: structuredAutocomplete timing for this input
  found: 2523ms warm, returning 5 wrong rows (17.7s observed cold)
  implication: Separate from the >120s trigram defect fixed in f6f351f. This is
               a correctness bug first and a latency bug second.

## Not yet investigated

- Whether other comma forms are affected ("Unit 5, 120 Main St" returned wrong
  rows too — 5 UNITED AVENUE, TARNEIT — at 135ms, so the misroute may be broad).
- Whether parseFreeformAddress's confidence heuristic should exclude inputs whose
  leading token parses as a level or unit designator.
- Whether structuredAutocomplete should verify its own results before returning.

## Deliberately out of scope of f6f351f

Fixing this means changing the freeform confidence heuristic, which affects every
comma-containing query — a much wider blast radius than the slash-unit anchoring
fix. Kept separate rather than bundled.
