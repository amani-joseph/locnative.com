const TRAILING_CONTINUATION_RE = / \\$/;

export interface ApiParam {
	description: string;
	example?: string;
	name: string;
	required: boolean;
	type: string;
}

export type ApiEndpointId =
	| "addresses.autocomplete"
	| "addresses.byId"
	| "addresses.nearby"
	| "addresses.reverse"
	// Geocoding
	| "addresses.geocode"
	| "geocode.batch.submit"
	| "geocode.batch.poll"
	| "geocode.batch.results"
	// Zones
	| "zones.create"
	| "zones.list"
	| "zones.get"
	| "zones.update"
	| "zones.delete"
	| "zones.contains"
	| "zones.addresses"
	// Devices
	| "devices.location.push"
	| "devices.zones"
	// Webhooks
	| "webhooks.create"
	| "webhooks.list"
	| "webhooks.delete"
	| "webhooks.reactivate"
	// Regions
	| "regions.classify"
	// Routing
	| "routing.directions";

export interface ApiEndpoint {
	description: string;
	/** Example JSON request body for non-GET (docs-only) endpoints' curl example. */
	exampleBody?: Record<string, unknown>;
	id: ApiEndpointId;
	method: "GET" | "POST" | "PUT" | "DELETE";
	params: ApiParam[];
	path: string;
	summary: string;
}

