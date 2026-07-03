# Security Settings — Production Implementation Design

**Date:** 2026-06-23
**Status:** Approved (design); pending spec review
**Scope:** Replace the three stub features in the Settings → Security section
(`apps/web/src/routes/_protected/settings.tsx:270-310`) with production-ready
features: Two-Factor Authentication, Active Sessions & Device Management, and
Account Deletion.

## Decisions (locked)

1. **Approach:** Use BetterAuth's official capabilities — the `twoFactor`
   plugin, the built-in session-management endpoints, and the `deleteUser`
   flow. No hand-rolled TOTP/crypto.
2. **Audit logging:** Dedicated `security_audit_log` table, written on every
   security-sensitive action.
3. **Approximate location:** Captured from Cloudflare `request.cf` at session
   creation, stored on the `session` row (best-effort; null when unavailable).
4. **Migrations:** I generate Drizzle schema + migration SQL. I do **not** run
   any DDL against the shared Neon DB. The user reviews and runs `db:migrate`.

## Architecture context

- BetterAuth 1.5.6 (`packages/auth/src/index.ts`). The `auth` instance is
  shared by the web app and the API Worker.
- The auth handler is mounted on the Cloudflare Worker (`apps/server/src/index.ts`)
  via Hono `app.on(["GET","POST"], "/api/auth/*")`. The web app proxies
  `/api/auth/*` to the Worker through a Service Binding
  (`apps/web/src/lib/auth-server.ts`).
- Auth schema: `packages/database/src/schema/auth.ts` (`user`, `session`,
  `account`, `verification`). Sessions already store `ipAddress` + `userAgent`.
- Migrations run to `0015`. Next migration is `0016`.
- API: oRPC routers in `packages/api/src/routers/domains/`
  (`protectedProcedure` / `publicProcedure`).
- UI: `@locnative/ui` provides `dialog`, `tabs`, `table`, `switch`,
  `badge`, `card`, `button`, `input`, `password-input`, `field`, `separator`,
  `skeleton`, `sonner` (toasts). No `alert-dialog` — use `dialog`.

## 1. Schema & migrations (`packages/database`)

All changes added to `packages/database/src/schema/auth.ts` (or a new
`security.ts` schema file for the audit log), exported from the package, and
captured in a single generated migration `0016_*`. **Not applied by the agent.**

### 1.1 `two_factor` table (BetterAuth plugin contract)

