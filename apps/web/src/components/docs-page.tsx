"use client";

import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from "@locnative/ui/components/sidebar";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@locnative/ui/components/tabs";
import { cn } from "@locnative/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
	AlertTriangleIcon,
	ArrowRightIcon,
	BookOpenIcon,
	BracesIcon,
	Code2Icon,
	KeyRoundIcon,
	LocateFixedIcon,
	MapPinIcon,
	SearchIcon,
	TerminalIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DocsBackground } from "@/components/backgrounds/docs-background";
import { LogoIcon } from "@/components/logo";

interface DocsSectionLink {
	href: string;
	title: string;
}

interface DocsSectionGroup {
	items: DocsSectionLink[];
	label: string;
}

interface EndpointParam {
	description: string;
	name: string;
	required: boolean;
	type: string;
}

interface EndpointDoc {
	description: string;
	exampleResponse: string;
	href: string;
	method: "GET" | "POST" | "PUT" | "DELETE";
	notes: string[];
	params: EndpointParam[];
	path: string;
	summary: string;
	title: string;
}

const docsNavGroups: DocsSectionGroup[] = [
	{
		label: "Getting Started",
		items: [
			{ title: "Overview", href: "#overview" },
			{ title: "Quickstart", href: "#quickstart" },
			{ title: "OpenAPI Spec", href: "#openapi-spec" },
			{ title: "JS/TS SDK", href: "#js-ts-sdk" },
			{ title: "Authentication", href: "#authentication" },
		],
	},
	{
		label: "React UI",
		items: [
			{ title: "Overview", href: "#react-ui" },
			{ title: "AddressAutocomplete", href: "#react-address-autocomplete" },
			{ title: "AddressFormField", href: "#react-address-form-field" },
			{ title: "AddressFieldGroup", href: "#react-address-field-group" },
			{ title: "ForwardGeocodeInput", href: "#react-forward-geocode" },
			{ title: "ReverseGeocodeInput", href: "#react-reverse-geocode" },
		],
	},
	{
		label: "Vue UI",
		items: [
			{ title: "Overview", href: "#vue-ui" },
			{ title: "Available Today", href: "#vue-available" },
			{ title: "Components (Phase 2)", href: "#vue-components" },
		],
	},
	{
		label: "Core Endpoints",
		items: [
			{ title: "Autocomplete", href: "#autocomplete" },
			{ title: "Reverse Geocoding", href: "#reverse" },
			{ title: "Nearby Search", href: "#nearby" },
			{ title: "Address by ID", href: "#address-by-id" },
		],
	},
	{
		label: "Geocoding",
		items: [
			{ title: "Forward Geocode", href: "#forward-geocode" },
			{ title: "Batch Submit", href: "#batch-submit" },
			{ title: "Batch Poll", href: "#batch-poll" },
			{ title: "Batch Results", href: "#batch-results" },
			{ title: "Batch Lifecycle", href: "#batch-lifecycle" },
		],
	},
	{
		label: "Zones",
		items: [
			{ title: "Create Zone", href: "#zone-create" },
			{ title: "List Zones", href: "#zone-list" },
			{ title: "Get Zone", href: "#zone-get" },
			{ title: "Update Zone", href: "#zone-update" },
			{ title: "Delete Zone", href: "#zone-delete" },
			{ title: "Zone Contains", href: "#zone-contains" },
			{ title: "Zone Addresses", href: "#zone-addresses" },
		],
	},
	{
		label: "Devices",
		items: [
			{ title: "Push Location", href: "#device-location" },
			{ title: "Device Zones", href: "#device-zones" },
		],
	},
	{
		label: "Webhooks",
		items: [
			{ title: "Create Webhook", href: "#webhook-create" },
			{ title: "List Webhooks", href: "#webhook-list" },
			{ title: "Delete Webhook", href: "#webhook-delete" },
			{ title: "Webhook Delivery", href: "#webhook-delivery" },
		],
	},
	{
		label: "Regions",
		items: [{ title: "Classify Coordinate", href: "#regions-classify" }],
	},
	{
		label: "Implementation Notes",
		items: [
			{ title: "Errors and Constraints", href: "#errors-and-constraints" },
			{ title: "Health Checks", href: "#health-checks" },
			{ title: "Integration Checklist", href: "#integration-checklist" },
			{ title: "Next Steps", href: "#next-steps" },
		],
	},
];

const quickstartCode = {
	curl: `curl "https://api.locnative.com/api/v1/addresses/autocomplete?q=123+Main+St&country=US" \\
  -H "Authorization: Bearer wh_live_your_api_key"`,
	javascript: `const response = await fetch(
  "https://api.locnative.com/api/v1/addresses/autocomplete?q=123+Main+St&country=US",
  {
    headers: {
      Authorization: "Bearer wh_live_your_api_key",
    },
  }
);

if (!response.ok) {
  throw new Error("Request failed");
}

const payload = await response.json();`,
	sdk: `import { createLocnativeClient } from "@locnative/sdk";

const client = createLocnativeClient({
  apiKey: process.env.LOCNATIVE_API_KEY!,
});

const payload = await client.addresses.autocomplete({
  q: "123 Main St",
  country: "US",
  limit: 5,
});`,
	python: `import requests

response = requests.get(
    "https://api.locnative.com/api/v1/addresses/autocomplete",
    params={"q": "123 Main St", "country": "US"},
    headers={"Authorization": "Bearer wh_live_your_api_key"},
    timeout=10,
)
response.raise_for_status()
payload = response.json()`,
} as const;

