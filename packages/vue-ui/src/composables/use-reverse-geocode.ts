import type { LocnativeClient, ReverseGeocodeAddress } from "@locnative/sdk";
import { type MaybeRefOrGetter, ref, toValue, watch } from "vue";
import { logDevError } from "../utils/dev-log";

export interface LatLng {
	lat: number;
	lng: number;
}

/**
 * Reactive reverse geocoding — Vue port of the react package's
 * `useReverseGeocode`. Resolves the supplied coordinates (reactive source) to an
 * address, aborting stale requests as the coordinates change.
 */
export function useReverseGeocode(
	client: LocnativeClient,
	coords: MaybeRefOrGetter<LatLng | null>
) {
	const address = ref<ReverseGeocodeAddress | null>(null);
	const distance = ref<number | null>(null);
	const loading = ref(false);
	const error = ref<Error | null>(null);

	let controller: AbortController | null = null;

	watch(
		// Track the primitive lat/lng so the watcher fires only on real changes,
		// not on every new object identity a caller may pass.
		() => {
			const value = toValue(coords);
			return value ? `${value.lat},${value.lng}` : null;
		},
		() => {
			controller?.abort();
			const value = toValue(coords);

			if (!value) {
				address.value = null;
				distance.value = null;
				loading.value = false;
				error.value = null;
				return;
			}

			const ctrl = new AbortController();
			controller = ctrl;
			loading.value = true;
			error.value = null;

			client.addresses
				.reverse({ lat: value.lat, lng: value.lng }, { signal: ctrl.signal })
				.then((res) => {
					if (!ctrl.signal.aborted) {
						address.value = res.address;
						distance.value = res.distance;
					}
				})
				.catch((err: unknown) => {
					if (!ctrl.signal.aborted) {
						logDevError("reverse geocode failed", err);
						error.value = err instanceof Error ? err : new Error(String(err));
					}
				})
				.finally(() => {
					if (!ctrl.signal.aborted) {
						loading.value = false;
					}
				});
		},
		{ immediate: true }
	);

	return { address, distance, loading, error };
}
