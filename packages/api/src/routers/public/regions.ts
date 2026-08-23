import { z } from "zod";
import {
	groupRegionsByLayer,
	parseLayers,
	regionsContainingPoint,
} from "../../shared/region-queries.ts";
import {
	apiKeyAuth,
	publicApiProcedure,
	usageMiddleware,
} from "../public-middleware.ts";

export const regionsClassify = publicApiProcedure
	.use(apiKeyAuth)
	.use(usageMiddleware("regions.classify"))
	.route({
		method: "GET",
		path: "/api/v1/regions",
		summary: "Classify a coordinate into administrative regions",
		tags: ["regions"],
	})
	.input(
		// GET query params arrive as strings — coerce like every other GET handler.
		// Bare z.number() makes the OpenAPI handler reject every request with 400.
		z.object({
			lat: z.coerce.number().min(-90).max(90),
			lng: z.coerce.number().min(-180).max(180),
			layers: z.string().optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const { lat, lng } = input;
		const layers = parseLayers(input.layers);
		const rows = await regionsContainingPoint(context.db, lat, lng, layers);
		return { query: { lat, lng }, regions: groupRegionsByLayer(rows) };
	});
