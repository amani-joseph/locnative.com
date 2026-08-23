# Background Effects & Motion Direction — Pricing · Coverage · Docs

**Author:** Creative Direction review (Senior Product Designer / Frontend UX / Motion)
**Scope:** `/_public/pricing`, `/_public/coverage`, `/docs`
**Source catalog:** Aceternity UI Backgrounds (`ui.aceternity.com/blocks/backgrounds`)
**Date:** 2026-06

---

## 0. The unifying idea — "The Living Map"

Don't bolt three unrelated trendy effects onto three pages. A world-class SaaS (Mapbox, Radar, Google Maps Platform) reads as *one* product. We give Locnative a single ownable motif and express it at a different "zoom level" per route:

| Route | Map metaphor | Feeling |
|---|---|---|
| **Pricing** | The **control room** — panels lit under a focused light | Trust, premium, decisive |
| **Coverage** | The **world layer** — the planet + live data arcs | Reach, scale, "it's everywhere" |
| **Docs** | The **coordinate grid** — faint cartographic graph paper | Calm, precise, developer-grade |

The thread that makes it *ours* and not a copy: **cartographic primitives** (dotted graticules, coordinate grids, lat/long ticks, signal arcs) rendered in a restrained **graphite + signal-green** palette, never the default Aceternity indigo/violet. Green is the brand accent; we treat it as a *signal* color (a live ping, a covered region, an active route) — used sparingly so it always means "data is alive here."

> **Hard rule across all three:** the background is *atmosphere*, never *content*. Target ≤ 8–12% of the visual weight. If you notice it while reading, it's too strong.

---

## 1. Cross-cutting guardrails (apply to every effect)

These are non-negotiable and should be encoded once, then reused.

### 1.1 Performance budget
- **Prefer CSS/SVG gradients & masks over canvas/WebGL.** Most of this direction is achievable with `radial-gradient`, `mask-image`, and a tiny SVG — zero JS frame cost.
- **Reserve canvas/WebGL for ONE hero moment per session** (the Coverage globe). Everything else is CSS.
- Any canvas effect must: cap `devicePixelRatio` to ≤ 2, run a **single** `requestAnimationFrame` loop, throttle ambient motion to ~30fps, and **pause when offscreen** via `IntersectionObserver`.
- Use `content-visibility: auto` on below-the-fold decorative sections.
- Never animate `box-shadow`/`filter` on large areas; animate `transform`/`opacity` only. Use `will-change` only on the actively animating node and remove it after.

### 1.2 SSR safety (this repo specifically)
The app server-renders in **workerd**, and `three-globe` / WebGL touch `window` at module scope (documented crash). **Every canvas/WebGL/globe background must be `React.lazy()` + `<Suspense>` and guarded** so it never imports during SSR:

```tsx
const Globe = typeof window === "undefined"
  ? () => null
  : lazy(() => import("@/components/ui/globe").then(m => ({ default: m.Globe })));
```

Static layers (gradients, SVG grid) render on the server fine and are the SSR/no-JS fallback.

