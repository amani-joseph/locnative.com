/**
 * Extracts the Locnative API key from an incoming MCP request.
 * Accepts `Authorization: Bearer <key>` (case-insensitive scheme) or
 * `X-API-Key: <key>`. Returns null when absent or blank.
 */
export const extractApiKey = (request: Request): string | null => {
	const auth = request.headers.get("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) {
		return auth.slice(7).trim() || null;
	}
	return request.headers.get("x-api-key")?.trim() || null;
};
