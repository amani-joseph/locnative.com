# Clivly Developer Experience Feedback

Updated: 2026-07-25

## Context

This document captures the friction encountered while integrating Clivly into the `locnative.com` monorepo and while attempting to retrieve the required Clivly credentials for local setup.

## Confirmed Friction Points

1. `clivly init` partially understands monorepos but still produces broken output in shared-package layouts.
It correctly detected `apps/web` as the app root and recognized `TanStack Start`, `drizzle`, and `better-auth`, but the generated config imported a non-existent Drizzle instance path and pointed the auth route at a bad relative import.

2. `clivly init` inferred an invalid placeholder contact mapping.
The repo has `users`, `teams`, and `team_members`, but no literal `contacts` table. The scaffold still generated `schema.contacts` and a relationship via `team_members.team_id`, which was not usable as-is.

3. `clivly` must be added to the app package that imports it, but the scaffold was executed from a different workspace.
The CLI generated files under `apps/web` while the dependency originally lived under `apps/server`. That left the generated app importing `clivly/*` without a direct dependency declaration.

4. `clivly status` assumes local env discovery is trivial, which breaks in split web/server workspaces.
The generated config initially used a DB import path that pulled in the full server env contract. In this repo that caused unrelated env validation failures instead of a clean “database not reachable” or “missing DATABASE_URL” error.

5. CLI pairing is disabled on the production Clivly backend.
`clivly login --no-browser` reached the server once network access was allowed, but the backend responded that CLI pairing is not enabled. This blocks the documented onboarding flow even though the package README positions `clivly login` as the normal next step after `init`.

6. Dashboard login currently requires client-side JavaScript inspection when working without an interactive browser.
The `/sign-in` page renders a loading shell and hydrates client-side. This makes headless HTTP-only login discovery harder than necessary.

7. Local verification still depends on external network reachability without clearly separating product issues from environment issues.
`clivly status` now loads config successfully, but sample fetch and namespace checks fail when the Neon database connection cannot be reached from the current environment. The error surface does not clearly distinguish “integration is structurally correct” from “external database/network unavailable.”

8. The authenticated dashboard flow is discoverable through RPC, but not transparently documented.
After signing in, the practical API-key creation path turned out to be a POST RPC call to `/rpc/tokens/create`, not an obvious REST endpoint or clearly documented manual flow. The dashboard bundle was required to discover the exact procedure names (`tokens.create`, `tokens.list`, `tokens.regenerate`, `tokens.revoke`).

9. Self-hosted onboarding and generated env placeholders do not line up cleanly.
The generated local env placeholders imply that `CLIVLY_SYNC_TRIGGER_SECRET` and `CLIVLY_VERIFY_TOKEN` are always part of setup, but the current self-hosted onboarding flow shows verification as automatic and does not expose a separate manual verify-token step in the product UI.

10. Browser-based validation and screenshots are harder than they should be in restricted environments.
The dashboard relies heavily on client-side hydration. That is workable in a normal browser, but it makes debugging and evidence capture brittle in constrained environments where browser automation is limited or unavailable.

11. `clivly dev` gets very close to a working cloud-sync loop, but the secret handoff is still fragile.
The tunnel command successfully registered a public callback URL with Clivly, and the hosted integration flipped to `configured: true` once a trigger secret was minted. However, signed trigger tests still returned 401 from the host app even after the same secret was added locally and the app was restarted. That makes the final “Run sync” step difficult to trust in a real setup session.

12. The chat-widget bootstrap path currently fails too hard when upstream Clivly connectivity breaks.
In this repo, the generated `/api/clivly/chat/session` route produced an unhandled 500 with a runtime error page when the upstream `fetch()` to Clivly failed. For a customer-facing chat widget, that is too brittle: the host app should receive a controlled JSON error and keep rendering normally even when Clivly is unavailable or misconfigured.

## Recommendations For The Clivly Team

1. Make `clivly init` monorepo-aware enough to generate package imports, not guessed relative filesystem imports.
For this repo, imports like `@locnative/auth` and `@locnative/database` are the stable integration surface. The scaffold should prefer package boundaries when they exist.

2. Add an explicit “shared schema / shared db package” prompt or flag.
The CLI should let the user provide:
`--schema`
`--db-import`
`--auth-import`
This would eliminate most post-scaffold surgery in workspace repos.