export const apiExplorerEndpoints: ApiEndpoint[] = [
	{
		id: "addresses.autocomplete",
		method: "GET",
		path: "/api/v1/addresses/autocomplete",
		summary: "Autocomplete addresses",
		description:
			"Search for addresses matching a partial query string. Returns up to 20 results ordered by relevance.",
		params: [
			{
				name: "q",
				type: "string",
				required: true,
				description: "Search query (minimum 2 characters)",
				example: "123 Main",
			},
			{
				name: "country",
				type: "string",
				required: false,
				description: "Filter by country code (e.g. US, GB, AU)",
				example: "US",
			},
			{
				name: "state",
				type: "string",
				required: false,
				description: "Filter by state/region (e.g. NY, NSW)",
				example: "NY",
			},
			{
				name: "limit",
				type: "number",
				required: false,
				description: "Maximum results to return (1-20, default 10)",
				example: "10",
			},
		],
	},
	{
		id: "addresses.byId",
		method: "GET",
		path: "/api/v1/addresses/{id}",
		summary: "Get address by ID",
		description:
			"Retrieve a single address record by its unique numeric identifier.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Unique address ID",
				example: "1",
			},
		],
	},
	{
		id: "addresses.nearby",
		method: "GET",
		path: "/api/v1/addresses/nearby",
		summary: "Find nearby addresses",
		description:
			"Find addresses within a given radius of a geographic coordinate. Results are ordered by distance.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude (-90 to 90)",
				example: "-37.8136",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude (-180 to 180)",
				example: "144.9631",
			},
			{
				name: "radius",
				type: "number",
				required: false,
				description: "Search radius in meters (max 50000, default 1000)",
				example: "500",
			},
			{
				name: "limit",
				type: "number",
				required: false,
				description: "Maximum results to return (1-50, default 10)",
				example: "10",
			},
			{
				name: "country",
				type: "string",
				required: false,
				description: "Filter by country code",
				example: "US",
			},
		],
	},
	{
		id: "addresses.reverse",
		method: "GET",
		path: "/api/v1/addresses/reverse",
		summary: "Reverse geocode",
		description:
			"Find the closest address to a given coordinate. Searches within 200 meters and returns the single nearest match.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude (-90 to 90)",
				example: "-37.8136",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude (-180 to 180)",
				example: "144.9631",
			},
		],
	},
	// --- Geocoding (GET endpoints are executable; POST is docs-only) ---
	{
		id: "addresses.geocode",
		method: "GET",
		path: "/api/v1/addresses/geocode",
		summary: "Forward geocode an address",
		description:
			"Resolve a free-form address string or structured fields to a canonical address with coordinates.",
		params: [
			{
				name: "q",
				type: "string",
				required: false,
				description: "Unstructured address text (minimum 5 characters)",
				example: "123 Main St Melbourne VIC",
			},
			{
				name: "structured",
				type: "string",
				required: false,
				description: "Set to true to use structured field inputs",
				example: "false",
			},
			{
				name: "street",
				type: "string",
				required: false,
				description: "Street address line (structured mode)",
				example: "123 Main St",
			},
			{
				name: "locality",
				type: "string",
				required: false,
				description: "Suburb or city name (structured mode)",
				example: "Melbourne",
			},
			{
				name: "state",
				type: "string",
				required: false,
				description: "State abbreviation (structured mode)",
				example: "VIC",
			},
			{
				name: "postcode",
				type: "string",
				required: false,
				description: "Postcode (structured mode)",
				example: "3000",
			},
			{
				name: "country",
				type: "string",
				required: false,
				description: "Country code",
				example: "AU",
			},
		],
	},
	// POST /geocode/batch — docs-only (not wired to GET-only sendRequest proxy)
	{
		id: "geocode.batch.submit",
		method: "POST",
		path: "/api/v1/geocode/batch",
		summary: "Submit a batch geocoding job",
		description:
			"Submit an array of address strings for background geocoding. Returns a jobId immediately. POST with JSON body — use the curl example in the docs page to test.",
		params: [],
		exampleBody: {
			addresses: [
				"20 W 34th St New York NY 10001",
				"221B Baker St London NW1 6XE",
			],
		},
	},
	{
		id: "geocode.batch.poll",
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}",
		summary: "Poll batch job status",
		description:
			"Check the status of a running batch geocoding job. Poll until status is completed or failed.",
		params: [
			{
				name: "jobId",
				type: "string",
				required: true,
				description: "Job ID (UUID) returned by batch submit",
				example: "550e8400-e29b-41d4-a716-446655440000",
			},
		],
	},
	{
		id: "geocode.batch.results",
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}/results",
		summary: "Fetch completed batch results",
		description:
			"Retrieve geocoded results once the batch job status is completed.",
		params: [
			{
				name: "jobId",
				type: "string",
				required: true,
				description: "Job ID (UUID) returned by batch submit",
				example: "550e8400-e29b-41d4-a716-446655440000",
			},
		],
	},
	// --- Zones (GET endpoints executable; POST/PUT/DELETE docs-only) ---
	// POST /zones — docs-only
	{
		id: "zones.create",
		method: "POST",
		path: "/api/v1/zones",
		summary: "Create a zone",
		description:
			"Create a named geofence zone defined by a GeoJSON Polygon. POST with JSON body — use the curl example in the docs page to test.",
		params: [],
		exampleBody: {
			name: "Melbourne CBD",
			description: "Central business district",
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[144.96, -37.81],
						[144.97, -37.81],
						[144.97, -37.82],
						[144.96, -37.81],
					],
				],
			},
		},
	},
	{
		id: "zones.list",
		method: "GET",
		path: "/api/v1/zones",
		summary: "List zones for a project",
		description:
			"Return zones for the API key's project, including GeoJSON geometry. The project is derived from the API key — no projectId param is required.",
		params: [
			{
				name: "page",
				type: "number",
				required: false,
				description: "Page number (default 1)",
				example: "1",
			},
			{
				name: "limit",
				type: "number",
				required: false,
				description: "Results per page (1-100, default 20)",
				example: "20",
			},
		],
	},
	{
		id: "zones.get",
		method: "GET",
		path: "/api/v1/zones/{id}",
		summary: "Get a zone by ID",
		description: "Fetch a single zone record including geometry.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Numeric zone ID",
				example: "1",
			},
		],
	},
	// PUT /zones/{id} — docs-only
	{
		id: "zones.update",
		method: "PUT",
		path: "/api/v1/zones/{id}",
		summary: "Update a zone",
		description:
			"Replace a zone's name or geometry. PUT with JSON body — use the curl example in the docs page to test.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Numeric zone ID",
				example: "1",
			},
		],
		exampleBody: {
			name: "Updated zone name",
		},
	},
	// DELETE /zones/{id} — docs-only
	{
		id: "zones.delete",
		method: "DELETE",
		path: "/api/v1/zones/{id}",
		summary: "Delete a zone",
		description:
			"Permanently delete a zone. DELETE request — use the curl example in the docs page to test.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Numeric zone ID",
				example: "1",
			},
		],
	},
	{
		id: "zones.contains",
		method: "GET",
		path: "/api/v1/zones/contains",
		summary: "Point-in-polygon zone test",
		description:
			"Test whether a coordinate falls inside any zone in the API key's project using PostGIS ST_Contains.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude (-90 to 90)",
				example: "-37.8136",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude (-180 to 180)",
				example: "144.9631",
			},
		],
	},
	{
		id: "zones.addresses",
		method: "GET",
		path: "/api/v1/zones/{id}/addresses",
		summary: "List addresses inside a zone",
		description:
			"Return paginated addresses whose coordinates fall inside the zone polygon.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Numeric zone ID",
				example: "1",
			},
			{
				name: "page",
				type: "number",
				required: false,
				description: "Page number (default 1)",
				example: "1",
			},
			{
				name: "limit",
				type: "number",
				required: false,
				description: "Addresses per page (1-500, default 50)",
				example: "50",
			},
		],
	},
	// --- Devices (POST is docs-only; GET executable) ---
	// POST /devices/{deviceId}/location — docs-only
	{
		id: "devices.location.push",
		method: "POST",
		path: "/api/v1/devices/{deviceId}/location",
		summary: "Push a device location update",
		description:
			"Record a device position and detect zone crossings. POST with JSON body — use the curl example in the docs page to test.",
		params: [
			{
				name: "deviceId",
				type: "string",
				required: true,
				description: "Device identifier",
				example: "truck-42",
			},
		],
		exampleBody: {
			lat: -37.8136,
			lng: 144.9631,
		},
	},
	{
		id: "devices.zones",
		method: "GET",
		path: "/api/v1/devices/{deviceId}/zones",
		summary: "Get current zones for a device",
		description:
			"Return the zones that contain the device's most recently recorded position.",
		params: [
			{
				name: "deviceId",
				type: "string",
				required: true,
				description: "Device identifier",
				example: "truck-42",
			},
		],
	},
	// --- Webhooks (POST/DELETE docs-only; GET executable) ---
	// POST /webhooks — docs-only
	{
		id: "webhooks.create",
		method: "POST",
		path: "/api/v1/webhooks",
		summary: "Create a webhook subscription",
		description:
			"Subscribe to zone boundary crossing events. POST with JSON body — use the curl example in the docs page to test.",
		params: [],
		exampleBody: {
			url: "https://example.com/webhooks/locnative",
			events: ["entry", "exit"],
		},
	},
	{
		id: "webhooks.list",
		method: "GET",
		path: "/api/v1/webhooks",
		summary: "List webhook subscriptions",
		description:
			"Return all webhook subscriptions for the API key's project (signing secret not included).",
		params: [],
	},
	// DELETE /webhooks/{id} — docs-only
	{
		id: "webhooks.delete",
		method: "DELETE",
		path: "/api/v1/webhooks/{id}",
		summary: "Delete a webhook subscription",
		description:
			"Permanently remove a webhook subscription. DELETE request — use the curl example in the docs page to test.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Numeric webhook subscription ID",
				example: "1",
			},
		],
	},
	{
		id: "webhooks.reactivate",
		method: "POST",
		path: "/api/v1/webhooks/{id}/reactivate",
		summary: "Reactivate a disabled webhook subscription",
		description:
			"Re-enable a webhook subscription that was automatically disabled after repeated delivery failures. POST request with no body.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Numeric webhook subscription ID",
				example: "1",
			},
		],
	},
	// --- Regions ---
	{
		id: "regions.classify",
		method: "GET",
		path: "/api/v1/regions",
		summary: "Classify a coordinate into administrative regions",
		description:
			"Returns the official ABS/ASGS administrative regions that contain a coordinate — state, SA1–SA4, LGA, postcode (POA), electoral divisions, and mesh block. Results are keyed by layer. Optionally filter with the `layers` parameter.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude (-90 to 90)",
				example: "-37.8136",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude (-180 to 180)",
				example: "144.9631",
			},
			{
				name: "layers",
				type: "string",
				required: false,
				description:
					"Comma-separated layer filter (state,sa1,sa2,sa3,sa4,lga,poa,ced,sed,mb). Omit to return all layers.",
				example: "sa2,lga,poa",
			},
		],
	},
	// --- Routing ---
	{
		id: "routing.directions",
		method: "GET",
		path: "/api/v1/routing/directions",
		summary: "Driving directions between two points",
		description:
			"Returns driving distance (m), duration (s), and route geometry (GeoJSON LineString) between two points. Accept coordinates (from/to as lat,lng) or G-NAF address IDs (fromAddressId/toAddressId).",
		params: [
			{
				name: "from",
				type: "string",
				required: false,
				description: 'Origin as "lat,lng" (or use fromAddressId)',
				example: "-37.8136,144.9631",
			},
			{
				name: "to",
				type: "string",
				required: false,
				description: 'Destination as "lat,lng" (or use toAddressId)',
				example: "-33.8688,151.2093",
			},
			{
				name: "fromAddressId",
				type: "number",
				required: false,
				description: "Origin G-NAF address id (alternative to from)",
				example: "12345",
			},
			{
				name: "toAddressId",
				type: "number",
				required: false,
				description: "Destination G-NAF address id (alternative to to)",
				example: "67890",
			},
		],
	},
];

