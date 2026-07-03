import { db } from "@locnative/api";
import { autocompleteAddresses } from "@locnative/database/queries";
import { batchGeocodeJobs } from "@locnative/database/schema";
import { eq } from "drizzle-orm";

export interface BatchGeocodeMessage {
	addresses: string[];
	jobId: string;
	projectId: string;
	type: "batch-geocode";
}

export interface BatchGeocodeResult {
	address?: {
		id: number;
		formattedAddress: string;
		latitude: number;
		longitude: number;
		country: string;
		state: string;
		locality: string;
		postcode: string;
	};
	error?: string;
	input: string;
	matched: boolean;
}

export async function processBatchGeocodeMessage(
	msg: BatchGeocodeMessage,
	// R2Bucket comes from @cloudflare/workers-types; use structural typing here
	env: { GEOCODE_RESULTS: R2Bucket }
): Promise<void> {
	try {
		const results: BatchGeocodeResult[] = [];

		for (const address of msg.addresses) {
			try {
				const { results: matches } = await autocompleteAddresses(db, address, {
					limit: 1,
				});
				const m = matches[0];
				if (m) {
					results.push({
						input: address,
						matched: true,
						address: {
							id: m.id,
							formattedAddress: m.formattedAddress,
							latitude: m.latitude,
							longitude: m.longitude,
							country: m.country,
							state: m.state,
							locality: m.locality,
							postcode: m.postcode,
						},
					});
				} else {
					results.push({ input: address, matched: false });
				}
			} catch (err) {
				results.push({
					input: address,
					matched: false,
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}

		const r2Key = `geocode-jobs/${msg.projectId}/${msg.jobId}.json`;
		await env.GEOCODE_RESULTS.put(r2Key, JSON.stringify(results), {
			httpMetadata: { contentType: "application/json" },
		});

		await db
			.update(batchGeocodeJobs)
			.set({
				status: "completed",
				processedCount: results.length,
				resultsR2Key: r2Key,
				completedAt: new Date(),
			})
			.where(eq(batchGeocodeJobs.id, msg.jobId));
	} catch (err) {
		await db
			.update(batchGeocodeJobs)
			.set({
				status: "failed",
				error: err instanceof Error ? err.message : "Unknown error",
				completedAt: new Date(),
			})
			.where(eq(batchGeocodeJobs.id, msg.jobId));
		throw err; // let CF Queue retry / DLQ
	}
}
