// @locnative/react — React hooks for the Locnative location API

export type { StorageLike } from "./autocomplete-cache.ts";
export type {
	ComboboxAction,
	ComboboxInputProps,
	ComboboxItemProps,
	ComboboxListboxProps,
	ComboboxState,
	UseComboboxOptions,
	UseComboboxResult,
} from "./combobox.ts";
export {
	buildInputProps,
	buildItemProps,
	buildListboxProps,
	comboboxReducer,
	INITIAL_COMBOBOX_STATE,
	keyToAction,
	useCombobox,
} from "./combobox.ts";
export type {
	AutocompleteCacheConfig,
	AutocompleteStatus,
	UseAutocompleteOptions,
	UseAutocompleteResult,
} from "./use-autocomplete.ts";
export { deriveStatus, useAutocomplete } from "./use-autocomplete.ts";

export type {
	LatLng,
	UseReverseGeocodeResult,
} from "./use-reverse-geocode.ts";
export { useReverseGeocode } from "./use-reverse-geocode.ts";

export type { RoutingResourceResult } from "./use-routing.ts";
export {
	useDirections,
	useIsochrone,
	useMatrix,
} from "./use-routing.ts";

export type { UseZoneContainsResult } from "./use-zone-contains.ts";
export { useZoneContains } from "./use-zone-contains.ts";
