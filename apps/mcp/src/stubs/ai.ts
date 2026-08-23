// Stub for the optional `ai` peer dependency of the `agents` SDK.
//
// `agents` declares `ai` as an OPTIONAL peer dependency and dynamically
// imports it (`const { jsonSchema } = await import("ai")`) only inside its
// AI-chat code path. The Locnative MCP server fronts the location API and
// never exercises that path, so `ai` is not installed. esbuild/workerd must
// still resolve the bare specifier at bundle time, so this stub is wired in
// via the `alias` map in wrangler.jsonc.
//
// If the unused code path is ever reached, fail loudly instead of silently
// returning undefined.
export function jsonSchema(): never {
	throw new Error(
		"The optional 'ai' dependency is not bundled in the Locnative MCP server."
	);
}
