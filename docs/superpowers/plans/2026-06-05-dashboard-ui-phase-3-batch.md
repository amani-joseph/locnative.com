# Dashboard UI — Phase 3: Batch Geocoding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the dashboard Batch Geocoding page — a session-authed oRPC `geocode` domain plus a `/batch` page where users paste or upload addresses, submit a job, watch polling progress, view the results table, export CSV/JSON, and see recent jobs.

**Architecture:** Reuse Phase 0/1 foundation (active-project selector, `requireProjectOwnership`, domain-router pattern). The dashboard submits jobs with `apiKeyId = null` (dashboard has no API key), which requires making `batch_geocode_jobs.apiKeyId` nullable. The dashboard oRPC handlers reuse the same `batch_geocode_jobs` table + CF Queue + R2 that the public API uses.

**Tech Stack:** oRPC + Drizzle, Cloudflare Queue + R2, TanStack Start/Router/Query (polling via `refetchInterval`), shadcn (Base UI), Vitest. Migration number for this phase: **0012** (pre-assigned; Phase 2 uses 0011). Migrations generated here, **applied to Neon centrally after merge**.

**Spec:** `docs/superpowers/specs/2026-06-04-dashboard-ui-geocoding-geofencing-design.md` (Phase 3)
**Research:** `docs/superpowers/research/ui-batch.md`

## Foundation available (do not rebuild)
- `apps/web/src/lib/active-project.ts` — `useActiveProject(ids)`, `ActiveProjectSelector`.
- `packages/api/src/shared/project-ownership.ts` — `requireProjectOwnership`.
- `packages/api/src/procedures.ts` — `protectedProcedure`.
- `batch_geocode_jobs` schema in `packages/database/src/schema/jobs.ts`.
- Public batch handlers: `packages/api/src/routers/public/geocode.ts` (batchGeocodeSubmit/Poll/Results) — reference for the env/Queue/R2 access pattern.
- Consumer: `apps/server/src/queues/batch-geocode.ts` (`processBatchGeocodeMessage`).
- oRPC client `import { orpcClient } from "@/lib/orpc"`. Domain registration in `packages/api/src/routers/index.ts`.
- Pattern reference: `packages/api/src/routers/domains/zones.ts`.

## ⚠️ Key risk to verify: env bindings in the oRPC (RPC) context
The public batch handlers read CF bindings via `(context as ... & { env?: { BATCH_GEOCODE_QUEUE?, GEOCODE_RESULTS? } })`. The dashboard handlers run through the `/rpc` handler (appRouter), NOT the public OpenAPI handler. **Task 2 Step 0 verifies whether the RPC context carries `env`.** If it does not, the dashboard submit must still insert the job row (status `pending`) and the plan documents that the worker needs the RPC handler wired to pass `env` into context. Read `apps/server/src/index.ts` to see how `createContext`/RPC handler is invoked and whether `env` is threaded; report findings and adapt.

## File Map
**Create:**
- `packages/database/drizzle/0012_batch_jobs_apikey_nullable.sql` — migration
- `packages/api/src/routers/domains/geocode.ts` — session-authed `geocodeRouter`
- `apps/web/src/components/batch/parse-addresses.ts` — pure paste/CSV parser (tested)
- `apps/web/src/components/batch/parse-addresses.test.ts`
- `apps/web/src/components/batch/batch-input.tsx` — paste/upload form
- `apps/web/src/components/batch/job-progress.tsx` — polling progress card
- `apps/web/src/components/batch/results-table.tsx` — results + export
- `apps/web/src/components/batch/job-history.tsx` — recent jobs list

**Modify:**
- `packages/database/src/schema/jobs.ts` — make `apiKeyId` nullable
- `packages/api/src/routers/index.ts` — register `geocode: geocodeRouter`
- `packages/sdk/src/types.ts` — batch dashboard types
- `apps/web/src/routes/_protected/batch.tsx` — replace placeholder with real page

---

## Task 1: Make batch_geocode_jobs.apiKeyId nullable

