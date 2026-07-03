# Transactional Email: Resend → Cloudflare Email Service

**Status:** Proposal · **Date:** 2026-06-24 · **Owner:** Joseph Amani

## Summary

Migrate the two transactional email flows off Resend onto **Cloudflare Email
Service (Email Sending)**, behind a single provider-agnostic `sendEmail()`
helper. The whole stack already runs on Cloudflare Workers, so this removes an
external dependency and one runtime secret (`RESEND_API_KEY`), replaces an
HTTP-to-Resend round trip with a native binding call, and keeps cost effectively
free/negligible at our volumes.

## Why (and a cost myth, busted)

Transactional email cost scales with **emails sent (events)**, not **users
stored**. Storing a million users does not generate a million emails — we only
send on password resets, invites, and (if enabled later) verifications. So the
"too many users for Resend" worry is misframed: we are nowhere near a cost
problem. The real win is **architectural alignment** — a native Workers binding
instead of a third-party API key.

| | Cloudflare Email Service (chosen) | Resend (current) |
|---|---|---|
| Integration | Native `env.EMAIL.send()` binding | External SDK + API key |
| Secrets to manage | 0 (binding, no key) | `RESEND_API_KEY` |
| Cost at our volume | Free / negligible | Free tier, then $20/mo+ |
| Transactional-only | Yes (by design) | No (also does marketing) |

## Current state (what we're replacing)

Resend is used in exactly two places, both module-level `new Resend(...)` calls:

- **Password reset** — `packages/auth/src/index.ts:126` (`sendResetPassword`)
- **Team invitations** — `packages/auth/src/invitations.ts:98` (`sendInvitationEmail`)

Config: `RESEND_API_KEY`, `EMAIL_FROM` in `packages/env/src/server.ts:17-18`.
Runs on the `apps/server` Worker (`compatibility_date 2026-04-14`,
`nodejs_compat` enabled — both prerequisites for the binding and the
`cloudflare:workers` env import).

Email verification on signup is **not** currently enabled, so there is no
per-signup email today.

### The one architectural wrinkle

`packages/auth` builds `auth = betterAuth({...})` at **module load**, so its
callbacks have no per-request `env` — they can't see a Worker binding the normal
way. Solution: access the binding at module scope via
`import { env } from "cloudflare:workers"` (supported on our compat date). No
need to thread `env` through BetterAuth.

---

## Step-by-step migration

### Phase 0 — One-time domain onboarding (do this first)

Enable Email Sending for the domain and let Cloudflare add SPF + DKIM DNS
records. (`locnative.com` is on Cloudflare DNS, so this is automatic.)

```bash
npx wrangler email sending enable locnative.com
npx wrangler email sending dns get locnative.com   # confirm SPF + DKIM present
```

DNS usually propagates in 5–15 minutes. Until the domain is verified, sends
fail with `E_SENDER_NOT_VERIFIED`.

> **Deliverability best practice:** also publish a **DMARC** record (Cloudflare
> sets SPF + DKIM, but not DMARC). Start in monitor mode:
> `_dmarc.locnative.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@locnative.com"`
> then tighten to `p=quarantine` → `p=reject` once reports look clean.
> Consider sending from a dedicated subdomain (e.g. `mail.locnative.com`) to
> protect the root domain's reputation — optional, but recommended before high
> volume.

### Phase 1 — Add the binding to the server Worker

In `apps/server/wrangler.jsonc`, add the `send_email` binding. Restrict the
allowed sender so the binding can't be abused to send from arbitrary addresses:

```jsonc
{
  // ...existing config...
  "send_email": [
    {
      "name": "EMAIL",
      "allowed_sender_addresses": ["noreply@locnative.com"]
    }
  ]
}
```

For local dev that actually sends (uses test addresses you control), add
`"remote": true` temporarily — **remove before deploy**:

```jsonc
{ "send_email": [{ "name": "EMAIL", "remote": true, "allowed_sender_addresses": ["noreply@locnative.com"] }] }
```

Regenerate types so `env.EMAIL` is typed from the runtime (don't hand-write
these types):

```bash
cd apps/server && npx wrangler types
```

### Phase 2 — Introduce a provider-agnostic `sendEmail()` helper

Create `packages/auth/src/email.ts`. This is the **only** place that knows which
provider we use — future swaps are a one-file change.

```typescript
import { env } from "cloudflare:workers";
import { serverEnv } from "@locnative/env/server";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a transactional email via the Cloudflare Email Service binding.
 * Centralised so the provider can be swapped without touching call sites.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams): Promise<void> {
  // `env` from cloudflare:workers exposes bindings at module scope, so this
  // works even though `auth` is constructed as a module-level singleton.
  await env.EMAIL.send({
    to,
    from: { email: serverEnv.EMAIL_FROM, name: "Locnative" },
    subject,
    html,
    text,
  });
}
```

