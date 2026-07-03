# Hero Section — Variant 3 Split Layout with Coordinate-Flying Globe

**Date:** 2026-06-21
**Status:** Approved
**Scope:** `apps/web` hero section (`components/shadcn-space/blocks/hero-15/*`)

## Goal

Rebuild the landing hero in the bold dark aesthetic of design **Variant 03**
(from the `locnative-hero-section-variants` handoff bundle), as a two-column
split: the existing auto-playing **address-search demo on the left**, an
interactive **cobe globe on the right**. When the demo "selects" an address,
the globe **spins/flies to that address's coordinates** and drops a marker —
visualising what the geocoding product does.

## Decisions (locked with user)

1. **Globe engine:** switch to **cobe** (green dotted earth, cyan markers) to
   match Variant 3. New dependency in `apps/web`. Lazy-loaded inside an effect
   so it stays out of the SSR module graph (workerd reads `window` at import
   time otherwise — same hazard the existing three-globe avoids).
2. **Copy:** keep the **current** headline ("Production-ready APIs for every
   location workflow") and subhead. Only the layout/aesthetic changes.
3. **Demo behaviour:** keep the existing **auto-play** demo (decorative,
   `aria-hidden`). Each selection drives the globe. No required user input.
4. **Globe interaction:** **drag-to-spin** (Variant 3's pointer handlers) plus
   eased **auto-fly** on each address selection.

## Layout

Two columns inside the existing `dark` hero shell, under the unchanged navbar.

- **Desktop (`lg:`):** `grid-cols-2`. Left = badge, H1, subhead, CTAs, demo
  card. Right = cobe globe with radar-sweep glow behind it and a
  "LIVE · drag to spin" pill.
- **Mobile:** single column — copy, CTAs, demo card, then the globe **stacked
  below** (smaller height). Globe stays visible (not a faded backdrop).
- **Background:** Variant 3's dark radial glow centred toward the globe side,
  plus the slow rotating conic radar sweep behind the globe.

## Components & files

- **`hero-15/hero.tsx`** — rewrite layout into the split. Hoist the demo's
  "currently selected location" into `HeroSection` state (`activeLocation`)
  via an `onResolve` callback so it can be passed to the globe.
- **`hero-15/hero-globe.tsx`** *(new)* — cobe globe. Lazy `import("cobe")`
  inside `useEffect` (client-only). Props: `target: { lat, lng } | null` and
  optional ambient markers. Responsibilities:
  - create the globe on a `<canvas>`, devicePixelRatio-aware;
  - `onRender`: ease `phi`/`theta` toward the target rotation; gentle
    auto-rotate when idle and not dragging;
  - pointer handlers for drag-to-spin (override `phi` while dragging);
  - render a cyan marker at the active location;
  - graceful fallback (radial placeholder) if cobe fails to load.
- **`hero-15/hero-globe-math.ts`** *(new, pure)* — `latLngToRotation(lat, lng)`
  returning `{ phi, theta }`. Extracted so the rotation mapping is unit-tested
  without a DOM/WebGL (project convention: pure logic + tests, no renderer).
- **Scenario coordinates:** extend each `DEMO_SCENARIOS` entry with the
  selected address's `lat`/`lng`:
  - 1600 Amphitheatre Pkwy, Mountain View → `37.4220, -122.0841`
  - 350 Fifth Ave, New York → `40.7484, -73.9857`
  - 10 Downing St, London → `51.5034, -0.1276`
- **Dependency:** add `cobe` to `apps/web/package.json`.

## Data flow

```
AddressDemoInput  --selects address-->  onResolve({ lat, lng })
        |                                       |
        +------------ lifted to --------------> HeroSection.activeLocation
                                                       |
                                                       v
                                            HeroGlobe target={activeLocation}
        cobe onRender: ease phi -> lng, theta -> lat (pause auto-rotate),
        drop cyan marker, hold; demo loop advances to the next scenario.
```

Drag overrides `phi` while the pointer is down; auto-fly resumes on the next
selection.

## Motion & fallbacks

- `prefers-reduced-motion`: globe renders static at the first scenario's
  location; demo shows its existing static resting state.
- cobe import/runtime failure → radial placeholder, no crash, no SSR import.
- Keep the current Framer entrance stagger on the left column.

## Testing

- `hero-globe-math.test.ts`: `latLngToRotation` — equator/prime-meridian maps to
  expected baseline, longitude sign moves `phi` the right way, latitude clamps
  to the configured tilt range, output is finite for all inputs.
- Extend the existing landing-content / hero tests only if they assert on copy
  (copy is unchanged, so likely no change needed).

## Out of scope

- No changes to nav, other landing sections, or the public geocoding API.
- No real API calls from the demo (coordinates are static, matching the
  existing decorative demo).
