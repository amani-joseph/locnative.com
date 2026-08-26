import { describe, expect, it } from "vitest";
import {
	groupRegionsByLayer,
	parseLayers,
	REGION_LAYERS,
} from "../../shared/region-queries.ts";

describe("parseLayers", () => {
	it("returns undefined when no layers param is given", () => {
		expect(parseLayers(undefined)).toBeUndefined();
	});

	it("returns undefined when the param has no valid layer codes", () => {
		expect(parseLayers("banana, xyz")).toBeUndefined();
	});

	it("returns undefined for whitespace-only input", () => {
		expect(parseLayers("   ")).toBeUndefined();
	});

	it("parses a csv of valid layer codes, trimming and lowercasing", () => {
		expect(parseLayers(" SA2 , lga ,poa")).toEqual(["sa2", "lga", "poa"]);
	});

	it("drops unknown codes but keeps valid ones", () => {
		expect(parseLayers("sa2,banana,mb")).toEqual(["sa2", "mb"]);
	});

	it("exposes the full set of supported layers", () => {
		expect(REGION_LAYERS).toEqual([
			"locality",
			"state",
			"sa1",
			"sa2",
			"sa3",
			"sa4",
			"lga",
			"poa",
			"ced",
			"sed",
			"mb",
		]);
	});
});

describe("groupRegionsByLayer", () => {
	it("keys regions by their layer with code+name only", () => {
		const result = groupRegionsByLayer([
			{ layer: "state", code: "2", name: "Victoria", state: "VIC" },
			{ layer: "lga", code: "24600", name: "Melbourne (C)", state: "VIC" },
		]);
		expect(result).toEqual({
			state: { code: "2", name: "Victoria" },
			lga: { code: "24600", name: "Melbourne (C)" },
		});
	});

	it("returns an empty object for no rows", () => {
		expect(groupRegionsByLayer([])).toEqual({});
	});

	it("keeps the first row when a layer appears more than once", () => {
		const result = groupRegionsByLayer([
			{ layer: "poa", code: "3000", name: "3000", state: "VIC" },
			{ layer: "poa", code: "3001", name: "3001", state: "VIC" },
		]);
		expect(result.poa).toEqual({ code: "3000", name: "3000" });
	});
});
