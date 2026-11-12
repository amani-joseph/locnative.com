// Dependency-free so the web app can import these at runtime.

/** Services offered on the onboarding screen, mirroring the public API. */
export const SERVICE_INTEREST_OPTIONS = [
	{
		value: "geocoding",
		label: "Address autocomplete & geocoding",
		description: "Search-as-you-type addresses and turn them into coordinates.",
	},
	{
		value: "batch_geocoding",
		label: "Batch geocoding",
		description: "Geocode large address lists asynchronously.",
	},
	{
		value: "routing",
		label: "Routing & directions",
		description:
			"Directions, distance matrices, isochrones and route optimisation.",
	},
	{
		value: "zones",
		label: "Zones & geofencing",
		description: "Draw zones and check which addresses or points fall inside.",
	},
	{
		value: "device_tracking",
		label: "Device & fleet tracking",
		description: "Report device locations and get zone enter/exit events.",
	},
	{
		value: "map_tiles",
		label: "Map tiles",
		description: "Vector map tiles and styles for your own maps.",
	},
	{
		value: "other",
		label: "Something else / not sure yet",
		description: "Tell us later — you can change this any time.",
	},
] as const;

export type ServiceInterest =
	(typeof SERVICE_INTEREST_OPTIONS)[number]["value"];

export const SERVICE_INTEREST_VALUES = SERVICE_INTEREST_OPTIONS.map(
	(option) => option.value
) as [ServiceInterest, ...ServiceInterest[]];

/**
 * The exact marketing checkbox text. Clivly stores it as proof of consent, so
 * any change to the wording must bump MARKETING_CONSENT_WORDING_VERSION.
 */
export const MARKETING_CONSENT_WORDING =
	"Send me product updates, tips and offers from Locnative. You can unsubscribe at any time.";

export const MARKETING_CONSENT_WORDING_VERSION = "2026-11 onboarding v1";

/** Where a consent change was captured, as reported to Clivly. */
export type ConsentSource = "onboarding" | "settings";
