import { apiKeys } from "@locnative/database/schema";
import { serverEnv } from "@locnative/env/server";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../procedures.ts";

const INTERNAL_API_AUTH_HEADER = "x-locnative-internal-auth";
const INTERNAL_API_KEY_ID_HEADER = "x-locnative-internal-api-key-id";
const INTERNAL_REQUEST_SOURCE_HEADER = "x-locnative-request-source";
const REQUEST_SOURCE_EXPLORER_TEST = "explorer_test";
const RAW_KEY_FORMAT_RE = /^wh_[^_]+_.+$/i;

type ApiEndpointId =
	| "addresses.autocomplete"
	| "addresses.byId"
	| "addresses.nearby"
	| "addresses.reverse"
	| "regions.classify"
	| "routing.directions"
	| "addresses.geocode"
	| "geocode.batch.submit"
	| "geocode.batch.poll"
	| "geocode.batch.results"
	| "zones.create"
	| "zones.list"
	| "zones.get"
	| "zones.update"
	| "zones.delete"
	| "zones.contains"
	| "zones.addresses"
	| "devices.location.push"
	| "devices.zones"
	| "webhooks.create"
	| "webhooks.list"
	| "webhooks.delete"
	| "webhooks.reactivate";

interface ApiEndpoint {
	id: ApiEndpointId;
	method: "GET" | "POST" | "PUT" | "DELETE";
	params: { name: string; pathParam?: boolean }[];
	path: string;
}

