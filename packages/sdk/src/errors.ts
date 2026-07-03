import type {
	WheraboutsApiErrorPayload,
	WheraboutsErrorCode,
	WheraboutsFieldError,
} from "./shared-types.ts";

export class WheraboutsApiError extends Error {
	readonly code: WheraboutsErrorCode | "unknown_error";
	readonly payload: WheraboutsApiErrorPayload | null;
	readonly status: number;
	/** Correlation id from the `X-Request-Id` header or error body, if present. */
	readonly requestId: string | null;
	/** Documentation link for this error, if the API provided one. */
	readonly docUrl: string | null;
	/** Field-level validation detail, if the API provided any. */
	readonly fields: WheraboutsFieldError[] | null;

	constructor(options: {
		code?: WheraboutsApiError["code"];
		docUrl?: string | null;
		fields?: WheraboutsFieldError[] | null;
		message: string;
		payload?: WheraboutsApiErrorPayload | null;
		requestId?: string | null;
		status: number;
	}) {
		super(options.message);
		this.name = "LocnativeApiError";
		this.status = options.status;
		this.code = options.code ?? "unknown_error";
		this.payload = options.payload ?? null;
		this.requestId = options.requestId ?? null;
		this.docUrl = options.docUrl ?? null;
		this.fields = options.fields ?? null;
	}
}

export { WheraboutsApiError as LocnativeApiError };
