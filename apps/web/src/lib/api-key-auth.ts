/**
 * Re-exports from the shared package.
 * Kept for backwards compatibility with any remaining web-side imports.
 */
export {
	API_KEY_PREFIX,
	formatApiKeyDisplayLabel,
	formatApiKeyDisplaySuffix,
	generateApiKeySecretPart,
	hashApiKeySecret,
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