const endpointMap = new Map<ApiEndpointId, ApiEndpoint>([
	[
		"addresses.autocomplete",
		{
			id: "addresses.autocomplete",
			method: "GET",
			path: "/api/v1/addresses/autocomplete",
			params: [
				{ name: "q" },
				{ name: "country" },
				{ name: "state" },
				{ name: "limit" },
			],
		},
	],
	[
		"addresses.byId",
		{
			id: "addresses.byId",
			method: "GET",
			path: "/api/v1/addresses/{id}",
			params: [{ name: "id", pathParam: true }],
		},
	],
	[
		"addresses.nearby",
		{
			id: "addresses.nearby",
			method: "GET",
			path: "/api/v1/addresses/nearby",
			params: [
				{ name: "lat" },
				{ name: "lng" },
				{ name: "radius" },
				{ name: "limit" },
				{ name: "country" },
			],
		},
	],
	[
		"addresses.reverse",
		{
			id: "addresses.reverse",
			method: "GET",
			path: "/api/v1/addresses/reverse",
			params: [{ name: "lat" }, { name: "lng" }],
		},
	],
	[
		"regions.classify",
		{
			id: "regions.classify",
			method: "GET",
			path: "/api/v1/regions",
			params: [{ name: "lat" }, { name: "lng" }, { name: "layers" }],
		},
	],
	[
		"routing.directions",
		{
			id: "routing.directions",
			method: "GET",
			path: "/api/v1/routing/directions",
			params: [
				{ name: "from" },
				{ name: "to" },
				{ name: "fromAddressId" },
				{ name: "toAddressId" },
			],
		},
	],
	[
		"addresses.geocode",
		{
			id: "addresses.geocode",
			method: "GET",
			path: "/api/v1/addresses/geocode",
			params: [
				{ name: "q" },
				{ name: "structured" },
				{ name: "street" },
				{ name: "locality" },
				{ name: "state" },
				{ name: "postcode" },
				{ name: "country" },
			],
		},
	],
	[
		"geocode.batch.poll",
		{
			id: "geocode.batch.poll",
			method: "GET",
			path: "/api/v1/geocode/batch/{jobId}",
			params: [{ name: "jobId", pathParam: true }],
		},
	],
	[
		"geocode.batch.results",
		{
			id: "geocode.batch.results",
			method: "GET",
			path: "/api/v1/geocode/batch/{jobId}/results",
			params: [{ name: "jobId", pathParam: true }],
		},
	],
	[
		"zones.list",
		{
			id: "zones.list",
			method: "GET",
			path: "/api/v1/zones",
			params: [{ name: "projectId" }],
		},
	],
	[
		"zones.get",
		{
			id: "zones.get",
			method: "GET",
			path: "/api/v1/zones/{id}",
			params: [{ name: "id", pathParam: true }],
		},
	],
	[
		"zones.contains",
		{
			id: "zones.contains",
			method: "GET",
			path: "/api/v1/zones/contains",
			params: [{ name: "projectId" }, { name: "lat" }, { name: "lng" }],
		},
	],
	[
		"zones.addresses",
		{
			id: "zones.addresses",
			method: "GET",
			path: "/api/v1/zones/{id}/addresses",
			params: [
				{ name: "id", pathParam: true },
				{ name: "limit" },
				{ name: "offset" },
			],
		},
	],
	[
		"devices.zones",
		{
			id: "devices.zones",
			method: "GET",
			path: "/api/v1/devices/{deviceId}/zones",
			params: [{ name: "deviceId", pathParam: true }, { name: "projectId" }],
		},
	],
	[
		"webhooks.list",
		{
			id: "webhooks.list",
			method: "GET",
			path: "/api/v1/webhooks",
			params: [{ name: "projectId" }],
		},
	],
	[
		"zones.create",
		{ id: "zones.create", method: "POST", path: "/api/v1/zones", params: [] },
	],
	[
		"zones.update",
		{
			id: "zones.update",
			method: "PUT",
			path: "/api/v1/zones/{id}",
			params: [{ name: "id", pathParam: true }],
		},
	],
	[
		"zones.delete",
		{
			id: "zones.delete",
			method: "DELETE",
			path: "/api/v1/zones/{id}",
			params: [{ name: "id", pathParam: true }],
		},
	],
	[
		"webhooks.create",
		{
			id: "webhooks.create",
			method: "POST",
			path: "/api/v1/webhooks",
			params: [],
		},
	],
	[
		"webhooks.delete",
		{
			id: "webhooks.delete",
			method: "DELETE",
			path: "/api/v1/webhooks/{id}",
			params: [{ name: "id", pathParam: true }],
		},
	],
	[
		"webhooks.reactivate",
		{
			id: "webhooks.reactivate",
			method: "POST",
			path: "/api/v1/webhooks/{id}/reactivate",
			params: [{ name: "id", pathParam: true }],
		},
	],
	[
		"devices.location.push",
		{
			id: "devices.location.push",
			method: "POST",
			path: "/api/v1/devices/{deviceId}/location",
			params: [{ name: "deviceId", pathParam: true }],
		},
	],
	[
		"geocode.batch.submit",
		{
			id: "geocode.batch.submit",
			method: "POST",
			path: "/api/v1/geocode/batch",
			params: [],
		},
	],
]);

export const EXPLORER_ENDPOINT_IDS: ReadonlySet<string> = new Set(
	endpointMap.keys()
);

/**
 * Look up an allowlisted explorer endpoint by id. Test-only helper — the
 * request handler uses `endpointMap.get` with an `ORPCError` instead; this
 * throws a plain Error and must not be called from the request path.
 */
export function getExplorerEndpoint(id: string): ApiEndpoint {
	const ep = endpointMap.get(id as ApiEndpointId);
	if (!ep) {
		throw new Error(`Unknown explorer endpoint: ${id}`);
	}
	return ep;
}

export function buildProxyRequest(
	endpoint: ApiEndpoint,
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined
): {
	method: ApiEndpoint["method"];
	url: string;
	body?: Record<string, unknown>;
} {
	let url = endpoint.path;
	for (const param of endpoint.params) {
		if (param.pathParam) {
			// Encode path-param values so free-form values can't traverse segments.
			url = url.replace(
				`{${param.name}}`,
				encodeURIComponent(paramValues[param.name] ?? "")
			);
		}
	}
	const queryParts: string[] = [];
	for (const param of endpoint.params) {
		if (!param.pathParam) {
			const value = paramValues[param.name];
			if (value) {
				queryParts.push(
					`${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`
				);
			}
		}
	}
	if (queryParts.length > 0) {
		url = `${url}?${queryParts.join("&")}`;
	}
	// Body is suppressed for GET; DELETE endpoints are called with body=undefined.
	const sendBody = endpoint.method === "GET" ? undefined : body;
	return { method: endpoint.method, url, body: sendBody };
}

