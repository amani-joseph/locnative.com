# Clivly — User-Flow & Configuration Redesign Proposal

Author: Locnative (from a production integration on TanStack Start + Cloudflare Workers + BetterAuth)
Date: 2026-07-26
Companion to: `clivly-developer-experience-feedback.md` (the bug/robustness log). This
document is the forward-looking UX proposal it points to.

---

## 1. Executive summary

Getting Clivly connected today means walking a **5-step full-page onboarding
wizard** (`token → connect → sync → configure → verify`) *and* a **separate,
disconnected chat-widget flow** buried in `Settings → Chat widget`, while
hand-managing **three host-side secrets** (plus two more when self-hosting). It
works, but it feels heavy, and the two journeys don't feel like one product.

This proposal argues for three changes, each grounded in what established
open-source and developer-tool companies already do:

1. **Collapse the secret model to two keys** — one *publishable* key (safe in the
   browser/build) and one *secret* key (server-only) — and **derive everything
   else** (sync-trigger secret, verify token, widget-token secret) from the
   secret key. Target: **1 secret + 1 public key**, down from 3–5 values.
2. **Move first-run configuration out of settings routes and into in-context
   dialogs** — a Supabase-style **"Connect" dialog** and a Chatwoot-style **"Add
   widget" dialog** — launchable from anywhere, with the developer's real values
   pre-filled. Settings becomes *manage/rotate*, not *first-run setup*.
3. **Collapse the connection journey from five pages into one modal with live
   detection** — `npx clivly connect` writes `.env` and scaffolds routes; the
   dashboard shows a single "waiting for first ping" state that auto-advances.

The through-line: **fewer secrets, fewer steps, fewer places to look, and the
product doing the work instead of the developer.**

---

## 2. Current-state map — what a developer actually does today

Reconstructed from the Clivly web app (`apps/web/src/routes/onboarding/*`,
`settings/*`, `components/chat-widget/*`).

**Journey A — connect the app (5 full-page steps):**

| Step | Route | Asks the developer to… |
| --- | --- | --- |
| 1 | `/onboarding` | Create workspace |
| 2 | `/onboarding/token` | Copy `CLIVLY_API_KEY` (secret) |
| 3 | `/onboarding/connect` | Paste into `.env`, run `npx clivly …`, wire trigger + verify |
| 4 | `/onboarding/sync` | Run first sync; observe SDK-connected + sync-result (465-line page) |
| 5 | `/onboarding/configure` + `/onboarding/verify` | Map data; confirm connection |

**Journey B — the chat widget (entirely separate, in Settings):**
`Settings → Chat widget` → `create-widget-dialog` → `widget-settings-form` →
`widget-installation-card` (snippet) → set `VITE_CLIVLY_WIDGET_ID` in the host
app → add the session route → set `CLIVLY_WIDGET_TOKEN_SECRET` on the server.

**Secret inventory a full integration touches:**

| Value | Kind | Where |
| --- | --- | --- |
| `CLIVLY_API_KEY` | secret | host app |
| `CLIVLY_SYNC_TRIGGER_SECRET` | secret | host app **and** Clivly (two copies must match) |
| `CLIVLY_VERIFY_TOKEN` | secret | host app |
| `CLIVLY_WIDGET_TOKEN_SECRET` | secret | Clivly server |
| `CLIVLY_TRIGGER_SECRET_WRAPPING_KEY` | secret | Clivly server (self-host) |
| `VITE_CLIVLY_WIDGET_ID` | public slug | host app build |
| `CLIVLY_SYNC_TRIGGER_URL` | config | host app |

That's **3 host-side secrets** to source, place, and (for the trigger secret)
keep in sync across two systems — before the widget's separate config even starts.

---

## 3. Diagnosis — why it feels complex

- **D1. Two products, two journeys.** "Connect the app" (sync) and "add the chat
  widget" are configured in different places with different mental models, so the
  developer never feels *one* setup. The widget flow doesn't reuse anything the
  connect flow already established.