### 1.3 Accessibility
- **`prefers-reduced-motion`**: ship a shared `useReducedMotion()` hook (a `matchMedia` wrapper). When reduced, render the *static composition* (gradient + grid still visible) with **all motion off** — never a blank page. Also add a global CSS safety net:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  }
  ```
- All background layers: `aria-hidden="true"` + `pointer-events-none`. They must never receive focus or intercept clicks.
- Maintain **WCAG AA contrast (≥ 4.5:1 body, ≥ 3:1 large)** of foreground text against the *brightest* point the background reaches behind it. Use a darkening scrim/mask behind text blocks (see Layering).

### 1.4 Mobile responsiveness
- Below `md`: **disable pointer-reactive effects** (spotlight-follows-cursor, ripple-on-hover — there's no cursor on touch) and **swap heavy canvas for the static gradient/SVG fallback**.
- Reduce particle/arc counts ~70% on small screens; lower canvas resolution.
- Backgrounds are `position: fixed`/`absolute inset-0` behind a scrolling content column — never cause horizontal overflow (`overflow-x-clip` on the section).

### 1.5 Readability
- Content sits in a container with a **local scrim**: `bg-background/70 backdrop-blur-sm` (or a radial dark mask) so text always has a calm bed.
- Fade the background to solid behind dense text via `mask-image: radial-gradient(...)` or a top/bottom linear fade.

### 1.6 Layering contract (z-index system, same on every route)
```
z-0   Base wash        — static CSS radial/linear gradient (SSR, always on)
z-10  Texture layer    — SVG grid / dotted graticule (static or ultra-slow drift)
z-20  Motion layer     — the one animated/canvas effect (lazy, reduced-motion aware)
z-30  Scrim/mask       — radial darken + edge fades to protect content
z-40  Content          — cards, copy, CTAs (the only interactive layer)
```
Layers 0–30 are `aria-hidden` + `pointer-events-none`. Implement as one `<RouteBackground>` wrapper per route so the system is consistent and centrally tunable.

---

## 2. Pricing Page — "The Control Room"

**Goal:** value, trust, premium, guide the eye to tiers + CTA.

### 2.1 Recommended Aceternity effects
1. **Spotlight / Spotlight New** (primary) — a soft conic/linear light raking in from the top-left of the hero, as if a single light source is illuminating the pricing panels. This is the premium "Linear/Stripe" move and it *naturally creates hierarchy* — the lit area is where the eye goes.
2. **Lamp Effect** (hero headline only) — the top-down converging glow to "reveal" the pricing headline ("Simple, usage-based pricing"). Use once, above the fold.
3. **Glowing Effect / Background Gradient** (on the **recommended tier card only**) — a slow animated gradient border that singles out the "Pro/Most popular" plan. This is conversion design, not decoration.

### 2.2 Alternatives
- **Aurora Background** (softer, calmer, less "stage-lit") if Spotlight feels too dramatic.
- **Dotted Glow Background** for a more technical, restrained read.

### 2.3 Visual rationale
Spotlight + Lamp create a **focal hierarchy for free** — light = importance. Pricing pages live or die on directing attention to one plan and one CTA; lighting does that more elegantly than arrows or louder colors. The glowing border on the hero tier is a quiet "choose me" without a garish badge.

### 2.4 Motion
- Spotlight: **static by default**; a 6–8s, ≤ 8px parallax drift tied to scroll (not mouse) on desktop only. Off on mobile + reduced-motion.
- Tier card border gradient: 8s linear hue sweep within green→teal range, `prefers-reduced-motion` → static gradient.
- CTA buttons: **Hover Border Gradient** / **Moving Border** on hover only (desktop).

### 2.5 Palette
- Base: `#0B0E0C` → `#0E1311` graphite (near-black, faint green undertone).
- Light source: warm-neutral `#F5F7F4` at 6–10% opacity (a *white* light, not green — green light looks sci-fi/cheap).
- Accent (tier highlight + CTA): signal green `#22C55E`/`#16A34A` → teal `#0EA5A4` gradient.
- Text: `#E8EAE7` primary, `#9BA39C` muted.

### 2.6 Layering
Base graphite wash → Spotlight cone (z-20, top) → very faint dot grid (z-10, 4% opacity) → radial scrim behind the tier table → cards in `bg-card/80 backdrop-blur` with the highlighted tier carrying the glow border.

### 2.7 Desktop ↔ mobile
- Desktop: Spotlight top-left + scroll parallax + hover gradients.
- Mobile: single static top-center radial glow (CSS only), no parallax, no hover; the highlighted-tier border becomes a static 1px green gradient stroke.

### 2.8 Implementation
```tsx
// PricingBackground.tsx — pure CSS, SSR-safe, reduced-motion aware
<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
  {/* z-0 base */}
  <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_15%_-10%,#11201A_0%,#0B0E0C_45%)]" />
  {/* z-10 dot grid, masked to fade */}
  <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(circle,#7CFFB2_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(60%_50%_at_50%_0%,#000,transparent)]" />
  {/* z-20 spotlight cone */}
  <div className="absolute -top-1/4 left-0 h-[60rem] w-[60rem] rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,transparent,rgba(245,247,244,0.08),transparent)] blur-3xl motion-safe:animate-[drift_8s_ease-in-out_infinite_alternate]" />
</div>
```
Highlighted tier card: wrap in Aceternity `BackgroundGradient` (or a `before:` pseudo gradient border) gated by `motion-safe:`.

---

## 3. Coverage Page — "The World Layer"

**Goal:** global reach, networks, location intelligence, dynamic-but-not-chaotic. *This is the marquee page* — the one effect users screenshot.

### 3.1 Recommended Aceternity effects
1. **World Map (dotted)** with **animated connection arcs** (primary, above the fold) — a dotted-grid world map with green signal arcs pinging between covered regions (US ↔ AU, the two real coverage areas, plus the intl beta markets). This is *literally the product* — coverage — rendered as art. Nothing communicates "global location data" faster.
2. **GitHub Globe / your existing `three-globe`** (alternative hero, pick ONE — not both) — the rotating globe with arcs. You already own this component; reuse it lazy-loaded.
3. **Background Beams** (section dividers below the fold) — faint vertical "data streams" behind the coverage table to imply live ingestion, at very low opacity.

> **Pick exactly one hero device** (flat World Map *or* 3D Globe). The World Map is cheaper, more legible on mobile, and reads instantly as "coverage"; the Globe is more premium but heavier. **My pick: World Map for the page hero; keep the Globe for the landing hero** so each page has a distinct signature.

