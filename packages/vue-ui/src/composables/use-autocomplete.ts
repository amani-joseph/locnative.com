import type {
	AddressSuggestion,
	AutocompleteParams,
	LocnativeClient,
} from "@locnative/sdk";
import { isRateLimitError } from "@locnative/sdk";
import { computed, onScopeDispose, ref } from "vue";
import { logDevError } from "../utils/dev-log";

const DEFAULT_DEBOUNCE_MS = 300;
/** API rejects `q` shorter than 2 chars; gate locally to avoid wasted 400s. */
const DEFAULT_MIN_LENGTH = 2;

export type AutocompleteStatus =
	| "idle"
	| "loading"
	| "success"
	| "empty"
	| "error";

export interface UseAutocompleteOptions {
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

/** Derive a single coarse status from the raw reactive flags — pure. */
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

/**
 * Reactive address autocomplete — Vue port of the react package's
 * `useAutocomplete`. Owns the `query` ref; debounces input, aborts in-flight
 * requests, and exposes coarse `status` plus raw flags.
 */
export function useAutocomplete(
	client: LocnativeClient,
	options: UseAutocompleteOptions = {}
) {
	const {
		debounceMs = DEFAULT_DEBOUNCE_MS,
		minLength = DEFAULT_MIN_LENGTH,
		keepPreviousData = false,
	} = options;

	const query = ref("");
	const results = ref<AddressSuggestion[]>([]);
	const loading = ref(false);
	const error = ref<Error | null>(null);
	const rateLimited = ref(false);

	let timer: ReturnType<typeof setTimeout> | null = null;
	let controller: AbortController | null = null;

	const cancelPending = (): void => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		controller?.abort();
		controller = null;
	};

	const runFetch = async (trimmed: string): Promise<void> => {
		const ctrl = new AbortController();
		controller = ctrl;
		const params: AutocompleteParams = {
			q: trimmed,
			limit: options.limit,
			country: options.country,
			state: options.state,
			lat: options.lat,
			lng: options.lng,
			sessionToken: options.sessionToken,
		};
		try {
			const res = await client.addresses.autocomplete(params, {
				signal: ctrl.signal,
			});
			if (!ctrl.signal.aborted) {
				results.value = res.results;
			}
		} catch (e) {
			if (!ctrl.signal.aborted) {
				logDevError("address autocomplete failed", e);
				error.value = e instanceof Error ? e : new Error(String(e));
				rateLimited.value = isRateLimitError(e);
				if (!keepPreviousData) {
					results.value = [];
				}
			}
		} finally {
			if (!ctrl.signal.aborted) {
				loading.value = false;
			}
		}
	};

	const setQuery = (value: string): void => {
		query.value = value;
		cancelPending();
		error.value = null;
		rateLimited.value = false;

		const trimmed = value.trim();
		if (trimmed.length < minLength) {
			if (!keepPreviousData) {
				results.value = [];
			}
			loading.value = false;
			return;
		}

		if (!keepPreviousData) {
			results.value = [];
		}
		loading.value = true;
		timer = setTimeout(() => {
			runFetch(trimmed).catch(() => undefined);
		}, debounceMs);
	};

	const reset = (): void => {
		cancelPending();
		query.value = "";
		results.value = [];
		loading.value = false;
		error.value = null;
		rateLimited.value = false;
	};

	onScopeDispose(cancelPending);

	const status = computed<AutocompleteStatus>(() =>
		deriveStatus({
			query: query.value,
			minLength,
			loading: loading.value,
			error: error.value,
			results: results.value,
		})
	);

	return {
		query,
		results,
		loading,
		error,
		rateLimited,
		status,
		setQuery,
		reset,
	};
}
