import { createFileRoute } from "@tanstack/react-router";
import { getOpenApiDocument } from "../../lib/openapi";

export const Route = createFileRoute("/api/openapi.json")({
	server: {
		handlers: {
			GET: async () =>
				Response.json(getOpenApiDocument(), {
					headers: {
						"cache-control": "public, max-age=300",
					},
				}),
		},
	},
});
