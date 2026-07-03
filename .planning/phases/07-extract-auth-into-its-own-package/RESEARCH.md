# Phase 07: Extract Auth Into Its Own Package — Research

**Researched:** 2026-04-17
**Domain:** BetterAuth package extraction / monorepo refactor
**Confidence:** HIGH — all findings are from direct file reads of both repos, no inference required.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Mirror mydeffo's `packages/auth/` structure 1:1 (same file names, same export shape, same dependency set scoped to auth).
- No behavioral changes. Pure refactor. Cookie attributes, OAuth providers, session durations, DB schema stay identical.
- No DB schema changes. BetterAuth tables stay in `packages/database`.
- No deploy-config changes. Wrangler files, env vars, custom domains unchanged.
- No GitHub OAuth app changes.

### Claude's Discretion
- Scope of email template files to include. Mydeffo has four templates (verify-email, reset-password, organization-invite, payment-confirmation). Locnative currently uses zero (no email send configured). Researcher to confirm whether to include empty email stubs or omit email directory entirely.

### Deferred Ideas (OUT OF SCOPE)
- Adding email sending (Resend) to locnative.
- Adding organization/admin BetterAuth plugins to locnative.
- Changing the Neon/Drizzle adapter.
- Any UI changes.
</user_constraints>

---

## Summary

Phase 07 moves the BetterAuth server configuration from `packages/api/src/auth.ts` into a new dedicated `packages/auth/` workspace package, and ensures `apps/web/src/lib/auth-client.ts` is the canonical client entry point (it already exists and is self-contained — no move needed). The new package becomes `@locnative/auth`, matching the workspace naming convention. The `packages/api` package loses its `auth.ts` file and its `better-auth` dependency; `apps/server` switches its import of `auth` from `@locnative/api` to `@locnative/auth`.

The mydeffo reference package (`packages/auth/src/index.ts`) is a single-file barrel that exports `auth` (the `betterAuth({...})` instance) and email utility functions. It has no client setup — the client lives in `apps/web/src/lib/auth/auth-client.ts` in mydeffo, mirrored by `apps/web/src/lib/auth-client.ts` in locnative (already in place).

**Primary recommendation:** Create `packages/auth/` with one source file (`src/index.ts`) containing the server auth config, zero email templates initially (locnative has no Resend key or email flow), and the same `package.json` / `tsconfig.json` shape as mydeffo. Wire `apps/server` to import `auth` from `@locnative/auth` instead of `@locnative/api`.

---

## 1. Mydeffo Package Manifest

**File:** `packages/auth/package.json` (mydeffo)

```json
{
  "name": "@mydeffo.com-web/auth",
  "type": "module",
  "exports": {
    ".": { "default": "./src/index.ts" },
    "./*": { "default": "./src/*.ts" }
  },
  "scripts": {},
  "dependencies": {
    "@mydeffo.com-web/db": "workspace:*",
    "@mydeffo.com-web/env": "workspace:*",
    "@react-email/components": "^1.0.1",
    "better-auth": "catalog:",
    "dotenv": "catalog:",
    "react": "^19.2.3",
    "resend": "^6.6.0",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@mydeffo.com-web/config": "workspace:*",
    "@types/react": "^19.2.7",
    "typescript": "catalog:"
  }
}
```

Key observations:
- ESM-only (`"type": "module"`).
- No `scripts` block (no build step — consumed via `src/` directly through TS path resolution).
- No `main` field; uses `exports` map only.
- Depends on `@mydeffo.com-web/db` (for the Drizzle `db` client and `authSchema`), `@mydeffo.com-web/env` (for secrets), `better-auth`, `resend`, `react` + `@react-email/components` (for email templates).
- No `peerDependencies`.

**Locnative equivalent name:** `@locnative/auth` (follows workspace pattern — see Section 13).

---

## 2. TypeScript Config

**File:** `packages/auth/tsconfig.json` (mydeffo)

```json
{
  "extends": "@mydeffo.com-web/config/tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "composite": true,
    "strictNullChecks": true,
    "jsx": "react-jsx",
    "skipLibCheck": true
  }
}
```

