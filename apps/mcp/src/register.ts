import type { LocnativeClient } from "@locnative/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toToolError } from "./errors.ts";
import { deviceTools } from "./tools/devices.ts";
import { geocodingTools } from "./tools/geocoding.ts";
import { routingTools } from "./tools/routing.ts";
import { zoneTools } from "./tools/zones.ts";
import type { ToolDef } from "./types.ts";

export const allTools: ToolDef[] = [
	...geocodingTools,
	...routingTools,
	...zoneTools,
	...deviceTools,
];

export const registerTools = (
	server: McpServer,
	getClient: () => LocnativeClient
): void => {
	for (const tool of allTools) {
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: tool.annotations,
			},
			async (args: Record<string, unknown>) => {
				try {
					return await tool.handler(getClient(), args);
				} catch (err) {
					return toToolError(err);
				}
			}
		);
	}
};
