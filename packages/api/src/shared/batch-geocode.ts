// ---------------------------------------------------------------------------
// Shared batch-geocode job logic.
//
// Both the public API (API-key auth, projectId from the key) and the dashboard
// RPC router (session auth, projectId via ownership check) need the same
// create / fetch / results / list behaviour. This module holds that logic so
// the two routers only differ in how they authenticate and shape responses.
// ---------------------------------------------------------------------------

import type { Database } from "@locnative/database";
import { batchGeocodeJobs } from "@locnative/database/schema";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";

export const MAX_BATCH_ADDRESSES = 1000;

// Structural CF binding types — avoids a hard @cloudflare/workers-types dep here.
export interface BatchGeocodeQueue {
	send: (message: {
		type: "batch-geocode";
		jobId: string;
		addresses: string[];
		projectId: string;
	}) => Promise<void>;
}

export interface GeocodeResultsBucket {
	get: (key: string) => Promise<{ json: () => Promise<unknown> } | null>;
}

/**
 * Insert a batch-geocode job and, when a queue binding is present, enqueue it.
 * The job is marked `processing` on a successful enqueue, or `failed` if the
 * enqueue throws (in which case an INTERNAL_SERVER_ERROR is raised).
 */
export async function createBatchGeocodeJob(
	db: Database,
	opts: {
		projectId: string;
		apiKeyId: string | null;
		addresses: string[];
		queue?: BatchGeocodeQueue;
	}
): Promise<{
	jobId: string;
	status: "pending" | "processing";
	inputCount: number;
}> {
	const { projectId, apiKeyId, addresses, queue } = opts;

	const [job] = await db
		.insert(batchGeocodeJobs)
		.values({
			projectId,
			apiKeyId,
			status: "pending",
			inputCount: addresses.length,
		})
		.returning({ id: batchGeocodeJobs.id });

	if (!job) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to create batch job.",
		});
	}

	if (!queue) {
		return { jobId: job.id, status: "pending", inputCount: addresses.length };
	}

	try {
		await queue.send({
			type: "batch-geocode",
			jobId: job.id,
			addresses,
			projectId,
		});
		await db
			.update(batchGeocodeJobs)
			.set({ status: "processing" })
			.where(eq(batchGeocodeJobs.id, job.id));
	} catch {
		await db
			.update(batchGeocodeJobs)
			.set({ status: "failed", error: "Failed to enqueue job." })
			.where(eq(batchGeocodeJobs.id, job.id));
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to enqueue batch job. Please retry.",
		});
	}

	return { jobId: job.id, status: "processing", inputCount: addresses.length };
}

/** Fetch a job scoped to its project, or throw NOT_FOUND. */
export async function getBatchGeocodeJob(
	db: Database,
	projectId: string,
	jobId: string
) {
	const [job] = await db
		.select()
		.from(batchGeocodeJobs)
		.where(
			and(
				eq(batchGeocodeJobs.id, jobId),
				eq(batchGeocodeJobs.projectId, projectId)
			)
		)
		.limit(1);
	if (!job) {
		throw new ORPCError("NOT_FOUND", { message: "Job not found." });
	}
	return job;
}

/** Read a completed job's results from R2, scoped to its project. */
export async function getBatchGeocodeResults(
	db: Database,
	projectId: string,
	jobId: string,
	bucket?: GeocodeResultsBucket
): Promise<{ results: unknown[]; count: number }> {
	const [job] = await db
		.select({
			status: batchGeocodeJobs.status,
			resultsR2Key: batchGeocodeJobs.resultsR2Key,
		})
		.from(batchGeocodeJobs)
		.where(
			and(
				eq(batchGeocodeJobs.id, jobId),
				eq(batchGeocodeJobs.projectId, projectId)
			)
		)
		.limit(1);

	if (!job) {
		throw new ORPCError("NOT_FOUND", { message: "Job not found." });
	}
	if (job.status !== "completed" || !job.resultsR2Key) {
		throw new ORPCError("NOT_FOUND", {
			message: `Results not ready. Job status: ${job.status}`,
		});
	}
	if (!bucket) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Storage binding unavailable.",
		});
	}

	const obj = await bucket.get(job.resultsR2Key);
	if (!obj) {
		throw new ORPCError("NOT_FOUND", { message: "Results file not found." });
	}
	const results = (await obj.json()) as unknown[];
	return { results, count: results.length };
}

/** List recent jobs for a project, newest first. */
export async function listBatchGeocodeJobs(
	db: Database,
	projectId: string,
	limit: number
) {
	const jobs = await db
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
		.limit(limit);
	return { jobs, count: jobs.length };
}