- **D2. Secret sprawl with unclear ownership.** Three host secrets, one of which
  (`SYNC_TRIGGER_SECRET`) must be identical in two systems. "Which secret lives
  where, and which two copies must match" is the single hardest part of setup and
  fails late and opaquely (we chased a signed-trigger `401` that was exactly this).
- **D3. Config lives in destination-style settings routes.** First-run work is
  spread across full-page routes the developer must navigate *to*, rather than a
  focused task surface that comes *to them*. Settings pages are for returning to
  manage something — not for a first-time linear task.
- **D4. Manual where it could be automatic.** Framework, schema location, route
  scaffolding, and secret placement are largely hand-done, when the CLI already
  has enough context to do them (it detects Drizzle + framework during `init`).

---

## 4. How established OSS / dev-tools solve this (the research)

| Product | Key model | First-run surface | Live feedback |
| --- | --- | --- | --- |
| **Supabase** | `sb_publishable_…` (safe to expose) + `sb_secret_…` (backend, full access) | **"Connect" dialog** hands you the right key + snippet per framework | — |
| **Clerk / Stripe / PostHog / Liveblocks** | publishable key (frontend) + secret key (backend), split by trust boundary | Dashboard copy-paste with `.env` snippet | — |
| **Sentry** | one public DSN + one build auth-token (CI only) | `npx @sentry/wizard@latest -i nextjs` auto-configures; **agent-assisted** setup for Claude Code/Cursor | in-product "waiting for first event," auto-advances |
| **Chatwoot** | **one public website token** | **inbox-creation dialog** holds *all* widget config (name, domain, color, welcome heading, greeting) → then one copy-paste snippet | — |
| **Convex / Trigger.dev** | keys written by CLI | `npx … init`/`dev` writes `.env` automatically | dashboard live-detects first connection/run |

**The four ideologies worth stealing:**

1. **Two keys, split by trust boundary** (Supabase/Clerk/Stripe). One public, one
   secret. Nothing else for the developer to manage.
2. **Configuration as an in-context dialog, not a settings page** (Supabase
   Connect, Chatwoot inbox creation). The task comes to you, pre-filled.
3. **The CLI/agent does the wiring** (Sentry wizard, Convex, Trigger.dev). Detect
   the framework, write the `.env`, scaffold the routes.
4. **Live "waiting for first signal" that self-advances** (Sentry, Convex,
   Trigger.dev). No manual "click verify" — the product notices success.

---

## 5. Proposal A — Two keys, derive the rest

**Adopt the publishable/secret split** and eliminate the standalone secrets.

| Today (host side) | Proposed | How |
| --- | --- | --- |
| `CLIVLY_API_KEY` (secret) | `clivly_sk_…` (secret) | renamed, same role; server-only |
| `VITE_CLIVLY_WIDGET_ID` (public slug) | `clivly_pk_…` (publishable) | one publishable key identifies the org + widget in the browser; **replaces the raw slug** |
| `CLIVLY_SYNC_TRIGGER_SECRET` | *(derived)* | `HKDF(sk, "clivly:sync-trigger")` — both sides derive it; nothing to copy or keep in sync |
| `CLIVLY_VERIFY_TOKEN` | *(derived)* | `HKDF(sk, "clivly:verify")` |
| `CLIVLY_WIDGET_TOKEN_SECRET` (server) | *(derived or auto-gen)* | derive from the org secret, or generate-and-persist on first boot |
| `CLIVLY_TRIGGER_SECRET_WRAPPING_KEY` (self-host) | `CLIVLY_MASTER_KEY` (one) | single root for self-host; derive the rest |

**Result for a Cloud host app: `clivly_sk_…` (secret) + `clivly_pk_…` (public).
Two values, one per trust boundary, nothing to keep in sync.** Rotating the
secret key rotates every derived secret automatically.

Rationale is exactly Supabase's guidance: publishable keys are "safe to expose …
web page, mobile app, CLIs, source code"; secret keys are "only use in backend
components." Callback-verification secrets are an *implementation detail of the
secret key*, not something a human should ever hand-copy.