**Files:**
- Modify: `packages/database/src/schema/jobs.ts`
- Create: `packages/database/drizzle/0012_batch_jobs_apikey_nullable.sql`

- [ ] **Step 1: Update the schema** — remove `.notNull()` from `apiKeyId` in `packages/database/src/schema/jobs.ts`:

```typescript
		apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
			onDelete: "cascade",
		}),
```
(was `.notNull().references(...)`; now nullable.)

- [ ] **Step 2: Hand-write the migration `0012_batch_jobs_apikey_nullable.sql`**

```sql
ALTER TABLE "batch_geocode_jobs" ALTER COLUMN "api_key_id" DROP NOT NULL;
```

> Do NOT run `drizzle-kit generate` (avoids numbering collision with Phase 2's 0011). Do NOT apply — controller applies centrally after merge.

- [ ] **Step 3: Type-check + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/database && pnpm check-types 2>&1 | grep -i error || echo "no errors"
git -C /Users/mac/Developer/projects/locnative.com add packages/database/src/schema/jobs.ts packages/database/drizzle/0012_batch_jobs_apikey_nullable.sql
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(db): make batch_geocode_jobs.apiKeyId nullable (migration 0012)"
```

---

## Task 2: Dashboard geocode oRPC domain

**Files:**
- Create: `packages/api/src/routers/domains/geocode.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 0: Verify env threading into RPC context**

Read `apps/server/src/index.ts`. Find where the RPC handler (`/rpc`) builds its context (look for `createContext` / `RPCHandler`). Determine whether the CF `env` (with `BATCH_GEOCODE_QUEUE`, `GEOCODE_RESULTS`) is available to appRouter handlers. Report one of:
- (a) `env` IS in the RPC context → dashboard submit can enqueue directly (mirror the public handler's `ctx.env?.BATCH_GEOCODE_QUEUE` access).
- (b) `env` is NOT threaded → implement the handlers to insert the job row and access env if present, degrading gracefully (job stays `pending` if no queue binding), AND note in your report that `apps/server/src/index.ts` should thread `env` into the RPC context for dashboard batch to fully work. If threading `env` is a small change (add it to the context object passed to the RPC handler), make that change and report it.

Proceed with the handlers below, adapting the env access to what you found.

- [ ] **Step 1: Create `packages/api/src/routers/domains/geocode.ts`**

```typescript
import { ORPCError } from "@orpc/server";
import { batchGeocodeJobs } from "@locnative/database/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";
import { requireProjectOwnership } from "../../shared/project-ownership.ts";

const projectIdInput = z.object({ projectId: z.string().uuid() });

export const geocodeRouter = {
	batchSubmit: protectedProcedure
		.input(
			projectIdInput.extend({
				addresses: z.array(z.string().min(5)).min(1).max(1000, "Maximum 1,000 addresses per job"),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			const ctx = context as typeof context & {
				// biome-ignore lint/suspicious/noExplicitAny: CF Queue binding not typed in this package
				env?: { BATCH_GEOCODE_QUEUE?: any };
			};
			const [job] = await context.db
				.insert(batchGeocodeJobs)
				.values({
					projectId,
					apiKeyId: null,
					status: "pending",
					inputCount: input.addresses.length,
				})
				.returning({ id: batchGeocodeJobs.id });

			if (ctx.env?.BATCH_GEOCODE_QUEUE) {
				try {
					await ctx.env.BATCH_GEOCODE_QUEUE.send({
						type: "batch-geocode",
						jobId: job!.id,
						addresses: input.addresses,
						projectId,
					});
					await context.db.update(batchGeocodeJobs).set({ status: "processing" }).where(eq(batchGeocodeJobs.id, job!.id));
				} catch {
					await context.db.update(batchGeocodeJobs).set({ status: "failed", error: "Failed to enqueue job." }).where(eq(batchGeocodeJobs.id, job!.id));
					throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to enqueue batch job. Please retry." });
				}
			}
			const finalStatus = ctx.env?.BATCH_GEOCODE_QUEUE ? "processing" : "pending";
			return { jobId: job!.id, status: finalStatus, inputCount: input.addresses.length };
		}),

	batchPoll: protectedProcedure
		.input(projectIdInput.extend({ jobId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			const [job] = await context.db
				.select()
				.from(batchGeocodeJobs)
				.where(and(eq(batchGeocodeJobs.id, input.jobId), eq(batchGeocodeJobs.projectId, projectId)))
				.limit(1);
			if (!job) {
				throw new ORPCError("NOT_FOUND", { message: "Job not found." });
			}
			return {
				jobId: job.id,
				status: job.status,
				inputCount: job.inputCount,
				processedCount: job.processedCount,
				completedAt: job.completedAt,
				error: job.error,
			};
		}),

	batchResults: protectedProcedure
		.input(projectIdInput.extend({ jobId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			const ctx = context as typeof context & {
				// biome-ignore lint/suspicious/noExplicitAny: R2 binding not typed in this package
				env?: { GEOCODE_RESULTS?: any };
			};
			const [job] = await context.db
				.select({ status: batchGeocodeJobs.status, resultsR2Key: batchGeocodeJobs.resultsR2Key })
				.from(batchGeocodeJobs)
				.where(and(eq(batchGeocodeJobs.id, input.jobId), eq(batchGeocodeJobs.projectId, projectId)))
				.limit(1);
			if (!job) {
				throw new ORPCError("NOT_FOUND", { message: "Job not found." });
			}
			if (job.status !== "completed" || !job.resultsR2Key) {
				throw new ORPCError("NOT_FOUND", { message: `Results not ready. Job status: ${job.status}` });
			}
			if (!ctx.env?.GEOCODE_RESULTS) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Storage binding unavailable." });
			}
			const obj = await ctx.env.GEOCODE_RESULTS.get(job.resultsR2Key);
			if (!obj) {
				throw new ORPCError("NOT_FOUND", { message: "Results file not found." });
			}
			const results = (await obj.json()) as unknown[];
			return { results, count: results.length };
		}),

	batchList: protectedProcedure
		.input(projectIdInput.extend({ limit: z.number().int().min(1).max(50).default(20) }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(context.db, input.projectId, context.session.user.id);
			const jobs = await context.db
				.select({
					id: batchGeocodeJobs.id,
					status: batchGeocodeJobs.status,
					inputCount: batchGeocodeJobs.inputCount,
					processedCount: batchGeocodeJobs.processedCount,
					createdAt: batchGeocodeJobs.createdAt,
					completedAt: batchGeocodeJobs.completedAt,
				})
				.from(batchGeocodeJobs)
				.where(eq(batchGeocodeJobs.projectId, projectId))
				.orderBy(desc(batchGeocodeJobs.createdAt))
				.limit(input.limit);
			return { jobs, count: jobs.length };
		}),
};
```

- [ ] **Step 2: Register in `packages/api/src/routers/index.ts`**

Add `import { geocodeRouter } from "./domains/geocode.ts";` and `geocode: geocodeRouter,` to `appRouter` (append — line-additive; the only overlap with Phase 2 is this file).

- [ ] **Step 3: Type-check + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/api && pnpm check-types 2>&1 | grep -v "api-explorer.ts(204" | grep -i error || echo "no new errors"
git -C /Users/mac/Developer/projects/locnative.com add packages/api/src/routers/domains/geocode.ts packages/api/src/routers/index.ts apps/server/src/index.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(api): add session-authed dashboard geocode (batch) oRPC domain"
```
(Include `apps/server/src/index.ts` in the add only if you modified it to thread `env`.)

---

## Task 3: Pure address/CSV parser (tested)

**Files:**
- Create: `apps/web/src/components/batch/parse-addresses.ts`
- Create: `apps/web/src/components/batch/parse-addresses.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseAddresses, MAX_BATCH } from "./parse-addresses.ts";

describe("parseAddresses", () => {
	it("splits newline-separated input and trims", () => {
		const out = parseAddresses("1 Macquarie St Sydney\n  100 George St Sydney  \n");
		expect(out.addresses).toEqual(["1 Macquarie St Sydney", "100 George St Sydney"]);
		expect(out.error).toBeNull();
	});
	it("drops blank lines", () => {
		expect(parseAddresses("a line here\n\n\nanother line here").addresses).toHaveLength(2);
	});
	it("takes the first column of CSV rows", () => {
		const out = parseAddresses('1 Macquarie St Sydney,extra,cols\n100 George St Sydney,x');
		expect(out.addresses).toEqual(["1 Macquarie St Sydney", "100 George St Sydney"]);
	});
	it("strips surrounding double quotes from CSV cells", () => {
		const out = parseAddresses('"1 Macquarie St, Sydney",foo');
		expect(out.addresses).toEqual(["1 Macquarie St, Sydney"]);
	});
	it("rejects entries shorter than 5 chars with an error", () => {
		const out = parseAddresses("ok address line\nabc");
		expect(out.error).toMatch(/at least 5/i);
	});
	it("rejects more than MAX_BATCH entries", () => {
		const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => `address number ${i}`).join("\n");
		expect(parseAddresses(many).error).toMatch(/1,?000/);
	});
	it("returns an error for empty input", () => {
		expect(parseAddresses("   ").error).toMatch(/no addresses/i);
	});
});
```

- [ ] **Step 2: Run it — expect FAIL**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/components/batch/parse-addresses.test.ts
```

