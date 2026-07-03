# UI Research Brief — Webhooks Manager

Dashboard surface for managing zone entry/exit event webhook subscriptions.

Sources audited:
- `packages/api/src/routers/public/webhooks.ts` (shipped public API)
- `apps/server/src/queues/webhook-delivery.ts` (delivery worker)
- `apps/server/src/queues/hmac.ts` (signing)
- `packages/database/src/schema/webhooks.ts` (table)
- `apps/web/src/routes/_protected/api-keys.tsx` (mirror UX pattern)
- `apps/web/src/lib/orpc.ts`, `packages/api/src/routers/index.ts`, `packages/api/src/routers/domains/{api-keys,projects}.ts`

---

## Endpoints / Data

### Shipped public API (apiKeyAuth, `/api/v1/webhooks`) — NOT used by dashboard
`packages/api/src/routers/public/webhooks.ts` exposes three procedures, all scoped to the API key's `projectId`:

- **`createWebhook`** — `POST /api/v1/webhooks`
  - Input: `{ url: string().url(), events: ("entry"|"exit")[] min 1, default ["entry","exit"], zoneId?: positive int }`
  - Generates secret via `generateWebhookSecret()`, stores only `secretEnc` (encrypted), sets `active: true, failing: false`.
  - Returns `{ id, url, events, zoneId, active, createdAt, secret }` — the plaintext **`secret` is returned ONCE** and never retrievable again (no decryptable read path for the UI).
- **`listWebhooks`** — `GET /api/v1/webhooks`
  - Returns `{ results: [{ id, url, events, zoneId, active, failing, createdAt }], count }`. No `secret`, no `secretEnc`.
- **`deleteWebhook`** — `DELETE /api/v1/webhooks/{id}`
  - Input `{ id }`. Returns `{ id, deleted: true }`. Scoped by `projectId` + `id`.

There is **no** reactivate, no update/edit, and **no test-send** endpoint in the public API.

### Database table — `webhook_subscriptions` (`schema/webhooks.ts`)
`id` (int identity PK), `project_id` (uuid, FK projects, cascade), `zone_id` (int, FK zones, cascade, **nullable** = all zones), `url` (text), `events` (text[], default `{entry,exit}`), `secret_enc` (text, encrypted), `active` (bool, default true), `failing` (bool, default false), `created_at` (tz timestamptz). Indexed on project_id and zone_id. **No delivery-log / delivery-history table exists.**

### Delivery behavior (`webhook-delivery.ts`)
- Queue message `WebhookDeliveryMessage { type, projectId, deviceId, lat, lng, zoneId, zoneName, event, timestamp }`.
- Matches subs: same project, `active=true`, `failing=false`, (zoneId match OR zoneId NULL), and event in `events[]`.
- Payload POSTed: `{ event, zone: { id, name }, device: { id, lat, lng }, timestamp }` (JSON).
- Signs with `hmacSign(secret, payload)` → header **`X-Locnative-Signature`** (HMAC-SHA256). Also sends `X-Locnative-Attempt`. 10s timeout per attempt.
- Retries up to `MAX_ATTEMPTS = 3`; if all fail (or secret decrypt fails) it sets **`failing: true`** and stops delivering to that sub. A `failing` sub is permanently excluded from delivery until something flips `failing` back to false — **and nothing in the codebase ever clears it.** This is the core reason a reactivate endpoint is needed.

---

## oRPC procedures to add (Decision A: session-authed `appRouter`)

`appRouter` (`packages/api/src/routers/index.ts`) currently registers: `apiExplorer, apiKeys, auth, dashboard, projects`. There is **no `zones` and no `webhooks` domain router** today. Add a new `webhooksRouter` domain (mirroring `domains/api-keys.ts`), built on `protectedProcedure` (which enforces `context.session`).

Scope note: session procedures resolve the user via `context.session.user.id`, then to that user's project(s) via the `projects` table (see `domains/projects.ts` `list`). A user may own multiple projects. The webhooks procedures need a `projectId` input (validated to belong to the session user) — the dashboard should pass the active/selected project, same way `projects.assignApiKey` takes `projectId: z.string().uuid()` and verifies ownership.

Procedures to implement in `webhooks.create/list/delete` (re-implement against session+projectId, do NOT call the public apiKey procedures):

- **`webhooks.list`** — input `{ projectId }`; returns rows `{ id, url, events, zoneId, active, failing, createdAt }`. Verify project belongs to session user.
- **`webhooks.create`** — input `{ projectId, url, events[], zoneId? }`; generate + encrypt secret; return `{ ...row, secret }` (plaintext once). Reuse `generateWebhookSecret`/`encryptSecret` exported from `@locnative/api` (`secret-crypto.ts`).
- **`webhooks.delete`** — input `{ projectId, id }`; scoped delete; returns `{ id, deleted: true }`.

### NEW backend additions to recommend (do not exist yet — flag for human sign-off)

- **`webhooks.reactivate`** (RECOMMENDED, blocking for a usable UI) — input `{ projectId, id }`; sets `failing: false` (and ensures `active: true`). Without this there is **no way** for a user to recover a `failing` subscription from the dashboard. No equivalent exists in the public API; this is a genuinely new backend capability.
- **`webhooks.test`** / "send test event" (OPTIONAL) — would synthesize a sample delivery payload, sign it, POST to the sub's URL, and report success/failure. Requires new server code (signing + fetch out of the worker, or enqueuing a delivery message). Needs design decision on whether it bypasses `failing` and whether a success auto-clears `failing`.
- **`webhooks.update`** (OPTIONAL) — edit url/events/zone. Not currently supported anywhere; today editing = delete + recreate (which rotates the secret). Worth deciding.

