---
quick_id: 261113-ail
status: complete
date: 2026-11-13
commits: [b9966fa, 1135f7d]
prs: [74, 77]
---

# 261113-ail: Replace auth shader with static illustrations — Summary

This was done outside the GSD tooling at the user's request (design options → user picks one → implement, PR, merge, deploy). This file records it after the fact.

## Done

| Step | PR | Result |
|---|---|---|
| Illustrations | #74 (`b9966fa`) | The WebGL `ShaderAnimation` beside sign-in, sign-up, forgot- and reset-password is replaced by `AuthIllustration`. Each visit picks one of two static WebP images (about 180 KB each) in `apps/web/public/illustrations/`. **Suburb at dusk:** a perspective suburb grid with contour lines and a route along the streets into a geofenced pin. **Topographic:** a contour map. `shader-lines.tsx` is deleted, and the illustration column gets `md:min-h-[420px]`. |
| Generator | #74 | `apps/web/scripts/generate-auth-illustrations.mjs` (seeded and deterministic; uses `sharp`). Run it with `pnpm -F web generate:auth-illustrations`. |
| Reveal fix | #77 | **Bug:** in production the illustration could stay invisible. The fade-in waited on `img.decode()`, which stayed pending even though the image was `complete`. **Fix:** reveal on `complete`, or on the `load`/`error` events, with a stable `useCallback` ref. |

## Verification

- Biome is clean on the touched files. `pnpm turbo build -F web` passes.
- Production at 1440×900: `/sign-in`, `/sign-up`, `/forgot-password` and `/reset-password` each serve an illustration and render no `<canvas>`. Both variants were observed.
- After #77, confirm on production that the scene becomes visible (computed `opacity: 1`) within about 1s.

## Notes

- `STATE.md` quick-task row added after PR #76 merged.