export const apiExplorerEndpointMap = new Map(
	apiExplorerEndpoints.map((endpoint) => [endpoint.id, endpoint])
);

export const buildApiExplorerUrl = (
	endpoint: ApiEndpoint,
	paramValues: Record<string, string>
): string => {
	let url = endpoint.path;

	for (const param of endpoint.params) {
		const pathToken = `{${param.name}}`;
		if (url.includes(pathToken)) {
			url = url.replace(pathToken, paramValues[param.name] ?? "");
		}
	}

	const queryParams = endpoint.params.filter(
		(param) => !endpoint.path.includes(`{${param.name}}`)
	);
	const searchParts: string[] = [];

	for (const param of queryParams) {
		const value = paramValues[param.name];
		if (value) {
			searchParts.push(
				`${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`
			);
		}
	}

	if (searchParts.length > 0) {
		url = `${url}?${searchParts.join("&")}`;
	}

	return url;
};

/**
 * Build a copyable curl snippet for docs-only (non-GET) endpoints. Path params
 * are substituted from the provided values (falling back to their example), and
 * the JSON body comes from the endpoint's `exampleBody`. Used by the explorer UI
 * to document POST/PUT/DELETE endpoints the GET-only proxy cannot execute.
 */
export const buildApiExplorerCurl = (
	endpoint: ApiEndpoint,
	baseUrl: string,
	paramValues: Record<string, string> = {}
): string => {
	let path = endpoint.path;
	for (const param of endpoint.params) {
		const pathToken = `{${param.name}}`;
		if (path.includes(pathToken)) {
			const value = paramValues[param.name] || param.example || param.name;
			path = path.replace(pathToken, value);
		}
	}

	const lines = [
		`curl -X ${endpoint.method} '${baseUrl}${path}' \\`,
		"  -H 'Authorization: Bearer wh_<id>_<secret>' \\",
	];

	if (endpoint.exampleBody) {
		lines.push("  -H 'Content-Type: application/json' \\");
		lines.push(`  -d '${JSON.stringify(endpoint.exampleBody, null, 2)}'`);
	} else {
		// Drop the trailing line-continuation on the final line.
		lines[lines.length - 1] =
			lines.at(-1)?.replace(TRAILING_CONTINUATION_RE, "") ?? "";
	}

	return lines.join("\n");
};