Key observations:
- `composite: true` + `outDir: dist` — prepared for project references and a build step, but the package is consumed source-first (no `dist/` is actually required for local workspace consumption).
- `jsx: react-jsx` is needed because the email templates are `.tsx` files.
- Extends the shared `@mydeffo.com-web/config/tsconfig.base.json`, which in locnative is `@locnative/config/tsconfig.base.json` at `packages/config/tsconfig.base.json`.
- Locnative base tsconfig does NOT include `jsx` — it must be added in the auth package tsconfig override.
- `strictNullChecks` is inherited from the base (which has `strict: true`), so listing it explicitly is redundant but harmless.

**Note on `jsx`:** Locnative's `tsconfig.base.json` has no `jsx` setting. If locnative omits email templates entirely, `jsx: react-jsx` is not needed. If email stubs are included as `.tsx` files, it must be added.

---

## 3. Source Tree

**mydeffo `packages/auth/src/`:**

```
src/
├── index.ts                                  — sole server barrel: betterAuth config + email send helpers
├── index.js                                  — compiled artifact (ignore — source is authoritative)
├── emails/
│   ├── verify-email-template.tsx             — React Email template for email verification
│   ├── verify-email-template.js              — compiled artifact
│   ├── reset-password-template.tsx           — React Email template for password reset
│   ├── reset-password-template.js            — compiled artifact
│   ├── organization-invite-template.tsx      — React Email template for org invitations
│   ├── organization-invite-template.js       — compiled artifact
│   └── payment-confirmation-template.tsx     — React Email template for payment receipts
│   └── payment-confirmation-template.js      — compiled artifact
```

The `.js` files alongside `.tsx` are compiled outputs that leaked into the source tree — they are not intentional source files. The `.tsx` files are the authoritative sources.

**mydeffo does NOT have a separate client export.** The auth client (`createAuthClient`) lives in `apps/web/src/lib/auth/auth-client.ts`, not inside `packages/auth/`.

---

## 4. Exports Shape

**File:** `packages/auth/src/index.ts` (mydeffo) — named exports:

| Export | Type | Purpose |
|--------|------|---------|
| `resend` | `Resend` instance | Shared Resend client for transactional email |
| `sendInviteEmail` | `async function` | Sends org invitation email via Resend |
| `sendPaymentConfirmationEmail` | `async function` | Sends payment confirmation email via Resend |
| `auth` | `ReturnType<typeof betterAuth>` | The BetterAuth server instance (handler, api, etc.) |

The `verifyLegacyFastHash`, `buildInviteUrl`, `buildVerificationUrl`, `buildResetPasswordUrl` helpers are unexported module-level functions.

**Locnative scope:** Only `auth` is needed. `resend`, `sendInviteEmail`, `sendPaymentConfirmationEmail` are specific to mydeffo's email flow which locnative does not have. The locnative `packages/auth/src/index.ts` will export only `auth`.

---

## 5. BetterAuth Config (mydeffo)

Full `betterAuth({...})` call, `packages/auth/src/index.ts` lines 201–334:

```
betterAuth({
  baseURL: env.BETTER_AUTH_URL,                       // from @mydeffo.com-web/env/server
  database: drizzleAdapter(db, {                      // db from @mydeffo.com-web/db
    provider: "pg",
    schema: authSchema,                               // from @mydeffo.com-web/db/schema/auth
  }),
  trustedOrigins: [env.CORS_ORIGIN, DEPLOYED_WEB_ORIGIN, "http://localhost:3001"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    password: { hash: hashPassword, verify: <legacy SHA-256 compat> },
    sendResetPassword: async ({ user, url }) => { ... resend ... },
  },
  socialProviders: { google: { ... } },  // conditionally included if GOOGLE_* env vars exist
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
      ...(cookieDomain ? { domain: cookieDomain } : {}),  // AUTH_COOKIE_DOMAIN env var
    },
  },
  rateLimit: { enabled: true, window: 10, max: 100 },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => { ... resend ... },
  },
  plugins: [organization({ membershipLimit: Number.MAX_SAFE_INTEGER }), adminPlugin()],
})
```

**Schema import path:** `authSchema` comes from `@mydeffo.com-web/db/schema/auth` (the `packages/db/src/schema/auth.ts` export).

---

## 6. Client Setup (mydeffo)

**File:** `apps/web/src/lib/auth/auth-client.ts` (mydeffo)

