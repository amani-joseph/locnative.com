/**
 * Re-exports from the shared package.
 * Kept for backwards compatibility with any remaining web-side imports.
 */
export {
	type ApiErrorCode,
	type ApiErrorResponseBody,
	applyServerTiming,
	createApiErrorBody,
	jsonApiError,
} from "@locnative/api/api-response";
