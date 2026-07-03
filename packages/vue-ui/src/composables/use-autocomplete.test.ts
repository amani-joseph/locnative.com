import { describe, expect, it } from "vitest";
import { type AutocompleteStatus, deriveStatus } from "./use-autocomplete";

const base = {
	error: null as Error | null,
	loading: false,
	minLength: 2,
	query: "",
	results: [] as never[],
};

const expectStatus = (
	over: Partial<typeof base>,
	expected: AutocompleteStatus
) => expect(deriveStatus({ ...base, ...over })).toBe(expected);

describe("deriveStatus", () => {
	it("is idle below the minimum query length", () => {
		expectStatus({ query: "a" }, "idle");
		expectStatus({ query: "" }, "idle");
	});

	it("is loading while a request is in flight", () => {
		expectStatus({ query: "abc", loading: true }, "loading");
	});

	it("is error when an error is present (and not loading)", () => {
		expectStatus({ query: "abc", error: new Error("boom") }, "error");
	});

	it("is empty when a completed search has no results", () => {
		expectStatus({ query: "abc", results: [] }, "empty");
	});

	it("is success when results are present", () => {
		expectStatus({ query: "abc", results: [{} as never] }, "success");
	});
});
