import { autocompleteAddresses } from "@locnative/database/queries";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { ValidatedApiKey } from "../../api-key-auth.ts";
import { o as baseBuilder } from "../../builder.ts";
import {
	createBatchGeocodeJob,
	getBatchGeocodeJob,
	getBatchGeocodeResults,
	MAX_BATCH_ADDRESSES,
} from "../../shared/batch-geocode.ts";
import { apiKeyAuth, usageMiddleware } from "../public-middleware.ts";
// buildGeocodeQuery lives in the env-free geocode-query.ts module so it stays
// unit-testable without loading serverEnv.
import { buildGeocodeQuery } from "./geocode-query.ts";

// ---------------------------------------------------------------------------
// Input schema — uses string literals since GET query params are always strings.
// Preprocess adds structured:"false" when the param is absent so callers can
// use plain ?q=... without explicitly passing structured=false.
// ---------------------------------------------------------------------------

const geocodeInput = z.preprocess(
	(data: unknown) => {
		if (
			typeof data === "object" &&
			data !== null &&
			!("structured" in (data as Record<string, unknown>))
		) {
			return { ...(data as Record<string, unknown>), structured: "false" };
		}
		return data;
	},
	z.discriminatedUnion("structured", [
		z.object({
			structured: z.literal("true"),
			street: z
				.string()
				.min(1, "Parameter 'street' is required in structured mode."),
			locality: z
				.string()
				.min(1, "Parameter 'locality' is required in structured mode."),
			state: z.string().optional(),
			postcode: z.string().optional(),
			country: z.string().optional(),
		}),
		z.object({
			structured: z.literal("false"),
			q: z
				.string()
				.min(5, "Query parameter 'q' must be at least 5 characters."),
			country: z.string().optional(),
			state: z.string().optional(),
		}),
	])
);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const forwardGeocode = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.geocode"))
	.route({
		method: "GET",
		path: "/api/v1/addresses/geocode",
		summary: "Forward geocode an address",
		tags: ["addresses"],
	})
	.input(geocodeInput)
	.handler(async ({ input, context }) => {
		const isStructured = input.structured === "true";

		// Build the query string
		let query: string;
		let country: string | undefined;
		let state: string | undefined;

		if (isStructured) {
			query = buildGeocodeQuery({
				structured: "true",
				street: input.street,
				locality: input.locality,
				state: input.state,
			});
			country = input.country;
			state = input.state;
		} else {
			query = buildGeocodeQuery({ structured: "false", q: input.q });
			country = input.country;
			state = input.state;
		}

		const { results } = await autocompleteAddresses(context.db, query, {
			country,
			state,
			limit: 1,
			// Skip the levenshtein/dmetaphone last-resort fallbacks: they drive the
			// cold-cache cost on unmatched queries and rarely yield a correct
			// geocode. word_similarity still provides typo tolerance.
			phoneticFallback: false,
		});

		if (results.length === 0) {
			throw new ORPCError("NOT_FOUND", {
				message: "No address found matching the query.",
			});
		}

		// biome-ignore lint: length check above guarantees existence
		const result = results[0]!;

		return {
			address: {
				id: result.id,
				formattedAddress: result.formattedAddress,
				streetAddress: result.streetAddress,
				streetName: result.streetName ?? null,
				streetNumber: result.streetNumber ?? null,
				streetType: result.streetType ?? null,
				locality: result.locality,
				state: result.state,
				postcode: result.postcode,
				country: result.country,
				latitude: result.latitude,
				longitude: result.longitude,
			},
			matchType: isStructured ? ("structured" as const) : ("fuzzy" as const),
		};
	});

// ---------------------------------------------------------------------------
// Batch geocoding handlers
// ---------------------------------------------------------------------------

export const batchGeocodeSubmit = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.batch"))
	.route({
		method: "POST",
		path: "/api/v1/geocode/batch",
		summary: "Submit batch geocoding job",
		tags: ["addresses"],
	})
	.input(
		z.object({
			addresses: z
				.array(z.string().min(5))
				.min(1)
				.max(MAX_BATCH_ADDRESSES, "Maximum 1,000 addresses per job"),
		})
	)
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & {
			validatedApiKey: ValidatedApiKey;
			// biome-ignore lint/suspicious/noExplicitAny: CF Queue binding not typed in this package
			env?: { BATCH_GEOCODE_QUEUE?: any };
		};
		const projectId = ctx.validatedApiKey.projectId;
		if (!projectId) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "No project associated with this API key.",
			});
		}

		return await createBatchGeocodeJob(context.db, {
			projectId,
			apiKeyId: ctx.validatedApiKey.apiKeyId,
			addresses: input.addresses,
			queue: ctx.env?.BATCH_GEOCODE_QUEUE,
		});
	});

export const batchGeocodePoll = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.batch.poll"))
	.route({
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}",
		summary: "Poll batch geocoding job",
		tags: ["addresses"],
	})
	.input(z.object({ jobId: z.string().uuid() }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & {
			validatedApiKey: ValidatedApiKey;
		};
		const projectId = ctx.validatedApiKey.projectId;
		if (!projectId) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "No project associated with this API key.",
			});
		}

		const job = await getBatchGeocodeJob(context.db, projectId, input.jobId);
		return {
			jobId: job.id,
			status: job.status,
			inputCount: job.inputCount,
			processedCount: job.processedCount,
			completedAt: job.completedAt,
			error: job.error,
			downloadUrl:
				job.status === "completed"
					? `/api/v1/geocode/batch/${job.id}/results`
					: null,
		};
	});

export const batchGeocodeResults = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.batch.results"))
	.route({
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}/results",
		summary: "Download batch geocoding results",
		tags: ["addresses"],
	})
	.input(z.object({ jobId: z.string().uuid() }))
	.handler(async ({ input, context }) => {
		const ctx = context as typeof context & {
			validatedApiKey: ValidatedApiKey;
			// biome-ignore lint/suspicious/noExplicitAny: CF R2 binding not typed in this package
			env?: { GEOCODE_RESULTS?: any };
		};
		const projectId = ctx.validatedApiKey.projectId;
		if (!projectId) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "No project associated with this API key.",
			});
		}

		return await getBatchGeocodeResults(
			context.db,
			projectId,
			input.jobId,
			ctx.env?.GEOCODE_RESULTS
		);
	});
