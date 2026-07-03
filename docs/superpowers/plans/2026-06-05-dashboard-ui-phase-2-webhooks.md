# Dashboard UI — Phase 2: Webhooks Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the dashboard Webhooks Manager — a session-authed oRPC `webhooks` domain plus a `/webhooks` page where users create zone entry/exit subscriptions (with a once-only secret reveal), list them with active/failing status, reactivate failing ones, delete, and view a delivery-attempt timeline.

**Architecture:** Reuse Phase 0/1 foundation (active-project selector, `requireProjectOwnership`, the domain-router pattern). Add a `webhook_delivery_attempts` table written by the existing `webhook-delivery.ts` queue consumer, a new `webhooks.reactivate` capability (shared by public + dashboard), and the dashboard oRPC domain + UI.

**Tech Stack:** oRPC + Drizzle, TanStack Start/Router, shadcn (Base UI), Vitest. Migration number for this phase: **0011** (pre-assigned to avoid collision with the parallel Phase 3 = 0012). Migrations are generated here but **applied to Neon centrally after merge**.

**Spec:** `docs/superpowers/specs/2026-06-04-dashboard-ui-geocoding-geofencing-design.md` (Phase 2)
**Research:** `docs/superpowers/research/ui-webhooks.md`

## Foundation available (do not rebuild)
- `apps/web/src/lib/active-project.ts` — `useActiveProject(ids)`, `ActiveProjectSelector`.
- `packages/api/src/shared/project-ownership.ts` — `requireProjectOwnership(db, projectId, userId)`.
- `packages/api/src/procedures.ts` — `protectedProcedure` (guarantees `context.session.user.id`).
- `packages/api/src/secret-crypto.ts` — `encryptSecret`, `decryptSecret`, `generateWebhookSecret`.
- Existing public webhooks handlers: `packages/api/src/routers/public/webhooks.ts` (createWebhook/listWebhooks/deleteWebhook).
- Consumer: `apps/server/src/queues/webhook-delivery.ts` (`processWebhookDeliveryMessage`).
- `webhookSubscriptions` schema in `packages/database/src/schema/webhooks.ts`.
- oRPC client: `import { orpcClient } from "@/lib/orpc"`. Domain registration in `packages/api/src/routers/index.ts`.
- Pattern reference: `packages/api/src/routers/domains/zones.ts` (Phase 1 — session-authed, ownership-checked domain).

## File Map
**Create:**
- `packages/database/src/schema/webhook-attempts.ts` — `webhookDeliveryAttempts` table
- `packages/database/drizzle/0011_webhook_delivery_attempts.sql` — hand-written migration
- `packages/api/src/shared/webhook-queries.ts` — shared functions (reactivate, list attempts)
- `packages/api/src/routers/domains/webhooks.ts` — session-authed `webhooksRouter`
- `apps/web/src/components/webhooks/webhook-create-dialog.tsx`
- `apps/web/src/components/webhooks/webhook-secret-reveal.tsx`
- `apps/web/src/components/webhooks/webhook-list.tsx`
- `apps/web/src/components/webhooks/delivery-timeline-drawer.tsx`

**Modify:**
- `packages/database/src/schema/index.ts` — export new table + types
- `apps/server/src/queues/webhook-delivery.ts` — log an attempt row per delivery
- `packages/api/src/routers/public/webhooks.ts` — add public `reactivateWebhook` endpoint + register
- `packages/api/src/routers/index.ts` — register `webhooks: webhooksRouter`
- `packages/sdk/src/types.ts` — add webhook dashboard types
- `apps/web/src/routes/_protected/webhooks.tsx` — replace placeholder with real page

---

## Task 1: webhook_delivery_attempts schema + migration

**Files:**
- Create: `packages/database/src/schema/webhook-attempts.ts`
- Create: `packages/database/drizzle/0011_webhook_delivery_attempts.sql`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create the schema `packages/database/src/schema/webhook-attempts.ts`**

