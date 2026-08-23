// Dependency-free geo convenience helpers. Locnative records expose flat
// `latitude`/`longitude`; map UIs and GeoJSON want different shapes. These save
// consumers from reshaping by hand (mirrors use-places-autocomplete's
// getLatLng/getZipCode utilities).

export interface LatLng {
	lat: number;
	lng: number;
}

interface HasCoords {
	latitude: number;
	longitude: number;
}

/** `{ latitude, longitude }` → `{ lat, lng }` (e.g. for Leaflet/Google Maps). */
export function getLatLng(point: HasCoords): LatLng {
	return { lat: point.latitude, lng: point.longitude };
}

/** `{ latitude, longitude }` → `[lng, lat]` (GeoJSON / MapLibre coordinate order). */
export function toLngLat(point: HasCoords): [number, number] {
	return [point.longitude, point.latitude];
}

// Resolve ISO 3166-1 country codes to display names via the platform Intl data —
// full international coverage with zero maintenance. Lazily constructed and
// cached per locale so repeated calls are cheap.
const regionDisplayCache = new Map<string, Intl.DisplayNames | null>();

function regionDisplayNames(locale: string): Intl.DisplayNames | null {
	const cached = regionDisplayCache.get(locale);
	if (cached !== undefined) {
		return cached;
	}
	const instance =
		typeof Intl !== "undefined" && "DisplayNames" in Intl
			? new Intl.DisplayNames([locale], { type: "region" })
			: null;
	regionDisplayCache.set(locale, instance);
	return instance;
}

/**
 * ISO 3166-1 country code → display name (e.g. `"US"` → `"United States"`,
 * `"IS"` → `"Iceland"`). Falls back to the raw code when `Intl.DisplayNames`
 * is unavailable or the code is malformed. Defaults to English; pass a BCP-47
 * `locale` for localized names.
 */
export function countryName(code: string, locale = "en"): string {
	if (!code) {
		return code;
	}
	try {
		return regionDisplayNames(locale)?.of(code.toUpperCase()) ?? code;
	} catch {
		// of() throws RangeError on malformed codes — keep the raw value.
		return code;
	}
}

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

/**
 * Great-circle distance in metres between two points (haversine). Handy for
 * client-side "how far is this result" without a round-trip.
 */
export function distanceMeters(a: HasCoords, b: HasCoords): number {
	const dLat = (b.latitude - a.latitude) * DEG;
	const dLng = (b.longitude - a.longitude) * DEG;
	const lat1 = a.latitude * DEG;
	const lat2 = b.latitude * DEG;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}
