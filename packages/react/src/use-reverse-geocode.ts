import type { LocnativeClient, ReverseGeocodeAddress } from "@locnative/sdk";
import { useEffect, useRef, useState } from "react";
import { logDevError } from "./dev-log.ts";

export interface LatLng {
	lat: number;
	lng: number;
}

export interface UseReverseGeocodeResult {
	address: ReverseGeocodeAddress | null;
	distance: number | null;
	error: Error | null;
	loading: boolean;
}

export function useReverseGeocode(
	client: LocnativeClient,
	coords: LatLng | null
): UseReverseGeocodeResult {
	const [address, setAddress] = useState<ReverseGeocodeAddress | null>(null);
	const [distance, setDistance] = useState<number | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	// Depend on the primitive lat/lng rather than the coords object so the effect
	// re-runs only when the coordinates actually change, not on every new object
	// identity a caller may pass. Capturing these locals (not `coords`) also keeps
	// the dependency array exhaustive.
	const lat = coords?.lat ?? null;
	const lng = coords?.lng ?? null;

	useEffect(() => {
		if (abortRef.current) {
			abortRef.current.abort();
		}

		if (lat === null || lng === null) {
			setAddress(null);
			setDistance(null);
			setLoading(false);
			setError(null);
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setLoading(true);
		setError(null);

		client.addresses
			.reverse({ lat, lng }, { signal: controller.signal })
			.then((res) => {
				if (!controller.signal.aborted) {
					setAddress(res.address);
					setDistance(res.distance);
				}
			})
			.catch((e: unknown) => {
				if (!controller.signal.aborted) {
					logDevError("reverse geocode failed", e);
					setError(e instanceof Error ? e : new Error(String(e)));
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			});

		return () => {
			controller.abort();
		};
	}, [lat, lng, client]);

	return { address, distance, loading, error };
}
