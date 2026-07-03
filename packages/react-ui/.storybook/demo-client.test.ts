import { describe, expect, it } from "vitest";
import { resolveDemoConfig } from "./demo-client";

describe("resolveDemoConfig", () => {
	it("marks configured when a key is present and keeps the given base URL", () => {
		const cfg = resolveDemoConfig({
			VITE_DEMO_API_KEY: "pk_test_123",
			VITE_DEMO_API_BASE_URL: "https://api.example.com",
		});
		expect(cfg).toEqual({
			apiKey: "pk_test_123",
			baseUrl: "https://api.example.com",
			configured: true,
		});
	});

	it("defaults the base URL and marks unconfigured when the key is missing", () => {
		const cfg = resolveDemoConfig({});
		expect(cfg).toEqual({
			apiKey: "",
			baseUrl: "https://api.locnative.com",
			configured: false,
		});
	});

	it("treats an empty-string key as unconfigured", () => {
		expect(resolveDemoConfig({ VITE_DEMO_API_KEY: "" }).configured).toBe(false);
	});
});