- [ ] **Step 3: Implement `parse-addresses.ts`**

```typescript
export const MAX_BATCH = 1000;
const MIN_LEN = 5;

export interface ParseResult {
	addresses: string[];
	error: string | null;
}

/** Strip one layer of surrounding double quotes and unescape doubled quotes. */
function unquote(cell: string): string {
	const trimmed = cell.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
		return trimmed.slice(1, -1).replace(/""/g, '"');
	}
	return trimmed;
}

/** Take the first CSV column of a line, honoring simple quoted cells. */
function firstColumn(line: string): string {
	if (line.startsWith('"')) {
		// find the closing quote (allowing escaped "")
		let i = 1;
		while (i < line.length) {
			if (line[i] === '"') {
				if (line[i + 1] === '"') {
					i += 2;
					continue;
				}
				break;
			}
			i += 1;
		}
		return unquote(line.slice(0, i + 1));
	}
	const comma = line.indexOf(",");
	return unquote(comma === -1 ? line : line.slice(0, comma));
}

/**
 * Parse pasted text OR CSV into a list of address strings.
 * - One address per line; for CSV rows, the first column is used.
 * - Blank lines dropped; each surviving line must be >= 5 chars.
 */
export function parseAddresses(input: string): ParseResult {
	const lines = input
		.split(/\r?\n/)
		.map((line) => firstColumn(line))
		.filter((line) => line.length > 0);

	if (lines.length === 0) {
		return { addresses: [], error: "No addresses found." };
	}
	if (lines.length > MAX_BATCH) {
		return { addresses: [], error: `Too many addresses (${lines.length}). Maximum is 1,000 per job.` };
	}
	const tooShort = lines.find((line) => line.length < MIN_LEN);
	if (tooShort) {
		return { addresses: [], error: `Each address must be at least 5 characters: "${tooShort}"` };
	}
	return { addresses: lines, error: null };
}
```