*(If independent secrets are required for rotation isolation, fall back to
**issuing** them at boot — the SDK fetches them using `sk` and caches — so the
developer still only ever configures two values. See feedback doc, Secrets §.)*

---

## 6. Proposal B — Configuration in dialogs, not settings routes

Replace first-run settings-page work with two **launch-from-anywhere dialogs**
(command palette, dashboard CTA, empty states). Settings keeps only *manage,
rotate, delete*.

### B1. The "Connect" dialog (Supabase-style)

```
┌─ Connect Clivly ───────────────────────────────┐
│  Framework:  [ TanStack Start ▾ ]  (auto-detected)│
│                                                 │
│  1  Run in your project:                        │
│     ┌───────────────────────────────────────┐   │
│     │ npx clivly connect                    ⧉│   │
│     └───────────────────────────────────────┘   │
│     Writes .env, scaffolds routes, links this org.│
│                                                 │
│  2  Or paste keys manually:                     │
│     CLIVLY_SECRET_KEY=clivly_sk_live_…        ⧉ │
│     CLIVLY_PUBLISHABLE_KEY=clivly_pk_live_…   ⧉ │
│                                                 │
│  ● Waiting for first connection…  (live)        │
└─────────────────────────────────────────────────┘
```

- Framework picker changes the snippet (Next / TanStack / SvelteKit / Remix /
  Nuxt / Hono-Workers), **keys pre-filled**.
- The live "waiting for first connection" row auto-advances to ✅ the moment the
  SDK heartbeats — no manual "verify" step.

### B2. The "Add chat widget" dialog (Chatwoot-style)

All widget config in **one creation dialog** — no raw SQL, no separate settings
trek, no `crm_widgets` INSERT:

```
┌─ Add chat widget ──────────────────────────────┐
│  Name           [ Support ]                      │
│  Allowed origins[ https://locnative.com     + ]  │
│  Greeting       [ Hi! How can we help? ]         │
│  Brand color    [ ● #22c55e ]      ┌───────────┐ │
│                                    │  PREVIEW   │ │
│  [ Create widget ]                 │  ▢ Support │ │
│                                    └───────────┘ │
└─────────────────────────────────────────────────┘
        ↓ after Create
┌─ Install ───────────────────────────────────────┐
│  Your publishable key is already set. Add:       │
│  <ClivlyChatWidget widgetId="support" />       ⧉ │
│  ● Waiting for first widget session…  (live)     │
└─────────────────────────────────────────────────┘
```

This is the single biggest UX win for the widget: it replaces
"hand-write an `INSERT INTO crm_widgets …`, then set a build var, then add a
route, then set a server secret" with **one dialog + one line of JSX**, because
the publishable key already carries identity and the session route is scaffolded.

### B3. Where dialogs beat settings pages

- **Launchable in context** — from the dashboard's empty state, the command
  palette (`⌘K → "Add widget"`), or a docs deep-link — not navigated-to.
- **Pre-filled with the org's real values**, so copy-paste "just works."
- **Ephemeral + focused** — one task, dismissible, with a live success signal,
  rather than a persistent page the developer must interpret.

---

## 7. Proposal C — One connection flow, CLI + agent driven, live-detected

Collapse the 5-step onboarding into **one path with three entry modes**, all
ending in the same live "waiting for first signal" state:

- **CLI (default):** `npx clivly connect` → detect framework + Drizzle schema →
  write `.env` (both keys) → scaffold the sync + widget-session routes → done.
  (This is Sentry's wizard / Convex's `npx convex dev` model.)
- **Agent-assisted:** ship a `clivly` setup skill/prompt (Sentry already does this
  for Claude Code, Cursor, Codex) so an AI agent wires it end-to-end. *Given
  Clivly's audience, this is high-leverage.*
- **Manual:** the "Connect" dialog (B1) for teams who want to paste keys.