### 3.2 Alternatives
- **Vortex** (toned down, green) for an abstract "data convergence" feel — riskier, more decorative.
- **Background Lines** — animated connective lines if a literal map feels too on-the-nose.

### 3.3 Visual rationale
Coverage is the one page where a literal geographic background is *additive to comprehension*, not decoration: the dotted map doubles as a legend for the coverage table beneath it. Arcs animating between the regions you actually serve makes the abstract claim ("global coverage") concrete and honest. Tying arc endpoints to real data (US, AU, beta markets) keeps it truthful.

### 3.4 Motion
- Arcs: stagger-draw (SVG `stroke-dashoffset` or canvas) every ~3–4s, each arc ~1.2s ease-out, then a soft fade; **max 4–6 concurrent arcs**, randomized order. Green→teal gradient stroke.
- Dotted map: static; covered-region dots get a slow 2–3s pulse (opacity 0.4→1). Reduced-motion → dots solid, no arcs.
- Globe (if chosen): slow auto-rotate ~0.3 rpm, pause offscreen, drag-to-spin on desktop only.

### 3.5 Palette
- Base: deep space graphite `#0A0D0F` with a faint cyan-green nebula radial.
- Map dots (uncovered): `#2A332E` (dim). Covered: signal green `#22C55E`. Beta: amber `#F59E0B` (matches the demo-key notice convention already in the app).
- Arcs: linear `#22C55E → #2DD4BF`.

### 3.6 Layering
Space-graphite wash → dotted world map (z-10, the texture *and* the subject) → arcs canvas/SVG (z-20) → radial scrim bottom-half so the coverage table sits on calm ground → table/cards z-40 in `bg-background/75 backdrop-blur`.

### 3.7 Desktop ↔ mobile
- Desktop: full world map + 4–6 live arcs + region pulse.
- Tablet: map + 2–3 arcs.
- Mobile: **static dotted map image** (or SVG) cropped to the user's hemisphere, covered-region pulse only, **no arcs, no canvas** — falls back to a crisp SVG so it's sharp and ~free. The globe option would be replaced entirely by the flat map on mobile.

### 3.8 Implementation
- Use Aceternity **World Map** (`react-simple-maps`-style dotted SVG) or render your own dotted map from a TopoJSON → it's an SVG, SSR-safe, and the arcs are SVG `<path>` with `stroke-dasharray` animation (no canvas needed on desktop either — cheaper than the lib's canvas version).
- If using the existing `three-globe`: `lazy()` + `<Suspense fallback={<StaticMapSVG/>}>`, `IntersectionObserver` to mount only when in view.
```tsx
// Arc draw — pure SVG/CSS, no canvas
<path d={arc} className="motion-safe:[stroke-dasharray:1000] motion-safe:[stroke-dashoffset:1000] motion-safe:animate-[draw_1.2s_ease-out_forwards]" stroke="url(#signal)" fill="none" />
```

---

## 4. Documentation Page — "The Coordinate Grid"

**Goal:** readability first; polished, developer-grade; motion almost imperceptible.

### 4.1 Recommended Aceternity effects
1. **Grid and Dot Background** (primary) — a faint coordinate/graph-paper grid, fixed behind the content column at ~4–6% opacity, masked to fade near text. Evokes cartographic graph paper + technical precision without any motion. This is the safest, most "Stripe/Vercel docs" choice.
2. **Tracing Beam** (left rail, desktop) — a thin beam that follows scroll progress down the left margin beside section anchors. It doubles as a **reading-progress + section indicator** — useful, not just pretty. Green accent dot at the active section.
3. **Glowing Effect** on **code blocks on hover** (desktop) — a subtle border glow when hovering a `CodeBlock`, reinforcing interactivity (copy button lives there).

### 4.2 Alternatives
- **Dotted Glow Background** — even quieter than the grid.
- **Background Beams** at *extremely* low opacity behind the hero/intro of the docs only (not behind body text).

### 4.3 Visual rationale
Docs are read, not admired. The grid gives "engineered/precise" texture subliminally; the Tracing Beam earns its motion by being *functional* (wayfinding in long technical pages). Anything more would tax reading and fail WCAG 2.3.x intent. The grid also visually rhymes with the dotted map on Coverage — same primitive, calmer dose — reinforcing brand cohesion.

### 4.4 Motion
- Grid: **static.** (Optional: a near-invisible 30s drift; default off.)
- Tracing Beam: driven by scroll position only (no autonomous animation); spring-eased. Reduced-motion → static full-height rail with an active-section highlight (no travel).
- Code block glow: hover-only, desktop-only, 150ms.

