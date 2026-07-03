export const WHERABOUTS_API_VERSION = "v1" as const;
export const WHERABOUTS_SDK_VERSION = "0.4.3" as const;
export const LOCNATIVE_API_VERSION = WHERABOUTS_API_VERSION;
export const LOCNATIVE_SDK_VERSION = WHERABOUTS_SDK_VERSION;

/**
 * Error codes the API may return. The server currently emits a subset; the full
 * union is declared for forward-compatibility with the Phase 2 error envelope
 * (see docs/CONTRACT.md §4). Unknown codes fall back to `unknown_error`.
 */
export type WheraboutsErrorCode =
	| "bad_request"
	| "conflict"
	| "forbidden"
	| "internal_error"
	| "not_found"
	| "rate_limited"
	| "timeout"
	| "unauthorized"
	| "unprocessable";
export type LocnativeErrorCode = WheraboutsErrorCode;

export interface WheraboutsFieldError {
	message: string;
	path: string;
}
export type LocnativeFieldError = WheraboutsFieldError;

export interface RequestLogEvent {
	durationMs: number;
	method: string;
	path: string;
	requestId?: string;
	status: number;
}

export interface WheraboutsApiErrorPayload {
	error: {
		code: WheraboutsErrorCode;
		message: string;
		/** Correlation id; also sent as the `X-Request-Id` response header. */
		request_id?: string;
		/** Link to documentation for this error code. */
		doc_url?: string;
		/** Field-level validation detail (validation errors only). */
		fields?: WheraboutsFieldError[];
	};
}
export type LocnativeApiErrorPayload = WheraboutsApiErrorPayload;

export interface WheraboutsClientConfig {
	/**
	 * Publishable/secret API key sent as `Authorization: Bearer <apiKey>`.
	 *
	 * Optional: when omitted, no `Authorization` header is sent. This supports
	 * the recommended browser pattern of proxying requests through your own
	 * backend (via a custom `baseUrl`/`fetch`) so the real key never reaches the
	 * client — the proxy attaches the key server-side.
	 */
	apiKey?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	headers?: Record<string, string>;
	/** Called after every request. Use for debugging or observability. */
	logger?: (event: RequestLogEvent) => void;
	/** Max automatic retries for transient failures. Default 2. */
	maxRetries?: number;
	/** Per-request timeout in milliseconds. Default 30000. */
	timeoutMs?: number;
}
export type LocnativeClientConfig = WheraboutsClientConfig;

/**
 * Per-call overrides. Every resource method accepts an optional trailing
 * `options` argument of this shape.
 */
export interface CallOptions {
	/** Extra headers merged over (not replacing) the client headers. */
	headers?: Record<string, string>;
	/** Idempotency key for write requests. Auto-generated on writes if omitted. */
	idempotencyKey?: string;
	/** Override the client's `maxRetries` for this call. */
	maxRetries?: number;
	/** Abort signal — aborting rejects the call (and is not retried). */
	signal?: AbortSignal;
	/** Override the client's `timeoutMs` for this call. */
	timeoutMs?: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions extends CallOptions {
	body?: unknown;
	method: HttpMethod;
	path: string;
	query?: Record<string, number | string | undefined>;
}

export type Requester = <T>(opts: RequestOptions) => Promise<T>;
