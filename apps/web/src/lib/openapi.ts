import { createApiErrorBody } from "./api-response";

const errorSchema = {
	type: "object",
	required: ["error"],
	properties: {
		error: {
			type: "object",
			required: ["code", "message"],
			properties: {
				code: {
					type: "string",
					enum: ["bad_request", "internal_error", "not_found", "unauthorized"],
				},
				message: { type: "string" },
			},
		},
	},
} as const;

export const getOpenApiDocument = () =>
	({
		openapi: "3.1.0",
		info: {
			title: "Locnative Public API",
			version: "1.0.0",
			description:
				"Production-grade address lookup endpoints for autocomplete, reverse geocoding, nearby search, and canonical address retrieval.",
		},
		servers: [{ url: "https://api.locnative.com" }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "API Key",
					description: "Send `Authorization: Bearer wh_<id>_<secret>`.",
				},
				apiKeyAuth: {
					type: "apiKey",
					in: "header",
					name: "X-API-Key",
				},
			},
			schemas: {
				ApiError: errorSchema,
			},
		},
		security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
		paths: {
			"/api/v1/addresses/autocomplete": {
				get: {
					operationId: "addresses.autocomplete",
					summary: "Autocomplete addresses",
					parameters: [
						{
							name: "q",
							in: "query",
							required: true,
							schema: { type: "string", minLength: 2 },
							description: "Free-form address query.",
						},
						{
							name: "country",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "Optional country filter such as `AU`.",
						},
						{
							name: "state",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "Optional state filter such as `VIC`.",
						},
						{
							name: "limit",
							in: "query",
							required: false,
							schema: { type: "integer", minimum: 1, maximum: 20, default: 10 },
							description: "Maximum results to return.",
						},
					],
					responses: {
						"200": {
							description: "Autocomplete matches",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["results", "count"],
										properties: {
											results: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
											count: { type: "integer" },
										},
									},
								},
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
									example: createApiErrorBody(
										"bad_request",
										"Query parameter 'q' must be at least 2 characters."
									),
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
									example: createApiErrorBody(
										"unauthorized",
										"Invalid, revoked, or expired API key."
									),
								},
							},
						},
					},
				},
			},
			"/api/v1/addresses/reverse": {
				get: {
					operationId: "addresses.reverse",
					summary: "Reverse geocode coordinates",
					parameters: [
						{
							name: "lat",
							in: "query",
							required: true,
							schema: { type: "number", minimum: -90, maximum: 90 },
						},
						{
							name: "lng",
							in: "query",
							required: true,
							schema: { type: "number", minimum: -180, maximum: 180 },
						},
					],
					responses: {
						"200": {
							description: "Nearest address result",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["address", "distance", "query"],
										properties: {
											address: { type: "object", additionalProperties: true },
											distance: { type: "integer" },
											query: { type: "object", additionalProperties: true },
										},
									},
								},
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "No address found",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/addresses/nearby": {
				get: {
					operationId: "addresses.nearby",
					summary: "Find nearby addresses",
					parameters: [
						{
							name: "lat",
							in: "query",
							required: true,
							schema: { type: "number", minimum: -90, maximum: 90 },
						},
						{
							name: "lng",
							in: "query",
							required: true,
							schema: { type: "number", minimum: -180, maximum: 180 },
						},
						{
							name: "radius",
							in: "query",
							required: false,
							schema: {
								type: "number",
								minimum: 1,
								maximum: 50_000,
								default: 1000,
							},
						},
						{
							name: "limit",
							in: "query",
							required: false,
							schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
						},
						{
							name: "country",
							in: "query",
							required: false,
							schema: { type: "string" },
						},
					],
					responses: {
						"200": {
							description: "Nearby address results",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["results", "count", "query"],
										properties: {
											results: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
											count: { type: "integer" },
											query: { type: "object", additionalProperties: true },
										},
									},
								},
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/addresses/{id}": {
				get: {
					operationId: "addresses.byId",
					summary: "Get address by ID",
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "integer" },
							description: "Canonical address ID from a prior response.",
						},
					],
					responses: {
						"200": {
							description: "Canonical address payload",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["id"],
										properties: {
											id: { type: "integer" },
										},
										additionalProperties: true,
									},
								},
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Unknown address ID",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			// --- Forward geocode ---
			"/api/v1/addresses/geocode": {
				get: {
					operationId: "addresses.geocode",
					summary: "Forward geocode an address",
					tags: ["addresses"],
					parameters: [
						{
							name: "q",
							in: "query",
							required: false,
							schema: { type: "string", minLength: 5 },
							description:
								"Unstructured address text (min 5 chars). Omit when using structured mode.",
						},
						{
							name: "structured",
							in: "query",
							required: false,
							schema: { type: "string", enum: ["true", "false"] },
							description:
								"Set to `true` to use structured field inputs instead of `q`.",
						},
						{
							name: "street",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "Street address line (structured mode).",
						},
						{
							name: "locality",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "Suburb or city name (structured mode).",
						},
						{
							name: "state",
							in: "query",
							required: false,
							schema: { type: "string" },
							description:
								"State abbreviation such as `VIC` (structured mode).",
						},
						{
							name: "postcode",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "Postcode (structured mode).",
						},
						{
							name: "country",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "Country code such as `AU`.",
						},
					],
					responses: {
						"200": {
							description: "Best-matching address with coordinates.",
							content: {
								"application/json": {
									schema: { type: "object", additionalProperties: true },
								},
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "No address found.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			// --- Batch geocode ---
			"/api/v1/geocode/batch": {
				post: {
					operationId: "geocode.batch.submit",
					summary: "Submit a batch geocoding job",
					tags: ["addresses"],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["addresses"],
									properties: {
										addresses: {
											type: "array",
											items: { type: "string" },
											description: "List of address strings to geocode.",
										},
									},
								},
							},
						},
					},
					responses: {
						"202": {
							description: "Job accepted — returns jobId for polling.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["jobId"],
										properties: { jobId: { type: "string" } },
									},
								},
							},
						},
						"400": {
							description: "Validation error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/geocode/batch/{jobId}": {
				get: {
					operationId: "geocode.batch.poll",
					summary: "Poll batch geocoding job status",
					tags: ["addresses"],
					parameters: [
						{
							name: "jobId",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Job ID returned by the batch submit endpoint.",
						},
					],
					responses: {
						"200": {
							description:
								"Job status (pending | processing | completed | failed).",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["jobId", "status"],
										properties: {
											jobId: { type: "string" },
											status: {
												type: "string",
												enum: ["pending", "processing", "completed", "failed"],
											},
											total: { type: "integer" },
											processed: { type: "integer" },
										},
									},
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Unknown job ID.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/geocode/batch/{jobId}/results": {
				get: {
					operationId: "geocode.batch.results",
					summary: "Fetch completed batch geocoding results",
					tags: ["addresses"],
					parameters: [
						{
							name: "jobId",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Job ID returned by the batch submit endpoint.",
						},
					],
					responses: {
						"200": {
							description: "Array of geocoded results, one per input address.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["results"],
										properties: {
											results: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
										},
									},
								},
							},
						},
						"400": {
							description: "Job not yet completed.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Unknown job ID.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			// --- Zones ---
			"/api/v1/zones": {
				post: {
					operationId: "zones.create",
					summary: "Create a zone",
					tags: ["zones"],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["projectId", "name", "geometry"],
									properties: {
										projectId: { type: "string" },
										name: { type: "string" },
										geometry: {
											type: "object",
											description: "GeoJSON Polygon geometry.",
											additionalProperties: true,
										},
									},
								},
							},
						},
					},
					responses: {
						"201": {
							description: "Zone created.",
							content: {
								"application/json": {
									schema: { type: "object", additionalProperties: true },
								},
							},
						},
						"400": {
							description:
								"Validation error (e.g. invalid geometry, 500-zone limit).",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
				get: {
					operationId: "zones.list",
					summary: "List zones for a project",
					tags: ["zones"],
					parameters: [
						{
							name: "projectId",
							in: "query",
							required: true,
							schema: { type: "string" },
							description: "Project identifier.",
						},
					],
					responses: {
						"200": {
							description: "Array of zone records.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["zones"],
										properties: {
											zones: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
										},
									},
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/zones/{id}": {
				get: {
					operationId: "zones.get",
					summary: "Get a zone by ID",
					tags: ["zones"],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Zone identifier.",
						},
					],
					responses: {
						"200": {
							description: "Zone record with geometry.",
							content: {
								"application/json": {
									schema: { type: "object", additionalProperties: true },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Zone not found.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
				put: {
					operationId: "zones.update",
					summary: "Update a zone",
					tags: ["zones"],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Zone identifier.",
						},
					],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										name: { type: "string" },
										geometry: {
											type: "object",
											description: "Replacement GeoJSON Polygon geometry.",
											additionalProperties: true,
										},
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Updated zone record.",
							content: {
								"application/json": {
									schema: { type: "object", additionalProperties: true },
								},
							},
						},
						"400": {
							description: "Validation error.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Zone not found.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
				delete: {
					operationId: "zones.delete",
					summary: "Delete a zone",
					tags: ["zones"],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Zone identifier.",
						},
					],
					responses: {
						"204": { description: "Zone deleted." },
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Zone not found.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/zones/contains": {
				get: {
					operationId: "zones.contains",
					summary: "Point-in-polygon zone test",
					tags: ["zones"],
					parameters: [
						{
							name: "projectId",
							in: "query",
							required: true,
							schema: { type: "string" },
							description: "Project identifier.",
						},
						{
							name: "lat",
							in: "query",
							required: true,
							schema: { type: "number", minimum: -90, maximum: 90 },
							description: "Latitude of the point to test.",
						},
						{
							name: "lng",
							in: "query",
							required: true,
							schema: { type: "number", minimum: -180, maximum: 180 },
							description: "Longitude of the point to test.",
						},
					],
					responses: {
						"200": {
							description: "List of zones that contain the point.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["zones"],
										properties: {
											zones: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
										},
									},
								},
							},
						},
						"400": {
							description: "Validation error.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/zones/{id}/addresses": {
				get: {
					operationId: "zones.addresses",
					summary: "List addresses inside a zone",
					tags: ["zones"],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Zone identifier.",
						},
						{
							name: "limit",
							in: "query",
							required: false,
							schema: {
								type: "integer",
								minimum: 1,
								maximum: 10_000,
								default: 100,
							},
							description: "Maximum addresses to return (capped at 10 000).",
						},
						{
							name: "offset",
							in: "query",
							required: false,
							schema: { type: "integer", minimum: 0, default: 0 },
							description: "Pagination offset.",
						},
					],
					responses: {
						"200": {
							description: "Paginated addresses inside the zone.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["addresses", "total"],
										properties: {
											addresses: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
											total: { type: "integer" },
										},
									},
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Zone not found.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			// --- Devices ---
			"/api/v1/devices/{deviceId}/location": {
				post: {
					operationId: "devices.location.push",
					summary: "Push a device location update",
					tags: ["devices"],
					parameters: [
						{
							name: "deviceId",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Caller-assigned device identifier.",
						},
					],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["projectId", "lat", "lng"],
									properties: {
										projectId: { type: "string" },
										lat: { type: "number", minimum: -90, maximum: 90 },
										lng: { type: "number", minimum: -180, maximum: 180 },
										timestamp: {
											type: "string",
											format: "date-time",
											description:
												"ISO-8601 timestamp (defaults to server time).",
										},
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description:
								"Location recorded; zone crossings (if any) returned.",
							content: {
								"application/json": {
									schema: { type: "object", additionalProperties: true },
								},
							},
						},
						"400": {
							description: "Validation error.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/devices/{deviceId}/zones": {
				get: {
					operationId: "devices.zones",
					summary: "Get current zones for a device",
					tags: ["devices"],
					parameters: [
						{
							name: "deviceId",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Caller-assigned device identifier.",
						},
						{
							name: "projectId",
							in: "query",
							required: true,
							schema: { type: "string" },
							description: "Project identifier.",
						},
					],
					responses: {
						"200": {
							description: "Zones the device is currently inside.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["zones"],
										properties: {
											zones: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
										},
									},
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Device not found.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			// --- Webhooks ---
			"/api/v1/webhooks": {
				post: {
					operationId: "webhooks.create",
					summary: "Create a webhook subscription",
					tags: ["webhooks"],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["projectId", "url", "events"],
									properties: {
										projectId: { type: "string" },
										url: { type: "string", format: "uri" },
										events: {
											type: "array",
											items: {
												type: "string",
												enum: ["zone.enter", "zone.exit"],
											},
										},
									},
								},
							},
						},
					},
					responses: {
						"201": {
							description:
								"Webhook created — includes once-shown signing secret.",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["id", "signingSecret"],
										properties: {
											id: { type: "string" },
											signingSecret: { type: "string" },
										},
										additionalProperties: true,
									},
								},
							},
						},
						"400": {
							description: "Validation error.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
				get: {
					operationId: "webhooks.list",
					summary: "List webhook subscriptions",
					tags: ["webhooks"],
					parameters: [
						{
							name: "projectId",
							in: "query",
							required: true,
							schema: { type: "string" },
							description: "Project identifier.",
						},
					],
					responses: {
						"200": {
							description:
								"Array of webhook records (signing secret not included).",
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["webhooks"],
										properties: {
											webhooks: {
												type: "array",
												items: { type: "object", additionalProperties: true },
											},
										},
									},
								},
							},
						},
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/v1/webhooks/{id}": {
				delete: {
					operationId: "webhooks.delete",
					summary: "Delete a webhook subscription",
					tags: ["webhooks"],
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "Webhook subscription identifier.",
						},
					],
					responses: {
						"204": { description: "Webhook deleted." },
						"401": {
							description: "Authentication error",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
						"404": {
							description: "Webhook not found.",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
		},
	}) as const;
