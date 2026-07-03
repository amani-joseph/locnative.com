// Import the dependency-free id list (not the full proxy module, which would
// transitively pull in server-only env validation into this browser test).
import { EXPLORER_ENDPOINT_IDS } from "@locnative/api/routers/domains/api-explorer-ids";
import { describe, expect, it } from "vitest";
import { apiExplorerEndpoints } from "./api-explorer-endpoints.ts";

describe("explorer catalog ↔ proxy allowlist drift guard", () => {
	it("every catalog endpoint is executable through the proxy allowlist", () => {
		const missing = apiExplorerEndpoints
			.map((endpoint) => endpoint.id)
			.filter((id) => !EXPLORER_ENDPOINT_IDS.has(id));
		expect(missing).toEqual([]);
	});
});