3. Do not generate placeholder entity mappings that reference nonexistent schema members.
If no suitable contact table exists, emit a TODO-only block instead of producing `schema.contacts` and a broken relationship example.

4. Keep the documented onboarding path aligned with backend reality.
If `clivly login` is disabled on the hosted service, the docs and CLI should say so up front and point the user directly to the dashboard-based manual credential path.

5. Provide a documented manual credential path in the CLI output.
When CLI pairing is unavailable, print the exact dashboard locations for:
API key creation
verify token
remote sync trigger secret
trigger URL expectations

6. Make `clivly status` more environment-aware.
It should classify failures into:
configuration errors
credential errors
network reachability errors
database connection errors
This would make the diagnosis much faster.

7. Add a lightweight non-browser auth flow for headless setups.
A device-code style flow or API-token bootstrap would be materially better than requiring a browser when the developer already has valid account credentials.

8. Document the manual API-key management path explicitly.
At minimum, the docs should name the dashboard section and the underlying behavior:
Settings → API keys
token is only shown once
regeneration revokes the previous token

9. Make self-hosted vs cloud-mode setup requirements visually distinct.
If remote sync trigger URL, trigger secret, or verify token only matter in certain modes, the CLI and dashboard should say that directly instead of presenting every env var as equally mandatory.

10. Tighten the `clivly dev` tunnel story.
If `clivly dev` says “Dashboard-triggered sync now points at this local session,” it should also make the secret handshake unambiguous:
show whether it expects `.env` or `.dev.vars`
show whether it generated or reused a signing secret
offer a one-shot end-to-end verification instead of leaving the user to discover 401s from a separate dashboard test

11. Make the chat session helper fail closed with a structured response instead of surfacing framework-level 500s.
If `createChatSessionHandler` cannot reach Clivly, it should consistently return a JSON `502` or similar application error, not rely on host-framework behavior around thrown fetch failures. That would make production integration safer and make debugging much clearer.

## Integration Notes For This Repo

1. Clivly is currently scaffolded in `apps/web`.

2. The generated integration had to be rewritten to:
use `users` as contacts
use `teams` as companies
load local env from `apps/server/.env` for CLI use
add a Drizzle introspector
use existing workspace package imports

3. The Clivly API key is now generated and stored locally in `apps/web/.env`.

4. Local validation now succeeds:
`pnpm --dir apps/web exec clivly status`
`pnpm --dir apps/web exec clivly connect`
`pnpm --dir apps/web exec clivly doctor`

5. The only remaining warning in local CLI validation is optional for self-hosted development:
`CLIVLY_SYNC_TRIGGER_URL` is unset, so Clivly Cloud cannot call this local app for remote sync. The CLI explicitly notes that push-only setups can ignore this until deployment.

6. The production backend still has CLI pairing disabled, so manual dashboard or RPC-based credential retrieval remains necessary.

7. Screenshot capture of the live dashboard could not be completed from this environment.
Authentication worked and the dashboard RPC/API behavior was confirmed, but local browser automation failed at the OS/runtime layer before screenshots could be produced.

8. Clivly onboarding advanced to the `sync` step, but the final signed trigger still fails.
As of Saturday, July 25, 2026, the workspace has:
generated API token
live SDK heartbeat
starter mappings applied for contacts and companies
configured remote sync URL and secret in the hosted integration

The remaining failure is the signed trigger test, which currently returns 401 from the host app during:
`integrations.testSyncTrigger`
`mappings.runSync`

9. The chat widget integration needed an additional host-side safeguard after deployment testing.
The first implementation used a default public widget slug of `support` and mounted the widget globally on every route. In practice that was too optimistic for production:
the widget should not mount unless `VITE_CLIVLY_WIDGET_ID` is explicitly configured
the host-side session bootstrap route should catch all upstream connectivity failures and return structured JSON instead of bubbling a runtime error page

---

# Round 2 — Robustness & Configuration (2026-07-26)

Gathered while getting the chat widget fully working in production on
`locnative.com` (Cloudflare Workers host). Each item below is backed by a
concrete failure we hit and fixed this session; together they point at a few
systemic robustness gaps rather than one-off bugs.

## R1. The documented session handler is not exported from the package you install — HIGH

The chat-widget guide says the backend route is a few lines:

```ts
import { createChatSessionHandler } from "@clivly/sdk";
export const POST = createChatSessionHandler({ apiKey: process.env.CLIVLY_API_KEY });
```

