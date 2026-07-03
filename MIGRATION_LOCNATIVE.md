# Rebrand Migration — locnative → locnative

**Branch:** `rebrand/locnative`
**Date:** 2026-07-02
**Old domain / name:** `locnative.com` / `Locnative` (repo also contains 3 stray `locnative` with an "h")
**New domain / name:** `locnative.com` / `Locnative`
**New visual identity:** "LN Flow" mark (from `locnative-flow-brand-package.html`) — signal mint `#4EE0A0` on void green-black `#0A0F0D`, Space Grotesk + JetBrains Mono.

---

## Scope (as agreed)

1. **Package scopes:** unify both `@locnative/*` and `@locnative/*` into a single **`@locnative/*`** scope.
2. **Coverage:** the entire working tree (source, docs, marketing, `.claude`, `.planning`, `.superpowers`), excluding only `.git/`, `node_modules/` and `pnpm-lock.yaml` (regenerated). Binary files are auto-skipped.
3. **Assets:** regenerate real asset files (logos, favicon, app icons, OG) with the LN Flow mark.
4. **Visual depth:** swap in the LN Flow mark, update `tokens.css` palette values to the Flow palette, and **rename the CSS token prefix `--ln-*` → `--ln-*`** across definitions and consumers.

---

## Replacement rules (ordered — specific first)

Applied only to text files (binary auto-skipped), excluding `.git/`, `node_modules/`, `pnpm-lock.yaml`:

| # | Find | Replace | Why |
|---|------|---------|-----|
| 1 | `@locnative/` | `@locnative/` | Unify scoped packages, drop `.com` |
| 2 | `@locnative/` | `@locnative/` | Unify second scope |
| 3 | `--ln-` | `--ln-` | CSS token prefix rename |
| 4 | `Locnative` / `Locnative` | `Locnative` | PascalCase brand + identifiers (`LocnativeClient` → `LocnativeClient`, etc.) |
| 5 | `LOCNATIVE` / `LOCNATIVE` | `LOCNATIVE` | Upper-case constants/labels |
| 6 | `locnative` / `locnative` | `locnative` | Lower-case remainder incl. `locnative.com` → `locnative.com` |

Order matters: scope + token-prefix rules run before the generic case rules so we don't produce `@locnative.com/*` or miss the prefix.

## Package directories

No package directory is brand-named (`api`, `auth`, `ui`, `sdk`, `web`, `server`, `mcp`, …), so **no directory renames are required** — only the `name` fields in each `package.json` and all import paths.

## Identifier map (examples)

- `LocnativeClient` → `LocnativeClient`
- `LocnativeApiError` / `LocnativeApiErrorPayload` → `LocnativeApiError` / `LocnativeApiErrorPayload`
- `LocnativeClientConfig` → `LocnativeClientConfig`
- `LocnativeFieldError`, `LocnativeErrorCode`, `LocnativeProvider`, `LocnativeMcp` → `Locnative*`

---

## Brand assets regenerated (`apps/web/public/brand/`)

SVG sources rewritten with the LN Flow mark, then rasterized to the documented PNG set:

- Marks/lockups: `logo.svg`, `logo-mark.svg`, `logo-horizontal.svg`, `logo-wordmark.svg`, and inverted/monochrome variants.
- Icons: `favicon.svg`, `apple-touch-icon.svg` + PNG favicon set (16→512), apple-touch 180.
- Social: `og-image.svg` + `og-image-1200x630.png`.
- `tokens.css`: prefix `--ln-*`, Flow palette values, Space Grotesk added.
- `README.md` / `brand.html`: names, domain, palette table updated.

Small sizes (favicon ≤64px, 32/16px) use the **fused-stroke** LN fallback per the brand guide; larger sizes use the full nine-dot mark.

---

## Post-steps & verification

1. `pnpm install` — relink workspace packages under `@locnative/*` and regenerate `pnpm-lock.yaml`.
2. Residual scan: `grep -riE 'wher[e]?abouts'` (excluding `.git`, `node_modules`, binaries) should return only historical/context notes, if any.
3. `grep -r '\-\-whr-'` should return zero.
4. Typecheck / build where feasible (`pnpm -w typecheck` or per-package).

## Rollback

All work is on `rebrand/locnative`. To abandon: `git checkout master && git branch -D rebrand/locnative`. Nothing on `master` is touched until you merge.

## Manual follow-ups (outside the repo)

- Register/point DNS for `locnative.com`; update Cloudflare Workers routes (`wrangler.toml` values are renamed but deployment config in the dashboard is manual).
- Update OAuth provider callback URLs, Stripe, Neon project labels, and any secrets referencing the old domain.
- Rename the local folder `locnative.com/` → `locnative.com/` if desired (done by you on your machine).
- The `CLAUDE.md` GSD-workflow gate was bypassed for this bulk rename at your explicit request.
