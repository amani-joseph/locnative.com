---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "The animated address autocomplete demo is visually centered and prominent in the hero section"
    - "The headline text supports the demo rather than competing with it"
    - "The layout works well on both mobile and desktop viewports"
  artifacts:
    - path: "apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx"
      provides: "Recentered hero layout with demo as focal point"
  key_links: []
---

<objective>
Realign the hero section layout so the animated address input demo takes center stage. Currently the layout stacks: badge -> h1 (very large) -> demo -> CTA buttons -> brand marquee. The oversized h1 dominates; the demo (the key marketing highlight) gets buried mid-page.

Purpose: The animated address autocomplete is the product's core selling point for developers. It should be the visual focal point visitors see immediately.
Output: Updated hero.tsx with demo-centric layout.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/CLAUDE.md
@apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx
@apps/web/src/components/shadcn-space/blocks/hero-15/index.tsx
@apps/web/src/routes/index.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restructure hero layout to center the address demo</name>
  <files>apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx</files>
  <action>
Restructure the HeroSection component layout in hero.tsx to make the AddressDemoInput the visual focal point:

1. **Reduce h1 size**: Scale down the heading from `text-4xl sm:text-6xl md:text-7xl lg:text-8xl` to approximately `text-3xl sm:text-4xl md:text-5xl lg:text-5xl`. The headline should be a concise supporting label, not the dominant element.

2. **Promote the demo**: Move the `AddressDemoInput` wrapper (`<motion.div className="w-full max-w-xl">`) ABOVE the CTA buttons. Increase its max-width from `max-w-xl` to `max-w-lg` on the wrapper (the inner AddressDemoInput already has `max-w-md`). Add more vertical spacing above and below the demo (e.g., `py-4 md:py-8`) so it breathes and draws the eye.

3. **Tighten the content block**: Reduce the outer container gap from `gap-8 md:gap-24` to `gap-6 md:gap-12` so the section feels more cohesive rather than spread out. Reduce min-height from `md:min-h-196` to `md:min-h-fit` so the section sizes to its content naturally.

4. **Uncomment and refine the subtitle**: Uncomment the `<motion.p>` subtitle paragraph (lines ~653-662). Shorten it to something punchy like: "Address autocomplete and geocoding API. Ship location features without the complexity." Keep it at `max-w-lg text-base text-muted-foreground`.

5. **Keep existing animation logic intact**: Do NOT modify the AddressDemoInput component, the demo scenarios, animation timings, or any animation variants. Only change the layout/sizing classes on the structural wrappers in HeroSection.

6. **Keep the brand marquee, badge, and CTA buttons** in the same relative order (badge -> h1 -> subtitle -> demo -> CTAs -> marquee), just with the adjusted sizing.
  </action>
  <verify>
    <automated>cd /Users/mac/Developer/projects/locnative.com && pnpm --filter @locnative/web exec tsc --noEmit 2>&1 | tail -5</automated>
  </verify>
  <done>Hero section renders with the animated address demo as the clear visual centerpiece. Heading is smaller and supportive. Subtitle is visible. Layout is tighter and more focused. No TypeScript errors.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Restructured hero section with the animated address demo as the visual focal point. Reduced heading size, tightened spacing, and uncommented subtitle text.</what-built>
  <how-to-verify>
    1. Run `pnpm dev` from workspace root (or `turbo dev`)
    2. Visit http://localhost:3001 in your browser
    3. Verify the animated address input demo is the most prominent element in the hero
    4. Verify the headline is smaller and supportive, not dominating
    5. Verify a subtitle paragraph is visible below the headline
    6. Verify layout looks good on mobile (resize browser to ~375px width)
    7. Verify the demo animation still cycles through all three scenarios smoothly
  </how-to-verify>
  <resume-signal>Type "approved" or describe what needs adjustment</resume-signal>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Visual inspection confirms demo-centric layout
- Animation behavior unchanged
</verification>

<success_criteria>
- The animated address autocomplete demo is the clear visual focal point of the hero section
- The heading is sized to support, not dominate
- Layout is responsive and looks good on mobile and desktop
- All existing animations continue to work correctly
</success_criteria>

<output>
After completion, create `.planning/quick/260414-ght-realign-hero-section-layout-to-center-th/260414-ght-SUMMARY.md`
</output>