---

## Components needed

Mirror `api-keys.tsx` conventions: `createFileRoute("/_protected/webhooks")`, `orpcClient` from `@/lib/orpc`, shadcn from `@locnative/ui/components/*`, `sonner` toasts, lucide-react icons.

- **Route**: `apps/web/src/routes/_protected/webhooks.tsx`.
- **List/table**: `Card` + table or row cards showing `url`, `events` (Badges: Entry/Exit), zone label ("All zones" when `zoneId` null, else zone name), and a status `Badge` (Active / Failing / Inactive). Use `Skeleton` for loading (matches api-keys).
- **Create dialog**: `Dialog` with `Input` (url), event checkboxes (Entry/Exit — need a `Checkbox` component; verify it exists in the UI package, else add), optional **zone picker** (`Select`/combobox sourced from zones list — see cross-surface dep), submit button with `LoaderIcon` spinner.
- **Secret reveal (once-only)**: mirror api-keys exactly — after create, show the returned `secret` in a read-only field with a copy-to-clipboard button (`CopyIcon`/`CheckIcon`, `navigator.clipboard`), a `ShieldAlertIcon` warning that it won't be shown again, and a sonner toast. State the secret only in component state, never refetch.
- **Delete**: confirm `Dialog` + `TrashIcon`, sonner toast on success, refetch list.
- **Failing affordance**: surface failing subs prominently (red badge / alert row) with a "Reactivate" button (needs `webhooks.reactivate`) and optionally a "Send test" button (needs `webhooks.test`).
- Type helper: `type WebhookListItem = Awaited<ReturnType<typeof orpcClient.webhooks.list>>["results"][number]` (matches the api-keys pattern).

---

## UX flow

1. User lands on `/webhooks`; list loads via `webhooks.list` (Skeleton while loading). Empty state with a "Create webhook" CTA.
2. Each row: URL, event badges, zone ("All zones" or name), status badge. Failing rows visually flagged with a Reactivate (and optional Test) action.
3. "New subscription" opens the create dialog: enter URL, tick events (default both), optionally pick a zone (default = all zones). Submit calls `webhooks.create`.
4. On success the dialog swaps to a **secret reveal** panel: plaintext secret + copy button + "store this now, you won't see it again" warning. Closing returns to the refreshed list (secret never reappears).
5. Delete: confirm → `webhooks.delete` → toast → refetch.
6. Reactivate (if endpoint added): on a failing sub → `webhooks.reactivate` → toast → refetch (badge flips to Active).

---

## Cross-surface dependencies

- **Zones list (Phase 1)** — the create dialog's optional zone picker needs the user's zones. As with webhooks, the public zones router (`zoneList`, apiKeyAuth) is **not** in the session `appRouter`. A session-authed `zones.list` procedure (Phase 1 deliverable) is a prerequisite for the picker. Until it exists, ship the zone picker disabled/"all zones only", or block this surface on Phase 1.
- **Active project selection** — webhooks are project-scoped; the page depends on whatever active-project mechanism the dashboard uses (see `projects.list`). The selected `projectId` must be passed to every webhooks procedure.
- **`secret-crypto.ts`** — `generateWebhookSecret`/`encryptSecret` are exported from `@locnative/api`; the new session procedures should reuse them (no new crypto).

---

## Edge cases

- Secret is shown exactly once; a hard browser refresh mid-create loses it — warn clearly and keep the dialog modal until acknowledged.
- `zoneId = null` must render as "All zones", not blank.
- `failing` subs receive no deliveries and self-heal never — without a reactivate flow they're dead weight; surface this state explicitly so users aren't silently dropping events.
- A user owning multiple projects must not see/delete another project's webhooks — every procedure must verify project ownership against `context.session.user.id` (don't trust client `projectId` blindly).
- Deleting a zone cascades and removes its zone-scoped webhooks (FK `onDelete: cascade`) — the list should reflect this after zone deletion.
- URL validation: enforce `z.string().url()` server-side (already in public API); mirror client-side for UX. Consider blocking obviously-internal URLs (SSRF) — see open questions.
- Duplicate subscriptions (same url+zone+events) are allowed today; UI may want to warn but the backend won't reject.

---

## Open questions

1. **Reactivate flow** — confirm we add `webhooks.reactivate` (set `failing=false`). Strongly recommended; without it a failing sub is unrecoverable from the UI. Should reactivate also re-test before clearing the flag?
2. **Send test event** — do we add `webhooks.test`? If so: does a successful test auto-clear `failing`? Does it bypass the `failing` guard? Where does the outbound POST run (procedure inline vs. enqueue)?
3. **Delivery history** — there is no delivery-log table. Do we ship without any history (just the binary failing flag), or is a delivery-attempts table in scope so users can see why a webhook failed? (This is the biggest UX gap.)
4. Should webhooks be **editable** (`webhooks.update`) or is delete+recreate (which rotates the secret) acceptable?
5. **Project scoping in UI** — is there an established active-project selector to reuse, or does the webhooks page need its own project switcher?
6. **SSRF / URL allowlist** — should the dashboard/back end restrict webhook target URLs (block localhost/private ranges)? Currently unrestricted.
7. **Secret rotation** — any need for a "rotate secret" action (would also be a new endpoint), independent of recreate?
