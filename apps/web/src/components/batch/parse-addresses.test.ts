// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MAX_BATCH, parseAddresses } from "./parse-addresses.ts";

const MAX_BATCH_ERROR_REGEX = /1,?000/;
const NO_ADDRESSES_ERROR_REGEX = /no addresses/i;
const MIN_LENGTH_ERROR_REGEX = /at least 5 characters/;

describe("parseAddresses", () => {
	it("splits newline-separated input and trims", () => {
		const out = parseAddresses("1 Macquarie St Sydney\n2 George St Sydney\n");
		expect(out.error).toBeNull();
		expect(out.addresses).toEqual([
			"1 Macquarie St Sydney",
			"2 George St Sydney",
		]);
	});

	it("drops blank lines", () => {
		const out = parseAddresses("1 Macquarie St Sydney\n\n2 George St Sydney");
		expect(out.error).toBeNull();
		expect(out.addresses).toHaveLength(2);
	});

	it("extracts the first column from CSV rows", () => {
		const out = parseAddresses(
			"1 Macquarie St Sydney,NSW,2000\n2 George St Sydney,NSW,2001"
		);
		expect(out.error).toBeNull();
		expect(out.addresses).toEqual([
			"1 Macquarie St Sydney",
			"2 George St Sydney",
		]);
	});

	it("handles quoted CSV cells with commas inside", () => {
		const out = parseAddresses('"1 Main St, Suite 100",NSW,2000');
		expect(out.error).toBeNull();
		expect(out.addresses).toEqual(["1 Main St, Suite 100"]);
	});

	it("returns an error when addresses exceed MAX_BATCH", () => {
		const many = Array.from(
			{ length: MAX_BATCH + 1 },
			(_, i) => `address number ${i}`
		).join("\n");
		expect(parseAddresses(many).error).toMatch(MAX_BATCH_ERROR_REGEX);
	});

	it("returns an error for empty input", () => {
		expect(parseAddresses("   ").error).toMatch(NO_ADDRESSES_ERROR_REGEX);
	});

	it("returns an error for a line shorter than 5 chars", () => {
		const out = parseAddresses("1 Macquarie St Sydney\nABC");
		expect(out.error).toMatch(MIN_LENGTH_ERROR_REGEX);
	});
});
