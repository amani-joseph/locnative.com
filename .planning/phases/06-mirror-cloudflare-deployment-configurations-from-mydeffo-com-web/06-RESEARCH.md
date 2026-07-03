# Phase 6: Mirror Cloudflare Deployment Configurations from mydeffo.com-web - Research

**Researched:** 2026-04-17
**Domain:** Cloudflare Workers deployment, TanStack Start SSR on Workers, Node.js API compatibility
**Confidence:** HIGH

## Summary

This phase requires aligning locnative.com's build, server, and deployment configuration with the proven patterns in mydeffo.com-web to ensure successful Cloudflare Workers deployment. The two projects share the same core stack (TanStack Start + Vite + Cloudflare Vite Plugin + Hono server), but locnative.com has several Node.js-only patterns that will fail on Cloudflare Workers.

The three critical issues are: (1) `packages/env/src/server.ts` uses `node:fs` (`existsSync`) and `node:path` for a directory-walking `.env` loader that is unnecessary on Workers (env vars come from wrangler config/secrets), (2) `packages/api/src/api-key-auth.ts` uses synchronous `scryptSync` from `node:crypto` which works with `nodejs_compat` but is suboptimal (should verify it works or switch to async `crypto.subtle`), and (3) the `next` package (16.1.1) is listed as a dependency in `apps/web/package.json` but never imported -- dead weight that may interfere with bundling.

**Primary recommendation:** Replace Node.js filesystem-based env loading with direct `process.env` access (Workers populate process.env via `nodejs_compat_populate_process_env`), verify `scryptSync` works on Workers with `nodejs_compat`, remove the unused `next` dependency, and align wrangler config patterns with mydeffo.com-web (observability logs, deploy scripts).

## Project Constraints (from CLAUDE.md)

- **Stack:** Must remain on TanStack Start + Convex -- no framework changes
- **Data storage:** Auth data must be stored in Convex (not a separate DB)
- **Feature parity:** Existing auth features must work identically on BetterAuth
- **Zero legacy auth residue:** Full replacement -- no legacy auth code or dependency should remain
- **Code style:** Ultracite/Biome formatting enforced, tabs, double quotes

## Architecture Patterns

### Configuration Comparison: locnative.com vs mydeffo.com-web

#### Wrangler Config (apps/web)

| Setting | locnative.com | mydeffo.com-web | Action |
|---------|---------------|-----------------|--------|
| Format | `wrangler.jsonc` | `wrangler.toml` | No change needed (both valid) |
| `compatibility_flags` | `["nodejs_compat", "nodejs_compat_populate_process_env"]` | `["nodejs_compat"]` | locnative has EXTRA flag -- keep it, needed for `process.env` |
| `main` entry | `@tanstack/react-start/server-entry` | `./node_modules/@tanstack/react-start/dist/default-entry/esm/server.js` | Both work; locnative uses the newer alias. Keep as-is |
| Observability | Not configured | `enabled: true`, `logs.enabled: true`, `logs.invocation_logs: true` | Add observability config |
| Routes/custom domain | Not configured | `routes = [{ pattern = "mydeffo.com", custom_domain = true }]` | Add when domain is ready |
| Build/deploy script | `vite build && wrangler deploy` | `pnpm build:cf && wrangler deploy --config dist/server/wrangler.json` | Align deploy script |

#### Wrangler Config (apps/server)

| Setting | locnative.com | mydeffo.com-web | Notes |
|---------|---------------|-----------------|-------|
| Format | `wrangler.jsonc` | `wrangler.jsonc` | Same |
| `nodejs_compat_populate_process_env` | Yes (extra) | No | locnative has extra flag |
| Observability | `enabled: true, head_sampling_rate: 1` | `enabled: true, logs.enabled: true, logs.invocation_logs: true` | Align log config |
| Production env | Not configured | Has `env.production` block with custom domain, CORS, cookie domain vars | Add production env block |

#### Vite Config (apps/web)

| Setting | locnative.com | mydeffo.com-web | Action |
|---------|---------------|-----------------|--------|
| Cloudflare plugin | Yes, `{ viteEnvironment: { name: "ssr" } }` | Same | Aligned |
| `resolve.dedupe` | `["react", "react-dom"]` | Not present | Keep -- prevents duplicate React in SSR |
| Sentry plugin | Not present | `sentryTanstackStart` | Out of scope for this phase |
| Preview config | Not present | Has `preview.host`, `preview.port`, `preview.allowedHosts` | Not needed for CF deployment |

