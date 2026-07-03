import { layers, namedTheme } from "protomaps-themes-base";

/**
 * MapLibre basemap resolution for the (dark) dashboard. In production we serve a
 * self-hosted Protomaps vector basemap from our own tile Worker (R2-backed,
 * edge-cached). Without a tiles base URL configured (local dev fallback) we use
 * the free, no-key OpenFreeMap dark style.
 */

export interface MapStyleSpec {
	glyphs: string;
	// biome-ignore lint/suspicious/noExplicitAny: maplibre LayerSpecification array
	layers: any[];
	sources: Record<string, unknown> & {
		protomaps: { type: "vector"; tiles: string[]; maxzoom: number };
	};
	sprite: string;
	version: 8;
}

export type MapStyle = string | MapStyleSpec;

/** Free, no-key, CORS-open dark vector basemap (dev fallback only). */
export const OPENFREEMAP_DARK = "https://tiles.openfreemap.org/styles/dark";
/** Light counterpart (for any future light-themed surface). */
export const OPENFREEMAP_LIGHT =
	"https://tiles.openfreemap.org/styles/positron";

const SOURCE_NAME = "protomaps";
const MAX_ZOOM = 15;
const TRAILING_SLASH_REGEX = /\/$/;

export function buildMapStyle(tilesBaseUrl?: string): MapStyle {
	if (!tilesBaseUrl) {
		return OPENFREEMAP_DARK;
	}
	const base = tilesBaseUrl.replace(TRAILING_SLASH_REGEX, "");
	return {
		version: 8,
		glyphs: `${base}/tiles/v1/fonts/{fontstack}/{range}.pbf`,
		sprite: `${base}/tiles/v1/sprite/dark`,
		sources: {
			[SOURCE_NAME]: {
				type: "vector",
				tiles: [`${base}/tiles/v1/{z}/{x}/{y}.mvt`],
				maxzoom: MAX_ZOOM,
			},
		},
		// `lang` is required for protomaps-themes-base v4 to emit the label
		// layers (place/road/water names). Without it, `layers()` returns only
		// geometry layers and the map renders with no text. See map-style.test.ts.
		layers: layers(SOURCE_NAME, namedTheme("dark"), { lang: "en" }),
	};
}
