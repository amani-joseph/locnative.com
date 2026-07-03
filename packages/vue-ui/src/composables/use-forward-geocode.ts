import type { LocnativeClient } from "@locnative/sdk";
import { type MaybeRefOrGetter, ref, toValue, watch } from "vue";
import { logDevError } from "../utils/dev-log";

export interface GeocodeAddress {
	formattedAddress: string;
	id: number;
	latitude: number;
	longitude: number;
}

/**
 * Reactive forward geocoding — Vue port of react-ui's `useForwardGeocode`.
 * Resolves the supplied address text (reactive source) to coordinates, aborting
 * stale requests as the query changes.
 */
export function useForwardGeocode(
	client: LocnativeClient,
	query: MaybeRefOrGetter<string | null>
) {
	const data = ref<GeocodeAddress | null>(null);
	const loading = ref(false);
	const error = ref<Error | null>(null);

	let controller: AbortController | null = null;

	watch(
		() => toValue(query),
		(value) => {
			controller?.abort();

			if (!value) {
				data.value = null;
				error.value = null;
				loading.value = false;
				return;
			}

			const ctrl = new AbortController();
			controller = ctrl;
			loading.value = true;
			error.value = null;

			client.geocode
				.forward({ q: value }, { signal: ctrl.signal })
				.then((response) => {
					if (ctrl.signal.aborted) {
						return;
					}
					const address = response.address;
					data.value = address
						? {
								id: address.id,
								formattedAddress: address.formattedAddress,
								latitude: address.latitude,
								longitude: address.longitude,
							}
						: null;
				})
				.catch((err: unknown) => {
					if (ctrl.signal.aborted) {
						return;
					}
					logDevError("forward geocode failed", err);
					error.value = err instanceof Error ? err : new Error(String(err));
					data.value = null;
				})
				.finally(() => {
					if (!ctrl.signal.aborted) {
						loading.value = false;
					}
				});
		},
		{ immediate: true }
	);

	return { data, loading, error };
}
