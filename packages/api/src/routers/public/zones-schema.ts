import { z } from "zod";

const ringSchema = z
	.array(z.tuple([z.number(), z.number()]))
	.min(4, "Ring must have at least 4 coordinate pairs")
	.refine(
		(coords) => {
			const first = coords[0];
			const last = coords.at(-1);
			return first && last && first[0] === last[0] && first[1] === last[1];
		},
		{
			message:
				"Ring must be closed (first and last coordinates must be identical)",
		}
	);

export const geoJsonPolygonSchema = z.object({
	type: z.literal("Polygon"),
	coordinates: z
		.array(ringSchema)
		.min(1, "Polygon coordinates must not be empty"),
});

export type GeoJsonPolygon = z.infer<typeof geoJsonPolygonSchema>;
