import type {
	LocnativeApiErrorPayload,
	LocnativeErrorCode,
	LocnativeFieldError,
} from "./shared-types.ts";

export class LocnativeApiError extends Error {
	readonly code: LocnativeErrorCode | "unknown_error";
	readonly payload: LocnativeApiErrorPayload | null;
	readonly status: number;
	/** Correlation id from the `X-Request-Id` header or error body, if present. */
	readonly requestId: string | null;
	/** Documentation link for this error, if the API provided one. */
	readonly docUrl: string | null;
	/** Field-level validation detail, if the API provided any. */
	readonly fields: LocnativeFieldError[] | null;

	constructor(options: {
		code?: LocnativeApiError["code"];
		docUrl?: string | null;
		fields?: LocnativeFieldError[] | null;
		message: string;
		payload?: LocnativeApiErrorPayload | null;
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