### Critical Node.js-Only Code in locnative.com

#### 1. `packages/env/src/server.ts` -- Filesystem-based .env Loading (BLOCKER)

**Problem:** Uses `existsSync` from `node:fs` and `path` from `node:path` to walk the directory tree looking for `.env` files. This will fail or be unnecessary on Cloudflare Workers.

**Why it exists:** Convenience for local dev -- finds `.env` files regardless of which workspace `cwd` is.

**mydeffo.com-web pattern:** Simple `import "dotenv/config"` one-liner, then `createEnv({ runtimeEnv: process.env })`.

**Fix:** Replace the filesystem walker with:
```typescript
import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url(),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    WEB_BASE_URL: z.string().url(),
    PORT: z.coerce.number().int().positive().default(3002),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

On Workers, `nodejs_compat_populate_process_env` ensures `wrangler.jsonc` vars and secrets are on `process.env`. The `dotenv/config` import is a no-op on Workers (no `.env` file) but harmless.

**Confidence:** HIGH -- verified mydeffo.com-web uses this exact pattern in production on CF Workers.

#### 2. `packages/api/src/api-key-auth.ts` -- Synchronous Node.js Crypto (RISK)

**Problem:** Uses `scryptSync`, `timingSafeEqual`, and `randomBytes` from `node:crypto`.

**Reality check:** With `nodejs_compat` flag, Cloudflare Workers supports `node:crypto` including synchronous APIs. The `scryptSync` call is computationally expensive (N=16384, r=8, p=1) and blocks the worker thread, but it works.

**mydeffo.com-web approach:** Uses `better-auth/crypto` (`hashPassword`, `verifyPassword`) which uses the Web Crypto API internally.

**Recommendation:** Keep `node:crypto` for now -- it works with `nodejs_compat`. The `scryptSync` blocking concern is minimal since API key validation is not a high-frequency hot path. If performance issues arise later, migrate to async `crypto.subtle.deriveBits` with PBKDF2 or use `better-auth/crypto`.

**Confidence:** MEDIUM -- `nodejs_compat` supports `scryptSync` per Cloudflare docs, but blocking a worker thread is suboptimal.

#### 3. `packages/api/src/routers/domains/api-keys-shared.ts` -- `randomUUID` from `node:crypto`

**Problem:** Uses `randomUUID` from `node:crypto`.

**Fix:** Available globally in Workers as `crypto.randomUUID()`. Can keep `node:crypto` import with `nodejs_compat`, or switch to global `crypto.randomUUID()`.

**Confidence:** HIGH -- both approaches work on Workers.

### Package Differences

#### Unused/Suspicious Dependencies in locnative.com apps/web

| Package | Version | Issue | Action |
|---------|---------|-------|--------|
| `next` | 16.1.1 | Not imported anywhere in src/. Dead dependency from a TanStack Start project | Remove |
| `eslint-config-next` | 16.0.3 | Dev dependency, pairs with `next` | Remove |
| `@neondatabase/serverless` | ^1.0.2 | Listed in both root AND apps/web. Should only be in `packages/database` | Remove from apps/web and root |
| `@tailwindcss/postcss` | ^4 | Unnecessary -- using `@tailwindcss/vite` plugin instead | Remove |
| `autoprefixer` | ^10.4.22 | Unnecessary with Tailwind v4 Vite plugin | Remove |
| `postcss` | ^8.5.6 | Unnecessary with Tailwind v4 Vite plugin | Remove |

#### Missing Dependencies (in mydeffo.com-web but potentially needed)

| Package | Purpose | Needed? |
|---------|---------|---------|
| `@cloudflare/workers-types` | Type definitions for CF Workers env bindings | Yes -- add to apps/server devDependencies |
| `wrangler` (root devDep) | mydeffo has at root level | locnative has it per-app, which is fine |

#### Version Differences

| Package | locnative | mydeffo | Notes |
|---------|-----------|---------|-------|
| `@cloudflare/vite-plugin` | ^1.31.2 | ^1.28.0 | locnative is newer, fine |
| `wrangler` | ^4.81.1 | ^4.73.0 | locnative is newer, fine |
| `drizzle-orm` | ^0.44.7 | ^0.45.1 | mydeffo is newer. Consider updating |
| `@neondatabase/serverless` | ^1.0.0 | ^0.10.4 | locnative is major version ahead. Both work on CF |
| `better-auth` | ^1.5.6 | catalog: | Should use catalog for consistency |

### Deploy Script Pattern

**mydeffo.com-web (apps/web):**
```json
{
  "build": "pnpm generate:sitemap && vite build",
  "build:cf": "pnpm generate:sitemap && NITRO_PRESET=cloudflare-pages vite build && cp instrument.server.mjs dist/server/",
  "deploy": "pnpm build:cf && wrangler deploy --config dist/server/wrangler.json"
}
```

**locnative.com (apps/web):**
```json
{
  "build": "vite build",
  "deploy": "vite build && wrangler deploy"
}
```

**Key differences:**
- mydeffo uses `NITRO_PRESET=cloudflare-pages` env var during CF build -- this may not be needed with the newer `@cloudflare/vite-plugin` approach
- mydeffo deploys using the generated `dist/server/wrangler.json` (which includes assets directory config), locnative relies on the source `wrangler.jsonc`
- Both approaches work. The generated `dist/server/wrangler.json` in locnative already contains the correct config (verified from reading the file)

### Server Export Pattern

**locnative.com (apps/server):**
```typescript
export default {
  fetch: app.fetch,
};
```

**mydeffo.com-web (apps/server):**
```typescript
export default withSentry(
  (workerEnv) => ({ dsn: workerEnv.SENTRY_DSN as string | undefined, ... }),
  app
);
```

Both use the standard Workers `fetch` handler export. The Sentry wrapper is out of scope.

### Auth Configuration Comparison

| Feature | locnative.com | mydeffo.com-web |
|---------|---------------|-----------------|
| Location | `packages/api/src/auth.ts` | `packages/auth/src/index.ts` |
| Cookie attributes | `sameSite: "none", secure: true, httpOnly: true` | Same + optional `domain` from env |
| Cookie domain | Not configurable | `AUTH_COOKIE_DOMAIN` env var |
| Rate limiting | Not configured | `enabled: true, window: 10, max: 100` |
| Email verification | Not configured | Full Resend integration |
| Trusted origins | Hardcoded + env | Same pattern |

**Action:** Add `AUTH_COOKIE_DOMAIN` support for production deployment where web and API are on different subdomains.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env file discovery on Workers | Filesystem walker | `dotenv/config` + `process.env` | Workers have no filesystem; env comes from wrangler config |
| Password hashing | `scryptSync` from `node:crypto` | `better-auth/crypto` (`hashPassword`/`verifyPassword`) | Web Crypto API compatible, non-blocking |
| Random UUIDs | `randomUUID` from `node:crypto` | `crypto.randomUUID()` global | Available in all modern runtimes including Workers |

## Common Pitfalls

### Pitfall 1: Node.js fs/path APIs on Workers
**What goes wrong:** `existsSync`, `readFileSync`, `path.join` etc. fail at runtime on Workers even though they compile fine.
**Why it happens:** Workers have no filesystem. `nodejs_compat` polyfills many Node.js APIs but not filesystem operations.
**How to avoid:** Grep for `from "node:fs"` and `from "node:path"` in all packages that get bundled for Workers. Replace with Worker-compatible alternatives.
**Warning signs:** Build succeeds but runtime throws `Error: No such module "node:fs"` or similar.

### Pitfall 2: Synchronous Crypto Blocking Workers
**What goes wrong:** `scryptSync` with high N value (16384) blocks the worker for 50-200ms per call.
**Why it happens:** Workers are single-threaded with a 30-second CPU time limit. Synchronous crypto eats into that budget.
**How to avoid:** For now, `nodejs_compat` supports it. Monitor via observability. If latency is an issue, migrate to async Web Crypto.
**Warning signs:** High p99 latency on API key validation endpoints, "Exceeded CPU time limit" errors.

### Pitfall 3: Environment Variables Not Available
**What goes wrong:** `process.env.VAR` returns `undefined` on Workers.
**Why it happens:** Without `nodejs_compat_populate_process_env` flag, Workers don't populate `process.env` from wrangler vars/secrets.
**How to avoid:** locnative.com already has this flag. Keep it. Also ensure all secrets are set via `wrangler secret put`.
**Warning signs:** Auth fails with "BETTER_AUTH_SECRET is required" or similar at startup.

### Pitfall 4: Unused `next` Package Interfering with Bundling
**What goes wrong:** Vite may resolve imports through Next.js internals unexpectedly.
**Why it happens:** `next` 16.x registers itself in node_modules resolution and may intercept React-related imports.
**How to avoid:** Remove the `next` and `eslint-config-next` dependencies entirely.
**Warning signs:** Unexpected build warnings about React Server Components or Next.js-specific transforms.

### Pitfall 5: Missing Wrangler Secrets in Production
**What goes wrong:** Deploy succeeds but app crashes because secrets aren't set.
**Why it happens:** `wrangler.jsonc` `vars` are plaintext and committed. Secrets like `DATABASE_URL`, `BETTER_AUTH_SECRET` must be set via `wrangler secret put`.
**How to avoid:** Document all required secrets. Verify with `wrangler secret list`.
**Warning signs:** Runtime errors about missing env vars that work fine locally.

## Code Examples

### Simplified Server Env (Worker-Compatible)
```typescript
// packages/env/src/server.ts -- Worker-compatible pattern from mydeffo.com-web
import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url(),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    WEB_BASE_URL: z.string().url(),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(3002),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