- [ ] **Step 4: Run the test — expect PASS (7 tests)** then commit

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm vitest run src/components/batch/parse-addresses.test.ts
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/batch/parse-addresses.ts apps/web/src/components/batch/parse-addresses.test.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): add pure address/CSV parser for batch geocoding"
```

---

## Task 4: Batch page — input, submit, polling progress

**Files:**
- Create: `apps/web/src/components/batch/batch-input.tsx`
- Create: `apps/web/src/components/batch/job-progress.tsx`
- Modify: `apps/web/src/routes/_protected/batch.tsx`

- [ ] **Step 1: Batch input component**

```typescript
import { Button } from "@locnative/ui/components/button";
import { Textarea } from "@locnative/ui/components/textarea";
import { useRef, useState } from "react";

export interface BatchInputProps {
	submitting: boolean;
	onSubmit: (text: string) => void;
}

export function BatchInput({ submitting, onSubmit }: BatchInputProps) {
	const [text, setText] = useState("");
	const fileRef = useRef<HTMLInputElement>(null);

	const onFile = async (file: File) => {
		const content = await file.text();
		setText(content);
	};

	return (
		<div className="space-y-2">
			<Textarea
				className="min-h-[180px] font-mono text-sm"
				onChange={(e) => setText(e.target.value)}
				placeholder={"Paste one address per line, or upload a CSV.\n1 Macquarie St Sydney NSW\n100 George St Sydney NSW"}
				value={text}
			/>
			<input
				accept=".csv,.txt"
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) {
						onFile(f);
					}
				}}
				ref={fileRef}
				type="file"
			/>
			<div className="flex gap-2">
				<Button onClick={() => fileRef.current?.click()} variant="outline">Upload CSV</Button>
				<Button disabled={submitting || text.trim().length === 0} onClick={() => onSubmit(text)}>
					{submitting ? "Submitting…" : "Geocode batch"}
				</Button>
			</div>
		</div>
	);
}
```
> Verify `Textarea` is exported from `@locnative/ui/components/textarea` (it is, per the components list). Adjust import if needed.

- [ ] **Step 2: Job progress component**

```typescript
import { Progress } from "@locnative/ui/components/progress";

