import type {
	AddressSuggestion,
	AutocompleteParams,
	LocnativeClient,
} from "@locnative/sdk";
import { isRateLimitError } from "@locnative/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AutocompleteCacheKeyParts,
	buildCacheKey,
	readCache,
	type StorageLike,
	writeCache,
} from "./autocomplete-cache.ts";
import { logDevError } from "./dev-log.ts";

const DEFAULT_DEBOUNCE_MS = 300;
/** API rejects `q` shorter than 2 chars; gate locally to avoid wasted 400s. */
const DEFAULT_MIN_LENGTH = 2;
const DEFAULT_CACHE_TTL_MS = 60_000;

export type AutocompleteStatus =
	| "idle"
	| "loading"
	| "success"
	| "empty"
	| "error";

/** Opt-in client-side cache for repeated/back-and-forth queries. */
export interface AutocompleteCacheConfig {
	/** A `sessionStorage`-like store. Entries are namespaced under `wh:ac:`. */
	storage: StorageLike;
	/** Entry lifetime in ms (default 60_000). */
	ttlMs?: number;
}

export interface UseAutocompleteOptions {
	cache?: AutocompleteCacheConfig;
	country?: string;
	debounceMs?: number;
	/** Keep the previous results visible while a new search runs / on error. */
	keepPreviousData?: boolean;
	/** Latitude for proximity boosting (pair with `lng`). */
	lat?: number;
	limit?: number;
	/** Longitude for proximity boosting (pair with `lat`). */
	lng?: number;
	/** Minimum trimmed query length before a request fires (default 2). */
	minLength?: number;
	/** Groups keystrokes into one billable session; see `newSessionToken()`. */
	sessionToken?: string;
	state?: string;
}

export interface UseAutocompleteResult {
	error: Error | null;
	loading: boolean;
	query: string;
	/** True when the last request was rejected with HTTP 429. */
	rateLimited: boolean;
	/** Clear the query, results, and any in-flight request. */
	reset: () => void;
	results: AddressSuggestion[];
	setQuery: (q: string) => void;
	status: AutocompleteStatus;
}

/**
 * Derive a single coarse status from the hook's raw flags. Exported for
 * unit-testing and for consumers who prefer a state machine to booleans.
 */
export function deriveStatus(s: {
	error: Error | null;
	loading: boolean;
	minLength: number;
	query: string;
	results: AddressSuggestion[];
}): AutocompleteStatus {
	if (s.query.trim().length < s.minLength) {
		return "idle";
	}
	if (s.loading) {
		return "loading";
	}
	if (s.error) {
		return "error";
	}
	return s.results.length === 0 ? "empty" : "success";
}

type SearchPlan =
	| { kind: "idle" }
	| { kind: "cache"; results: AddressSuggestion[] }
	| { kind: "fetch" };

/** Decide whether to skip, serve from cache, or hit the network — pure. */
function planSearch(args: {
	cacheStorage: StorageLike | undefined;
	cacheTtl: number;
	keyParts: AutocompleteCacheKeyParts;
	minLength: number;
	trimmed: string;
}): SearchPlan {
	if (args.trimmed.length < args.minLength) {
		return { kind: "idle" };
	}
	if (args.cacheStorage) {
		const hit = readCache(
			args.cacheStorage,
			buildCacheKey(args.keyParts),
			args.cacheTtl,
			Date.now()
		);
		if (hit) {
			return { kind: "cache", results: hit };
		}
	}
	return { kind: "fetch" };
}

interface SearchActions {
	onError: (error: Error, rateLimited: boolean) => void;
	onSettled: () => void;
	onSuccess: (results: AddressSuggestion[]) => void;
}