But `createChatSessionHandler` is **not exported from the installed `clivly`
package** (`clivly@0.4.x`), and `@clivly/sdk` is not what `clivly init` installs.
So every host that follows the guide is forced to **hand-write the proxy**, and a
hand-written proxy silently drifts from the real backend contract. We hit *two*
separate 400s this way, both of which the SDK handler already gets right:

- **`origin` must be in the request _body_, not just the header.** The backend
  validates `body.origin`; forwarding it only as a header returns `400
  invalid_body`. The SDK handler includes it in the body — the hand-rolled one
  didn't.
- **`visitorToken: null` must be accepted.** The widget sends `visitorToken:
  null` (not `undefined`) for a first-time visitor. A validator that only allows
  `undefined | string` rejects the real payload with `400 invalid_payload`. The
  SDK's own validator explicitly allows `null`; the hand-rolled copy didn't.

**Why it matters:** this is the single biggest robustness win available. The
contract is subtle enough that hand-reimplementation is a trap, yet the package
forces exactly that. **Fix:** export `createChatSessionHandler` from the `clivly`
package people actually install, and have `clivly init` (or a `clivly add widget`
command) scaffold the session route the same way it scaffolds sync routes — so
nobody hand-writes the contract.

## R2. The generated `clivly.config.ts` crashes on edge/Workers runtimes — HIGH

The scaffolded config runs Node-only code at **module scope**:
`dirname(fileURLToPath(import.meta.url))` plus `dotenv` filesystem reads. On
Cloudflare Workers `import.meta.url` is `undefined`, so `fileURLToPath` throws at
import time. Because the config is imported by the `/api/clivly/*` routes, this
took down **every request on the deployed site with a 500** (`TypeError: The
"path" argument must be of type string…`), including routes that have nothing to
do with Clivly. It built fine and only failed at runtime on the edge.

**Fix:** generate an edge-safe config. Guard all filesystem/`.env` loading behind
a runtime check (e.g. `if (import.meta.url)` / detect Node) so the config body is
inert on Workers, where env comes from bindings on `process.env` already. Given
Clivly's own keywords target serverless/edge (and the reference host app is
Workers), the scaffolder should assume edge by default.

## R3. Backend request validation is too strict — apply Postel's law — MEDIUM

Both widget-session 400s trace to the backend rejecting reasonable input:
- `origin` accepted from the body only, never from the (already-present) `Origin`
  header.
- `visitorToken` distinguishing `null` from `undefined`/absent.

**Fix:** be liberal in what you accept. Read `origin` from the body *or* the
`Origin` header; treat `null`, `undefined`, and missing `visitorToken`
identically. This one change would have prevented both production 400s
regardless of how the proxy was written.

## R4. No widget-management path — raw SQL into a production DB — MEDIUM

Provisioning a widget means hand-writing an `INSERT INTO crm_widgets (...)` with
a `gen_random_uuid()::text` id, a JSONB origin allowlist, and a JSONB `config`
that must contain exactly `greeting` + `brandColor`. There is no UI and no CLI
for it, so the first-run experience is "hand-craft SQL against prod." Easy to get
the org id, JSON shape, or origin exact-match wrong.

**Fix:** ship `clivly widget create --slug support --origin https://app.com
--greeting "…" --brand "#22c55e"` (and `widget list`). It already has the API key
and org context; it can insert the row correctly and echo the `VITE_CLIVLY_WIDGET_ID`
to set. Raw SQL should never be step 1.

## R5. Nothing validates the widget end-to-end before production — MEDIUM

`clivly status`/`doctor` walk credentials, config, sources, and heartbeat — but
never actually **mint a test widget session**. So a fully "green" setup still
failed the real POST in three different ways (config, origin, visitorToken). A
single dry-run that POSTs a synthetic session and reports the exact backend error
would have caught all of it locally.

**Fix:** add `clivly widget check --slug support` that performs the real session
handshake against the backend and prints the concrete failure
(`widget_not_found` / `invalid_body` / `origin_not_allowed` / `widget_not_configured`),
mirroring the troubleshooting table. Fold it into the `doctor` ladder when a
widget is configured.

## R6. Widget surfaces opaque errors to the end user and the developer — LOW/MEDIUM

