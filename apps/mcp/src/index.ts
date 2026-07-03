import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { extractApiKey } from "./auth.ts";
import { buildClient } from "./client.ts";
import { registerTools } from "./register.ts";
import type { Env, Props } from "./types.ts";

export class LocnativeMcp extends McpAgent<Env, unknown, Props> {
	server = new McpServer({ name: "locnative", version: "0.1.0" });

	// biome-ignore lint/suspicious/useAwait: McpAgent.init is an async lifecycle hook the framework awaits; this implementation wires tools synchronously but the signature must stay async to match the base class.
	async init() {
		registerTools(this.server, () =>
			// biome-ignore lint/style/noNonNullAssertion: this.props is set per request by the Durable Object — fetch() below writes ctx.props and updateProps() refreshes this.props before init/handlers run.
			buildClient(this.props!.apiKey, this.env.LOCNATIVE_API_BASE_URL)
		);
	}
}

const mcpHandler = LocnativeMcp.serve("/mcp", { binding: "MCP_OBJECT" });

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const apiKey = extractApiKey(request);
		if (!apiKey) {
			return new Response(
				JSON.stringify({
					error: "Missing API key. Send Authorization: Bearer <key>.",
				}),
				{
					status: 401,
					headers: {
						"content-type": "application/json",
						"WWW-Authenticate": "Bearer",
					},
				}
			);
		}
		// agents@0.2.x reads per-session props off the ExecutionContext: serve()
		// passes ctx.props into the Durable Object, where updateProps() refreshes
		// this.props on every request so each call uses its own API key.
		(ctx as ExecutionContext & { props: Props }).props = { apiKey };
		return await mcpHandler.fetch(request, env, ctx);
	},
};