export interface JobProgressProps {
	status: string;
	processedCount: number;
	inputCount: number;
	error?: string | null;
}

export function JobProgress({ status, processedCount, inputCount, error }: JobProgressProps) {
	const pct = inputCount > 0 ? Math.round((processedCount / inputCount) * 100) : 0;
	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="flex items-center justify-between text-sm">
				<span className="font-medium capitalize">{status}</span>
				<span className="text-muted-foreground">{processedCount}/{inputCount}</span>
			</div>
			<Progress value={status === "completed" ? 100 : pct} />
			{error ? <p className="text-destructive text-sm">{error}</p> : null}
		</div>
	);
}
```

- [ ] **Step 3: Wire the page with polling** — `apps/web/src/routes/_protected/batch.tsx` (replace placeholder). Polls `batchPoll` every 1.5s while status is pending/processing using a `setInterval` in an effect (keep it simple; TanStack Query refetchInterval is also fine but a manual interval avoids extra wiring).

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@locnative/ui/components/card";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ActiveProjectSelector } from "@/components/active-project-selector";
import { BatchInput } from "@/components/batch/batch-input";
import { JobProgress } from "@/components/batch/job-progress";
import { parseAddresses } from "@/components/batch/parse-addresses";
import { useActiveProject } from "@/lib/active-project";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/batch")({ component: RouteComponent });

type PollResult = Awaited<ReturnType<typeof orpcClient.geocode.batchPoll>>;

function RouteComponent() {
	const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
	const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
	const { activeId, select } = useActiveProject(projectIds);

	const [submitting, setSubmitting] = useState(false);
	const [job, setJob] = useState<PollResult | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		orpcClient.projects.list()
			.then((rows) => setProjects(rows.map((r) => ({ id: r.id, name: r.name }))))
			.catch(() => toast.error("Failed to load projects."));
	}, []);

	const stopPolling = useCallback(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
	}, []);

	useEffect(() => stopPolling, [stopPolling]);

	const startPolling = useCallback((projectId: string, jobId: string) => {
		stopPolling();
		pollRef.current = setInterval(async () => {
			try {
				const res = await orpcClient.geocode.batchPoll({ projectId, jobId });
				setJob(res);
				if (res.status === "completed" || res.status === "failed") {
					stopPolling();
				}
			} catch {
				stopPolling();
			}
		}, 1500);
	}, [stopPolling]);

	const handleSubmit = async (text: string) => {
		if (!activeId) {
			return;
		}
		const parsed = parseAddresses(text);
		if (parsed.error) {
			toast.error(parsed.error);
			return;
		}
		setSubmitting(true);
		try {
			const res = await orpcClient.geocode.batchSubmit({ projectId: activeId, addresses: parsed.addresses });
			setJob({ jobId: res.jobId, status: res.status, inputCount: res.inputCount, processedCount: 0, completedAt: null, error: null });
			startPolling(activeId, res.jobId);
			toast.success("Batch submitted.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to submit batch.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="space-y-4">
			<ActiveProjectSelector activeId={activeId} onSelect={select} projects={projects} />
			<Card>
				<CardHeader><CardTitle className="text-sm">Batch geocoding</CardTitle></CardHeader>
				<CardContent className="space-y-4">
					<BatchInput onSubmit={handleSubmit} submitting={submitting} />
					{job ? (
						<JobProgress
							error={job.error}
							inputCount={job.inputCount}
							processedCount={job.processedCount}
							status={job.status}
						/>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
```
> The results table + export + job history are added in Task 5. This step delivers submit + live progress.

