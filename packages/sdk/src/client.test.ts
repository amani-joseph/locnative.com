import { describe, expect, it } from "vitest";
import { createLocnativeClient } from "./client.ts";

const EXPECTED_PATHS = [
	["GET", "/api/v1/addresses/autocomplete"],
	["GET", "/api/v1/addresses/reverse"],
	["GET", "/api/v1/addresses/nearby"],
	["GET", "/api/v1/addresses/1"],
	["GET", "/api/v1/addresses/geocode"],
	["POST", "/api/v1/geocode/batch"],
	["GET", "/api/v1/geocode/batch/job_1"],
	["GET", "/api/v1/geocode/batch/job_1/results"],
	["POST", "/api/v1/zones"],
	["GET", "/api/v1/zones"],
	["GET", "/api/v1/zones/1"],
	["PUT", "/api/v1/zones/1"],
	["DELETE", "/api/v1/zones/1"],
	["GET", "/api/v1/zones/contains"],
	["GET", "/api/v1/zones/1/addresses"],
	["POST", "/api/v1/devices/dev_1/location"],
	["GET", "/api/v1/devices/dev_1/zones"],
	["POST", "/api/v1/webhooks"],
	["GET", "/api/v1/webhooks"],
	["DELETE", "/api/v1/webhooks/1"],
	["POST", "/api/v1/webhooks/1/reactivate"],
	["GET", "/api/v1/regions"],
	["GET", "/api/v1/routing/directions"],
] as const;

describe("client coverage", () => {
	it("every public endpoint is reachable via a namespaced method", async () => {
		const seen = new Set<string>();
		const fetchImpl = ((input: URL | Request | string, init?: RequestInit) => {
			const u = new URL(String(input));
			seen.add(`${init?.method ?? "GET"} ${u.pathname}`);
			return Promise.resolve(
				new Response("{}", {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			);
		}) as typeof fetch;
		const c = createLocnativeClient({ apiKey: "wh_test", fetch: fetchImpl });

		await c.addresses.autocomplete({ q: "x" });
		await c.addresses.reverse({ lat: 0, lng: 0 });
		await c.addresses.nearby({ lat: 0, lng: 0 });
		await c.addresses.getById(1);
		await c.geocode.forward({ q: "x" } as never);
		await c.geocode.batch.submit({} as never);
		await c.geocode.batch.poll("job_1");
		await c.geocode.batch.results("job_1");
		await c.zones.create({} as never);
		await c.zones.list();
		await c.zones.get(1);
		await c.zones.update(1, {} as never);
		await c.zones.delete(1);
		await c.zones.contains({ lat: 0, lng: 0 });
		await c.zones.addresses(1);
		await c.devices.pushLocation("dev_1", {} as never);
		await c.devices.zones("dev_1");
		await c.webhooks.create({} as never);
		await c.webhooks.list();
		await c.webhooks.delete(1);
		await c.webhooks.reactivate(1);
		await c.regions.classify({ lat: 0, lng: 0 });
		await c.routing.directions({ from: "0,0", to: "1,1" });

		for (const [method, path] of EXPECTED_PATHS) {
			expect(seen).toContain(`${method} ${path}`);
		}
	});
});