The visitor-facing widget renders "Chat session request failed with 400." with no
discriminator, and nothing distinguishes `invalid_payload` (host proxy) from
`invalid_body` (backend) from `widget_not_found`. We could only tell them apart
by capturing the network body in a headless browser.

**Fix:** in dev mode, log the structured upstream error to the console; keep the
friendly message for visitors but include a machine-readable `code` the developer
can see.

---

# Round 2 — Secret sprawl: fewer secrets to configure (HIGH, DX)

**This is the configuration pain we feel most.** A full host-app integration
(sync + widget) currently makes a developer source and keep in sync a pile of
distinct `CLIVLY_*` values across two or three places. Inventory of what a real
integration touches:

| Env var | Kind | Set where | Needed for |
| --- | --- | --- | --- |
| `CLIVLY_API_KEY` | **secret** | host app | everything (root credential) |
| `CLIVLY_SYNC_TRIGGER_SECRET` | **secret** | host app **and** Clivly | verifying Cloud→host sync callbacks |
| `CLIVLY_VERIFY_TOKEN` | **secret** | host app | verify step |
| `CLIVLY_WIDGET_TOKEN_SECRET` | **secret** | Clivly server | signing widget session tokens |
| `CLIVLY_TRIGGER_SECRET_WRAPPING_KEY` | **secret** | Clivly server | encrypting the stored trigger secret |
| `CLIVLY_SYNC_TRIGGER_URL` | config | host app | public callback origin |
| `VITE_CLIVLY_WIDGET_ID` | public slug | host app (build) | widget identity |
| `CLIVLY_API_URL` | config | host app | backend override |
| `CLIVLY_CLI_PAIRING_ENABLED`, `CLIVLY_SDK_TRIGGER_URL_OVERRIDE_ENABLED`, `CLIVLY_ENV_KEYS`, `CLIVLY_INSTALL_SPEC`, `CLIVLY_DEV_PATTERN` | flags/config | Clivly server | various |

That is **3 secrets on the host side alone** (`API_KEY`, `SYNC_TRIGGER_SECRET`,
`VERIFY_TOKEN`) plus **2 more** if self-hosting the server — for one product.
The mental model "which secret lives where, and which two copies must match" is
the hardest part of setup, and a mismatch fails late and opaquely (we chased a
signed-trigger `401` that was exactly this).

**The core observation:** the **API key already proves the host app's identity to
Clivly.** Every other host-side secret is a *shared secret for verifying
Clivly→host callbacks* — and those don't need to be human-managed at all.

### Proposals, in order of preference

1. **Derive callback secrets from the API key; stop configuring them.** Make the
   sync-trigger signing key and verify token a deterministic function of the API
   key (e.g. `HKDF(api_key, "clivly:sync-trigger")`). Both sides derive the same
   value, so there is **nothing to copy and nothing to keep in sync** — rotating
   the API key rotates everything. Net host-side secrets: **1** (`CLIVLY_API_KEY`).

2. **If they must stay independent, issue them — don't ask for them.** `clivly
   login` already writes `CLIVLY_API_KEY` + `CLIVLY_SYNC_TRIGGER_SECRET` to
   `.env`. Extend that so the SDK **fetches** any callback secret at boot using
   the API key (short-lived, cached), so the developer never hand-copies a second
   secret. Net human-managed secrets: **1**.

3. **Auto-generate server-side secrets on first boot.** `CLIVLY_WIDGET_TOKEN_SECRET`
   and `CLIVLY_TRIGGER_SECRET_WRAPPING_KEY` are currently hard prerequisites that
   fail with a 503/500 at the worst moment. For self-host, generate-and-persist
   them on first run (or derive from a single `CLIVLY_MASTER_KEY`) instead of
   making each a separate manual prerequisite.

4. **Collapse the namespace and document tiers.** Regardless of the above,
   publish a single table: "Cloud users set exactly these N; self-hosters add
   these M." Today it is genuinely hard to tell which of the ~12 `CLIVLY_*` vars a
   plain Cloud + widget user actually needs (answer: `CLIVLY_API_KEY` +
   `VITE_CLIVLY_WIDGET_ID`, everything else optional/derived) — and that clarity
   alone would remove most of the felt burden.

**Target end-state for a Cloud host app:** one secret (`CLIVLY_API_KEY`) and one
public slug (`VITE_CLIVLY_WIDGET_ID`). Everything else derived, issued, or
defaulted.