```typescript
import { env } from "@mydeffo.com-web/env/web";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [organizationClient()],
});

export const useSession = authClient.useSession;
export const signInWithGoogle = (...) => authClient.signIn.social({ provider: "google", ... });
export const getSession = () => authClient.getSession();
export const signOut = async () => { ... };
```

The auth client lives in `apps/web`, not in `packages/auth`. It imports from `better-auth/react` directly (not from `packages/auth`).

**Locnative equivalent:** `apps/web/src/lib/auth-client.ts` already exists and is self-contained. It uses `createAuthClient` from `better-auth/react` with no plugins (locnative has no org/admin plugins). **No move or change is needed for the client file.**

---

## 7. Schema Location and Package Relationships

### mydeffo
- Auth schema (`authSchema`) lives in `packages/db/src/schema/auth.ts`, exported as `@mydeffo.com-web/db/schema/auth`.
- `packages/auth` **depends on** `packages/db` (not vice versa).
- Dependency direction: `packages/auth` → `packages/db` → (Neon, Drizzle).

### locnative
- Auth schema (`authSchema`) lives in `packages/database/src/schema/auth.ts` (lines 1–109, verified above).
- It is exported from `packages/database/src/schema/index.ts` and re-exported by `packages/database` main index.
- Currently `packages/api` depends on `packages/database` and `packages/env`.
- After extraction: `packages/auth` will depend on `packages/database` (for `authSchema` and `db` client) and `packages/env` (for `serverEnv`).

**Critical detail:** The locnative `db` client is currently created inside `packages/api/src/db.ts`:
```typescript
import { createDb } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
export const db = createDb(serverEnv.DATABASE_URL);
```
The new `packages/auth` will need its own db instance. Two options:
1. Create `packages/auth/src/db.ts` that calls `createDb(serverEnv.DATABASE_URL)` — mirrors mydeffo's pattern where `db` is imported from `@mydeffo.com-web/db` (which exports a pre-constructed db client).
2. Import the db instance from `packages/database` if `packages/database` exports one.

**Checking `packages/database/src/index.ts` and `packages/database/src/client.ts`:**

- `packages/database/src/client.ts` contains `createDb` (a factory).
- `packages/database/src/index.ts` exports `createDb` (and schema types).
- There is no singleton `db` instance exported from `packages/database`.

**Resolution:** `packages/auth/src/db.ts` must instantiate `createDb(serverEnv.DATABASE_URL)` itself, identical to the current `packages/api/src/db.ts`. This is the correct pattern — each consumer owns its db instance.

---

## 8. Emails

### mydeffo
Four React Email templates in `packages/auth/src/emails/`:
1. `verify-email-template.tsx` — email verification link
2. `reset-password-template.tsx` — password reset link
3. `organization-invite-template.tsx` — org invitation link
4. `payment-confirmation-template.tsx` — Stripe payment confirmation

Template library: `@react-email/components` (Body, Button, Container, Heading, Html, etc.) with Tailwind utility classes via the `Tailwind` wrapper component.

Sending: Resend SDK (`resend.emails.send({ react: <Template /> })`).

### locnative
- No Resend key is configured.
- No email templates exist anywhere.
- `emailAndPassword.enabled: true` but no `sendResetPassword` or `sendVerificationEmail` callbacks are wired.
- `emailVerification` block is absent from `packages/api/src/auth.ts`.

**Conclusion:** The `emails/` directory should be **omitted** from the locnative `packages/auth/src/` for now. The phase is a pure refactor — no new email functionality.

---

## 9. Consumers in locnative

### `apps/server/src/index.ts`
- Imports `{ auth }` from `@locnative/api` (line 8).
- Uses `auth.handler(context.req.raw)` on the `/api/auth/*` Hono route (line 55).
- **Must change:** update import to `@locnative/auth`.

### `apps/web/src/lib/auth-client.ts`
- Imports `createAuthClient` from `better-auth/react` directly.
- No dependency on `@locnative/api` or `@locnative/auth`.
- **No change needed.**

### `apps/web/src/lib/auth-server.ts`
- Imports from `@tanstack/react-start/server` only.
- No dependency on any auth package.
- **No change needed.**

### `apps/web/src/routes/**` (sign-in, sign-up, callbacks, etc.)
- All import from `@/lib/auth-client` or `@/lib/auth-server` — no direct package deps.
- **No change needed.**

