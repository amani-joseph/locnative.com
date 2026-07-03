import { describe, expect, it } from "vitest";
import { buildSdkSnippet, sdkCallForEndpoint } from "./sdk-snippet.ts";

describe("sdkCallForEndpoint", () => {
	it("maps catalog ids to namespaced SDK calls", () => {
		expect(sdkCallForEndpoint("zones.create")).toBe("client.zones.create");
		expect(sdkCallForEndpoint("addresses.autocomplete")).toBe(
			"client.addresses.autocomplete"
		);
		expect(sdkCallForEndpoint("geocode.batch.submit")).toBe(
			"client.geocode.batch.submit"
		);
		expect(sdkCallForEndpoint("addresses.byId")).toBe(
			"client.addresses.getById"
		);
		expect(sdkCallForEndpoint("devices.location.push")).toBe(
			"client.devices.pushLocation"
		);
		expect(sdkCallForEndpoint("geocode.batch.poll")).toBe(
			"client.geocode.batch.poll"
		);
		expect(sdkCallForEndpoint("regions.classify")).toBe(
			"client.regions.classify"
		);
	});
});

describe("buildSdkSnippet", () => {
	it("renders a runnable snippet for a method with a single params arg", () => {
		const snippet = buildSdkSnippet(
			"regions.classify",
			{ lat: "-37.8", lng: "144.9" },
			undefined
		);
		expect(snippet).toContain(
			'import { createLocnativeClient } from "@locnative/sdk";'
		);
		expect(snippet).toContain("client.regions.classify({");
		expect(snippet).toContain("lat: -37.8");
		expect(snippet).toContain("lng: 144.9");
	});

	it("renders a body object for a create call", () => {
		const snippet = buildSdkSnippet("zones.create", {}, { name: "depot" });
		expect(snippet).toContain("client.zones.create({");
		expect(snippet).toContain('name: "depot"');
	});

	it("renders an empty-arg call when there are no params or body", () => {
		const snippet = buildSdkSnippet("webhooks.list", {}, undefined);
		expect(snippet).toContain("client.webhooks.list()");
	});

	it("appends a trailing comment to a matching param line", () => {
		const snippet = buildSdkSnippet(
			"routing.directions",
			{ from: "-27.47,153.02", to: "-33.87,151.21" },
			undefined,
			{ from: "Brisbane QLD", to: "Sydney NSW" }
		);
		expect(snippet).toContain('from: "-27.47,153.02", // Brisbane QLD');
		expect(snippet).toContain('to: "-33.87,151.21", // Sydney NSW');
	});

	it("omits comments when none are provided", () => {
		const snippet = buildSdkSnippet(
			"routing.directions",
			{ from: "-27.47,153.02" },
			undefined
		);
		expect(snippet).toContain('from: "-27.47,153.02"');
		expect(snippet).not.toContain("//");
	});
});
