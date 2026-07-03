import type { LocnativeClient, ZoneRecord } from "@locnative/sdk";
import { useEffect, useRef, useState } from "react";

import type { LatLng } from "./use-reverse-geocode.ts";

export interface UseZoneContainsResult {
	error: Error | null;
	loading: boolean;
	zones: ZoneRecord[];
}

export function useZoneContains(
	client: LocnativeClient,
	coords: LatLng | null
): UseZoneContainsResult {
	const [zones, setZones] = useState<ZoneRecord[]>([]);
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
			setZones([]);
			setLoading(false);
			setError(null);
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setLoading(true);
		setError(null);

		client.zones
			.contains({ lat, lng }, { signal: controller.signal })
			.then((res) => {
				if (!controller.signal.aborted) {
					setZones(res.zones);
				}
			})
			.catch((e: unknown) => {
				if (!controller.signal.aborted) {
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

	return { zones, loading, error };
}