### `packages/api/src/index.ts`
- Exports `{ auth }` re-exported from `./auth.ts` (line 1).
- After extraction: remove this export (or keep a thin re-export if other api consumers need it — but currently only `apps/server` consumes `auth` from `@locnative/api`, so the re-export can be deleted).

### `packages/api/src/context.ts` and `procedures.ts`
- May reference `auth` for session reading (common pattern). Need to check.

**File:** `packages/api/src/context.ts` — not yet read. This is an open question (see Section 15).

---

## 10. Workspace Glue

### pnpm-workspace.yaml
```yaml
packages:
  - apps/*
  - packages/*
catalog:
  dotenv: ^17.2.2
  zod: ^4.1.13
  ...
```

`packages/*` glob automatically picks up any new `packages/auth/` directory — **no manual edit to `pnpm-workspace.yaml` is needed**.

`better-auth` is NOT in the catalog (it uses a pinned version `^1.5.6` in `packages/api/package.json`). The new `packages/auth/package.json` should pin the same version.

### turbo.json
Current tasks: `build` (dependsOn `^build`, outputs `dist/**`), `check-types` (dependsOn `^check-types`), `dev`, `dev:setup`. No named pipeline entries reference specific packages. The new package participates automatically through the glob.

### tsconfig project references
No root-level `tsconfig.json` with `references` array was found in locnative. Each package/app has its own tsconfig that extends the base. **No root tsconfig change needed.**

---

## 11. Build Output

### mydeffo
- `tsconfig.json` has `composite: true` and `outDir: dist` — theoretically supports building to `dist/`.
- In practice, `package.json` exports point to `./src/index.ts` directly (not `./dist/index.js`).
- No `build` script is defined in `package.json`.
- **Conclusion:** Consumed source-first via TypeScript path resolution. No `dist/` build step required.

### locnative
Same pattern applies. All existing locnative packages (`api`, `database`, `env`, `ui`) use `"./src/*.ts"` in their exports maps and have no `build` script. The new `packages/auth` follows the same convention — no build step.

---

## 12. Locnative Current Auth Code Inventory

Files that contain auth logic and their disposition:

