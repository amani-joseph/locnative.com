import { describe, expect, it } from "vitest";
import { buildMapStyle, OPENFREEMAP_DARK } from "./map-style.ts";

describe("buildMapStyle", () => {
	it("falls back to OpenFreeMap dark when no tiles base url", () => {
		expect(buildMapStyle(undefined)).toBe(OPENFREEMAP_DARK);
	});

	it("builds a Protomaps style object pointing at our tile worker", () => {
		const style = buildMapStyle("https://api.locnative.com");
		expect(typeof style).not.toBe("string");
		const s = style as Exclude<ReturnType<typeof buildMapStyle>, string>;
		expect(s.sources.protomaps).toMatchObject({
			type: "vector",
			tiles: ["https://api.locnative.com/tiles/v1/{z}/{x}/{y}.mvt"],
		});
		expect(s.glyphs).toBe(
			"https://api.locnative.com/tiles/v1/fonts/{fontstack}/{range}.pbf"
		);
		expect(Array.isArray(s.layers)).toBe(true);
		expect(s.layers.length).toBeGreaterThan(5);
	});

	it("includes label layers so place/road names render", () => {
		const style = buildMapStyle("https://api.locnative.com");
		const s = style as Exclude<ReturnType<typeof buildMapStyle>, string>;
		// protomaps-themes-base v4 only emits label layers when `lang` is passed.
		// Without them, the basemap renders with no text. Guard against regressing.
		const labelLayers = s.layers.filter(
			(layer) => layer?.layout?.["text-field"] !== undefined
		);
		expect(labelLayers.length).toBeGreaterThan(0);
	});
});