The four separate onboarding pages (`token/connect/sync/verify`) become **one
modal with a live checklist** that self-advances as signals arrive (SDK
heartbeat → first sync → widget session), rather than four pages the developer
clicks through and manually verifies.

---

## 8. Proposed end-to-end flows (before → after)

**Connect the app**
- *Before:* 5 pages · copy API key · edit `.env` · run CLI · wire trigger+verify
  secrets · run sync · click verify.
- *After:* `npx clivly connect` (or the Connect dialog) → keys written, routes
  scaffolded → dashboard flips to ✅ on first heartbeat. **1 command, 2 keys.**

**Add the chat widget**
- *Before:* raw `crm_widgets` SQL · set `VITE_CLIVLY_WIDGET_ID` · add session
  route · set `CLIVLY_WIDGET_TOKEN_SECRET` · redeploy · discover 400s by hand.
- *After:* "Add widget" dialog (name/origins/greeting/color + live preview) →
  Create → paste one `<ClivlyChatWidget widgetId="…" />` line (publishable key
  already set, route already scaffolded) → live "first session" ✅. **1 dialog, 1
  line.**

---

## 9. Mapping to Clivly's current architecture

- **Keys:** introduce `clivly_pk_`/`clivly_sk_` alongside today's API key
  (Supabase shipped exactly this dual-run migration — old keys keep working until
  disabled). Widget bootstrap accepts the `pk` in place of the raw slug.
- **Derivation:** the backend already holds the org secret; add an HKDF step for
  the trigger/verify/widget secrets so both sides derive instead of store.
- **Dialogs:** you already have `create-widget-dialog`, `widget-settings-form`,
  `widget-preview`, `widget-installation-card` — B2 is largely **re-composing
  existing components into one create→install dialog** and dropping the raw-SQL
  path. `connection-journey.ts` already models the states B1/C need.
- **CLI:** `clivly init` already detects framework + Drizzle; `clivly connect`
  extends it to also scaffold the widget-session route and write both keys.
- **Live detection:** the SDK heartbeat + `integrations` state already exist; wire
  them to the dialog's "waiting" rows.

---

## 10. Phased roadmap

- **P0 (biggest felt relief, low risk):**
  - Publishable/secret key split; **derive** `SYNC_TRIGGER_SECRET` + `VERIFY_TOKEN`
    from `sk` (removes the two-copy sync and one secret outright).
  - `clivly widget create` CLI + the create→install **dialog**; delete the raw-SQL
    path.
- **P1:**
  - `npx clivly connect` one-shot (framework detect, write `.env`, scaffold sync
    **and** widget routes).
  - "Connect" dialog with live "waiting for first connection."
  - Fold widget provisioning + a real test-session check into `clivly doctor`.
- **P2:**
  - Agent-assisted setup skill (Claude Code/Cursor/Codex).
  - Collapse the 4 onboarding pages into one live self-advancing modal; settings
    becomes manage-only.
  - Self-host: single `CLIVLY_MASTER_KEY`, derive/auto-generate server secrets.

---

## 11. Risks & migration

- **Key migration must be non-breaking.** Run old `CLIVLY_API_KEY` and new
  `clivly_sk_` simultaneously; deprecate on a published timeline (Supabase's model).
- **Derived secrets change rotation semantics.** Rotating `sk` rotates all derived
  secrets — document it, and offer the "issue independent secrets" fallback (§5)
  for teams that need per-callback rotation isolation.
- **Publishable key exposure.** It must be genuinely safe in the browser: it
  identifies, authorizes nothing on its own (the backend `sk` authorizes
  sessions), and is origin-scoped — same posture as Supabase publishable / Stripe
  `pk` / Chatwoot website token.
- **Scaffolding into unknown project layouts.** Keep the manual dialog path as the
  always-available fallback when detection is ambiguous (monorepos especially).

---

## 12. The one-sentence version

Give developers **two keys instead of five secrets**, configure through **two
dialogs instead of a settings maze**, and let **`npx clivly connect` + live
detection** do the wiring — the same moves Supabase, Clerk, Sentry, and Chatwoot
already made.
