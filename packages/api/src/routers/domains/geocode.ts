import {
	type AutocompleteResult,
	autocompleteAddresses,
} from "@locnative/database/queries";
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";
import {
	createBatchGeocodeJob,
	getBatchGeocodeJob,
	getBatchGeocodeResults,
	listBatchGeocodeJobs,
	MAX_BATCH_ADDRESSES,
} from "../../shared/batch-geocode.ts";
import { requireProjectOwnership } from "../../shared/project-ownership.ts";

const projectIdInput = z.object({ projectId: z.string().uuid() });

export interface GeocodeCandidate {
	formattedAddress: string;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	postcode: string;
	state: string;
}

export function mapAutocompleteCandidates(
	results: AutocompleteResult[]
): GeocodeCandidate[] {
	return results.map((r) => ({
		id: r.id,
		formattedAddress: r.formattedAddress,
		locality: r.locality,
		state: r.state,
		postcode: r.postcode,
		latitude: r.latitude,
		longitude: r.longitude,
	}));
}

export const geocodeRouter = {
	batchSubmit: protectedProcedure
		.input(
			projectIdInput.extend({
				addresses: z
					.array(z.string().min(5))
					.min(1)
					.max(MAX_BATCH_ADDRESSES, "Maximum 1,000 addresses per job"),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const ctx = context as typeof context & {
				// biome-ignore lint/suspicious/noExplicitAny: CF Queue binding not typed in this package
				env?: { BATCH_GEOCODE_QUEUE?: any };
			};
			return createBatchGeocodeJob(context.db, {
				projectId,
				apiKeyId: null,
				addresses: input.addresses,
				queue: ctx.env?.BATCH_GEOCODE_QUEUE,
			});
		}),

	batchPoll: protectedProcedure
		.input(projectIdInput.extend({ jobId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const job = await getBatchGeocodeJob(context.db, projectId, input.jobId);
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
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			const ctx = context as typeof context & {
				// biome-ignore lint/suspicious/noExplicitAny: CF R2 binding not typed in this package
				env?: { GEOCODE_RESULTS?: any };
			};
			return getBatchGeocodeResults(
				context.db,
				projectId,
				input.jobId,
				ctx.env?.GEOCODE_RESULTS
			);
		}),

	batchList: protectedProcedure
		.input(
			projectIdInput.extend({
				limit: z.number().int().min(1).max(50).default(20),
			})
		)
		.handler(async ({ context, input }) => {
			const projectId = await requireProjectOwnership(
				context.db,
				input.projectId,
				context.session.user.id
			);
			return listBatchGeocodeJobs(context.db, projectId, input.limit);
		}),

	autocomplete: protectedProcedure
		.input(
			z.object({
				q: z.string().min(3),
				limit: z.number().int().min(1).max(10).default(5),
			})
		)
		.handler(async ({ context, input }) => {
			const { results } = await autocompleteAddresses(context.db, input.q, {
				limit: input.limit,
			});
			return { results: mapAutocompleteCandidates(results) };
		}),
};
