import { createLocnativeClient } from "@locnative/sdk";
import { describe, expect, it, vi } from "vitest";

describe("useZoneContains - client integration", () => {
	it("returns zones containing the given coordinates", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					count: 1,
					query: { lat: -33.87, lng: 151.21 },
					zones: [
						{
							createdAt: "2026-01-01",
							description: null,
							id: 99,
							metadata: null,
							name: "CBD Zone",
							projectId: "proj_1",
							updatedAt: "2026-01-01",
						},
					],
				}),
				{ status: 200 }
			)
		);
		const client = createLocnativeClient({
			apiKey: "wh_test",
			baseUrl: "http://localhost",
			fetch: fetchMock,
		});

		const res = await client.zones.contains({ lat: -33.87, lng: 151.21 });
		expect(res.zones).toHaveLength(1);
		const zone = res.zones[0];
		expect(zone).toBeDefined();
		if (zone) {
			expect(zone.name).toBe("CBD Zone");
		}
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