/** Run one autocomplete request, routing the outcome through `actions`. */
async function executeAutocomplete(
	client: LocnativeClient,
	params: AutocompleteParams,
	controller: AbortController,
	actions: SearchActions
): Promise<void> {
	try {
		const res = await client.addresses.autocomplete(params, {
			signal: controller.signal,
		});
		if (!controller.signal.aborted) {
			actions.onSuccess(res.results);
		}
	} catch (e) {
		if (!controller.signal.aborted) {
			logDevError("address autocomplete failed", e);
			const err = e instanceof Error ? e : new Error(String(e));
			actions.onError(err, isRateLimitError(e));
		}
	} finally {
		if (!controller.signal.aborted) {
			actions.onSettled();
		}
	}
}

function cancelPending(
	timer: ReturnType<typeof setTimeout> | null,
	controller: AbortController | null
): void {
	if (timer) {
		clearTimeout(timer);
	}
	controller?.abort();
}

export function useAutocomplete(
	client: LocnativeClient,
	options: UseAutocompleteOptions = {}
): UseAutocompleteResult {
	const {
		debounceMs = DEFAULT_DEBOUNCE_MS,
		minLength = DEFAULT_MIN_LENGTH,
		limit,
		country,
		state,
		lat,
		lng,
		sessionToken,
		keepPreviousData = false,
		cache,
	} = options;

	const [query, setQuery] = useState("");
	const [results, setResults] = useState<AddressSuggestion[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [rateLimited, setRateLimited] = useState(false);

	const abortRef = useRef<AbortController | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Stable setter — consumers can safely pass this to input onChange.
	const handleSetQuery = useCallback((q: string) => {
		setQuery(q);
	}, []);

	const reset = useCallback(() => {
		cancelPending(timerRef.current, abortRef.current);
		setQuery("");
		setResults([]);
		setLoading(false);
		setError(null);
		setRateLimited(false);
	}, []);

	const cacheStorage = cache?.storage;
	const cacheTtl = cache?.ttlMs ?? DEFAULT_CACHE_TTL_MS;

	useEffect(() => {
		cancelPending(timerRef.current, abortRef.current);

		const trimmed = query.trim();
		const keyParts: AutocompleteCacheKeyParts = {
			q: trimmed,
			country,
			state,
			limit,
			lat,
			lng,
		};
		const plan = planSearch({
			trimmed,
			minLength,
			cacheStorage,
			cacheTtl,
			keyParts,
		});

		setError(null);
		setRateLimited(false);

		if (plan.kind === "idle") {
			if (!keepPreviousData) {
				setResults([]);
			}
			setLoading(false);
			return;
		}
		if (plan.kind === "cache") {
			setResults(plan.results);
			setLoading(false);
			return;
		}

		// Clear stale results as the new search starts unless asked to keep them
		// visible (keepPreviousData avoids dropdown flicker between keystrokes).
		if (!keepPreviousData) {
			setResults([]);
		}
		setLoading(true);
		timerRef.current = setTimeout(async () => {
			const controller = new AbortController();
			abortRef.current = controller;
			await executeAutocomplete(
				client,
				{ q: trimmed, limit, country, state, lat, lng, sessionToken },
				controller,
				{
					onSuccess: (r) => {
						setResults(r);
						if (cacheStorage) {
							writeCache(cacheStorage, buildCacheKey(keyParts), r, Date.now());
						}
					},
					onError: (err, limited) => {
						setError(err);
						setRateLimited(limited);
						if (!keepPreviousData) {
							setResults([]);
						}
					},
					onSettled: () => setLoading(false),
				}
			);
		}, debounceMs);

		return () => cancelPending(timerRef.current, abortRef.current);
	}, [
		query,
		debounceMs,
		minLength,
		limit,
		country,
		state,
		lat,
		lng,
		sessionToken,
		keepPreviousData,
		cacheStorage,
		cacheTtl,
		client,
	]);

	const status = deriveStatus({ query, minLength, loading, error, results });

	return {
		query,
		setQuery: handleSetQuery,
		results,
		loading,
		error,
		rateLimited,
		reset,
		status,
	};
}