```typescript
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { webhookSubscriptions } from "./webhooks.ts";

export const webhookDeliveryAttempts = pgTable(
	"webhook_delivery_attempts",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		subscriptionId: integer("subscription_id")
			.notNull()
			.references(() => webhookSubscriptions.id, { onDelete: "cascade" }),
		event: varchar({ length: 10 }).notNull(),
		zoneId: integer("zone_id"),
		deviceId: varchar("device_id", { length: 255 }),
		statusCode: integer("status_code"),
		ok: boolean().notNull(),
		attempt: integer().notNull(),
		error: text(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_webhook_attempts_subscription_id").on(table.subscriptionId),
		index("idx_webhook_attempts_created_at").on(table.createdAt),
	]
);

export type WebhookDeliveryAttempt = typeof webhookDeliveryAttempts.$inferSelect;
export type NewWebhookDeliveryAttempt =
	typeof webhookDeliveryAttempts.$inferInsert;
```

- [ ] **Step 2: Export from `packages/database/src/schema/index.ts`**

Append:
```typescript
export type {
	NewWebhookDeliveryAttempt,
	WebhookDeliveryAttempt,
} from "./webhook-attempts.ts";
export { webhookDeliveryAttempts } from "./webhook-attempts.ts";
```

- [ ] **Step 3: Hand-write the migration `packages/database/drizzle/0011_webhook_delivery_attempts.sql`**

```sql
CREATE TABLE "webhook_delivery_attempts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_delivery_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subscription_id" integer NOT NULL,
	"event" varchar(10) NOT NULL,
	"zone_id" integer,
	"device_id" varchar(255),
	"status_code" integer,
	"ok" boolean NOT NULL,
	"attempt" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempts" ADD CONSTRAINT "webhook_delivery_attempts_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_webhook_attempts_subscription_id" ON "webhook_delivery_attempts" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_attempts_created_at" ON "webhook_delivery_attempts" USING btree ("created_at");
```