const endpointDocs: EndpointDoc[] = [
	{
		title: "Autocomplete",
		href: "#autocomplete",
		method: "GET",
		path: "/api/v1/addresses/autocomplete",
		summary: "Search for matching addresses as a user types.",
		description:
			"Autocomplete returns up to 20 ranked address candidates for a partial query. It is the best default starting point for signup forms, checkout flows, address capture, and internal tools that need fast suggestions without embedding a map SDK.",
		params: [
			{
				name: "q",
				type: "string",
				required: true,
				description: "Free-form address input. Must be at least 2 characters.",
			},
			{
				name: "country",
				type: "string",
				required: false,
				description: "Optional country filter such as `US`, `GB`, or `AU`.",
			},
			{
				name: "state",
				type: "string",
				required: false,
				description:
					"Optional state/region filter such as `NY`, `ON`, or `NSW`.",
			},
			{
				name: "limit",
				type: "number",
				required: false,
				description:
					"Maximum results to return. Defaults to 10 and is capped at 20.",
			},
		],
		notes: [
			"Requests with a query shorter than 2 characters return `400`.",
			"Use `country` and `state` filters to keep search results tight for known regions.",
			"Successful `2xx` requests are counted toward usage for the calling API key.",
		],
		exampleResponse: `{
  "results": [
    {
      "id": 104233,
      "formattedAddress": "20 W 34th St, New York NY 10001, US",
      "streetAddress": "20 W 34th St",
      "locality": "New York",
      "state": "NY",
      "postcode": "10001",
      "country": "US",
      "latitude": 40.7484,
      "longitude": -73.9857
    }
  ],
  "count": 1
}`,
	},
	{
		title: "Reverse Geocoding",
		href: "#reverse",
		method: "GET",
		path: "/api/v1/addresses/reverse",
		summary: "Resolve a coordinate pair to the nearest address.",
		description:
			"Reverse geocoding searches for the closest address within 200 meters of the provided coordinate pair and returns a single best match. This is a strong fit for mobile location capture, driver tooling, and QA flows that need to validate map-selected points.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude value between -90 and 90.",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude value between -180 and 180.",
			},
		],
		notes: [
			"Invalid or out-of-range coordinates return `400`.",
			"If no address exists within 200 meters, the API returns `404`.",
			"The response includes `distance` so you can reason about match quality.",
		],
		exampleResponse: `{
  "address": {
    "id": 215078,
    "formattedAddress": "221B Baker St, London NW1 6XE, GB",
    "streetAddress": "221B Baker St",
    "locality": "London",
    "state": "",
    "postcode": "NW1 6XE",
    "country": "GB",
    "longitude": -0.1585,
    "latitude": 51.5237,
    "confidence": 90
  },
  "distance": 14,
  "query": {
    "lat": 51.5237,
    "lng": -0.1585
  }
}`,
	},
	{
		title: "Nearby Search",
		href: "#nearby",
		method: "GET",
		path: "/api/v1/addresses/nearby",
		summary: "Find addresses inside a radius around a coordinate.",
		description:
			"Nearby search returns multiple address records ordered by distance from the query point. It is useful when you need to inspect candidate addresses near an asset, confirm catchment coverage, or build operational tooling for support and logistics teams.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude value between -90 and 90.",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude value between -180 and 180.",
			},
			{
				name: "radius",
				type: "number",
				required: false,
				description:
					"Radius in meters. Defaults to 1000 and is capped at 50000.",
			},
			{
				name: "limit",
				type: "number",
				required: false,
				description:
					"Maximum results to return. Defaults to 10 and is capped at 50.",
			},
			{
				name: "country",
				type: "string",
				required: false,
				description: "Optional country filter such as `US`, `GB`, or `AU`.",
			},
		],
		notes: [
			"Results are ordered by computed geographic distance from the query point.",
			"Country filters are normalized to uppercase before execution.",
			"Use smaller radii for operational tooling to avoid noisy address lists.",
		],
		exampleResponse: `{
  "results": [
    {
      "id": 318842,
      "country": "IS",
      "state": "",
      "locality": "Reykjavík",
      "postcode": "101",
      "streetName": "Laugavegur",
      "streetType": "",
      "numberFirst": "26",
      "longitude": -21.9270,
      "latitude": 64.1430,
      "distance": 35
    }
  ],
  "count": 1,
  "query": {
    "lat": 64.1466,
    "lng": -21.9426,
    "radius": 500
  }
}`,
	},
	{
		title: "Address by ID",
		href: "#address-by-id",
		method: "GET",
		path: "/api/v1/addresses/{id}",
		summary: "Fetch the canonical address record for a known identifier.",
		description:
			"After you have selected an address from autocomplete or another indexed flow, use the address ID endpoint to retrieve the underlying record again without re-running search. This keeps downstream workflows deterministic and removes ambiguity around free-form input.",
		params: [
			{
				name: "id",
				type: "number",
				required: true,
				description: "Numeric address identifier returned by search responses.",
			},
		],
		notes: [
			"Non-numeric IDs return `400`.",
			"Unknown IDs return `404`.",
			"The full address payload includes canonical fields such as `gnafPid` and `confidence` when available.",
		],
		exampleResponse: `{
  "id": 287513,
  "country": "CA",
  "state": "ON",
  "locality": "Ottawa",
  "postcode": "K1A 0B1",
  "streetName": "Elgin",
  "streetType": "St",
  "streetSuffix": null,
  "buildingName": null,
  "flatType": null,
  "flatNumber": null,
  "levelType": null,
  "levelNumber": null,
  "numberFirst": "150",
  "numberLast": null,
  "longitude": -75.6989,
  "latitude": 45.4201,
  "confidence": 88,
  "gnafPid": null
}`,
	},
	// --- Geocoding ---
	{
		title: "Forward Geocode",
		href: "#forward-geocode",
		method: "GET",
		path: "/api/v1/addresses/geocode",
		summary: "Resolve an address string or structured fields to a coordinate.",
		description:
			"Forward geocoding converts a human-readable address into a canonical address record with latitude and longitude. Pass an unstructured query in `q` or set `structured=true` and supply individual fields (`street`, `locality`, `state`, `postcode`). The server returns the single best match.",
		params: [
			{
				name: "q",
				type: "string",
				required: false,
				description:
					"Unstructured address text (minimum 5 characters). Omit when using structured mode.",
			},
			{
				name: "structured",
				type: "string",
				required: false,
				description:
					"Set to `true` to use structured field inputs instead of `q`.",
			},
			{
				name: "street",
				type: "string",
				required: false,
				description: "Street address line (structured mode).",
			},
			{
				name: "locality",
				type: "string",
				required: false,
				description: "Suburb or city name (structured mode).",
			},
			{
				name: "state",
				type: "string",
				required: false,
				description:
					"State/region code such as `NY` or `VIC` (structured mode).",
			},
			{
				name: "postcode",
				type: "string",
				required: false,
				description: "Postcode (structured mode).",
			},
			{
				name: "country",
				type: "string",
				required: false,
				description: "Country code such as `US`.",
			},
		],
		notes: [
			"Either `q` or `structured=true` with at least one field is required.",
			"Returns `404` when no match can be found.",
			"The response shape mirrors the autocomplete candidate object.",
		],
		exampleResponse: `{
  "id": 198452,
  "formattedAddress": "1600 Pennsylvania Ave NW, Washington DC 20500, US",
  "streetAddress": "1600 Pennsylvania Ave NW",
  "locality": "Washington",
  "state": "DC",
  "postcode": "20500",
  "country": "US",
  "latitude": 38.8977,
  "longitude": -77.0365,
  "confidence": 95
}`,
	},
	{
		title: "Batch Submit",
		href: "#batch-submit",
		method: "POST",
		path: "/api/v1/geocode/batch",
		summary: "Submit a list of addresses for background geocoding.",
		description:
			"Batch geocoding accepts an array of address strings and processes them asynchronously. The endpoint returns a `jobId` immediately; poll `GET /api/v1/geocode/batch/{jobId}` until `status` is `completed`, then fetch results.",
		params: [
			{
				name: "addresses",
				type: "string[]",
				required: true,
				description: "JSON array of address strings to geocode.",
			},
		],
		notes: [
			"Submits as `POST` with a JSON body — not executable in the try-it explorer.",
			"Returns `202 Accepted` with a `jobId` for polling.",
			"See the Batch Lifecycle section for the full submit → poll → results flow.",
		],
		exampleResponse: `{
  "jobId": "job_abc123xyz"
}`,
	},
	{
		title: "Batch Poll",
		href: "#batch-poll",
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}",
		summary: "Check the status of a running batch geocoding job.",
		description:
			"Poll this endpoint after submitting a batch job. When `status` is `completed` the results endpoint is ready. When `status` is `failed` the job encountered an unrecoverable error.",
		params: [
			{
				name: "jobId",
				type: "string",
				required: true,
				description: "Job ID returned by the batch submit endpoint.",
			},
		],
		notes: [
			"Poll at a reasonable interval (e.g. every 2 seconds) — avoid tight loops.",
			"Possible statuses: `pending`, `processing`, `completed`, `failed`.",
			"`processed` and `total` fields are present once processing begins.",
		],
		exampleResponse: `{
  "jobId": "job_abc123xyz",
  "status": "processing",
  "total": 500,
  "processed": 142
}`,
	},
	{
		title: "Batch Results",
		href: "#batch-results",
		method: "GET",
		path: "/api/v1/geocode/batch/{jobId}/results",
		summary: "Retrieve geocoded results for a completed batch job.",
		description:
			"Once `status` is `completed`, fetch the full result set from this endpoint. Results are ordered to match the input array — each entry contains either a resolved address or a `null` match with an error reason.",
		params: [
			{
				name: "jobId",
				type: "string",
				required: true,
				description: "Job ID returned by the batch submit endpoint.",
			},
		],
		notes: [
			"Returns `400` if the job is not yet in `completed` state.",
			"Each result entry includes the original input address and the matched record (or `null`).",
		],
		exampleResponse: `{
  "results": [
    {
      "input": "20 W 34th St New York NY",
      "match": {
        "id": 104233,
        "formattedAddress": "20 W 34th St, New York NY 10001, US",
        "latitude": 40.7484,
        "longitude": -73.9857,
        "confidence": 95
      }
    },
    {
      "input": "not a real address xyz",
      "match": null,
      "error": "no_match"
    }
  ]
}`,
	},
	// --- Zones ---
	{
		title: "Create Zone",
		href: "#zone-create",
		method: "POST",
		path: "/api/v1/zones",
		summary: "Create a geofence zone for a project.",
		description:
			"Creates a named zone defined by a GeoJSON Polygon geometry. Zones are used for point-in-polygon tests, address enumeration, and triggering webhook events when devices enter or exit. Each project may have up to 500 zones.",
		params: [
			{
				name: "projectId",
				type: "string",
				required: true,
				description: "Project identifier.",
			},
			{
				name: "name",
				type: "string",
				required: true,
				description: "Human-readable zone name.",
			},
			{
				name: "geometry",
				type: "object",
				required: true,
				description:
					"GeoJSON Polygon geometry — coordinates must form a closed ring.",
			},
		],
		notes: [
			"Submits as `POST` with a JSON body — not executable in the try-it explorer.",
			"Returns `400` with code `zone_limit_exceeded` when the project has 500 zones.",
			"PostGIS validates the geometry; invalid or unclosed rings return `400`.",
		],
		exampleResponse: `{
  "id": "zone_01HX3K9R",
  "projectId": "proj_abc",
  "name": "Melbourne CBD",
  "createdAt": "2026-06-05T00:00:00.000Z"
}`,
	},
	{
		title: "List Zones",
		href: "#zone-list",
		method: "GET",
		path: "/api/v1/zones",
		summary: "List all zones for a project.",
		description:
			"Returns the full list of zones for the given project. Zone geometry (GeoJSON) is included so the map can render all polygons in one request.",
		params: [
			{
				name: "projectId",
				type: "string",
				required: true,
				description: "Project identifier.",
			},
		],
		notes: [
			"Geometry is included in every zone record for map rendering.",
			"Up to 500 zones are returned (the per-project limit).",
		],
		exampleResponse: `{
  "zones": [
    {
      "id": "zone_01HX3K9R",
      "name": "Melbourne CBD",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[144.95, -37.82], [144.97, -37.82], [144.97, -37.81], [144.95, -37.81], [144.95, -37.82]]]
      },
      "createdAt": "2026-06-05T00:00:00.000Z"
    }
  ]
}`,
	},
	{
		title: "Get Zone",
		href: "#zone-get",
		method: "GET",
		path: "/api/v1/zones/{id}",
		summary: "Fetch a single zone by ID.",
		description:
			"Returns the full zone record including geometry. Useful for re-rendering a specific zone on the map or verifying the stored polygon.",
		params: [
			{
				name: "id",
				type: "string",
				required: true,
				description: "Zone identifier.",
			},
		],
		notes: [
			"Returns `404` for unknown zone IDs.",
			"Geometry is returned as a GeoJSON Polygon.",
		],
		exampleResponse: `{
  "id": "zone_01HX3K9R",
  "projectId": "proj_abc",
  "name": "Melbourne CBD",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[144.95, -37.82], [144.97, -37.82], [144.97, -37.81], [144.95, -37.81], [144.95, -37.82]]]
  },
  "createdAt": "2026-06-05T00:00:00.000Z"
}`,
	},
	{
		title: "Update Zone",
		href: "#zone-update",
		method: "PUT",
		path: "/api/v1/zones/{id}",
		summary: "Update a zone's name or geometry.",
		description:
			"Replaces the zone's name, geometry, or both. Partial updates are supported — omit fields you do not want to change. The geometry is re-validated by PostGIS on every update.",
		params: [
			{
				name: "id",
				type: "string",
				required: true,
				description: "Zone identifier (path parameter).",
			},
			{
				name: "name",
				type: "string",
				required: false,
				description: "New zone name.",
			},
			{
				name: "geometry",
				type: "object",
				required: false,
				description: "Replacement GeoJSON Polygon geometry.",
			},
		],
		notes: [
			"Submits as `PUT` with a JSON body — not executable in the try-it explorer.",
			"Returns `404` for unknown zone IDs.",
			"Invalid geometry returns `400`.",
		],
		exampleResponse: `{
  "id": "zone_01HX3K9R",
  "projectId": "proj_abc",
  "name": "Melbourne CBD (updated)",
  "updatedAt": "2026-06-05T01:00:00.000Z"
}`,
	},
	{
		title: "Delete Zone",
		href: "#zone-delete",
		method: "DELETE",
		path: "/api/v1/zones/{id}",
		summary: "Permanently delete a zone.",
		description:
			"Deletes the zone record. Any webhook subscriptions listening to this zone's boundary events will stop firing. This action cannot be undone.",
		params: [
			{
				name: "id",
				type: "string",
				required: true,
				description: "Zone identifier.",
			},
		],
		notes: [
			"Submits as `DELETE` — not executable in the try-it explorer.",
			"Returns `204 No Content` on success.",
			"Returns `404` for unknown zone IDs.",
		],
		exampleResponse: "204 No Content",
	},
	{
		title: "Zone Contains",
		href: "#zone-contains",
		method: "GET",
		path: "/api/v1/zones/contains",
		summary: "Test whether a coordinate falls inside any zone.",
		description:
			"Point-in-polygon test using PostGIS ST_Contains. Provide a project ID and a coordinate; the API returns all zones that contain the point. Returns an empty array when the point is outside all zones.",
		params: [
			{
				name: "projectId",
				type: "string",
				required: true,
				description: "Project identifier.",
			},
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude (-90 to 90).",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude (-180 to 180).",
			},
		],
		notes: [
			"Returns an empty `zones` array (not `404`) when no zones contain the point.",
			"Uses PostGIS ST_Contains — points exactly on the boundary are included.",
		],
		exampleResponse: `{
  "zones": [
    {
      "id": "zone_01HX3K9R",
      "name": "Melbourne CBD"
    }
  ]
}`,
	},
	{
		title: "Zone Addresses",
		href: "#zone-addresses",
		method: "GET",
		path: "/api/v1/zones/{id}/addresses",
		summary: "List addresses whose coordinates fall inside a zone.",
		description:
			"Returns paginated address records from the GNAF dataset that are spatially contained within the zone polygon. Large zones may contain tens of thousands of addresses; the response is capped at 10 000 per request and includes a `total` count.",
		params: [
			{
				name: "id",
				type: "string",
				required: true,
				description: "Zone identifier.",
			},
			{
				name: "limit",
				type: "number",
				required: false,
				description:
					"Maximum addresses to return. Defaults to 100, capped at 10 000.",
			},
			{
				name: "offset",
				type: "number",
				required: false,
				description: "Pagination offset. Defaults to 0.",
			},
		],
		notes: [
			"When `total` exceeds 10 000 the response is truncated — paginate using `offset`.",
			"Returns `404` for unknown zone IDs.",
		],
		exampleResponse: `{
  "addresses": [
    {
      "id": 104233,
      "formattedAddress": "123 Main St, Melbourne VIC 3000, AU",
      "latitude": -37.8136,
      "longitude": 144.9631
    }
  ],
  "total": 3412
}`,
	},
	// --- Devices ---
	{
		title: "Push Location",
		href: "#device-location",
		method: "POST",
		path: "/api/v1/devices/{deviceId}/location",
		summary: "Record a device's current location and detect zone crossings.",
		description:
			"Upserts the device's latest position. The server runs a PostGIS point-in-polygon check against all project zones and computes enter/exit events relative to the device's previous position. Any zone crossings trigger configured webhook subscriptions.",
		params: [
			{
				name: "deviceId",
				type: "string",
				required: true,
				description: "Caller-assigned device identifier (path parameter).",
			},
			{
				name: "projectId",
				type: "string",
				required: true,
				description: "Project identifier (request body).",
			},
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude (-90 to 90) (request body).",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude (-180 to 180) (request body).",
			},
			{
				name: "timestamp",
				type: "string",
				required: false,
				description: "ISO-8601 timestamp. Defaults to server time.",
			},
		],
		notes: [
			"Submits as `POST` with a JSON body — not executable in the try-it explorer.",
			"Zone crossings in the response are computed relative to the previous position.",
			"Webhook delivery is asynchronous — crossings are returned synchronously here.",
		],
		exampleResponse: `{
  "deviceId": "truck-42",
  "recorded": true,
  "crossings": [
    { "zoneId": "zone_01HX3K9R", "event": "zone.enter" }
  ]
}`,
	},
	{
		title: "Device Zones",
		href: "#device-zones",
		method: "GET",
		path: "/api/v1/devices/{deviceId}/zones",
		summary: "Get the zones a device is currently inside.",
		description:
			"Returns the zones that contain the device's most recently recorded position. Useful for real-time dashboards that need to display a device's current zone membership without re-running a PIP query client-side.",
		params: [
			{
				name: "deviceId",
				type: "string",
				required: true,
				description: "Caller-assigned device identifier.",
			},
			{
				name: "projectId",
				type: "string",
				required: true,
				description: "Project identifier.",
			},
		],
		notes: [
			"Returns `404` when the device has no recorded position.",
			"Returns an empty `zones` array when the device is outside all zones.",
		],
		exampleResponse: `{
  "deviceId": "truck-42",
  "zones": [
    {
      "id": "zone_01HX3K9R",
      "name": "Melbourne CBD"
    }
  ]
}`,
	},
	// --- Webhooks ---
	{
		title: "Create Webhook",
		href: "#webhook-create",
		method: "POST",
		path: "/api/v1/webhooks",
		summary: "Subscribe to zone boundary crossing events.",
		description:
			"Creates a webhook subscription that receives POST requests whenever a device crosses a zone boundary. The response includes a `signingSecret` that is shown exactly once — store it securely. All subsequent deliveries are signed with HMAC-SHA256 using that secret.",
		params: [
			{
				name: "projectId",
				type: "string",
				required: true,
				description: "Project identifier.",
			},
			{
				name: "url",
				type: "string",
				required: true,
				description: "HTTPS endpoint that will receive webhook POST requests.",
			},
			{
				name: "events",
				type: "string[]",
				required: true,
				description:
					"Event types to subscribe to: `zone.enter`, `zone.exit`, or both.",
			},
		],
		notes: [
			"Submits as `POST` with a JSON body — not executable in the try-it explorer.",
			"`signingSecret` is returned only once — store it immediately.",
			"The subscription URL must be reachable over HTTPS.",
		],
		exampleResponse: `{
  "id": "wh_01HX9AB",
  "projectId": "proj_abc",
  "url": "https://your-app.example.com/webhooks/locnative",
  "events": ["zone.enter", "zone.exit"],
  "signingSecret": "whsec_abc123xyz",
  "createdAt": "2026-06-05T00:00:00.000Z"
}`,
	},
	{
		title: "List Webhooks",
		href: "#webhook-list",
		method: "GET",
		path: "/api/v1/webhooks",
		summary: "List webhook subscriptions for a project.",
		description:
			"Returns all active and failing webhook subscriptions for the project. The `signingSecret` is never included in list responses — it is only returned once at creation time.",
		params: [
			{
				name: "projectId",
				type: "string",
				required: true,
				description: "Project identifier.",
			},
		],
		notes: [
			"Subscriptions marked `failing` have exceeded the 3-retry delivery threshold.",
			"Use `DELETE /api/v1/webhooks/{id}` to remove a failing subscription.",
		],
		exampleResponse: `{
  "webhooks": [
    {
      "id": "wh_01HX9AB",
      "url": "https://your-app.example.com/webhooks/locnative",
      "events": ["zone.enter", "zone.exit"],
      "status": "active",
      "createdAt": "2026-06-05T00:00:00.000Z"
    }
  ]
}`,
	},
	{
		title: "Delete Webhook",
		href: "#webhook-delete",
		method: "DELETE",
		path: "/api/v1/webhooks/{id}",
		summary: "Remove a webhook subscription.",
		description:
			"Permanently deletes the webhook subscription. No further deliveries will be attempted. Use this to clean up failing subscriptions or remove subscriptions that are no longer needed.",
		params: [
			{
				name: "id",
				type: "string",
				required: true,
				description: "Webhook subscription identifier.",
			},
		],
		notes: [
			"Submits as `DELETE` — not executable in the try-it explorer.",
			"Returns `204 No Content` on success.",
			"Returns `404` for unknown webhook IDs.",
		],
		exampleResponse: "204 No Content",
	},
	// --- Regions ---
	{
		title: "Classify Coordinate",
		href: "#regions-classify",
		method: "GET",
		path: "/api/v1/regions",
		summary: "Return the administrative regions that contain a coordinate.",
		description:
			"Classifies a latitude/longitude into the official ABS/ASGS regions that contain it — state, SA1–SA4, LGA, postcode, electoral divisions, and mesh block — keyed by layer. Outside Australia the regions object is empty.",
		params: [
			{
				name: "lat",
				type: "number",
				required: true,
				description: "Latitude of the coordinate to classify (e.g. -37.8136).",
			},
			{
				name: "lng",
				type: "number",
				required: true,
				description: "Longitude of the coordinate to classify (e.g. 144.9631).",
			},
			{
				name: "layers",
				type: "string",
				required: false,
				description:
					"Comma-separated list of region layers to return (e.g. `sa2,lga,poa`). Omit to return all available layers.",
			},
		],
		notes: [
			"Outside Australia the `regions` object is empty — not a `404`.",
			"Use the `layers` parameter to limit the response to only the layers you need.",
			'curl example: curl "https://api.locnative.com/api/v1/regions?lat=-37.8136&lng=144.9631" -H "Authorization: Bearer YOUR_API_KEY"',
		],
		exampleResponse: `{
  "query": { "lat": -37.8136, "lng": 144.9631 },
  "regions": {
    "state": { "code": "2", "name": "Victoria" },
    "sa2": { "code": "206041122", "name": "Melbourne" },
    "lga": { "code": "24600", "name": "Melbourne (C)" },
    "poa": { "code": "3000", "name": "3000" }
  }
}`,
	},
];

