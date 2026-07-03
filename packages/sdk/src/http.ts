import { LocnativeApiError } from "./errors.ts";
import {
	type HttpMethod,
	LOCNATIVE_API_VERSION,
	LOCNATIVE_SDK_VERSION,
	type LocnativeApiErrorPayload,
	type LocnativeClientConfig,
	type Requester,
	type RequestOptions,
} from "./shared-types.ts";

const DEFAULT_BASE_URL = "https://api.locnative.com";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 5000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const WRITE_METHODS = new Set<HttpMethod>(["POST", "PUT"]);

const createBaseHeaders = (config: LocnativeClientConfig): Headers => {
	const headers = new Headers(config.headers);
	headers.set("accept", "application/json");
	// Only attach auth when a key is configured. Omitting it enables the proxy
	// pattern (the consumer's backend injects the real key), and avoids sending a
	// literal "Bearer undefined" when no key is provided.
	if (config.apiKey) {
		headers.set("authorization", `Bearer ${config.apiKey}`);
	}
	headers.set(
		"x-locnative-sdk",
		`js-ts/${LOCNATIVE_SDK_VERSION} api/${LOCNATIVE_API_VERSION}`
	);
	return headers;
};

const generateIdempotencyKey = (): string => {
	const cryptoObj = globalThis.crypto;
	if (cryptoObj?.randomUUID) {
		return cryptoObj.randomUUID();
	}
	// Fallback for runtimes without crypto.randomUUID.
	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

const buildRequestHeaders = (
	baseHeaders: Headers,
	opts: RequestOptions
): Headers => {
	const headers = new Headers(baseHeaders);
	if (opts.headers) {
		for (const [key, value] of Object.entries(opts.headers)) {
			headers.set(key, value);
		}
	}
	if (opts.body !== undefined) {
		headers.set("content-type", "application/json");
	}
	// Writes carry an Idempotency-Key so retries are safe (docs/CONTRACT.md §6).
	if (WRITE_METHODS.has(opts.method)) {
		headers.set(
			"idempotency-key",
			opts.idempotencyKey ?? generateIdempotencyKey()
		);
	} else if (opts.idempotencyKey) {
		headers.set("idempotency-key", opts.idempotencyKey);
	}
	return headers;
};

const readRequestId = (response: Response): string | null =>
	response.headers.get("x-request-id") ??
	response.headers.get("x-locnative-request-id");

const parseApiError = async (
	response: Response
): Promise<LocnativeApiError> => {
	let payload: LocnativeApiErrorPayload | null = null;
	try {
		payload = (await response.json()) as LocnativeApiErrorPayload;
	} catch {
		payload = null;
	}
	const message =
		payload?.error.message ??
		`Locnative request failed with status ${response.status}`;
	return new LocnativeApiError({
		status: response.status,
		message,
		code: payload?.error.code ?? "unknown_error",
		payload,
		requestId: payload?.error.request_id ?? readRequestId(response),
		docUrl: payload?.error.doc_url ?? null,
		fields: payload?.error.fields ?? null,
	});
};

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) to milliseconds. */
const parseRetryAfter = (value: string | null): number | null => {
	if (!value) {
		return null;
	}
	const seconds = Number(value);
	if (Number.isFinite(seconds)) {
		return Math.max(0, seconds * 1000);
	}
	const dateMs = Date.parse(value);
	if (Number.isNaN(dateMs)) {
		return null;
	}
	return Math.max(0, dateMs - Date.now());
};

/** Exponential backoff with full jitter, capped. */
const computeBackoff = (attempt: number): number => {
	const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
	return Math.random() * exponential;
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new Error("Aborted"));
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason ?? new Error("Aborted"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});

const buildRequestUrl = (
	path: string,
	baseUrl: URL,
	query: RequestOptions["query"]
): URL => {
	const url = new URL(path, baseUrl);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url;
};

// Wires a caller's AbortSignal into the per-attempt controller and returns an
// unlink cleanup. Keeping this out of the retry loop keeps its complexity down.
const linkAbort = (
	controller: AbortController,
	callerSignal: AbortSignal | undefined
): (() => void) => {
	if (!callerSignal) {
		return () => {
			// no caller signal to unlink
		};
	}
	const onCallerAbort = () => controller.abort();
	if (callerSignal.aborted) {
		controller.abort();
	} else {
		callerSignal.addEventListener("abort", onCallerAbort, { once: true });
	}
	return () => callerSignal.removeEventListener("abort", onCallerAbort);
};

// Decides what to do with a thrown request error: retry after `waitMs`, or
// stop and surface `error`. Extracted so the retry loop stays under the
// cognitive-complexity limit. `attempt` is the pre-increment value, so `waitMs`
// (computeBackoff(attempt)) matches the original computeBackoff(attempt - 1)
// taken after the caller increments.
type RetryDecision =
	| { retry: true; waitMs: number }
	| { retry: false; error: unknown };

const classifyRequestError = (
	error: unknown,
	ctx: {
		callerSignal: AbortSignal | undefined;
		timedOut: boolean;
		attempt: number;
		maxRetries: number;
		timeoutMs: number;
	}
): RetryDecision => {
	// Caller aborted — never retry; propagate their intent.
	if (ctx.callerSignal?.aborted) {
		return { retry: false, error };
	}
	// Our timeout fired — treat like a transient failure.
	if (ctx.timedOut) {
		if (ctx.attempt < ctx.maxRetries) {
			return { retry: true, waitMs: computeBackoff(ctx.attempt) };
		}
		return {
			retry: false,
			error: new LocnativeApiError({
				status: 0,
				code: "timeout",
				message: `Request timed out after ${ctx.timeoutMs}ms.`,
			}),
		};
	}
	// A parsed API error (non-retryable status) — surface as-is.
	if (error instanceof LocnativeApiError) {
		return { retry: false, error };
	}
	// Network/transport error — retry if budget remains.
	if (ctx.attempt < ctx.maxRetries) {
		return { retry: true, waitMs: computeBackoff(ctx.attempt) };
	}
	return { retry: false, error };
};