> Do NOT run `drizzle-kit generate` (it would auto-number and may collide with Phase 3's parallel work). Do NOT apply the migration — the controller applies it centrally after merge. This task only creates the schema + SQL file + exports.

- [ ] **Step 4: Type-check**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/database && pnpm check-types 2>&1 | grep -i error || echo "no errors"
```

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add packages/database/src/schema/webhook-attempts.ts packages/database/src/schema/index.ts packages/database/drizzle/0011_webhook_delivery_attempts.sql
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(db): add webhook_delivery_attempts table + migration 0011"
```

---

## Task 2: Log delivery attempts + public reactivate endpoint

**Files:**
- Create: `packages/api/src/shared/webhook-queries.ts`
- Modify: `apps/server/src/queues/webhook-delivery.ts`
- Modify: `packages/api/src/routers/public/webhooks.ts`

- [ ] **Step 1: Create `packages/api/src/shared/webhook-queries.ts`**

```typescript
import type { Database } from "@locnative/database";
import { webhookSubscriptions } from "@locnative/database/schema";
import { and, eq } from "drizzle-orm";

/** Clear the `failing` flag on a subscription. Returns false if not owned. */
export async function reactivateWebhook(
	db: Database,
	projectId: string,
	subscriptionId: number
): Promise<boolean> {
	const result = await db
		.update(webhookSubscriptions)
		.set({ failing: false })
		.where(
			and(
				eq(webhookSubscriptions.id, subscriptionId),
				eq(webhookSubscriptions.projectId, projectId)
			)
		)
		.returning({ id: webhookSubscriptions.id });
	return result.length > 0;
}
```

- [ ] **Step 2: Log an attempt row in the consumer**

In `apps/server/src/queues/webhook-delivery.ts`, import the attempts table and insert a row after each delivery attempt (success or failure). Add to imports:
```typescript
import { webhookDeliveryAttempts, webhookSubscriptions } from "@locnative/database/schema";
```
Then modify `deliverOnce` to RETURN the status code (not just a boolean), and have the caller log each attempt. Replace `deliverOnce` with:
```typescript
async function deliverOnce(
	url: string,
	body: string,
	signature: string,
	attempt: number
): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Locnative-Signature": signature,
				"X-Locnative-Attempt": String(attempt),
			},
			body,
			signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
		});
		return { ok: res.ok, statusCode: res.status, error: res.ok ? null : `HTTP ${res.status}` };
	} catch (err) {
		return { ok: false, statusCode: null, error: err instanceof Error ? err.message : "Request failed" };
	}
}
```
Then in the per-sub loop, replace the retry block so it logs each attempt:
```typescript
			let delivered = false;
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				const outcome = await deliverOnce(sub.url, payload, signature, attempt);
				await db.insert(webhookDeliveryAttempts).values({
					subscriptionId: sub.id,
					event: msg.event,
					zoneId: msg.zoneId,
					deviceId: msg.deviceId,
					statusCode: outcome.statusCode,
					ok: outcome.ok,
					attempt,
					error: outcome.error,
				});
				if (outcome.ok) {
					delivered = true;
					break;
				}
			}
```
Keep the existing `if (!delivered) { ...set failing... }` block and the corrupt-secret path unchanged. (The corrupt-secret path may optionally log an attempt with `ok:false, attempt:0, error:"decrypt failed"` — add that insert for completeness.)

- [ ] **Step 3: Add a public `reactivateWebhook` endpoint**

In `packages/api/src/routers/public/webhooks.ts`, add a handler that uses the shared function, then register it. Add import:
```typescript
import { reactivateWebhook } from "../../shared/webhook-queries.ts";
```
Add handler:
```typescript
export const reactivateWebhookEndpoint = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("webhooks.reactivate"))
	.route({
		method: "POST",
		path: "/api/v1/webhooks/{id}/reactivate",
		summary: "Reactivate a failing webhook subscription",
		tags: ["webhooks"],
	})
	.input(z.object({ id: z.coerce.number().int().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & AuthContext;
		const projectId = requireProjectId(ctx.validatedApiKey.projectId);
		const ok = await reactivateWebhook(context.db, projectId, input.id);
		if (!ok) {
			throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
		}
		return { id: input.id, reactivated: true };
	});
```
Then find where the public webhooks handlers are registered in `packages/api/src/routers/public-http.ts` (the `webhooks` key in `publicHttpRouter`) and add `webhookReactivate: reactivateWebhookEndpoint` to that nested object. Read public-http.ts to match the exact registration shape.

- [ ] **Step 4: Type-check both packages**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm check-types 2>&1 | grep -v "api-explorer.ts(204" | grep -i error || echo "no new errors"
cd /Users/mac/Developer/projects/locnative.com/apps/server && pnpm check-types 2>&1 | grep -i error || echo "no errors"
```

- [ ] **Step 5: Commit**

```bash
git -C /Users/mac/Developer/projects/locnative.com add packages/api/src/shared/webhook-queries.ts apps/server/src/queues/webhook-delivery.ts packages/api/src/routers/public/webhooks.ts packages/api/src/routers/public-http.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(api): log webhook delivery attempts + add reactivate endpoint"
```

---

## Task 3: Dashboard webhooks oRPC domain

**Files:**
- Create: `packages/api/src/routers/domains/webhooks.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create the domain router**

```typescript
import { ORPCError } from "@orpc/server";
import { webhookSubscriptions, webhookDeliveryAttempts, zones } from "@locnative/database/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";
import { requireProjectOwnership } from "../../shared/project-ownership.ts";
import { reactivateWebhook } from "../../shared/webhook-queries.ts";
import { encryptSecret, generateWebhookSecret } from "../../secret-crypto.ts";

const projectIdInput = z.object({ projectId: z.string().uuid() });

export const webhooksRouter = {
	list: protectedProcedure
		.input(projectIdInput)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			const rows = await context.db
				.select({
					id: webhookSubscriptions.id,
					url: webhookSubscriptions.url,
					events: webhookSubscriptions.events,
					zoneId: webhookSubscriptions.zoneId,
					active: webhookSubscriptions.active,
					failing: webhookSubscriptions.failing,
					createdAt: webhookSubscriptions.createdAt,
				})
				.from(webhookSubscriptions)
				.where(eq(webhookSubscriptions.projectId, projectId))
				.orderBy(desc(webhookSubscriptions.createdAt));
			return { webhooks: rows, count: rows.length };
		}),

	create: protectedProcedure
		.input(
			projectIdInput.extend({
				url: z.string().url(),
				events: z.array(z.enum(["entry", "exit"])).min(1).default(["entry", "exit"]),
				zoneId: z.number().int().positive().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			if (input.zoneId) {
				const [zone] = await context.db
					.select({ id: zones.id })
					.from(zones)
					.where(and(eq(zones.id, input.zoneId), eq(zones.projectId, projectId)))
					.limit(1);
				if (!zone) {
					throw new ORPCError("NOT_FOUND", { message: "Zone not found." });
				}
			}
			const secret = generateWebhookSecret();
			const secretEnc = encryptSecret(secret);
			const [sub] = await context.db
				.insert(webhookSubscriptions)
				.values({
					projectId,
					zoneId: input.zoneId ?? null,
					url: input.url,
					events: input.events,
					secretEnc,
					active: true,
					failing: false,
				})
				.returning({
					id: webhookSubscriptions.id,
					url: webhookSubscriptions.url,
					events: webhookSubscriptions.events,
					zoneId: webhookSubscriptions.zoneId,
					active: webhookSubscriptions.active,
					createdAt: webhookSubscriptions.createdAt,
				});
			return { ...sub!, secret };
		}),

	delete: protectedProcedure
		.input(projectIdInput.extend({ id: z.number().int().min(1) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			const result = await context.db
				.delete(webhookSubscriptions)
				.where(and(eq(webhookSubscriptions.id, input.id), eq(webhookSubscriptions.projectId, projectId)))
				.returning({ id: webhookSubscriptions.id });
			if (result.length === 0) {
				throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
			}
			return { success: true };
		}),

	reactivate: protectedProcedure
		.input(projectIdInput.extend({ id: z.number().int().min(1) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			const ok = await reactivateWebhook(context.db, projectId, input.id);
			if (!ok) {
				throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
			}
			return { success: true };
		}),

	deliveries: protectedProcedure
		.input(projectIdInput.extend({ id: z.number().int().min(1), limit: z.number().int().min(1).max(100).default(25) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			// Verify the subscription belongs to the project
			const [sub] = await context.db
				.select({ id: webhookSubscriptions.id })
				.from(webhookSubscriptions)
				.where(and(eq(webhookSubscriptions.id, input.id), eq(webhookSubscriptions.projectId, projectId)))
				.limit(1);
			if (!sub) {
				throw new ORPCError("NOT_FOUND", { message: "Webhook not found." });
			}
			const attempts = await context.db
				.select({
					id: webhookDeliveryAttempts.id,
					event: webhookDeliveryAttempts.event,
					zoneId: webhookDeliveryAttempts.zoneId,
					deviceId: webhookDeliveryAttempts.deviceId,
					statusCode: webhookDeliveryAttempts.statusCode,
					ok: webhookDeliveryAttempts.ok,
					attempt: webhookDeliveryAttempts.attempt,
					error: webhookDeliveryAttempts.error,
					createdAt: webhookDeliveryAttempts.createdAt,
				})
				.from(webhookDeliveryAttempts)
				.where(eq(webhookDeliveryAttempts.subscriptionId, input.id))
				.orderBy(desc(webhookDeliveryAttempts.createdAt))
				.limit(input.limit);
			return { attempts, count: attempts.length };
		}),
};
```

- [ ] **Step 2: Register in `packages/api/src/routers/index.ts`**

Add `import { webhooksRouter } from "./domains/webhooks.ts";` and `webhooks: webhooksRouter,` to `appRouter` (append — this line is the only overlap with Phase 3; keep it additive).

- [ ] **Step 3: Type-check + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm check-types 2>&1 | grep -v "api-explorer.ts(204" | grep -i error || echo "no new errors"
git -C /Users/mac/Developer/projects/locnative.com add packages/api/src/routers/domains/webhooks.ts packages/api/src/routers/index.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(api): add session-authed dashboard webhooks oRPC domain"
```

---

## Task 4: Webhooks page — list, create (once-only secret), delete

**Files:**
- Create: `apps/web/src/components/webhooks/webhook-secret-reveal.tsx`
- Create: `apps/web/src/components/webhooks/webhook-create-dialog.tsx`
- Create: `apps/web/src/components/webhooks/webhook-list.tsx`
- Modify: `apps/web/src/routes/_protected/webhooks.tsx`

- [ ] **Step 1: Secret reveal component `webhook-secret-reveal.tsx`**

Mirrors the api-keys once-only reveal pattern (read `apps/web/src/routes/_protected/api-keys.tsx` for the copy-to-clipboard idiom).

```typescript
import { Button } from "@locnative/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

export interface WebhookSecretRevealProps {
	secret: string | null;
	onClose: () => void;
}

export function WebhookSecretReveal({ secret, onClose }: WebhookSecretRevealProps) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		if (!secret) {
			return;
		}
		await navigator.clipboard.writeText(secret);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};
	return (
		<Dialog onOpenChange={(o) => !o && onClose()} open={secret !== null}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Webhook signing secret</DialogTitle>
					<DialogDescription>
						Copy this now — it is shown once and cannot be retrieved later. Use it to verify the X-Locnative-Signature HMAC.
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-2 rounded-md border bg-muted p-2 font-mono text-sm">
					<span className="flex-1 truncate">{secret}</span>
					<Button aria-label="Copy secret" onClick={copy} size="icon" variant="ghost">
						{copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
					</Button>
				</div>
				<DialogFooter>
					<Button onClick={onClose}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Create dialog `webhook-create-dialog.tsx`** — url input, entry/exit checkboxes, optional zone select. Zone options are passed in as a prop (the page fetches them via `orpcClient.zones.list` when available; falls back to "all zones").

```typescript
import { Button } from "@locnative/ui/components/button";
import { Checkbox } from "@locnative/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { useEffect, useState } from "react";

export interface WebhookZoneOption {
	id: number;
	name: string;
}

export interface WebhookCreateValues {
	url: string;
	events: ("entry" | "exit")[];
	zoneId?: number;
}

export interface WebhookCreateDialogProps {
	open: boolean;
	saving: boolean;
	zones: WebhookZoneOption[];
	onCancel: () => void;
	onSubmit: (values: WebhookCreateValues) => void;
}

export function WebhookCreateDialog({ open, saving, zones, onCancel, onSubmit }: WebhookCreateDialogProps) {
	const [url, setUrl] = useState("");
	const [entry, setEntry] = useState(true);
	const [exit, setExit] = useState(true);
	const [zoneId, setZoneId] = useState<string>("all");

	useEffect(() => {
		if (!open) {
			setUrl("");
			setEntry(true);
			setExit(true);
			setZoneId("all");
		}
	}, [open]);

	const events: ("entry" | "exit")[] = [
		...(entry ? (["entry"] as const) : []),
		...(exit ? (["exit"] as const) : []),
	];

	return (
		<Dialog onOpenChange={(o) => !o && onCancel()} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create webhook</DialogTitle>
					<DialogDescription>Receive a signed POST when a device crosses a zone boundary.</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="wh-url">Endpoint URL</Label>
						<Input id="wh-url" onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/locnative" value={url} />
					</div>
					<div className="space-y-2">
						<Label>Events</Label>
						<div className="flex gap-4">
							<label className="flex items-center gap-2 text-sm">
								<Checkbox checked={entry} onCheckedChange={(v) => setEntry(v === true)} /> Entry
							</label>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox checked={exit} onCheckedChange={(v) => setExit(v === true)} /> Exit
							</label>
						</div>
					</div>
					<div className="space-y-1">
						<Label htmlFor="wh-zone">Zone</Label>
						<Select onValueChange={setZoneId} value={zoneId}>
							<SelectTrigger id="wh-zone"><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All zones</SelectItem>
								{zones.map((z) => (
									<SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={onCancel} variant="outline">Cancel</Button>
					<Button
						disabled={saving || url.trim().length === 0 || events.length === 0}
						onClick={() => onSubmit({ url: url.trim(), events, zoneId: zoneId === "all" ? undefined : Number(zoneId) })}
					>
						{saving ? "Creating…" : "Create webhook"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```
> Verify Base UI `Checkbox` API (`checked`/`onCheckedChange`) in `packages/ui/src/components/checkbox.tsx`; adjust if the prop names differ and report.

- [ ] **Step 3: Webhook list `webhook-list.tsx`** — table with url, events, zone, status badge (Active/Failing), and per-row actions (deliveries, reactivate when failing, delete).

```typescript
import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";
import { ListIcon, RefreshCwIcon, TrashIcon } from "lucide-react";

export interface WebhookRow {
	id: number;
	url: string;
	events: string[];
	zoneId: number | null;
	active: boolean;
	failing: boolean;
	createdAt: string;
}

export interface WebhookListProps {
	webhooks: WebhookRow[];
	onDelete: (id: number) => void;
	onReactivate: (id: number) => void;
	onViewDeliveries: (id: number) => void;
}

export function WebhookList({ webhooks, onDelete, onReactivate, onViewDeliveries }: WebhookListProps) {
	if (webhooks.length === 0) {
		return <p className="py-8 text-center text-muted-foreground text-sm">No webhooks yet.</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>URL</TableHead>
					<TableHead>Events</TableHead>
					<TableHead>Zone</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{webhooks.map((wh) => (
					<TableRow key={wh.id}>
						<TableCell className="max-w-[240px] truncate font-mono text-xs">{wh.url}</TableCell>
						<TableCell>{wh.events.join(", ")}</TableCell>
						<TableCell>{wh.zoneId === null ? "All" : `#${wh.zoneId}`}</TableCell>
						<TableCell>
							{wh.failing ? (
								<Badge variant="destructive">Failing</Badge>
							) : (
								<Badge variant="secondary">Active</Badge>
							)}
						</TableCell>
						<TableCell className="text-right">
							<Button aria-label="View deliveries" onClick={() => onViewDeliveries(wh.id)} size="icon" variant="ghost">
								<ListIcon className="size-4" />
							</Button>
							{wh.failing ? (
								<Button aria-label="Reactivate" onClick={() => onReactivate(wh.id)} size="icon" variant="ghost">
									<RefreshCwIcon className="size-4" />
								</Button>
							) : null}
							<Button aria-label="Delete webhook" onClick={() => onDelete(wh.id)} size="icon" variant="ghost">
								<TrashIcon className="size-4" />
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```
> Verify `Badge` variant names in `packages/ui/src/components/badge.tsx` (`destructive`/`secondary`); adjust if different.

- [ ] **Step 4: Wire the page `apps/web/src/routes/_protected/webhooks.tsx`** (replace placeholder)

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@locnative/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@locnative/ui/components/card";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActiveProjectSelector } from "@/components/active-project-selector";
import { WebhookCreateDialog, type WebhookCreateValues, type WebhookZoneOption } from "@/components/webhooks/webhook-create-dialog";
import { WebhookList, type WebhookRow } from "@/components/webhooks/webhook-list";
import { WebhookSecretReveal } from "@/components/webhooks/webhook-secret-reveal";
import { useActiveProject } from "@/lib/active-project";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/webhooks")({ component: RouteComponent });

function RouteComponent() {
	const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
	const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
	const { activeId, select } = useActiveProject(projectIds);

	const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
	const [zones, setZones] = useState<WebhookZoneOption[]>([]);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

	useEffect(() => {
		orpcClient.projects.list()
			.then((rows) => setProjects(rows.map((r) => ({ id: r.id, name: r.name }))))
			.catch(() => toast.error("Failed to load projects."));
	}, []);

	const refresh = useCallback(async (projectId: string) => {
		try {
			const [wh, zoneRes] = await Promise.all([
				orpcClient.webhooks.list({ projectId }),
				orpcClient.zones.list({ projectId }).catch(() => ({ zones: [] as { id: number; name: string }[] })),
			]);
			setWebhooks(wh.webhooks);
			setZones(zoneRes.zones.map((z) => ({ id: z.id, name: z.name })));
		} catch {
			toast.error("Failed to load webhooks.");
		}
	}, []);

	useEffect(() => {
		if (activeId) {
			refresh(activeId);
		}
	}, [activeId, refresh]);

	const handleCreate = async (values: WebhookCreateValues) => {
		if (!activeId) {
			return;
		}
		setSaving(true);
		try {
			const created = await orpcClient.webhooks.create({ projectId: activeId, ...values });
			setDialogOpen(false);
			setRevealedSecret(created.secret);
			await refresh(activeId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create webhook.");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: number) => {
		if (!activeId) {
			return;
		}
		try {
			await orpcClient.webhooks.delete({ projectId: activeId, id });
			toast.success("Webhook deleted.");
			await refresh(activeId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to delete webhook.");
		}
	};

	const handleReactivate = async (id: number) => {
		if (!activeId) {
			return;
		}
		try {
			await orpcClient.webhooks.reactivate({ projectId: activeId, id });
			toast.success("Webhook reactivated.");
			await refresh(activeId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to reactivate.");
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<ActiveProjectSelector activeId={activeId} onSelect={select} projects={projects} />
				<Button disabled={!activeId} onClick={() => setDialogOpen(true)}>Create webhook</Button>
			</div>
			<Card>
				<CardHeader><CardTitle className="text-sm">Webhooks ({webhooks.length})</CardTitle></CardHeader>
				<CardContent>
					<WebhookList
						onDelete={handleDelete}
						onReactivate={handleReactivate}
						onViewDeliveries={() => toast.info("Delivery timeline lands in the next step.")}
						webhooks={webhooks}
					/>
				</CardContent>
			</Card>
			<WebhookCreateDialog onCancel={() => setDialogOpen(false)} onSubmit={handleCreate} open={dialogOpen} saving={saving} zones={zones} />
			<WebhookSecretReveal onClose={() => setRevealedSecret(null)} secret={revealedSecret} />
		</div>
	);
}
```
> The delivery-timeline drawer is wired in Task 5 (this step stubs `onViewDeliveries` with a toast).

- [ ] **Step 5: Build + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -8
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/webhooks/ apps/web/src/routes/_protected/webhooks.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): webhooks page with list, create (once-only secret), delete, reactivate"
```

---

## Task 5: Delivery timeline drawer

**Files:**
- Create: `apps/web/src/components/webhooks/delivery-timeline-drawer.tsx`
- Modify: `apps/web/src/routes/_protected/webhooks.tsx`

- [ ] **Step 1: Create the drawer**

```typescript
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@locnative/ui/components/sheet";
import { Badge } from "@locnative/ui/components/badge";

export interface DeliveryAttemptItem {
	id: number;
	event: string;
	statusCode: number | null;
	ok: boolean;
	attempt: number;
	error: string | null;
	createdAt: string;
}

export interface DeliveryTimelineDrawerProps {
	open: boolean;
	loading: boolean;
	attempts: DeliveryAttemptItem[];
	onClose: () => void;
}

export function DeliveryTimelineDrawer({ open, loading, attempts, onClose }: DeliveryTimelineDrawerProps) {
	return (
		<Sheet onOpenChange={(o) => !o && onClose()} open={open}>
			<SheetContent className="w-[460px] sm:max-w-[460px]">
				<SheetHeader>
					<SheetTitle>Delivery attempts</SheetTitle>
					<SheetDescription>{loading ? "Loading…" : `${attempts.length} recent attempts`}</SheetDescription>
				</SheetHeader>
				<div className="mt-4 space-y-2 overflow-auto">
					{attempts.map((a) => (
						<div className="flex items-center justify-between rounded-md border p-2 text-sm" key={a.id}>
							<div className="flex flex-col">
								<span className="font-medium">{a.event} · attempt {a.attempt}</span>
								<span className="text-muted-foreground text-xs">{new Date(a.createdAt).toLocaleString()}</span>
								{a.error ? <span className="text-destructive text-xs">{a.error}</span> : null}
							</div>
							{a.ok ? (
								<Badge variant="secondary">{a.statusCode ?? "OK"}</Badge>
							) : (
								<Badge variant="destructive">{a.statusCode ?? "ERR"}</Badge>
							)}
						</div>
					))}
				</div>
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 2: Wire into `webhooks.tsx`**

Add import + state + handler, and replace the `onViewDeliveries` stub:
```typescript
import { DeliveryTimelineDrawer, type DeliveryAttemptItem } from "@/components/webhooks/delivery-timeline-drawer";

	const [deliveriesOpen, setDeliveriesOpen] = useState(false);
	const [deliveriesLoading, setDeliveriesLoading] = useState(false);
	const [attempts, setAttempts] = useState<DeliveryAttemptItem[]>([]);

	const handleViewDeliveries = async (id: number) => {
		if (!activeId) {
			return;
		}
		setDeliveriesOpen(true);
		setDeliveriesLoading(true);
		try {
			const res = await orpcClient.webhooks.deliveries({ projectId: activeId, id });
			setAttempts(
				res.attempts.map((a) => ({
					id: a.id,
					event: a.event,
					statusCode: a.statusCode,
					ok: a.ok,
					attempt: a.attempt,
					error: a.error,
					createdAt: typeof a.createdAt === "string" ? a.createdAt : new Date(a.createdAt).toISOString(),
				}))
			);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load deliveries.");
		} finally {
			setDeliveriesLoading(false);
		}
	};
```
Replace `onViewDeliveries={() => toast.info(...)}` with `onViewDeliveries={handleViewDeliveries}`, and render `<DeliveryTimelineDrawer attempts={attempts} loading={deliveriesLoading} onClose={() => setDeliveriesOpen(false)} open={deliveriesOpen} />` at the end of the page.

- [ ] **Step 3: Build + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -8
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/webhooks/delivery-timeline-drawer.tsx apps/web/src/routes/_protected/webhooks.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add webhook delivery timeline drawer"
```

---

## Task 6: SDK types

**Files:**
- Modify: `packages/sdk/src/types.ts`

- [ ] **Step 1: Append webhook dashboard types** (this file is also touched by Phase 3 — append only, line-additive)

```typescript
// --- Webhooks (dashboard) ---

export interface WebhookDeliveryAttemptRecord {
	id: number;
	event: string;
	zoneId: number | null;
	deviceId: string | null;
	statusCode: number | null;
	ok: boolean;
	attempt: number;
	error: string | null;
	createdAt: string;
}

export interface WebhookReactivateResponse {
	success: boolean;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/sdk && pnpm check-types 2>&1 | grep -i error || echo "no errors"
git -C /Users/mac/Developer/projects/locnative.com add packages/sdk/src/types.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(sdk): add webhook delivery-attempt + reactivate types"
```

---

## Done — Phase 2 complete

End state: `/webhooks` page — pick a project, create a subscription (URL + entry/exit + optional zone), copy the once-only signing secret, see the list with Active/Failing badges, reactivate a failing subscription, view its delivery-attempt timeline, and delete. Backend: `webhook_delivery_attempts` logged by the consumer; `webhooks.reactivate` available on both public and dashboard surfaces.

**Central post-merge action (controller, not this plan):** apply migration `0011` to Neon via the Neon HTTP driver, then redeploy the server worker (the consumer change must go live for attempt logging).