const docsToc = docsNavGroups.flatMap((group) => group.items);

const docsSectionIds = docsToc.map((item) => item.href.replace("#", ""));

const docsRouteRender = (to: string) => <Link to={to} />;

function CodeBlock({ code, label }: { code: string; label: string }) {
	return (
		<div className="overflow-hidden rounded-xl border bg-card">
			<div className="flex items-center justify-between border-b px-4 py-2">
				<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
					{label}
				</p>
			</div>
			<pre className="overflow-x-auto p-4 font-mono text-sm leading-6">
				<code>{code}</code>
			</pre>
		</div>
	);
}

function SectionHeading({
	id,
	eyebrow,
	title,
	description,
}: {
	description: string;
	eyebrow: string;
	id: string;
	title: string;
}) {
	return (
		<div className="scroll-mt-24 space-y-3" id={id}>
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.2em]">
				{eyebrow}
			</p>
			<div className="space-y-2">
				<h2 className="font-semibold text-2xl tracking-tight">{title}</h2>
				<p className="max-w-3xl text-base text-muted-foreground leading-7">
					{description}
				</p>
			</div>
		</div>
	);
}

function EndpointSection({ endpoint }: { endpoint: EndpointDoc }) {
	return (
		<section className="scroll-mt-24 space-y-6" id={endpoint.href.slice(1)}>
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<Badge className="font-mono text-emerald-600" variant="outline">
						{endpoint.method}
					</Badge>
					<code className="rounded-md bg-muted px-2 py-1 font-mono text-sm">
						{endpoint.path}
					</code>
				</div>
				<div className="space-y-2">
					<h3 className="font-semibold text-xl tracking-tight">
						{endpoint.title}
					</h3>
					<p className="text-base text-muted-foreground leading-7">
						{endpoint.description}
					</p>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Why you would use it</CardTitle>
						<CardDescription>{endpoint.summary}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{endpoint.notes.map((note) => (
							<div className="flex gap-3" key={note}>
								<div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
								<p className="text-muted-foreground text-sm leading-6">
									{note}
								</p>
							</div>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Parameters</CardTitle>
						<CardDescription>
							Validate and normalize these values before you send the request.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{endpoint.params.map((param) => (
							<div className="rounded-lg border p-3" key={param.name}>
								<div className="flex flex-wrap items-center gap-2">
									<code className="font-semibold text-sm">{param.name}</code>
									<Badge variant={param.required ? "default" : "secondary"}>
										{param.required ? "Required" : "Optional"}
									</Badge>
									<Badge className="font-mono" variant="outline">
										{param.type}
									</Badge>
								</div>
								<p className="mt-2 text-muted-foreground text-sm leading-6">
									{param.description}
								</p>
							</div>
						))}
					</CardContent>
				</Card>
			</div>

			<CodeBlock code={endpoint.exampleResponse} label="Example Response" />
		</section>
	);
}

interface ComponentPropDoc {
	default?: string;
	description: string;
	name: string;
	required?: boolean;
	type: string;
}

interface ComponentDoc {
	example: string;
	href: string;
	name: string;
	props: ComponentPropDoc[];
	summary: string;
}

const reactComponents: ComponentDoc[] = [
	{
		name: "AddressAutocomplete",
		href: "#react-address-autocomplete",
		summary:
			"Accessible (WAI-ARIA combobox) debounced address search with keyboard navigation, proximity bias, session tokens, i18n strings, and customizable render slots. Provide a client created with createLocnativeClient.",
		example: `import { createLocnativeClient } from "@locnative/sdk";
import { AddressAutocomplete } from "@locnative/react-ui";
import "@locnative/react-ui/styles.css";

const client = createLocnativeClient({
  apiKey: import.meta.env.VITE_LOCNATIVE_KEY,
});

export function Checkout() {
  return (
    <AddressAutocomplete
      client={client}
      placeholder="Start typing an address…"
      onSelect={(address) => console.log(address.formattedAddress)}
    />
  );
}`,
		props: [
			{
				name: "client",
				type: "LocnativeClient",
				required: true,
				description: "SDK client created with createLocnativeClient.",
			},
			{
				name: "onSelect",
				type: "(address: AddressWithParsed) => void",
				description: "Called when a suggestion is selected.",
			},
			{
				name: "onQueryChange",
				type: "(query: string) => void",
				description: "Called as the input text changes.",
			},
			{
				name: "placeholder",
				type: "string",
				description: "Input placeholder text.",
			},
			{
				name: "debounceMs",
				type: "number",
				default: "300",
				description: "Debounce in ms before querying the API.",
			},
			{
				name: "minCharsToSearch",
				type: "number",
				default: "2",
				description: "Minimum characters typed before searching.",
			},
			{
				name: "maxSuggestions",
				type: "number",
				default: "5",
				description: "Maximum number of suggestions to show.",
			},
			{
				name: "enableGeolocation",
				type: "boolean",
				default: "false",
				description:
					"Use the browser's geolocation to bias results by proximity.",
			},
			{
				name: "userLat",
				type: "number",
				description:
					"Explicit latitude for proximity bias (instead of geolocation).",
			},
			{
				name: "userLng",
				type: "number",
				description:
					"Explicit longitude for proximity bias (instead of geolocation).",
			},
			{
				name: "sessionToken",
				type: "string",
				description:
					"Group a run of keystrokes into one billable search (see SDK newSessionToken()).",
			},
			{ name: "disabled", type: "boolean", description: "Disable the input." },
			{
				name: "required",
				type: "boolean",
				description: "Mark the input as required.",
			},
			{
				name: "error",
				type: "string",
				description: "External error message to display.",
			},
			{
				name: "id",
				type: "string",
				default: '"locnative-autocomplete"',
				description: "id forwarded to the input element.",
			},
			{
				name: "className",
				type: "string",
				description: "Class applied to the root container.",
			},
			{
				name: "i18nStrings",
				type: "Partial<AddressI18nStrings>",
				description: "Override built-in UI strings (no results, retry, etc.).",
			},
			{
				name: "renderSuggestion",
				type: "(address: AddressWithParsed, isActive: boolean) => ReactNode",
				description: "Render a custom suggestion row.",
			},
			{
				name: "renderEmpty",
				type: "() => ReactNode",
				description: "Render a custom empty state.",
			},
			{
				name: "renderLoading",
				type: "() => ReactNode",
				description: "Render a custom loading state.",
			},
			{
				name: "renderError",
				type: "(error: Error | null) => ReactNode",
				description: "Render a custom error state.",
			},
		],
	},
	{
		name: "AddressFormField",
		href: "#react-address-form-field",
		summary:
			"AddressAutocomplete wrapped with a <label> and error styling — a drop-in form field. Accepts every AddressAutocomplete prop plus the fields below.",
		example: `import { createLocnativeClient } from "@locnative/sdk";
import { AddressFormField } from "@locnative/react-ui";
import "@locnative/react-ui/styles.css";

const client = createLocnativeClient({
  apiKey: import.meta.env.VITE_LOCNATIVE_KEY,
});

export function Checkout() {
  return (
    <AddressFormField
      client={client}
      label="Delivery address"
      required
      onSelect={setAddress}
    />
  );
}`,
		props: [
			{
				name: "label",
				type: "string",
				required: true,
				description: "Text content of the <label> element.",
			},
			{
				name: "labelClassName",
				type: "string",
				description: "Additional class(es) applied to the <label> element.",
			},
			{
				name: "errorClassName",
				type: "string",
				description:
					"Additional class(es) applied to the error text <p> element.",
			},
			{
				name: "…AddressAutocomplete props",
				type: "AddressAutocompleteProps",
				description:
					"Every AddressAutocomplete prop is forwarded unchanged (client, onSelect, placeholder, debounceMs, proximity bias, render slots, etc.).",
			},
		],
	},
	{
		name: "AddressFieldGroup",
		href: "#react-address-field-group",
		summary:
			"A controlled group of structured inputs (street, suburb, state, postcode) for editing a full address. Provide value and onChange.",
		example: `import { useState } from "react";
import { createLocnativeClient } from "@locnative/sdk";
import {
  AddressFieldGroup,
  type AddressFieldGroupValue,
} from "@locnative/react-ui";

const client = createLocnativeClient({ apiKey: "..." });

const EMPTY: AddressFieldGroupValue = {
  street: "",
  suburb: "",
  state: "",
  postcode: "",
};

function MyForm() {
  const [address, setAddress] = useState<AddressFieldGroupValue>(EMPTY);

  return (
    <AddressFieldGroup client={client} value={address} onChange={setAddress} />
  );
}`,
		props: [
			{
				name: "client",
				type: "LocnativeClient",
				required: true,
				description: "SDK client created with createLocnativeClient.",
			},
			{
				name: "value",
				type: "AddressFieldGroupValue",
				required: true,
				description: "Controlled value for the field group.",
			},
			{
				name: "onChange",
				type: "(value: AddressFieldGroupValue) => void",
				required: true,
				description:
					"Change handler called with the updated value on any field edit.",
			},
			{
				name: "streetLabel",
				type: "string",
				default: '"Street Address"',
				description: "Override the street address field label.",
			},
			{
				name: "suburbLabel",
				type: "string",
				default: '"Suburb"',
				description: "Override the suburb field label.",
			},
			{
				name: "stateLabel",
				type: "string",
				default: '"State"',
				description: "Override the state field label.",
			},
			{
				name: "postcodeLabel",
				type: "string",
				default: '"Postcode"',
				description: "Override the postcode field label.",
			},
			{
				name: "disabled",
				type: "boolean",
				default: "false",
				description: "Disables all fields.",
			},
			{
				name: "className",
				type: "string",
				description: "Additional CSS class applied to the root container.",
			},
		],
	},
	{
		name: "ForwardGeocodeInput",
		href: "#react-forward-geocode",
		summary:
			"Resolves a free-text address string to coordinates (forward geocoding) as the query prop changes. Controlled: the parent owns query and receives results via onResult. Renders a read-only display of the resolved latitude, longitude pair.",
		example: `import { createLocnativeClient } from "@locnative/sdk";
import { ForwardGeocodeInput } from "@locnative/react-ui";

const client = createLocnativeClient({ apiKey: "..." });

function MyComponent() {
  const [query, setQuery] = React.useState("");

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ForwardGeocodeInput
        client={client}
        query={query}
        onResult={(r) => console.log(r.latitude, r.longitude)}
      />
    </>
  );
}`,
		props: [
			{
				name: "client",
				type: "LocnativeClient",
				required: true,
				description: "SDK client created with createLocnativeClient.",
			},
			{
				name: "query",
				type: "string | null",
				required: true,
				description:
					"Address text to geocode. null or empty string skips the request.",
			},
			{
				name: "onResult",
				type: "(r: { latitude: number | null; longitude: number | null; formattedAddress: string | null }) => void",
				description:
					"Called whenever the resolved result changes. All fields are null when no result is available.",
			},
			{
				name: "placeholder",
				type: "string",
				default: '"Coordinates will appear here"',
				description: "Placeholder text for the read-only display input.",
			},
			{
				name: "id",
				type: "string",
				description: "id forwarded to the input element.",
			},
			{
				name: "className",
				type: "string",
				description: "Additional CSS class applied to the input element.",
			},
			{
				name: "disabled",
				type: "boolean",
				default: "false",
				description: "Disables the input.",
			},
		],
	},
	{
		name: "ReverseGeocodeInput",
		href: "#react-reverse-geocode",
		summary:
			"Resolves a latitude/longitude pair to the nearest address (reverse geocoding). No request is made until both coordinates are non-null.",
		example: `import { createLocnativeClient } from "@locnative/sdk";
import { ReverseGeocodeInput } from "@locnative/react-ui";

const client = createLocnativeClient({ apiKey: "..." });

function MyComponent() {
  const [coords, setCoords] = React.useState<{
    lat: number | null;
    lng: number | null;
  }>({ lat: null, lng: null });

  return (
    <ReverseGeocodeInput
      client={client}
      latitude={coords.lat}
      longitude={coords.lng}
      onResult={(r) => console.log(r.address, r.distance)}
    />
  );
}`,
		props: [
			{
				name: "client",
				type: "LocnativeClient",
				required: true,
				description: "SDK client created with createLocnativeClient.",
			},
			{
				name: "latitude",
				type: "number | null",
				required: true,
				description:
					"Latitude to reverse-geocode. null suppresses the request.",
			},
			{
				name: "longitude",
				type: "number | null",
				required: true,
				description:
					"Longitude to reverse-geocode. null suppresses the request.",
			},
			{
				name: "onResult",
				type: "(r: { address: string | null; distance: number | null }) => void",
				description:
					"Called whenever the resolved address changes. Both fields are null when no result is available.",
			},
			{
				name: "placeholder",
				type: "string",
				default: '"Address will appear here"',
				description: "Placeholder text for the read-only display input.",
			},
			{
				name: "id",
				type: "string",
				description: "id forwarded to the input element.",
			},
			{
				name: "className",
				type: "string",
				description: "Additional CSS class applied to the input element.",
			},
			{
				name: "disabled",
				type: "boolean",
				default: "false",
				description: "Disables the input.",
			},
		],
	},
];

function ComponentReference({ component }: { component: ComponentDoc }) {
	return (
		<section className="scroll-mt-24 space-y-5" id={component.href.slice(1)}>
			<div className="space-y-2">
				<h3 className="font-semibold text-xl tracking-tight">
					{component.name}
				</h3>
				<p className="max-w-3xl text-base text-muted-foreground leading-7">
					{component.summary}
				</p>
			</div>

			<CodeBlock code={component.example} label="Usage" />

			<div className="space-y-3">
				<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
					Props
				</p>
				<div className="grid gap-3">
					{component.props.map((prop) => (
						<div className="rounded-lg border p-3" key={prop.name}>
							<div className="flex flex-wrap items-center gap-2">
								<code className="break-all font-semibold text-sm">
									{prop.name}
								</code>
								<Badge variant={prop.required ? "default" : "secondary"}>
									{prop.required ? "Required" : "Optional"}
								</Badge>
								{prop.default ? (
									<Badge className="font-mono" variant="outline">
										default: {prop.default}
									</Badge>
								) : null}
							</div>
							<code className="mt-2 block break-all font-mono text-muted-foreground text-xs leading-5">
								{prop.type}
							</code>
							<p className="mt-1 text-muted-foreground text-sm leading-6">
								{prop.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

export function DocsPage() {
	const [activeSection, setActiveSection] = useState("overview");

	const currentSectionTitle = useMemo(() => {
		return (
			docsToc.find((item) => item.href === `#${activeSection}`)?.title ??
			"Overview"
		);
	}, [activeSection]);

	const scrollToSection = (href: string) => {
		const sectionId = href.replace("#", "");
		setActiveSection(sectionId);

		const section = document.getElementById(sectionId);
		if (!section) {
			return;
		}

		section.scrollIntoView({ behavior: "smooth", block: "start" });
		window.history.replaceState(null, "", `#${sectionId}`);
	};

	useEffect(() => {
		const updateFromHash = () => {
			const hash = window.location.hash.replace("#", "");
			if (hash) {
				setActiveSection(hash);
			}
		};

		updateFromHash();

		const observedElements = docsSectionIds
			.map((id) => document.getElementById(id))
			.filter((element): element is HTMLElement => element !== null);

		const observer = new IntersectionObserver(
			(entries) => {
				const visibleEntries = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				const nextSectionId = visibleEntries[0]?.target.id;
				if (nextSectionId) {
					setActiveSection(nextSectionId);
				}
			},
			{
				rootMargin: "-18% 0px -62% 0px",
				threshold: [0, 1],
			}
		);

		for (const element of observedElements) {
			observer.observe(element);
		}

		window.addEventListener("hashchange", updateFromHash);

		return () => {
			window.removeEventListener("hashchange", updateFromHash);
			observer.disconnect();
		};
	}, []);

	return (
		<SidebarProvider
			className={cn("min-w-0 max-w-full [--docs-wrapper-max-width:96rem]")}
		>
			<Sidebar
				className="border-r *:data-[slot=sidebar-inner]:bg-background"
				collapsible="offcanvas"
				variant="sidebar"
			>
				<SidebarHeader className="h-14 justify-center border-b px-2">
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton render={docsRouteRender("/")}>
								<LogoIcon />
								<span className="font-medium text-foreground">Locnative</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					{docsNavGroups.map((group) => (
						<SidebarGroup key={group.label}>
							<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{group.items.map((item) => (
										<SidebarMenuItem key={item.href}>
											<SidebarMenuButton
												isActive={activeSection === item.href.slice(1)}
												onClick={() => scrollToSection(item.href)}
											>
												<span>{item.title}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))}

					<SidebarGroup>
						<SidebarGroupLabel>Tools</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton render={docsRouteRender("/api-docs")}>
										<TerminalIcon />
										<span>API Explorer</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton render={docsRouteRender("/sign-up")}>
										<KeyRoundIcon />
										<span>Create API Key</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarRail />
			</Sidebar>

			<SidebarInset className="relative isolate min-w-0">
				<DocsBackground />
				<header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur">
					<div className="flex min-w-0 items-center gap-3">
						<SidebarTrigger className="md:hidden" />
						<div className="min-w-0">
							<p className="font-medium text-sm">Docs</p>
							<p className="truncate text-muted-foreground text-xs">
								{currentSectionTitle}
							</p>
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<Link to="/sign-in">
							<Button size="sm" variant="ghost">
								Sign in
							</Button>
						</Link>
						<Link to="/api-docs">
							<Button size="sm" variant="outline">
								<TerminalIcon className="size-4" />
								API Explorer
							</Button>
						</Link>
					</div>
				</header>

				<div className="relative z-10 mx-auto flex w-full min-w-0 max-w-(--docs-wrapper-max-width) flex-1 flex-col overflow-x-clip p-4 md:p-6">
					<div className="grid min-w-0 grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_15rem]">
						<main className="min-w-0 space-y-12">
							<section className="scroll-mt-24 space-y-6" id="overview">
								<div className="space-y-4">
									<div className="flex flex-wrap gap-2">
										<Badge variant="secondary">Public documentation</Badge>
										<Badge variant="secondary">4 core address endpoints</Badge>
										<Badge variant="secondary">API key authentication</Badge>
									</div>
									<div className="space-y-3">
										<h1 className="max-w-3xl font-semibold text-4xl tracking-tight">
											Documentation built for shipping a production geocoding
											integration quickly.
										</h1>
										<p className="max-w-3xl text-base text-muted-foreground leading-7">
											Locnative gives you a clean HTTP interface for address
											autocomplete, reverse geocoding, nearby lookup, and
											canonical address retrieval. This page is the opinionated
											path through the API: what to call first, how
											authentication works, what validation happens on the
											server, and how to structure a reliable implementation.
										</p>
									</div>
									<div className="flex flex-wrap gap-3">
										<a href="#quickstart">
											<Button>
												<BookOpenIcon className="size-4" />
												Start with quickstart
											</Button>
										</a>
										<Link to="/api-docs">
											<Button variant="outline">
												<TerminalIcon className="size-4" />
												Open API Explorer
											</Button>
										</Link>
										<a href="/api/openapi.json" rel="noopener" target="_blank">
											<Button variant="outline">
												<BracesIcon className="size-4" />
												OpenAPI JSON
											</Button>
										</a>
									</div>
								</div>

								<div className="grid gap-4 md:grid-cols-3">
									<Card>
										<CardHeader className="space-y-2">
											<SearchIcon className="size-5 text-muted-foreground" />
											<CardTitle className="text-base">
												Search-first flow
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm leading-6">
												Use autocomplete to capture intent early, then persist
												the selected address ID for deterministic follow-up
												calls.
											</p>
										</CardContent>
									</Card>

									<Card>
										<CardHeader className="space-y-2">
											<LocateFixedIcon className="size-5 text-muted-foreground" />
											<CardTitle className="text-base">
												Coordinate-aware endpoints
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm leading-6">
												Reverse and nearby endpoints validate coordinate ranges
												and return distance-aware results for operational
												workflows.
											</p>
										</CardContent>
									</Card>

									<Card>
										<CardHeader className="space-y-2">
											<KeyRoundIcon className="size-5 text-muted-foreground" />
											<CardTitle className="text-base">
												Simple auth model
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm leading-6">
												Authenticate with `Authorization: Bearer` or
												`X-API-Key`. Successful `2xx` responses are
												automatically recorded against the key that made the
												request.
											</p>
										</CardContent>
									</Card>
								</div>
							</section>

							<section className="space-y-6" id="quickstart">
								<SectionHeading
									description="If you are integrating Locnative for the first time, start with autocomplete. It exercises the authentication path, the public API hostname, and the response envelope you will see across the address search surface."
									eyebrow="First request"
									id="quickstart"
									title="Quickstart"
								/>

								<Tabs className="space-y-4" defaultValue="curl">
									<TabsList>
										<TabsTrigger value="curl">cURL</TabsTrigger>
										<TabsTrigger value="javascript">JavaScript</TabsTrigger>
										<TabsTrigger value="python">Python</TabsTrigger>
									</TabsList>
									{(
										Object.entries(quickstartCode) as [
											keyof typeof quickstartCode,
											string,
										][]
									).map(([lang, code]) => (
										<TabsContent key={lang} value={lang}>
											<CodeBlock code={code} label={lang} />
										</TabsContent>
									))}
								</Tabs>

								<Card>
									<CardHeader>
										<CardTitle className="text-base">What to expect</CardTitle>
										<CardDescription>
											Autocomplete returns a `results` array plus a `count`
											field.
										</CardDescription>
									</CardHeader>
									<CardContent className="grid gap-3 md:grid-cols-3">
										<div className="rounded-lg border p-4">
											<p className="font-medium text-sm">Auth</p>
											<p className="mt-2 text-muted-foreground text-sm leading-6">
												Pass the key in{" "}
												<code>Authorization: Bearer {"<key>"}</code> or{" "}
												<code>X-API-Key</code>.
											</p>
										</div>
										<div className="rounded-lg border p-4">
											<p className="font-medium text-sm">Validation</p>
											<p className="mt-2 text-muted-foreground text-sm leading-6">
												Queries shorter than 2 characters fail fast with `400`.
											</p>
										</div>
										<div className="rounded-lg border p-4">
											<p className="font-medium text-sm">Usage tracking</p>
											<p className="mt-2 text-muted-foreground text-sm leading-6">
												Only successful `2xx` responses increment daily usage.
												Production requests and interactive explorer tests are
												recorded separately.
											</p>
										</div>
									</CardContent>
								</Card>
							</section>

							<section className="space-y-6" id="openapi-spec">
								<SectionHeading
									description="The public REST contract is also published as an OpenAPI document so SDK work, contract review, and external tooling can target the same source of truth as the docs page."
									eyebrow="Contract"
									id="openapi-spec"
									title="Use the published OpenAPI spec"
								/>

								<div className="grid gap-4 md:grid-cols-2">
									<Card>
										<CardHeader>
											<CardTitle className="text-base">Spec URL</CardTitle>
											<CardDescription>
												Fetch the machine-readable contract directly from the
												app.
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3">
											<code className="block break-all rounded bg-muted px-3 py-2 font-mono text-sm">
												https://api.locnative.com/api/openapi.json
											</code>
											<p className="text-muted-foreground text-sm leading-6">
												Use this document for SDK generation, contract reviews,
												Postman imports, or CI checks against the current v1
												surface.
											</p>
											<a
												href="/api/openapi.json"
												rel="noopener"
												target="_blank"
											>
												<Button size="sm" variant="outline">
													<BracesIcon className="size-4" />
													View OpenAPI JSON
												</Button>
											</a>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												What it covers
											</CardTitle>
											<CardDescription>
												The spec mirrors the currently supported public address
												endpoints.
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3 text-muted-foreground text-sm leading-6">
											<p>
												Every documented endpoint includes authentication
												requirements, parameters, error schemas, and a response
												summary.
											</p>
											<p>
												If you are building a client library, prefer the OpenAPI
												document plus the interactive explorer together so you
												can validate both static contracts and live behavior.
											</p>
										</CardContent>
									</Card>
								</div>
							</section>

							<section className="space-y-6" id="js-ts-sdk">
								<SectionHeading
									description="Phase 2 starts by giving JavaScript and TypeScript consumers a typed client instead of forcing every integration to hand-roll `fetch` wrappers. The current preview SDK is a lightweight REST client over the same public v1 endpoints documented here."
									eyebrow="SDK preview"
									id="js-ts-sdk"
									title="Use the first-party JS/TS client"
								/>

								<div className="grid gap-4 md:grid-cols-2">
									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												Workspace package
											</CardTitle>
											<CardDescription>
												The SDK currently lives in this repo as a typed
												workspace package.
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3">
											<code className="block break-all rounded bg-muted px-3 py-2 font-mono text-sm">
												@locnative/sdk
											</code>
											<p className="text-muted-foreground text-sm leading-6">
												It exposes a single `createLocnativeClient()`
												entrypoint, stable response types for the public address
												API, and a normalized `LocnativeApiError` for non-`2xx`
												failures.
											</p>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-base">Why it exists</CardTitle>
											<CardDescription>
												The public platform contract is REST, so the SDK targets
												the documented v1 endpoints directly.
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3 text-muted-foreground text-sm leading-6">
											<p>
												This keeps public client adoption separate from the
												internal dashboard&apos;s ORPC transport and makes the
												SDK a clean fit for Node runtimes, browser apps,
												workers, and framework wrappers.
											</p>
											<p>
												The first preview covers autocomplete, reverse
												geocoding, nearby search, and canonical address lookup
												by ID.
											</p>
										</CardContent>
									</Card>
								</div>

								<CodeBlock code={quickstartCode.sdk} label="TypeScript SDK" />
							</section>

							<section className="space-y-6" id="authentication">
								<SectionHeading
									description="The public address API is protected with API keys rather than session auth. That keeps server-to-server usage simple while still allowing the dashboard to manage keys and inspect usage safely."
									eyebrow="Authentication"
									id="authentication"
									title="Send the API key on every request"
								/>

								<div className="grid gap-4 md:grid-cols-2">
									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												Accepted headers
											</CardTitle>
										</CardHeader>
										<CardContent className="space-y-3">
											<div className="rounded-lg border p-4">
												<p className="font-medium text-sm">Preferred</p>
												<code className="mt-2 block rounded bg-muted px-3 py-2 font-mono text-sm">
													Authorization: Bearer wh_live_your_api_key
												</code>
											</div>
											<div className="rounded-lg border p-4">
												<p className="font-medium text-sm">Also supported</p>
												<code className="mt-2 block rounded bg-muted px-3 py-2 font-mono text-sm">
													X-API-Key: wh_live_your_api_key
												</code>
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												Failure behavior
											</CardTitle>
										</CardHeader>
										<CardContent className="space-y-3 text-muted-foreground text-sm leading-6">
											<p>
												Missing keys return `401` with guidance to send a bearer
												token or `X-API-Key`.
											</p>
											<p>
												Invalid or revoked keys also return `401`. The address
												handler is never called when authentication fails.
											</p>
											<p>
												Successful requests update `lastUsedAt` and feed daily
												usage accounting automatically. Explorer-originated test
												requests are marked separately from production traffic.
											</p>
										</CardContent>
									</Card>
								</div>

								<Card>
									<CardHeader>
										<CardTitle className="text-base">
											How interactive testing works
										</CardTitle>
									</CardHeader>
									<CardContent className="space-y-3 text-muted-foreground text-sm leading-6">
										<p>
											When you are signed in, the dashboard explorer defaults to
											a managed-key proxy flow. You choose one of your active
											keys and the explorer sends the request server-side
											without requiring you to paste the raw secret.
										</p>
										<p>
											If you need to validate a specific bearer token manually,
											the explorer also supports a raw-key mode. Raw keys are
											kept only for the current browser session and are never
											persisted by the explorer.
										</p>
										<p>
											Every explorer request is labeled as `Test traffic`, so it
											shows up separately from production usage in the
											dashboard.
										</p>
									</CardContent>
								</Card>
							</section>

							<section className="scroll-mt-24 space-y-6" id="react-ui">
								<div className="space-y-3">
									<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.2em]">
										React UI
									</p>
									<div className="space-y-2">
										<h2 className="font-semibold text-2xl tracking-tight">
											@locnative/react-ui
										</h2>
										<p className="max-w-3xl text-base text-muted-foreground leading-7">
											Production-ready React components for address
											autocomplete, forward and reverse geocoding, and
											structured address fields. Built on the SDK, styled with
											Tailwind, shipped with a prebuilt stylesheet, accessible
											to WCAG AA, and compatible with TanStack Form.
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Badge variant="secondary">React 18 / 19</Badge>
										<Badge variant="secondary">WCAG AA</Badge>
										<Badge variant="secondary">Prebuilt styles</Badge>
									</div>
								</div>

								<CodeBlock
									code={"npm install @locnative/react-ui @locnative/sdk"}
									label="Install"
								/>
								<CodeBlock
									code={
										'// Import the stylesheet once, near your app root\nimport "@locnative/react-ui/styles.css";'
									}
									label="Stylesheet"
								/>

								<div className="grid gap-4 md:grid-cols-2">
									{reactComponents.map((component) => (
										<a
											className="group/link block"
											href={component.href}
											key={component.href}
										>
											<Card className="h-full transition-colors hover:border-primary">
												<CardHeader>
													<CardTitle className="flex items-center gap-2 text-base">
														<Code2Icon className="size-4 text-muted-foreground" />
														{component.name}
													</CardTitle>
													<CardDescription className="line-clamp-2">
														{component.summary}
													</CardDescription>
												</CardHeader>
											</Card>
										</a>
									))}
								</div>
							</section>

							{reactComponents.map((component) => (
								<ComponentReference
									component={component}
									key={component.href}
								/>
							))}

							<section className="scroll-mt-24 space-y-6" id="vue-ui">
								<div className="space-y-3">
									<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.2em]">
										Vue UI
									</p>
									<div className="space-y-2">
										<h2 className="font-semibold text-2xl tracking-tight">
											@locnative/vue-ui
										</h2>
										<p className="max-w-3xl text-base text-muted-foreground leading-7">
											The Vue 3 counterpart to react-ui — the same address
											autocomplete, geocoding inputs, and structured address
											fields. Built on the SDK and styled with Tailwind.
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Badge variant="secondary">Vue 3.0+</Badge>
										<Badge variant="outline">Early access · v0.1.0</Badge>
									</div>
								</div>

								<div className="rounded-xl border border-dashed bg-card p-4">
									<div className="flex items-start gap-3">
										<AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
										<div className="space-y-1">
											<p className="font-medium text-sm">
												Components are planned for Phase 2
											</p>
											<p className="text-muted-foreground text-sm leading-6">
												Today the package ships the shared types and utilities
												the components build on. The Vue 3 SFC components are
												not yet exported — the reference below documents the
												intended API.
											</p>
										</div>
									</div>
								</div>

								<CodeBlock
									code={"npm install @locnative/vue-ui @locnative/sdk"}
									label="Install"
								/>
							</section>

							<section className="scroll-mt-24 space-y-5" id="vue-available">
								<div className="space-y-2">
									<h3 className="font-semibold text-xl tracking-tight">
										Available today
									</h3>
									<p className="max-w-3xl text-base text-muted-foreground leading-7">
										The package exports the building blocks the components share
										— usable right now.
									</p>
								</div>

								<CodeBlock
									code={
										'import {\n  toAddressWithParsed,\n  cn,\n  type AddressWithParsed,\n  type AddressI18nStrings,\n  type AddressSuggestionInput,\n} from "@locnative/vue-ui";'
									}
									label="Exports"
								/>

								<div className="grid gap-3">
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											toAddressWithParsed(suggestion)
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											Maps a raw SDK AddressSuggestion into the flattened
											AddressWithParsed shape the components use
											(formattedAddress, latitude, longitude, plus parsed
											streetAddress, suburb, state, postcode, and country).
										</p>
									</div>
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											cn(...classes)
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											The clsx + tailwind-merge class combiner used internally
											for composing Tailwind classes without conflicts.
										</p>
									</div>
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											AddressWithParsed · AddressI18nStrings ·
											AddressSuggestionInput
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											Shared types: the flattened address shape, the overridable
											UI strings, and the SDK suggestion input type.
										</p>
									</div>
								</div>
							</section>

							<section className="scroll-mt-24 space-y-5" id="vue-components">
								<div className="space-y-2">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="font-semibold text-xl tracking-tight">
											Components
										</h3>
										<Badge variant="outline">Phase 2 · preview</Badge>
									</div>
									<p className="max-w-3xl text-base text-muted-foreground leading-7">
										The Vue 3 SFC components mirror their react-ui counterparts.
										Each takes a client created with createLocnativeClient. This
										is the intended API; the components are not yet exported.
									</p>
								</div>

								<CodeBlock
									code={
										'<script setup lang="ts">\nimport { createLocnativeClient } from "@locnative/sdk";\nimport { AddressAutocomplete } from "@locnative/vue-ui";\nimport "@locnative/vue-ui/styles.css";\n\nconst client = createLocnativeClient({\n  apiKey: import.meta.env.VITE_LOCNATIVE_KEY,\n});\n\nfunction onSelect(address) {\n  console.log(address.formattedAddress, address.latitude);\n}\n</script>\n\n<template>\n  <AddressAutocomplete :client="client" @select="onSelect" />\n</template>'
									}
									label="Preview (Phase 2)"
								/>

								<div className="grid gap-3">
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											AddressAutocomplete
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											Accessible combobox address search with proximity bias and
											i18n strings.
										</p>
									</div>
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											AddressFormField
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											AddressAutocomplete wrapped with a label and error
											styling.
										</p>
									</div>
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											AddressFieldGroup
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											Structured street, suburb, state, and postcode inputs.
										</p>
									</div>
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											ForwardGeocodeInput
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											Resolves a free-text address string to coordinates.
										</p>
									</div>
									<div className="rounded-lg border p-3">
										<code className="break-all font-semibold text-sm">
											ReverseGeocodeInput
										</code>
										<p className="mt-1 text-muted-foreground text-sm leading-6">
											Resolves a latitude/longitude pair to the nearest address.
										</p>
									</div>
								</div>
							</section>

							<div className="space-y-10">
								<SectionHeading
									description="These are the four address endpoints currently exposed in the app. The docs below mirror the actual path names and request validation behavior implemented on the server today."
									eyebrow="API surface"
									id="autocomplete"
									title="Core endpoints"
								/>

								{endpointDocs.map((endpoint) => (
									<EndpointSection endpoint={endpoint} key={endpoint.path} />
								))}
							</div>

							<section className="scroll-mt-24 space-y-6" id="batch-lifecycle">
								<SectionHeading
									description="Batch geocoding is a three-step async flow. Submit the job, poll for completion, then fetch results."
									eyebrow="Async lifecycle"
									id="batch-lifecycle"
									title="Batch geocoding lifecycle"
								/>

								<div className="space-y-4">
									<div className="grid gap-4 md:grid-cols-3">
										<Card>
											<CardHeader>
												<CardTitle className="flex items-center gap-2 text-base">
													<span className="flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
														1
													</span>
													Submit
												</CardTitle>
											</CardHeader>
											<CardContent>
												<p className="text-muted-foreground text-sm leading-6">
													POST your array of addresses to{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														POST /api/v1/geocode/batch
													</code>
													. The server enqueues the job and returns a{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														jobId
													</code>{" "}
													immediately.
												</p>
											</CardContent>
										</Card>
										<Card>
											<CardHeader>
												<CardTitle className="flex items-center gap-2 text-base">
													<span className="flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
														2
													</span>
													Poll
												</CardTitle>
											</CardHeader>
											<CardContent>
												<p className="text-muted-foreground text-sm leading-6">
													Call{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														GET /api/v1/geocode/batch/{"{jobId}"}
													</code>{" "}
													every few seconds until{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														status
													</code>{" "}
													is{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														completed
													</code>{" "}
													or{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														failed
													</code>
													.
												</p>
											</CardContent>
										</Card>
										<Card>
											<CardHeader>
												<CardTitle className="flex items-center gap-2 text-base">
													<span className="flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
														3
													</span>
													Fetch results
												</CardTitle>
											</CardHeader>
											<CardContent>
												<p className="text-muted-foreground text-sm leading-6">
													Once completed, retrieve the full result array from{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														GET /api/v1/geocode/batch/{"{jobId}"}/results
													</code>
													. Each entry maps to the original input in order.
												</p>
											</CardContent>
										</Card>
									</div>

									<CodeBlock
										code={`// Step 1 — submit
const { jobId } = await fetch("https://api.locnative.com/api/v1/geocode/batch", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "wh_live_your_api_key",
  },
  body: JSON.stringify({ addresses: ["20 W 34th St New York NY", "221B Baker St London"] }),
}).then((r) => r.json());

// Step 2 — poll until completed
let status = "pending";
while (status !== "completed" && status !== "failed") {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const poll = await fetch(\`https://api.locnative.com/api/v1/geocode/batch/\${jobId}\`, {
    headers: { "X-API-Key": "wh_live_your_api_key" },
  }).then((r) => r.json());
  status = poll.status;
}

// Step 3 — fetch results
const { results } = await fetch(
  \`https://api.locnative.com/api/v1/geocode/batch/\${jobId}/results\`,
  { headers: { "X-API-Key": "wh_live_your_api_key" } }
).then((r) => r.json());`}
										label="Batch lifecycle (JavaScript)"
									/>
								</div>
							</section>

							<section className="scroll-mt-24 space-y-6" id="webhook-delivery">
								<SectionHeading
									description="Locnative delivers webhook events by POSTing to your subscription URL when a device crosses a zone boundary. Use the HMAC signature to verify authenticity."
									eyebrow="Webhook delivery"
									id="webhook-delivery"
									title="Webhook delivery and HMAC verification"
								/>

								<div className="space-y-4">
									<div className="grid gap-4 md:grid-cols-2">
										<Card>
											<CardHeader>
												<CardTitle className="text-base">
													Delivery format
												</CardTitle>
											</CardHeader>
											<CardContent className="space-y-3">
												<p className="text-muted-foreground text-sm leading-6">
													On a zone boundary crossing, Locnative sends a signed
													POST to your subscription URL with a JSON body:
												</p>
												<CodeBlock
													code={`{
  "event": "zone.enter",
  "zone": { "id": "zone_01HX3K9R", "name": "Melbourne CBD" },
  "device": { "id": "truck-42" },
  "timestamp": "2026-06-05T10:30:00.000Z"
}`}
													label="Webhook payload"
												/>
											</CardContent>
										</Card>
										<Card>
											<CardHeader>
												<CardTitle className="text-base">
													Retries and failure
												</CardTitle>
											</CardHeader>
											<CardContent className="space-y-3">
												<p className="text-muted-foreground text-sm leading-6">
													Locnative retries failed deliveries up to 3 times with
													exponential backoff. After 3 consecutive failures the
													subscription is marked{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														failing
													</code>{" "}
													and no further deliveries are attempted until the
													subscription is deleted and recreated.
												</p>
												<p className="text-muted-foreground text-sm leading-6">
													Return a{" "}
													<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
														2xx
													</code>{" "}
													response within 5 seconds to acknowledge delivery.
													Non-2xx or timeouts count as failures.
												</p>
											</CardContent>
										</Card>
									</div>

									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												HMAC-SHA256 signature verification
											</CardTitle>
											<CardDescription>
												Every delivery includes an{" "}
												<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
													X-Locnative-Signature: hmac-sha256={"<hex>"}
												</code>{" "}
												header. Verify it using the <code>signingSecret</code>{" "}
												shown once at webhook creation time.
											</CardDescription>
										</CardHeader>
										<CardContent>
											<CodeBlock
												code={`import { createHmac, timingSafeEqual } from "node:crypto";

function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.replace("hmac-sha256=", "");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

// In your Express / TanStack Start handler:
const rawBody = await request.text();
const sig = request.headers.get("x-locnative-signature") ?? "";
if (!verifyWebhookSignature(rawBody, sig, process.env.WEBHOOK_SECRET!)) {
  return new Response("Unauthorized", { status: 401 });
}
const payload = JSON.parse(rawBody);`}
												label="Verify HMAC (Node.js)"
											/>
										</CardContent>
									</Card>
								</div>
							</section>

							<section className="space-y-6" id="errors-and-constraints">
								<SectionHeading
									description="The API keeps failures explicit and predictable. The main categories are authentication failures, request validation failures, and not-found responses for queries that do not resolve to an address."
									eyebrow="Operational behavior"
									id="errors-and-constraints"
									title="Errors and constraints"
								/>

								<div className="grid gap-4 md:grid-cols-3">
									<Card>
										<CardHeader>
											<CardTitle className="flex items-center gap-2 text-base">
												<KeyRoundIcon className="size-4" />
												401 Unauthorized
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm leading-6">
												Returned when the API key is missing, invalid, revoked,
												or expired. Error responses use a stable envelope:
												`error.code` plus `error.message`.
											</p>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="flex items-center gap-2 text-base">
												<AlertTriangleIcon className="size-4" />
												400 Validation
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm leading-6">
												Used for short search queries, malformed IDs, missing
												coordinates, or coordinates outside valid geographic
												bounds.
											</p>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="flex items-center gap-2 text-base">
												<MapPinIcon className="size-4" />
												404 Not Found
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm leading-6">
												Used when a numeric address ID does not exist or reverse
												geocoding cannot find an address within 200 meters.
											</p>
										</CardContent>
									</Card>
								</div>

								<Card>
									<CardHeader>
										<CardTitle className="text-base">
											Current request constraints
										</CardTitle>
									</CardHeader>
									<CardContent className="grid gap-3 md:grid-cols-2">
										<div className="rounded-lg border p-4">
											<p className="font-medium text-sm">Autocomplete</p>
											<p className="mt-2 text-muted-foreground text-sm leading-6">
												`q` must be at least 2 characters. `limit` defaults to
												10 and is capped at 20.
											</p>
										</div>
										<div className="rounded-lg border p-4">
											<p className="font-medium text-sm">Nearby</p>
											<p className="mt-2 text-muted-foreground text-sm leading-6">
												`radius` defaults to 1000m and is capped at 50000m.
												`limit` defaults to 10 and is capped at 50.
											</p>
										</div>
										<div className="rounded-lg border p-4">
											<p className="font-medium text-sm">Reverse</p>
											<p className="mt-2 text-muted-foreground text-sm leading-6">
												Searches the nearest address within 200m and returns
												exactly one match.
											</p>
										</div>
										<div className="rounded-lg border p-4">
											<p className="font-medium text-sm">Coordinates</p>
											<p className="mt-2 text-muted-foreground text-sm leading-6">
												Latitude must remain inside `-90..90` and longitude
												inside `-180..180`.
											</p>
										</div>
									</CardContent>
								</Card>

								<CodeBlock
									code={`{
  "error": {
    "code": "bad_request",
    "message": "Query parameter 'q' must be at least 2 characters."
  }
}`}
									label="Error Envelope"
								/>
							</section>

							<section className="space-y-6" id="health-checks">
								<SectionHeading
									description="Baseline platform observability starts with a public health surface and response timing data. These routes are intended for synthetic checks, deployment verification, and integration smoke tests."
									eyebrow="Observability"
									id="health-checks"
									title="Health checks and timing"
								/>

								<div className="grid gap-4 md:grid-cols-2">
									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												Health endpoint
											</CardTitle>
											<CardDescription>
												Use this route for uptime probes and deployment checks.
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3">
											<code className="block break-all rounded bg-muted px-3 py-2 font-mono text-sm">
												https://api.locnative.com/api/health
											</code>
											<p className="text-muted-foreground text-sm leading-6">
												The health response includes the published platform SLO
												targets for latency and uptime, plus a timestamped
												service status result.
											</p>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-base">Server-Timing</CardTitle>
											<CardDescription>
												Core API responses expose request duration directly in
												the response headers.
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3 text-muted-foreground text-sm leading-6">
											<p>
												Check the `Server-Timing` header to inspect endpoint
												latency while testing in the explorer, from your own
												client, or through synthetic monitoring.
											</p>
											<p>
												This is the baseline measurement layer for the v1 API
												surface while richer dashboard analytics continue to
												mature.
											</p>
										</CardContent>
									</Card>
								</div>
							</section>

							<section className="space-y-6" id="integration-checklist">
								<SectionHeading
									description="If you want the cleanest production implementation, treat the docs as an execution checklist rather than a reference page you skim once."
									eyebrow="Delivery checklist"
									id="integration-checklist"
									title="Integration checklist"
								/>

								<div className="grid gap-4 md:grid-cols-2">
									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												Recommended flow
											</CardTitle>
										</CardHeader>
										<CardContent className="space-y-3">
											<div className="flex gap-3">
												<SearchIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
												<p className="text-muted-foreground text-sm leading-6">
													Start with autocomplete for user-entered text so the
													user selects a canonical address rather than
													submitting free-form input.
												</p>
											</div>
											<div className="flex gap-3">
												<BracesIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
												<p className="text-muted-foreground text-sm leading-6">
													Store the returned address `id` and use the by-ID
													endpoint whenever you need to rehydrate that record
													later.
												</p>
											</div>
											<div className="flex gap-3">
												<LocateFixedIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
												<p className="text-muted-foreground text-sm leading-6">
													Use reverse or nearby only when you already trust the
													source coordinates or want map-adjacent workflows.
												</p>
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<CardTitle className="text-base">
												Implementation details
											</CardTitle>
										</CardHeader>
										<CardContent className="space-y-3">
											<div className="flex gap-3">
												<Code2Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
												<p className="text-muted-foreground text-sm leading-6">
													Handle `400` and `401` explicitly in your client layer
													so forms can recover gracefully without masking
													validation issues.
												</p>
											</div>
											<div className="flex gap-3">
												<KeyRoundIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
												<p className="text-muted-foreground text-sm leading-6">
													Keep API keys on trusted infrastructure or server
													routes when possible instead of exposing them directly
													in a public client.
												</p>
											</div>
											<div className="flex gap-3">
												<BookOpenIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
												<p className="text-muted-foreground text-sm leading-6">
													Use the API explorer after sign-in when you want to
													validate request shapes and inspect responses
													interactively.
												</p>
											</div>
										</CardContent>
									</Card>
								</div>
							</section>

							<section className="space-y-6" id="next-steps">
								<SectionHeading
									description="Once your first request works, the fastest next move is to generate a dedicated API key for the environment you are shipping and test the exact endpoint mix you expect to use in production."
									eyebrow="Next steps"
									id="next-steps"
									title="Move from docs to implementation"
								/>

								<div className="grid gap-4 md:grid-cols-3">
									<Card className="h-full">
										<CardHeader>
											<CardTitle className="text-base">Create a key</CardTitle>
											<CardDescription>
												Generate the key you will use for development or
												staging.
											</CardDescription>
										</CardHeader>
										<CardContent>
											<Link to="/sign-up">
												<Button className="w-full">
													Create account
													<ArrowRightIcon className="size-4" />
												</Button>
											</Link>
										</CardContent>
									</Card>

									<Card className="h-full">
										<CardHeader>
											<CardTitle className="text-base">
												Inspect requests
											</CardTitle>
											<CardDescription>
												Use the protected explorer to verify parameters and
												outputs.
											</CardDescription>
										</CardHeader>
										<CardContent>
											<Link to="/api-docs">
												<Button className="w-full" variant="outline">
													Open API Explorer
												</Button>
											</Link>
										</CardContent>
									</Card>

									<Card className="h-full">
										<CardHeader>
											<CardTitle className="text-base">Track usage</CardTitle>
											<CardDescription>
												Watch successful request volume once your integration is
												live.
											</CardDescription>
										</CardHeader>
										<CardContent>
											<Link to="/dashboard">
												<Button className="w-full" variant="outline">
													View dashboard
												</Button>
											</Link>
										</CardContent>
									</Card>
								</div>
							</section>
						</main>

						<aside className="hidden xl:block">
							<div className="sticky top-24 space-y-4 rounded-xl border bg-card p-4">
								<p className="font-medium text-sm">On this page</p>
								<nav className="space-y-1">
									{docsToc.map((item) => (
										<a
											className={cn(
												"block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
												activeSection === item.href.slice(1)
													? "bg-muted font-medium text-foreground"
													: "text-muted-foreground"
											)}
											href={item.href}
											key={item.href}
										>
											{item.title}
										</a>
									))}
								</nav>
								<div className="rounded-lg border border-dashed p-3">
									<p className="font-medium text-sm">
										Need interactive testing?
									</p>
									<p className="mt-2 text-muted-foreground text-sm leading-6">
										The API explorer lives behind sign-in so you can test with
										real project keys safely.
									</p>
									<Link to="/api-docs">
										<Button className="mt-3 w-full" size="sm" variant="outline">
											<TerminalIcon className="size-4" />
											Open explorer
										</Button>
									</Link>
								</div>
							</div>
						</aside>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