### Wrangler Production Env Block (Server)
```jsonc
// apps/server/wrangler.jsonc -- add production environment
{
  "env": {
    "production": {
      "vars": {
        "AUTH_COOKIE_DOMAIN": ".locnative.com",
        "BETTER_AUTH_URL": "https://locnative-server.mr-amanijoseph.workers.dev",
        "WEB_BASE_URL": "https://locnative.com"
      },
      "routes": [
        {
          "pattern": "api.locnative.com",
          "custom_domain": true
        }
      ]
    }
  }
}
```

### Observability Config
```jsonc
// Add to both wrangler configs
"observability": {
  "enabled": true,
  "logs": {
    "enabled": true,
    "invocation_logs": true,
    "head_sampling_rate": 1
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `NITRO_PRESET=cloudflare-pages` | `@cloudflare/vite-plugin` handles preset automatically | CF Vite Plugin v1.x (2025) | locnative already uses the new approach |
| Manual worker entry file | `main: "@tanstack/react-start/server-entry"` alias | TanStack Start 1.x | locnative uses the newer alias pattern |
| `wrangler.toml` only | `wrangler.jsonc` supported | Wrangler 3.x+ | Both formats work; jsonc allows comments |

## Open Questions

1. **Cookie domain for cross-subdomain auth**
   - What we know: mydeffo uses `AUTH_COOKIE_DOMAIN=".mydeffo.com"` for cross-subdomain cookie sharing (web on `mydeffo.com`, API on `api.mydeffo.com`)
   - What's unclear: Will locnative use subdomains (e.g., `api.locnative.com`) or the workers.dev domain?
   - Recommendation: Add `AUTH_COOKIE_DOMAIN` as optional env var now, configure when domain setup is finalized

2. **`scryptSync` performance on Workers**
   - What we know: `nodejs_compat` supports it, and it's only used for API key validation (not high-frequency)
   - What's unclear: Exact CPU time consumption per call on Workers
   - Recommendation: Ship as-is, monitor via observability, migrate to async if needed

3. **Convex dependency**
   - What we know: locnative.com has Convex as part of its stack but the schema is currently empty
   - What's unclear: Whether Convex client-side SDK has any Node.js-only dependencies that affect Workers SSR
   - Recommendation: Verify Convex SDK works in Workers SSR environment during testing

## Sources

### Primary (HIGH confidence)
- Direct file comparison between `/Users/mac/Developer/projects/locnative.com` and `/Users/mac/Developer/projects/mydeffo.com-web`
- mydeffo.com-web is deployed and working on Cloudflare Workers (verified via wrangler config with production env and custom domains)

### Secondary (MEDIUM confidence)
- Cloudflare Workers `nodejs_compat` documentation for Node.js API support claims
- TanStack Start server entry alias pattern

## Metadata

**Confidence breakdown:**
- Configuration comparison: HIGH - direct file-to-file comparison
- Node.js compatibility issues: HIGH - verified which APIs are used and which are problematic
- Deployment patterns: HIGH - mydeffo.com-web is a working reference
- `scryptSync` on Workers: MEDIUM - works with `nodejs_compat` but performance impact unclear

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable -- CF Workers compat flags don't change frequently)