The `twoFactor` plugin expects a table with these columns. Table name must be
`twoFactor` (BetterAuth default; Drizzle pgTable name `"two_factor"` mapped via
the adapter's model naming — verify the adapter maps `twoFactor` → `two_factor`,
otherwise name the table to match BetterAuth's expectation).

| column        | type   | notes                                  |
|---------------|--------|----------------------------------------|
| `id`          | text   | primary key                            |
| `secret`      | text   | TOTP secret (managed by BetterAuth)    |
| `backup_codes`| text   | encrypted by BetterAuth                 |
| `user_id`     | text   | FK → `user(id)` ON DELETE CASCADE      |

Index on `user_id`.

### 1.2 `user.two_factor_enabled`

`boolean("two_factor_enabled").notNull().default(false)` added to the `user`
table (BetterAuth's `twoFactor` plugin reads/writes this flag).

### 1.3 `session` geo columns

Add nullable text columns to `session`: `geo_country`, `geo_region`,
`geo_city`. Populated best-effort from `request.cf` at session creation.

### 1.4 `security_audit_log` table

| column       | type        | notes                                            |
|--------------|-------------|--------------------------------------------------|
| `id`         | text        | primary key (generated)                          |
| `user_id`    | text        | FK → `user(id)` ON DELETE SET NULL (logs survive deletion) |
| `action`     | text        | e.g. `two_factor.enable`, `session.revoke`, `account.delete` |
| `ip_address` | text        | nullable                                         |
| `user_agent` | text        | nullable                                         |
| `metadata`   | jsonb       | nullable; action-specific detail                 |
| `created_at` | timestamptz | notNull, default now                             |

Index on `(user_id, created_at)`.

> **DB approval gate:** Per the project's standing rule, the agent must not run
> DDL against the shared Neon DB. The migration file is generated and handed to
> the user for review + `pnpm db:migrate`.

## 2. Auth config (`packages/auth/src/index.ts`)

### 2.1 Plugin + deletion config

```ts
import { twoFactor } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";

betterAuth({
  appName: "Locnative",
  // ...existing...
  plugins: [twoFactor()],
  user: {
    deleteUser: { enabled: true },
  },
});
```

`deleteUser.enabled: true` activates `/api/auth/delete-user`, which requires the
user's password (and a fresh session via BetterAuth's `sensitiveSessionMiddleware`).
On the `user` `ON DELETE CASCADE` FKs (`session`, `account`, `two_factor`,
team membership, projects/API keys) the DB removes dependent rows; verify each
user-owned table cascades or is cleaned in a `deleteUser.beforeDelete` hook.

### 2.2 Audit hook

A BetterAuth `hooks.after` middleware inspects `ctx.path` and writes a
`security_audit_log` row for security-sensitive paths:

- `/two-factor/enable`, `/two-factor/disable`, `/two-factor/verify-totp`,
  `/two-factor/generate-backup-codes`
- `/delete-user`
- `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`
- `/sign-in/*` (success/failure)

IP from `ctx.request` headers (`cf-connecting-ip` / `x-forwarded-for`),
user-agent from the request. Writing the audit row must never throw into the
auth response — wrap in try/catch and swallow (matches the repo's
"accounting must not fail the response" convention).

### 2.3 Session geo capture

`databaseHooks.session.create.before` reads `ctx.request.cf` (Cloudflare
geo: `country`, `region`, `city`) and returns the augmented session data with
`geoCountry`/`geoRegion`/`geoCity`. Null when `cf` is unavailable (local dev,
non-Cloudflare). Must not throw.

### 2.4 Rate limiting

BetterAuth `rateLimit` is already enabled (window 10s, max 100). Add tighter
per-path rules for `/two-factor/*` and `/delete-user` via the `rateLimit.customRules`
map (e.g. stricter window/max) to satisfy OWASP brute-force protection on
verification and deletion endpoints.

## 3. Client (`apps/web/src/lib/auth-client.ts`)

```ts
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
  fetchOptions: { credentials: "include" },
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
  ],
});

export const {
  useSession, signIn, signUp, signOut, requestPasswordReset, resetPassword,
  twoFactor,            // enable / disable / verifyTotp / getTotpUri / generateBackupCodes
  listSessions, revokeSession, revokeSessions, revokeOtherSessions,
  deleteUser,
} = authClient;
```

## 4. New web route — `/two-factor`

`apps/web/src/routes/_auth/two-factor.tsx` — shown after a sign-in that returns
`twoFactorRedirect` (2FA enabled). UI:

- 6-digit TOTP input → `twoFactor.verifyTotp({ code, trustDevice })`.
- "Use a backup code" toggle → `twoFactor.verifyBackupCode({ code })`.
- "Trust this device for 30 days" checkbox (maps to `trustDevice`).
- On success: redirect to the post-login destination (dashboard).
- Loading / invalid-code / rate-limited error states.

## 5. Settings Security section

Extract the security stubs from `settings.tsx` into focused components under
`apps/web/src/components/settings/security/`. The settings route renders the
three cards. Each component owns its own data fetching and state.

### 5.1 `two-factor-card.tsx`

- **Status:** badge Enabled/Disabled from `useSession().user.twoFactorEnabled`.
- **Enable flow (multi-step within a `dialog`):**
  1. Password prompt → `twoFactor.enable({ password })` → returns `totpURI`
     + `backupCodes`.
  2. Render QR from `totpURI` using the `qrcode` library to a data-URL/`<canvas>`
     (no network call). Show the manual setup key (secret parsed from the URI)
     as a fallback.
  3. 6-digit verification input → `twoFactor.verifyTotp({ code })`. Only after
     successful verification is 2FA considered active.
  4. Reveal backup codes once, with **Download** (`.txt` Blob) and **Copy**.
     Codes are never shown again after this step.
- **Disable:** password prompt → `twoFactor.disable({ password })`.
- **Regenerate backup codes:** password prompt →
  `twoFactor.generateBackupCodes({ password })` → show + download new set
  (invalidates old codes).
- Full loading/success/error states; toasts via `sonner`.
- The TOTP secret is never displayed after setup (only the one-time QR/manual
  key during enable).

### 5.2 `active-sessions-card.tsx`

- **Data:** `listSessions()` → rows enriched client-side:
  - Device type / browser / OS parsed from `userAgent` via `ua-parser-js`.
  - IP address (`ipAddress`), approximate location (geo columns), last-active
    (`updatedAt`), expiry (`expiresAt`).
  - "This device" indicator: match the current session token from
    `useSession()`.
- **Actions:**
  - Revoke individual session → `revokeSession({ token })`.
  - "Sign out all other devices" → `revokeOtherSessions()`.
- **UX:** optimistic removal from the list with rollback on error; refetch on
  settle to reconcile with server state. Empty state when only the current
  session exists. Skeleton while loading.
- Revoked sessions are invalidated server-side immediately (BetterAuth deletes
  the session row); audit rows recorded via the hook in §2.2.

### 5.3 `delete-account-card.tsx`

Multi-step confirmation in a `dialog` (prevents accidental deletion):

1. **Warning step** — explicit copy:
   - *Deleted:* account/profile, all projects, all API keys, all sessions,
     2FA secret + backup codes, team memberships.
   - *Retained (legal/billing/compliance):* billing & invoice records,
     `security_audit_log` entries (anonymised via `user_id` SET NULL).
2. **Type-to-confirm** — user types their exact email to proceed.
3. **Re-authentication** — password input; if `twoFactorEnabled`, also a TOTP
   code input.
4. **Execute** — `deleteUser({ password, callbackURL: "/" })` (BetterAuth
   verifies password + fresh session, cascades deletes). On success all
   sessions are invalidated and the user is redirected out.
- Loading/success/error states; the destructive button is disabled until all
  steps validate.

## 6. Dependencies (add to `apps/web`)

- `qrcode` — render the TOTP URI to a QR offline.
- `ua-parser-js` — parse `userAgent` into device/browser/OS.

No `otpauth`/`speakeasy` — TOTP is handled server-side by BetterAuth.

## 7. Testing

Follow the repo's no-DOM test convention (extract pure logic, mock the SDK
boundary; Vitest):

- UA parsing → device/browser/OS label mapping.
- Backup-code formatting + download Blob construction.
- Audit-action path → action-name mapping (the §2.2 matcher).
- Delete-confirmation validation (email match, required fields, 2FA gating).

BetterAuth-owned endpoints (TOTP verification, session revocation, deletion)
are not re-tested — they are library-covered.

## 8. Security checklist (OWASP)

- All settings endpoints run behind an authenticated session
  (`protectedProcedure` / BetterAuth session middleware).
- Sensitive actions (2FA enable/disable, deletion) require password
  re-authentication (BetterAuth `sensitiveSessionMiddleware`).
- Rate limiting on `/two-factor/*` and `/delete-user` (§2.4).
- TOTP secret + backup codes stored encrypted; never re-exposed after setup.
- Audit logging for all security-sensitive actions (§1.4, §2.2).
- Input validation via Zod / BetterAuth schemas.
- Session revocation is server-side and immediate.

## Out of scope

- Email-OTP 2FA fallback (TOTP + backup codes only for now).
- Passkeys / WebAuthn.
- Admin-initiated session/user management (self-service only).
- Applying migrations to the shared DB (user-owned).
