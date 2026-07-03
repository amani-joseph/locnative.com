// biome-ignore-all lint/style/useConsistentTypeDefinitions: these are kept as `type` aliases, not interfaces, on purpose — Props/Env are passed to McpAgent<Env, _, Props> (constrained to Record<string, unknown>) and ToolResult flows into the MCP SDK's tool-callback return type; interfaces are open/augmentable so TS does not consider them assignable to those index-signature constraints, but closed type aliases are.

import type { LocnativeClient } from "@locnative/sdk";
import type { ZodRawShape } from "zod";

/** Worker environment bindings/vars for the MCP server. */
export type Env = { LOCNATIVE_API_BASE_URL: string };

/** Per-session agent props extracted from the incoming bearer token. */
export type Props = { apiKey: string };

/**
 * The shape every tool handler returns as MCP content. `isError: true` marks a
 * tool-level failure (e.g. a mapped upstream error or a refused destructive op)
 * so the client surfaces it without throwing out of the agent.
 */
export type ToolResult = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

/**
 * Contract every tool module must satisfy. Each tool exports a `ToolDef`; the
 * registry (register.ts) wires it via `server.registerTool(name, {description,
 * inputSchema, annotations}, cb)` and invokes `handler(client, args)` with a
 * per-session SDK client and the validated arguments.
 */
export type ToolDef = {
	name: string;
	description: string;
	annotations?: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
		openWorldHint?: boolean;
	};
	inputSchema: ZodRawShape;
	handler: (
		client: LocnativeClient,
		args: Record<string, unknown>
	) => Promise<ToolResult>;
};