> **Note on `EMAIL_FROM`:** keep the env var (now just the address, e.g.
> `noreply@locnative.com`) — it must match `allowed_sender_addresses` in the
> binding. The Workers binding uses `from: { email, name }` (the REST API uses
> `address` instead — not used here).

### Phase 3 — Swap the two call sites

**`packages/auth/src/index.ts`** — replace the Resend block in
`sendResetPassword` (lines ~126–139):

```typescript
import { sendEmail } from "./email.ts";
// ...remove: import { Resend } from "resend";

sendResetPassword: async ({ user, token }) => {
  const resetUrl = `${serverEnv.WEB_BASE_URL.replace(
    TRAILING_SLASH_REGEX,
    ""
  )}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Locnative password",
    html: buildResetPasswordHtml(resetUrl),
    text: buildResetPasswordText(resetUrl),
  });
},
```

**`packages/auth/src/invitations.ts`** — replace the body of
`sendInvitationEmail` (lines ~98–106), dropping `new Resend(...)`:

```typescript
import { sendEmail } from "./email.ts";
// ...remove: import { Resend } from "resend";

await sendEmail({
  to,
  subject: `${inviterName} invited you to ${teamName} on Locnative`,
  html: buildInviteHtml({ teamName, inviterName, inviterEmail, inviteUrl }),
  text: buildInviteText({ teamName, inviterName, inviteUrl }),
});
```

### Phase 4 — Clean up env + dependency

- `packages/env/src/server.ts`: **remove** `RESEND_API_KEY` (lines 17 & 36).
  Keep `EMAIL_FROM`. Set `EMAIL_FROM=noreply@locnative.com`.
- `packages/auth/package.json`: remove the `resend` dependency, then
  `pnpm install` to update the lockfile.
- Remove the `RESEND_API_KEY` secret from the deployed Worker once verified:
  `npx wrangler secret delete RESEND_API_KEY` (in `apps/server`).
- Check the other Resend references found in the repo and update/remove as
  needed: `apps/web/src/components/.../verify-email-01/verify-email.tsx`,
  `packages/api/src/routers/domains/teams.ts` (this is the invite call path),
  and test files (`api-key-crypto.test.ts`, `vitest.config.ts`).

### Phase 5 — Robustness (recommended, not required)

- **Don't let a send failure 500 the auth flow.** Wrap `sendEmail` calls so a
  delivery error is logged but doesn't break signup/reset where appropriate, OR
  surface it intentionally. Match existing audit-hook philosophy ("must never
  fail the auth response").
- **Retry transient errors** (`E_RATE_LIMIT_EXCEEDED`, `E_DELIVERY_FAILED`,
  `E_INTERNAL_SERVER_ERROR`) with exponential backoff. Don't retry validation
  errors (`E_VALIDATION_ERROR`, `E_SENDER_NOT_VERIFIED`).
- **Suppression handling:** `E_RECIPIENT_SUPPRESSED` means the address bounced
  or marked spam — treat as a known dead address, don't retry.
- **Tests:** the binding can't be imported in vitest (no `cloudflare:workers`
  outside workerd). Mock `sendEmail` (the helper boundary), per the repo's
  mock-the-boundary test convention — not the Cloudflare binding itself.

### Phase 6 — Verify before claiming done

1. Local: `"remote": true`, run `npx wrangler dev` in `apps/server`, trigger a
   password reset to a real test address, confirm receipt.
2. Remove `"remote": true`, deploy `apps/server`.
3. Production: trigger one real reset + one real invite; confirm delivery and
   that headers show DKIM=pass / SPF=pass / DMARC=pass (view raw headers in
   Gmail). Check the Email Sending analytics in the Cloudflare dashboard.

---

## Rollback

The provider lives entirely in `packages/auth/src/email.ts`. To revert, restore
the Resend implementation in that one file and re-add `RESEND_API_KEY`. Call
sites don't change. (This is the payoff of the abstraction — keep it even if we
later move to SES.)

## When to revisit SES

If we ever push **millions of transactional emails/month** or need features
Cloudflare lacks (advanced templating, dedicated IPs, deep analytics), Amazon
SES is the cheapest battle-tested engine (~$0.10/1k). From Workers it needs
SigV4 signing (use `aws4fetch`, not the heavy AWS SDK). Because of the
`sendEmail()` abstraction, that becomes a one-file swap — no need to decide now.
```