### 4.5 Palette
- Base: `#0B0E0C` (same graphite family — cohesion).
- Grid lines: `#FFFFFF` at 4% (major) / 2% (minor) for the coordinate feel.
- Tracing beam: muted green `#16A34A`, active node `#22C55E`.
- Body text unchanged from current docs tokens (don't touch contrast that already works).

### 4.6 Layering
Graphite wash (z-0) → coordinate grid, masked to fade behind the prose column (z-10) → content column z-40 on a subtle `bg-background/60` card so text never sits directly on grid intersections → Tracing Beam in the left gutter (z-30, outside the text measure).

### 4.7 Desktop ↔ mobile
- Desktop: grid + Tracing Beam rail + code-hover glow.
- Mobile: grid only, at even lower opacity (3%); **no Tracing Beam** (no gutter space, and the sidebar already handles nav); no hover glow. Sidebar/TOC remains the wayfinding tool.

### 4.8 Implementation
```tsx
// Docs grid — static, SSR-safe
<div aria-hidden className="pointer-events-none fixed inset-0 -z-10
  [background-image:linear-gradient(#ffffff0a_1px,transparent_1px),linear-gradient(90deg,#ffffff0a_1px,transparent_1px)]
  [background-size:64px_64px]
  [mask-image:radial-gradient(100%_60%_at_50%_0%,#000_30%,transparent)]" />
```
Tracing Beam: Aceternity `TracingBeam` wrapping the article, but **swap its default to scroll-linked + reduced-motion static**; bind the active node to the same heading IDs the sidebar/anchor system already uses.

---

## 5. Make it ours (anti-"copied-template" modifications)

1. **Palette swap is mandatory** — replace every default Aceternity indigo/violet/blue with the **graphite + signal-green/teal** system. This single change makes the effects unrecognizable as stock.
2. **Cartographic primitives** — dots become **graticule dots**, grids carry occasional **lat/long tick labels** (e.g., faint `40°N`, `151°E`), arcs are **great-circle paths** (curved like real flight/geodesic lines), not straight beams. These details say "maps company."
3. **Green = signal semantics** — green only appears where something is *live/covered/active* (covered regions, active section, recommended tier, hovered code). Consistent meaning across pages = brand language.
4. **One shared primitive, three doses** — the dotted/grid texture appears on all three at different intensities, so the suite feels designed, not assembled.
5. **Honest data** — Coverage arcs connect the regions you actually serve. Truth is a brand asset for an API company.

---

## 6. Final recommendation (what I'd ship)

If this were my product, I'd ship a **restrained, CSS-first system** and spend the *one* expensive effect where it sells:

- **Pricing:** static **Spotlight** wash (CSS conic + radial) + a **glowing gradient border on the recommended tier** + hover-gradient CTA. No canvas. Premium, calm, conversion-focused.
- **Coverage:** **dotted World Map in SVG** with **green great-circle arcs** between real coverage regions (SVG stroke animation, ≤ 6 concurrent), region-pulse on covered markets. Reuse the existing `three-globe` *only* on desktop as a progressive enhancement, never on mobile. **This is the hero moment.**
- **Docs:** **coordinate grid** (static, masked) + a **functional Tracing Beam** reading rail on desktop. Nothing else.

Everything gates on `useReducedMotion()` and `md:` breakpoints, every decorative layer is `aria-hidden + pointer-events-none`, and the only WebGL is the lazy, offscreen-paused, desktop-only globe. This delivers the "future-grade SaaS" feel of Mapbox/Radar while keeping Lighthouse green, the main thread quiet, and the content unmistakably readable.

**Build order:** (1) shared `<RouteBackground>` + `useReducedMotion()` primitives → (2) Docs grid (lowest risk, validates the system) → (3) Pricing spotlight → (4) Coverage map+arcs (highest effort, highest payoff).

---

## 7. Effect → route quick map

| Aceternity effect | Pricing | Coverage | Docs | Verdict |
|---|:--:|:--:|:--:|---|
| Spotlight / Spotlight New | ★ | | | Pricing hero focus |
| Lamp Effect | ○ | | | Pricing headline reveal (optional) |
| Background Gradient / Glowing Effect | ★ (tier) | | ○ (code hover) | Conversion + affordance |
| World Map + arcs | | ★ | | Coverage hero (my pick) |
| GitHub/3D Globe (existing) | | ○ | | Desktop enhancement only |
| Background Beams (+Collision) | | ○ | ○ | Low-opacity dividers only |
| Grid & Dot Backgrounds | ○ | | ★ | Docs primary; light dose elsewhere |
| Tracing Beam | | | ★ | Functional reading rail |
| Aurora Background | ○ (alt) | | | Softer Pricing alt |
| Vortex / Meteors / Shooting Stars / Sparkles | ✗ | ✗ (Vortex maybe) | ✗ | Too playful for this brand |

★ recommended · ○ optional/alt · ✗ avoid
