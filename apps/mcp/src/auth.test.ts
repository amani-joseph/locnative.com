import { describe, expect, it } from "vitest";
import { extractApiKey } from "./auth.ts";

const req = (headers: Record<string, string>) =>
	new Request("https://mcp.locnative.com/mcp", { headers });

describe("extractApiKey", () => {
	it("reads a Bearer token (case-insensitive scheme)", () => {
		expect(extractApiKey(req({ Authorization: "Bearer key_123" }))).toBe(
			"key_123"
		);
		expect(extractApiKey(req({ authorization: "bearer key_456" }))).toBe(
			"key_456"
		);
	});

	it("trims surrounding whitespace from the token", () => {
		expect(extractApiKey(req({ Authorization: "Bearer  key_789 " }))).toBe(
			"key_789"
		);
	});

	it("falls back to X-API-Key", () => {
		expect(extractApiKey(req({ "X-API-Key": "key_abc" }))).toBe("key_abc");
	});

	it("returns null for a blank or whitespace-only key", () => {
		expect(extractApiKey(req({ Authorization: "Bearer    " }))).toBeNull();
		expect(extractApiKey(req({ "X-API-Key": "   " }))).toBeNull();
	});

	it("returns null when no key header is present", () => {
		expect(extractApiKey(req({}))).toBeNull();
	});
});
