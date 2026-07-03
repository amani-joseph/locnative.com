---
phase: quick
plan: 260415-hwm
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Hero section fits within the viewport on mobile screens (375px width) without horizontal overflow"
    - "Address demo card and suggestions panel scale down gracefully on small screens"
    - "H1 heading is readable on mobile without being too large or too small"
    - "Globe background does not cause horizontal scroll on any screen size"
  artifacts:
    - path: "apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx"
      provides: "Responsive hero section"
  key_links: []
---

<objective>
Fix hero section responsiveness for mobile viewports. The address demo card overflows on small screens, the h1 text sizing needs mobile-first adjustments, and the globe backdrop can cause horizontal scroll. The viewport meta tag already exists in __root.tsx with maximum-scale=1.

Purpose: Make the landing page hero look polished on phones and tablets.
Output: Updated hero.tsx with mobile-responsive layout.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx
@apps/web/src/routes/__root.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix hero section mobile responsiveness</name>
  <files>apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx</files>
  <action>
Apply the following responsive fixes to the hero section component:

1. **Address demo card container (AddressDemoInput, line 512-513):**
   - Change the outer card from fixed `h-96` to `h-auto min-h-[22rem] md:min-h-[24rem]` so content determines height on mobile instead of clipping.
   - Reduce padding on mobile: change `p-3` to `p-2.5 md:p-3` and keep `md:p-4`.

2. **H1 heading (line 649-662):**
   - The h1 currently has `text-xl sm:text-2xl md:text-xl lg:text-2xl` which is inconsistent. Change to `text-lg sm:text-xl md:text-2xl` for a clean mobile-first progression.
   - Change padding from `p-2 md:p-4` to `px-3 py-2 md:px-4 md:py-3` for better mobile spacing.

3. **Subtitle text (line 664-665):**
   - Change from `text-base md:text-lg` to `text-sm sm:text-base md:text-lg` so it does not dominate small screens.

4. **Globe backdrop (line 728-735):**
   - The globe container at `inset-x-0 -bottom-32` with large fixed heights can cause horizontal overflow. Add `overflow-hidden` to the globe wrapper div.
   - Reduce mobile globe height: change `globeHeightClassName="h-[30rem] md:h-[60rem]"` to `globeHeightClassName="h-[20rem] sm:h-[30rem] md:h-[60rem]"`.

5. **Main section container (line 627):**
   - Change `min-h-[80vh] md:min-h-[85vh]` to `min-h-[70vh] md:min-h-[85vh]` so on short mobile screens the hero does not force excessive scrolling.
   - Change `gap-4 md:gap-8` to `gap-3 md:gap-6` for tighter mobile spacing.
   - Change `py-10 md:py-14` to `py-6 md:py-14` to reduce top/bottom padding on mobile.

6. **Suggestion rows (line 246-248):**
   - The third suggestion is already hidden on mobile (`hidden md:flex`) which is good. Keep this.
   - Reduce suggestion row padding on mobile: change `px-3 py-2.5 md:px-3.5` to `px-2.5 py-2 md:px-3.5`.
  </action>
  <verify>
    <automated>cd /Users/mac/Developer/projects/locnative.com && pnpm dlx ultracite check apps/web/src/components/shadcn-space/blocks/hero-15/hero.tsx</automated>
  </verify>
  <done>Hero section renders without horizontal overflow on 375px mobile viewport. Card height adapts to content. Text sizes progress cleanly from mobile to desktop. Globe does not cause scroll issues.</done>
</task>

</tasks>

<verification>
- Open the site on a 375px viewport (Chrome DevTools mobile simulation) and confirm no horizontal scrollbar
- Address demo card fits within the viewport width with appropriate padding
- H1 text is readable and not oversized on mobile
- Suggestions panel does not overflow the card
- Globe background stays contained without causing layout shift
</verification>

<success_criteria>
- No horizontal overflow on viewports 320px-768px wide
- Hero content is vertically centered and does not require excessive scrolling on mobile
- Text hierarchy (h1, subtitle) scales cleanly across breakpoints
- Lint passes with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/260415-hwm-fix-hero-section-responsiveness-and-view/260415-hwm-SUMMARY.md`
</output>
