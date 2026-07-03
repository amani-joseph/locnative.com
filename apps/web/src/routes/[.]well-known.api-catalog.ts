import { createFileRoute } from "@tanstack/react-router";

/**
 * RFC 9727 API catalog. Advertises the public geocoding API and its
 * discovery resources (OpenAPI description, human docs, health status) as an
 * RFC 9264 linkset so automated agents can discover the API surface.
 */
export const Route = createFileRoute("/.well-known/api-catalog")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const { origin } = new URL(request.url);

				const linkset = [
					{
						anchor: `${origin}/api/v1`,
						"service-desc": [
							{
								href: `${origin}/api/openapi/json`,
								type: "application/json",
								title: "Locnative geocoding API — OpenAPI description",
							},
						],
						"service-doc": [
							{
								href: `${origin}/docs`,
								type: "text/html",
								title: "Locnative API documentation",
							},
						],
						status: [
							{
								href: `${origin}/api/health`,
								type: "application/json",
								title: "Locnative API health status",
							},
						],
					},
				];

				return new Response(JSON.stringify({ linkset }, null, 2), {
					headers: {
						"content-type": "application/linkset+json",
						"cache-control": "public, max-age=3600",
					},
				});
			},
		},
	},
});