- [ ] **Step 4: Build + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -8
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/batch/batch-input.tsx apps/web/src/components/batch/job-progress.tsx apps/web/src/routes/_protected/batch.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): batch geocoding page with submit + polling progress"
```

---

## Task 5: Results table, export, and job history

**Files:**
- Create: `apps/web/src/components/batch/results-table.tsx`
- Create: `apps/web/src/components/batch/job-history.tsx`
- Modify: `apps/web/src/routes/_protected/batch.tsx`

- [ ] **Step 1: Results table + CSV/JSON export `results-table.tsx`**

```typescript
import { Button } from "@locnative/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";

export interface BatchResultRow {
	input: string;
	matched: boolean;
	address?: {
		formattedAddress: string;
		latitude: number;
		longitude: number;
	};
	error?: string;
}

export interface ResultsTableProps {
	results: BatchResultRow[];
}

function download(filename: string, content: string, type: string) {
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function toCsv(results: BatchResultRow[]): string {
	const header = "input,matched,formatted_address,latitude,longitude,error";
	const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
	const rows = results.map((r) =>
		[
			escape(r.input),
			r.matched ? "true" : "false",
			escape(r.address?.formattedAddress ?? ""),
			r.address?.latitude ?? "",
			r.address?.longitude ?? "",
			escape(r.error ?? ""),
		].join(",")
	);
	return [header, ...rows].join("\n");
}

export function ResultsTable({ results }: ResultsTableProps) {
	return (
		<div className="space-y-2">
			<div className="flex justify-end gap-2">
				<Button onClick={() => download("geocode-results.csv", toCsv(results), "text/csv")} size="sm" variant="outline">
					Export CSV
				</Button>
				<Button onClick={() => download("geocode-results.json", JSON.stringify(results, null, 2), "application/json")} size="sm" variant="outline">
					Export JSON
				</Button>
			</div>
			<div className="max-h-[360px] overflow-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Input</TableHead>
							<TableHead>Matched address</TableHead>
							<TableHead>Lat/Lng</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{results.map((r, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: results are a static snapshot
							<TableRow key={i}>
								<TableCell className="max-w-[200px] truncate text-xs">{r.input}</TableCell>
								<TableCell className="text-xs">
									{r.matched ? r.address?.formattedAddress : <span className="text-destructive">{r.error ?? "No match"}</span>}
								</TableCell>
								<TableCell className="text-xs">
									{r.matched && r.address ? `${r.address.latitude.toFixed(5)}, ${r.address.longitude.toFixed(5)}` : "—"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Job history `job-history.tsx`**

```typescript
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";

export interface JobHistoryItem {
	id: string;
	status: string;
	inputCount: number;
	processedCount: number;
	createdAt: string;
}

export interface JobHistoryProps {
	jobs: JobHistoryItem[];
	onSelect: (jobId: string) => void;
}

export function JobHistory({ jobs, onSelect }: JobHistoryProps) {
	if (jobs.length === 0) {
		return <p className="py-4 text-center text-muted-foreground text-sm">No jobs yet.</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Job</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Size</TableHead>
					<TableHead>Created</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{jobs.map((j) => (
					<TableRow className="cursor-pointer" key={j.id} onClick={() => onSelect(j.id)}>
						<TableCell className="font-mono text-xs">{j.id.slice(0, 8)}</TableCell>
						<TableCell className="text-xs capitalize">{j.status}</TableCell>
						<TableCell className="text-xs">{j.inputCount}</TableCell>
						<TableCell className="text-xs">{new Date(j.createdAt).toLocaleString()}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

- [ ] **Step 3: Wire into `batch.tsx`** — fetch results when a job completes, render `<ResultsTable>`; load + show `<JobHistory>`; clicking a completed history job loads its results.

Add imports + state + logic:
```typescript
import { ResultsTable, type BatchResultRow } from "@/components/batch/results-table";
import { JobHistory, type JobHistoryItem } from "@/components/batch/job-history";

	const [results, setResults] = useState<BatchResultRow[] | null>(null);
	const [jobs, setJobs] = useState<JobHistoryItem[]>([]);

	const loadResults = useCallback(async (projectId: string, jobId: string) => {
		try {
			const res = await orpcClient.geocode.batchResults({ projectId, jobId });
			setResults(res.results as BatchResultRow[]);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load results.");
		}
	}, []);

	const refreshJobs = useCallback(async (projectId: string) => {
		try {
			const res = await orpcClient.geocode.batchList({ projectId });
			setJobs(res.jobs.map((j) => ({
				id: j.id,
				status: j.status,
				inputCount: j.inputCount,
				processedCount: j.processedCount,
				createdAt: typeof j.createdAt === "string" ? j.createdAt : new Date(j.createdAt).toISOString(),
			})));
		} catch { /* non-critical */ }
	}, []);
```
- In `useEffect([activeId])`, also call `refreshJobs(activeId)`.
- In `startPolling`, when status becomes `completed`, call `loadResults(projectId, jobId)` and `refreshJobs(projectId)`.
- Render `<ResultsTable results={results} />` when `results` is non-null, and a "Recent jobs" card with `<JobHistory jobs={jobs} onSelect={(id) => activeId && loadResults(activeId, id)} />`.

- [ ] **Step 4: Build + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -8
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/batch/results-table.tsx apps/web/src/components/batch/job-history.tsx apps/web/src/routes/_protected/batch.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(web): batch results table with export + job history"
```

---

## Task 6: SDK types

**Files:**
- Modify: `packages/sdk/src/types.ts`

- [ ] **Step 1: Append batch dashboard types** (append only — Phase 2 also appends here; keep line-additive)

```typescript
// --- Batch geocoding (dashboard) ---

export interface DashboardBatchJobSummary {
	id: string;
	status: "pending" | "processing" | "completed" | "failed";
	inputCount: number;
	processedCount: number;
	createdAt: string;
	completedAt: string | null;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/packages/sdk && pnpm check-types 2>&1 | grep -i error || echo "no errors"
git -C /Users/mac/Developer/projects/locnative.com add packages/sdk/src/types.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "feat(sdk): add dashboard batch job summary type"
```

---

## Done — Phase 3 complete

End state: `/batch` page — pick a project, paste or upload addresses (≤1000, validated), submit, watch live progress, view the results table, export CSV/JSON, and browse/reopen recent jobs.

**Central post-merge actions (controller, not this plan):** apply migration `0012` to Neon; if Task 2 Step 0 found `env` is NOT threaded into the RPC context, ensure `apps/server/src/index.ts` passes `env` to the RPC handler context (so dashboard submit can enqueue) before redeploying the server worker.