const explorerRequestSchema = z.object({
	authMode: z.enum(["managed", "raw"]),
	endpointId: z.string(),
	managedKeyId: z.string().uuid().optional(),
	paramValues: z.record(z.string(), z.string()).default({}),
	rawApiKey: z.string().optional(),
	body: z.record(z.string(), z.unknown()).optional(),
});

const parseResponseBody = async (response: Response): Promise<unknown> => {
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return await response.json();
	}
	return await response.text();
};

export const apiExplorerRouter = {
	sendRequest: protectedProcedure
		.input(explorerRequestSchema)
		.handler(async ({ context, input }) => {
			const authUserId = context.session.user.id;

			const endpoint = endpointMap.get(input.endpointId as ApiEndpointId);
			if (!endpoint) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Unsupported API explorer endpoint.",
				});
			}

			const proxyReq = buildProxyRequest(
				endpoint,
				input.paramValues,
				input.body
			);
			const targetUrl = new URL(proxyReq.url, serverEnv.BETTER_AUTH_URL);
			const fetchFn = context.localFetch ?? fetch;
			const headers = new Headers({
				accept: "application/json",
				[INTERNAL_API_AUTH_HEADER]: serverEnv.BETTER_AUTH_SECRET,
				[INTERNAL_REQUEST_SOURCE_HEADER]: REQUEST_SOURCE_EXPLORER_TEST,
			});

			if (input.authMode === "managed") {
				if (!input.managedKeyId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Choose a managed API key before sending a test request.",
					});
				}

				const [managedKey] = await context.db
					.select({
						expiresAt: apiKeys.expiresAt,
						id: apiKeys.id,
						revokedAt: apiKeys.revokedAt,
					})
					.from(apiKeys)
					.where(
						and(
							eq(apiKeys.id, input.managedKeyId),
							eq(apiKeys.userId, authUserId)
						)
					)
					.limit(1);

				if (!managedKey) {
					throw new ORPCError("BAD_REQUEST", {
						message: "The selected API key does not belong to your account.",
					});
				}
				if (managedKey.revokedAt) {
					throw new ORPCError("BAD_REQUEST", {
						message: "The selected API key has been revoked.",
					});
				}
				if (
					managedKey.expiresAt &&
					managedKey.expiresAt.getTime() <= Date.now()
				) {
					throw new ORPCError("BAD_REQUEST", {
						message: "The selected API key has expired.",
					});
				}

				headers.set(INTERNAL_API_KEY_ID_HEADER, managedKey.id);
			} else {
				const rawApiKey = input.rawApiKey?.trim();
				if (!rawApiKey) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Paste a raw API key before sending a test request.",
					});
				}
				if (!RAW_KEY_FORMAT_RE.test(rawApiKey)) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Raw API keys must match the wh_<id>_<secret> format.",
					});
				}
				headers.set("Authorization", `Bearer ${rawApiKey}`);
			}

			if (proxyReq.body !== undefined) {
				headers.set("content-type", "application/json");
			}
			const startedAt = Date.now();
			// No `cache` option: this fetch runs in-process via localFetch and the
			// Workers runtime does not support the `cache` RequestInit field.
			const response = await fetchFn(targetUrl, {
				method: proxyReq.method,
				headers,
				body:
					proxyReq.body === undefined
						? undefined
						: JSON.stringify(proxyReq.body),
			});
			const durationMs = Date.now() - startedAt;
			const body = await parseResponseBody(response);

			return {
				body,
				durationMs,
				ok: response.ok,
				requestUrl: proxyReq.url,
				statusCode: response.status,
			};
		}),
};
