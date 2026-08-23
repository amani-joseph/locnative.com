import { describe, expect, it } from "vitest";
import { LocnativeApiError } from "./errors.ts";
import {
	isClientError,
	isLocnativeApiError,
	isRateLimitError,
} from "./guards.ts";

const apiError = (status: number, code?: LocnativeApiError["code"]) =>
	new LocnativeApiError({ status, code, message: "x" });

describe("isLocnativeApiError", () => {
	it("is true for a LocnativeApiError", () => {
		expect(isLocnativeApiError(apiError(404, "not_found"))).toBe(true);
	});

	it("is false for a plain Error or non-error", () => {
		expect(isLocnativeApiError(new Error("nope"))).toBe(false);
		expect(isLocnativeApiError(null)).toBe(false);
		expect(isLocnativeApiError({ foo: 1 })).toBe(false);
	});

	it("falls back to name+status duck-typing (duplicate-module safety)", () => {
		const dup = { name: "LocnativeApiError", status: 500, message: "x" };
		expect(isLocnativeApiError(dup)).toBe(true);
	});
});

describe("isRateLimitError", () => {
	it("is true for 429 or rate_limited", () => {
		expect(isRateLimitError(apiError(429))).toBe(true);
		expect(isRateLimitError(apiError(503, "rate_limited"))).toBe(true);
	});
	it("is false otherwise", () => {
		expect(isRateLimitError(apiError(500))).toBe(false);
		expect(isRateLimitError(new Error("x"))).toBe(false);
	});
});

describe("isClientError", () => {
	it("is true for 4xx, false for 5xx", () => {
		expect(isClientError(apiError(400))).toBe(true);
		expect(isClientError(apiError(404))).toBe(true);
		expect(isClientError(apiError(500))).toBe(false);
	});
});
