Title: feat(web): SDK Playground — API-key select + place-name routing

## Summary

Enhances the SDK Playground so it's usable without hand-pasting secrets or hand-converting coordinates:

- **API-key combobox** — pick a saved key (resolved server-side via *managed* auth — no secret leaves the server) or paste a raw `wh_…` key. Replaces the old raw-key text input.
- **Place-name → `lat,lng` picker** on `routing.directions` `from`/`to` — type a city/town/address, choose from an interactive autocomplete; a valid pasted `lat,lng` passes through untouched. The resolved place name is shown as a `// comment` next to the coordinate in the generated SDK snippet.
- **Backend `geocode.autocomplete`** — session-authed procedure (works pre-API-key) backing the picker, wrapping the existing GNAF autocomplete query.

## Notable details

- The SDK snippet never renders a real or managed secret — it keeps the `process.env.LOCNATIVE_API_KEY` placeholder.
- Both dropdowns are accessible (combobox/listbox ARIA, full keyboard nav, focus/blur + timer cleanup); the picker guards against last-response-wins races on fast typing.
- Switching methods now resets stale params/body/place-name comments.

## Out of scope / heads-up for reviewers

- **`fix(web): restore green typecheck baseline` (093023a):** the branch started on a *pre-existing* red typecheck from a botched `feat/zones-map-ux` merge (broken `ZoneMapProps`/`ZoneWithGeometryRow`, dead refs in `batch/results-map.tsx`). Fixed to make every CI gate meaningful — unrelated to the feature, worth a glance.
- Two **doc-only** commits (`docs(spec)`/`docs(plan)` for an *SDK Playground result map*) ride along as forward-looking planning artifacts. That feature is **not** implemented in this PR.

## Test plan

- [x] `apps/web` typecheck clean (`tsc --noEmit`)
- [x] `apps/web` tests: 47/47
- [x] `@locnative/api` tests: 65/65 (incl. `geocode.autocomplete` mapper)
- [ ] Manual: routing.directions — pick a saved key, type "Brisbane"/"Sydney", confirm markers→route and snippet shows `from: "...", // Brisbane QLD`
- [ ] Manual: paste a raw `wh_…` key and a raw `lat,lng`; confirm both pass through
- [ ] Manual: empty key field → Run shows "Select a saved API key or paste a raw key first."
