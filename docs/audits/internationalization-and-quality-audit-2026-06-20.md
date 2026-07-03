# Project Audit — Internationalization & Quality (2026-06-20)

Scope: all apps/ and packages/, with emphasis on standardizing away the
Australia-only assumptions baked in when G-NAF was the only dataset. Prod now
carries ~28 countries + full US (~299.5M rows), so AU-centric code and copy are
now *incorrect*, not merely incomplete.

Severity: **HIGH** = wrong output / customer-facing falsehood · **MED** =
degraded non-AU UX · **LOW** = cosmetic / docs.

---

## 1. Internationalization defects (code)

### 1.1 [HIGH] `formattedAddress` uses AU ordering + breaks on stateless countries
- `packages/database/src/queries/autocomplete.ts:192`
- `packages/api/src/routers/public-http.ts:220`

Both build the string as:
```
`${street}, ${locality} ${state} ${postcode}, ${country}`
```
This is the Australian `Locality STATE Postcode` convention applied to **every**
country. Two concrete problems:

1. **Double-space / dangling tokens for stateless countries.** Iceland, UK,
   France, Germany, etc. store `state = ''`. Result: `"… Reykjanesbær  233, IS"`
   (double space). The Iceland smoke test (`docs/analysis/smoke-test-iceland-results.md`
   finding #1) fixed this for the **stored `search_text`** via `NULLIF(state,'')`,
   but these two **runtime formatters were never given the same treatment** — the
   bug is live in API/SDK/UI output today.
2. **Wrong word order/punctuation per locale** (US/CA put a comma before state;
   UK has no state and postcode placement differs).

**Fix:** extract one shared, country-aware `formatAddress(row)` helper in
`packages/database` and call it from both paths (kills the duplication too —
see 4.1). Minimum viable fix: drop empty parts (`[locality, state, postcode]
.filter(Boolean).join(" ")`). Better: a small per-country format table.

### 1.2 [MED] `state` column is `NOT NULL`, forcing `''` sentinels
- `packages/database/src/schema/addresses.ts:23` — `state: varchar({length:10}).notNull()`

Stateless countries are stored as empty string, which is what drives 1.1 and
makes "has a state" ambiguous (`NULL` vs `''`). Consider making `state` nullable
and normalizing `''`→`NULL` on ingest. **Requires DB approval + migration** (see
memory: DB changes require approval) — flag, don't auto-apply.

### 1.3 [MED] `COUNTRY_NAMES` maps only `AU`
- `packages/react-ui/src/utils/parse-address.ts:4-6`
- `packages/vue-ui/src/utils/parse-address.ts:4-6`

`{ AU: "Australia" }` → every non-AU suggestion renders the raw ISO code
("US", "GB", "IS"). Replace the hand-maintained map with
`new Intl.DisplayNames([locale], { type: "region" }).of(code)` — full coverage,
zero maintenance, locale-aware.

### 1.4 [MED] Freeform parser only knows AU/US/UK/CA regions
- `packages/database/src/queries/parse-freeform-address.ts` (REGION_CODES set =
  US states + AU states; POSTCODE_PATTERNS = US ZIP / AU-EU 4-digit / CA / UK).

Region reranking and postcode extraction silently no-op for other countries.
Plus Iceland smoke test finding #2 (still open): locals type street-first
(`"Laugavegur 26"`) but `search_text` is number-first, so the prefix path misses
and only the `street_name ILIKE` fallback saves it. Decide: per-country
`search_text` ordering vs. strengthening the parsed-path fallback in
`autocomplete.ts`.

---

## 2. Internationalization defects (docs & published copy)

### 2.1 [MED — customer-facing] Published package copy still says "Australian only"
- `packages/sdk/package.json` description: *"Australian geocoding … G-NAF/ABS data"*
- `packages/sdk/README.md:5,7,179,182`, `packages/react-ui/README.md:9`,
  `packages/vue-ui` description.

These ship to npm and undersell/misstate current coverage (28 countries + US).
Rewrite to "international authoritative open address data (G-NAF, Overture, ODA,
OpenAddresses…)". Note: SDK/react-ui are already on npm — bump + republish, and
push before publishing (memory: npm-publish-without-git-push-drift).

### 2.2 [LOW] All docs/UI examples are Melbourne/AU
- `apps/web/src/components/docs-page.tsx` (`"123 Main St, Melbourne VIC 3000, AU"`
  repeated ~6×), `apps/web/src/lib/api-explorer-endpoints.ts:74,150,234`
  (`example: "AU"`).

Diversify examples (a US, a UK, an IS sample) to visibly signal international
coverage to evaluating developers.

### 2.3 [LOW] Routing is AU-only
- `infra/osrm/*` graphs/docs cover AU only. International addresses geocode but
  can't be routed. Document the limitation in the routing docs and SDK, or scope
  international routing as a roadmap item.

---

## 3. Other bugs / flaws found

- **[LOW] Dead/deprecated shim:** `apps/web/src/lib/with-api-key.ts:2` is
  `@deprecated` (v1 moved to `apps/server` oRPC). Confirm no live imports and
  delete.
- **[LOW] Repo hygiene:** ephemeral build/cache dirs are sitting in the repo root
  (`node-compile-cache/`, `v8-compile-cache-501/`, `tsx-501/`,
  `Rg4xacSoJdQxVWTQ6Npgo/`, `node_modules` caches). Add to `.gitignore` and
  confirm none are tracked.
- **[PROCESS] Large uncommitted working tree:** `git status` shows ~40 modified
  files across api/database/react-ui/vue-ui spanning unrelated concerns. High
  drift/merge-revert risk (memory: merge-silently-reverted-feature). Land or
  shelve in coherent commits.

---

## 4. Quality / maintainability improvements

- **4.1 De-duplicate the address formatter.** The exact `formattedAddress`
  template lives in two files (1.1) and will drift. One shared helper fixes the
  i18n bug and the duplication together.
- **4.2 Centralize country/region knowledge.** Region codes, postcode patterns,
  country-name display, and address format order are scattered
  (`country-codes.ts`, `parse-freeform-address.ts`, the two `parse-address.ts`,
  ingest adapters). A single `@locnative/geo-locale` module would make
  "add a country" a one-file change.
- **4.3 i18n regression tests.** Add fixtures asserting `formattedAddress` for a
  stateless country (IS/GB) and a stateful one (US/AU) so 1.1 can't regress.

---

## Suggested priority order
1. **1.1** formatted-address fix (live wrong output) — small, high impact, no DB change.
2. **2.1** published package copy (customer-facing falsehood) — docs only.
3. **1.3 / 1.4** non-AU display + parsing UX.
4. **2.2 / 4.1 / 4.2** examples, dedupe, centralization.
5. **1.2** nullable `state` migration — needs DB approval.
6. Hygiene & process items as cleanup.