// Decides whether a non-OK response should be retried. Returns the (capped)
// wait when retryable; otherwise the caller throws the parsed API error.
const classifyResponse = (
	response: Response,
	ctx: { attempt: number; maxRetries: number }
): { retry: true; waitMs: number } | { retry: false } => {
	if (RETRYABLE_STATUSES.has(response.status) && ctx.attempt < ctx.maxRetries) {
		const wait =
			parseRetryAfter(response.headers.get("retry-after")) ??
			computeBackoff(ctx.attempt);
		return { retry: true, waitMs: Math.min(wait, BACKOFF_CAP_MS) };
	}
	return { retry: false };
};

const readResponseBody = async <T>(response: Response): Promise<T> => {
	if (response.status === 204) {
		return undefined as T;
	}
	const text = await response.text();
	return (text ? JSON.parse(text) : undefined) as T;
};

interface AttemptContext {
	attempt: number;
	body: string | undefined;
	callerSignal: AbortSignal | undefined;
	config: LocnativeClientConfig;
	fetchImpl: typeof globalThis.fetch;
	headers: Headers;
	maxRetries: number;
	method: HttpMethod;
	path: string;
	startTime: number;
	timeoutMs: number;
	url: URL;
}

type AttemptOutcome<T> =
	| { done: true; value: T }
	| { done: false; waitMs: number };

// One request attempt: sets up the timeout/abort controller, performs the fetch,
// and returns either a terminal value or a retry signal (the loop owns waiting
// and the attempt counter). Throws on non-retryable failures.
const runAttempt = async <T>(
	ctx: AttemptContext
): Promise<AttemptOutcome<T>> => {
	const controller = new AbortController();
	let timedOut = false;
	const timeoutId = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, ctx.timeoutMs);
	const unlinkAbort = linkAbort(controller, ctx.callerSignal);

	try {
		const response = await ctx.fetchImpl(ctx.url, {
			method: ctx.method,
			headers: ctx.headers,
			body: ctx.body,
			signal: controller.signal,
		});

		ctx.config.logger?.({
			method: ctx.method,
			path: ctx.path,
			status: response.status,
			durationMs: Date.now() - ctx.startTime,
			requestId: readRequestId(response) ?? undefined,
		});

		if (!response.ok) {
			const decision = classifyResponse(response, {
				attempt: ctx.attempt,
				maxRetries: ctx.maxRetries,
			});
			if (decision.retry) {
				return { done: false, waitMs: decision.waitMs };
			}
			throw await parseApiError(response);
		}

		return { done: true, value: await readResponseBody<T>(response) };
	} catch (error) {
		const decision = classifyRequestError(error, {
			callerSignal: ctx.callerSignal,
			timedOut,
			attempt: ctx.attempt,
			maxRetries: ctx.maxRetries,
			timeoutMs: ctx.timeoutMs,
		});
		if (decision.retry) {
			return { done: false, waitMs: decision.waitMs };
		}
		throw decision.error;
	} finally {
		clearTimeout(timeoutId);
		unlinkAbort();
	}
};

export const createRequester = (config: LocnativeClientConfig): Requester => {
	const resolvedFetch = config.fetch ?? globalThis.fetch;
	if (!resolvedFetch) {
		throw new Error(
			"A fetch implementation is required to create the SDK client."
		);
	}
	// Bind the fetch implementation to globalThis. Internally it is invoked as a
	// property of the request context (`ctx.fetchImpl(...)`), which is a method
	// call and would otherwise set `this` to that context object. The browser's
	// native `fetch` requires `this` to be the global (window/WorkerGlobalScope)
	// and throws `TypeError: Illegal invocation` otherwise — so unbound usage
	// breaks every request in the browser (Node's fetch tolerates it, hiding the
	// bug in tests/SSR). Binding is harmless for user-supplied fetch functions.
	const fetchImpl = resolvedFetch.bind(globalThis);
	const baseUrl = new URL(config.baseUrl ?? DEFAULT_BASE_URL);
	const baseHeaders = createBaseHeaders(config);

	return async <T>(opts: RequestOptions): Promise<T> => {
		const url = buildRequestUrl(opts.path, baseUrl, opts.query);

		const headers = buildRequestHeaders(baseHeaders, opts);
		const hasBody = opts.body !== undefined;
		const body = hasBody ? JSON.stringify(opts.body) : undefined;
		const maxRetries =
			opts.maxRetries ?? config.maxRetries ?? DEFAULT_MAX_RETRIES;
		const timeoutMs = opts.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		// GET/PUT/DELETE are idempotent; POST is only retry-safe with a key (always
		// set for writes above), so every request here is retryable by method.
		const callerSignal = opts.signal;
		const startTime = Date.now();

		let attempt = 0;
		// Retry loop: each attempt returns a terminal value or a retry signal with
		// the backoff to wait. The per-attempt mechanics live in runAttempt.
		while (true) {
			const outcome = await runAttempt<T>({
				fetchImpl,
				url,
				method: opts.method,
				headers,
				body,
				path: opts.path,
				config,
				timeoutMs,
				callerSignal,
				attempt,
				maxRetries,
				startTime,
			});
			if (outcome.done) {
				return outcome.value;
			}
			attempt++;
			await sleep(outcome.waitMs, callerSignal);
		}
	};
};
