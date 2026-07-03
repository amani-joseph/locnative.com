/**
 * @deprecated The v1 API endpoints now live on apps/server via oRPC OpenAPIHandler.
 * This file is kept only while any non-proxied route still references it.
 * Once all v1 routes are removed, delete this file.
 */
export {
	INTERNAL_API_AUTH_HEADER,
	INTERNAL_API_KEY_ID_HEADER,
	INTERNAL_REQUEST_SOURCE_HEADER,
	parseApiKeyFromRequest,
	REQUEST_SOURCE_EXPLORER_TEST,
	REQUEST_SOURCE_PRODUCTION,
	recordUsage,
	type ValidatedApiKey,
	validateApiKey,
	validateApiKeyById,
} from "@locnative/api/api-key-auth";
export {
	applyServerTiming,
	jsonApiError,
} from "@locnative/api/api-response";
