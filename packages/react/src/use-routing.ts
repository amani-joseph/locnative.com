import type {
	CallOptions,
	DirectionsParams,
	DirectionsResponse,
	IsochroneParams,
	IsochroneResponse,
	LocnativeClient,
	MatrixParams,
	MatrixResponse,
} from "@locnative/sdk";
import { useEffect, useRef, useState } from "react";
import { runResource } from "./async-resource.ts";

export interface RoutingResourceResult<T> {
	data: T | null;
	error: Error | null;
	loading: boolean;
}

type RoutingCall<P, R> = (
	client: LocnativeClient,
	params: P,
	options: CallOptions
) => Promise<R>;

/**
 * Shared effect skeleton for the routing hooks: fires `call` whenever the
 * (serialized) params change, aborts the previous request, and exposes
 * `{ data, loading, error }`. Pass `null` params to stay idle.
 */
function useRoutingResource<P, R>(
	client: LocnativeClient,
	params: P | null,
	call: RoutingCall<P, R>
): RoutingResourceResult<R> {
	const [data, setData] = useState<R | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	// Serialize params so stable values don't refire on every render.
	const key = params ? JSON.stringify(params) : null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `params` is tracked via its serialized `key`
	useEffect(() => {
		if (abortRef.current) {
			abortRef.current.abort();
		}

		if (!params) {
			setData(null);
			setLoading(false);
			setError(null);
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setLoading(true);
		setError(null);

		runResource(
			call(client, params, { signal: controller.signal }),
			controller.signal,
			{
				onSuccess: setData,
				onError: setError,
				onSettled: () => setLoading(false),
			}
		);

		return () => controller.abort();
	}, [key, client, call]);

	return { data, loading, error };
}

const directionsCall: RoutingCall<DirectionsParams, DirectionsResponse> = (
	client,
	params,
	options
) => client.routing.directions(params, options);

const matrixCall: RoutingCall<MatrixParams, MatrixResponse> = (
	client,
	params,
	options
) => client.routing.matrix(params, options);

const isochroneCall: RoutingCall<IsochroneParams, IsochroneResponse> = (
	client,
	params,
	options
) => client.routing.isochrone(params, options);

/** Fetch turn-by-turn directions; pass `null` to stay idle. */
export function useDirections(
	client: LocnativeClient,
	params: DirectionsParams | null
): RoutingResourceResult<DirectionsResponse> {
	return useRoutingResource(client, params, directionsCall);
}

/** Fetch a duration/distance matrix; pass `null` to stay idle. */
export function useMatrix(
	client: LocnativeClient,
	params: MatrixParams | null
): RoutingResourceResult<MatrixResponse> {
	return useRoutingResource(client, params, matrixCall);
}

/** Fetch an isochrone polygon; pass `null` to stay idle. */
export function useIsochrone(
	client: LocnativeClient,
	params: IsochroneParams | null
): RoutingResourceResult<IsochroneResponse> {
	return useRoutingResource(client, params, isochroneCall);
}