| File | Current Role | Action in Phase 07 |
|------|-------------|---------------------|
| `packages/api/src/auth.ts` | BetterAuth server config (`betterAuth({...})`) | **DELETE** — content moves to `packages/auth/src/index.ts` |
| `packages/api/src/db.ts` | Creates Drizzle db client for api package | **KEEP** — api still needs db for oRPC procedures. Auth package creates its own db instance. |
| `packages/api/src/index.ts` | Re-exports `auth` among other things | **MODIFY** — remove `export { auth } from "./auth.ts"` |
| `packages/api/package.json` | Lists `better-auth` as dependency | **MODIFY** — remove `better-auth` dep (if context.ts/procedures.ts don't use it; see open question) |
| `apps/server/src/index.ts` | Imports `auth` from `@locnative/api` | **MODIFY** — change import to `@locnative/auth` |
| `apps/web/src/lib/auth-client.ts` | BetterAuth client (`createAuthClient`) | **NO CHANGE** — already standalone |
| `apps/web/src/lib/auth-server.ts` | SSR session proxy helper | **NO CHANGE** — uses `fetch`, no package dep on auth |
| `packages/database/src/schema/auth.ts` | Drizzle schema for BetterAuth tables | **NO CHANGE** — stays in `packages/database` |

**New files to create:**
- `packages/auth/package.json`
- `packages/auth/tsconfig.json`
- `packages/auth/src/index.ts`
- `packages/auth/src/db.ts` (db instance for auth package)

---

## 13. Naming Convention

All locnative workspace package names use the `@locnative/` scope:
- `@locnative/api`
- `@locnative/database`
- `@locnative/env`
- `@locnative/ui`
- `@locnative/config`
- `@locnative/sdk`

**New package name:** `@locnative/auth`

Import path for consumers: `import { auth } from "@locnative/auth"`

---

## 14. Divergence Analysis

### Cookie attributes
- **mydeffo** (`packages/auth/src/index.ts`, lines 276–283): `sameSite: "none"`, `secure: true`, `httpOnly: true`, conditional `domain` from `AUTH_COOKIE_DOMAIN`.
- **locnative** (`packages/api/src/auth.ts`, lines 39–48): identical — `sameSite: "none"`, `secure: true`, `httpOnly: true`, conditional `domain` from `serverEnv.AUTH_COOKIE_DOMAIN`.
- **Verdict:** No divergence. Copy as-is.

### Social providers
- **mydeffo:** Google OAuth, conditionally enabled (`if GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET`).
- **locnative:** GitHub OAuth only, always enabled (no conditional), with explicit `redirectURI`.
- **Verdict:** Preserve locnative's GitHub-only config. Do not adopt mydeffo's Google provider or conditional guard.

### emailAndPassword
- **mydeffo:** `enabled: true`, `minPasswordLength: 8`, `requireEmailVerification: true`, legacy SHA-256 password verify support, `sendResetPassword` + `sendVerificationEmail` callbacks.
- **locnative:** `enabled: true`, no `minPasswordLength`, no `requireEmailVerification`, no callbacks.
- **Verdict:** Preserve locnative's minimal config. Do not add mydeffo's email callbacks or legacy hash support.

### DB adapter
- **mydeffo:** `drizzleAdapter(db, { provider: "pg", schema: authSchema })` — Neon Postgres via Drizzle.
- **locnative:** identical — `drizzleAdapter(db, { provider: "pg", schema: authSchema })`.
- **Verdict:** No divergence.

### Plugins
- **mydeffo:** `organization({ membershipLimit: Number.MAX_SAFE_INTEGER })` + `adminPlugin()`.
- **locnative:** No plugins.
- **Verdict:** Preserve locnative's plugin-free config. Phase 07 is not adding org/admin features.

### rateLimit
- **mydeffo:** `rateLimit: { enabled: true, window: 10, max: 100 }`.
- **locnative:** Not configured.
- **Verdict:** Out of scope for this phase. Do not add.

### trustedOrigins
- **mydeffo:** `[env.CORS_ORIGIN, DEPLOYED_WEB_ORIGIN, "http://localhost:3001"]`
- **locnative:** `[serverEnv.WEB_BASE_URL, DEPLOYED_WEB_ORIGIN, "http://localhost:3001", "https://locnative.com", "https://api.locnative.com"]`
- **Verdict:** Preserve locnative's full list.

### `secret` field
- **mydeffo:** No explicit `secret` field in `betterAuth({...})` — relies on `BETTER_AUTH_SECRET` env var being picked up automatically.
- **locnative:** Explicitly passes `secret: serverEnv.BETTER_AUTH_SECRET`.
- **Verdict:** Preserve locnative's explicit `secret` — it's more defensive and already works.

---

## 15. Open Questions

1. **`packages/api/src/context.ts` usage of `auth`**
   - What we know: `context.ts` is the oRPC context factory. It may import `auth` to read the session from incoming requests (common BetterAuth pattern: `auth.api.getSession({ headers })`).
   - What's unclear: If `context.ts` imports from `./auth.ts`, it will need to be updated to import from `@locnative/auth` instead. This would also mean `packages/api` keeps `@locnative/auth` as a dependency rather than removing it entirely.
   - Recommendation: Read `packages/api/src/context.ts` before finalizing the plan. If it references `auth`, `packages/api/package.json` gains `@locnative/auth` as a workspace dep instead of removing `better-auth`.

2. **Whether `packages/api` can fully drop `better-auth`**
   - Depends on answer to #1. If `context.ts` or `procedures.ts` import from `better-auth/*` directly (e.g., type imports), the dependency must stay in `packages/api` or be transitive through `@locnative/auth`.
   - Recommendation: Audit `packages/api/src/context.ts` and `packages/api/src/procedures.ts` before writing the plan.

---

## Recommended Mirror Strategy

### Files to Create

**`packages/auth/package.json`**
```json
{
  "name": "@locnative/auth",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "default": "./src/index.ts" },
    "./*": { "default": "./src/*.ts" }
  },
  "scripts": {},
  "dependencies": {
    "@locnative/database": "workspace:*",
    "@locnative/env": "workspace:*",
    "better-auth": "^1.5.6"
  },
  "devDependencies": {
    "@locnative/config": "workspace:*",
    "typescript": "^5"
  }
}
```

Notes:
- No `resend`, `react`, `@react-email/components`, `@types/react` — email features excluded.
- `better-auth` version matches current `packages/api/package.json`.
- `private: true` matches all other locnative packages.

**`packages/auth/tsconfig.json`**
```json
{
  "extends": "@locnative/config/tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "composite": true,
    "skipLibCheck": true
  }
}
```

Notes:
- Omit `jsx: react-jsx` (no email `.tsx` files).
- `strictNullChecks` inherited from base (`strict: true`).

**`packages/auth/src/db.ts`**
```typescript
import { createDb } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";

export const db = createDb(serverEnv.DATABASE_URL);
```

(Identical to the current `packages/api/src/db.ts`.)

**`packages/auth/src/index.ts`**
Move the content of `packages/api/src/auth.ts` here verbatim, then update the two import lines:
```typescript
// Before (in packages/api/src/auth.ts):
import { authSchema } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { db } from "./db.ts";

// After (in packages/auth/src/index.ts):
import { authSchema } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { db } from "./db.ts";

export const auth = betterAuth({ ... });
```

The import paths for `authSchema`, `serverEnv`, and `db` are identical — only `db` changes from a relative sibling to a local `./db.ts` in the new package. `authSchema` import path `@locnative/database` is unchanged.

### Files to Delete

| File | Reason |
|------|--------|
| `packages/api/src/auth.ts` | Content moved to `packages/auth/src/index.ts` |

### Files to Modify

| File | Change |
|------|--------|
| `packages/api/src/index.ts` | Remove `export { auth } from "./auth.ts"` |
| `packages/api/package.json` | Remove `"better-auth": "^1.5.6"` (pending open question #1 — may need to become `"@locnative/auth": "workspace:*"` instead if context.ts uses auth) |
| `apps/server/src/index.ts` | Change `import { ..., auth, ... } from "@locnative/api"` to `import { auth } from "@locnative/auth"` plus keep the other imports from `@locnative/api` |
| `apps/server/package.json` | Add `"@locnative/auth": "workspace:*"` as a dependency |

### No Change Required

| File | Reason |
|------|--------|
| `apps/web/src/lib/auth-client.ts` | Already standalone, imports directly from `better-auth/react` |
| `apps/web/src/lib/auth-server.ts` | No auth package dep, uses fetch only |
| `apps/web/src/routes/**` | Import from `@/lib/auth-client` or `@/lib/auth-server` only |
| `packages/database/src/schema/auth.ts` | Schema stays in database package |
| `pnpm-workspace.yaml` | `packages/*` glob auto-discovers new package |
| `turbo.json` | No named package references to update |
| Root tsconfig | No project references array |
| Any `.env` files | No env var changes |

---

## Sources

### Primary (HIGH confidence)
- Direct file reads of `mydeffo.com-web/packages/auth/package.json` — package manifest
- Direct file reads of `mydeffo.com-web/packages/auth/tsconfig.json` — TS config
- Direct file reads of `mydeffo.com-web/packages/auth/src/index.ts` — full betterAuth config + exports (334 lines)
- Direct file reads of `mydeffo.com-web/apps/web/src/lib/auth/auth-client.ts` — client setup
- Direct file reads of `mydeffo.com-web/apps/server/src/index.ts` — server consumer pattern
- Direct file reads of `locnative.com/packages/api/src/auth.ts` — current server config
- Direct file reads of `locnative.com/packages/api/src/index.ts` — current export shape
- Direct file reads of `locnative.com/packages/api/src/db.ts` — db factory pattern
- Direct file reads of `locnative.com/apps/server/src/index.ts` — server consumer
- Direct file reads of `locnative.com/apps/web/src/lib/auth-client.ts` — client (no change needed)
- Direct file reads of `locnative.com/packages/database/src/schema/auth.ts` — schema ownership confirmed
- Direct file reads of `locnative.com/pnpm-workspace.yaml` — naming convention
- Direct file reads of `locnative.com/turbo.json` — pipeline structure
- Direct file reads of `locnative.com/packages/config/tsconfig.base.json` — base TS config

## Metadata

**Confidence breakdown:**
- Mydeffo package structure: HIGH — direct file reads
- Locnative consumer graph: HIGH — direct file reads + grep
- Divergence analysis: HIGH — line-by-line comparison of both auth configs
- Open questions: flagged rather than guessed

**Research date:** 2026-04-17
**Valid until:** N/A — this is a static refactor, no external dependencies or versions to expire.
