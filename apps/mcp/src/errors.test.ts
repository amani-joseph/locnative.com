import { LocnativeApiError } from "@locnative/sdk";
import { describe, expect, it } from "vitest";
import { ok, toToolError } from "./errors.ts";
import type { ToolResult } from "./types.ts";

const RATE_LIMIT = /rate.?limit/i;
const AUTH = /auth|api key/i;
const UPSTREAM = /upstream|temporarily/i;

// Reading content[0].text without a non-null assertion: an empty string keeps
// negative assertions (.not.toContain) valid while still failing positive ones
// if a result unexpectedly has no content block.
const firstText = (r: ToolResult): string => r.content[0]?.text ?? "";

describe("ok", () => {
	it("wraps data as a JSON text block", () => {
		expect(ok({ a: 1 })).toEqual({
			content: [{ type: "text", text: '{"a":1}' }],
		});
	});
});

describe("toToolError", () => {
	const make = (status: number, message: string) =>
		new LocnativeApiError({ message, status });

	it("maps 429 to a rate-limit message", () => {
		const r = toToolError(make(429, "slow down"));
		expect(r.isError).toBe(true);
		expect(firstText(r)).toMatch(RATE_LIMIT);
	});

	it("maps 401 to an auth message", () => {
		expect(firstText(toToolError(make(401, "bad key")))).toMatch(AUTH);
	});

	it("maps 5xx to a generic upstream error without leaking internals", () => {
		const r = toToolError(make(500, "stack trace here"));
		expect(firstText(r)).toMatch(UPSTREAM);
		expect(firstText(r)).not.toContain("stack trace here");
	});

	it("handles non-API errors", () => {
		const r = toToolError(new Error("boom"));
		expect(r.isError).toBe(true);
		expect(firstText(r)).toContain("boom");
	});
});
