import { LocnativeApiError } from "./errors.ts";

/**
 * Narrow an unknown thrown value to `LocnativeApiError`. Uses `instanceof`
 * with a `name`-based fallback so it still works if two copies of the SDK are
 * loaded (e.g. duplicate dep versions), where `instanceof` can fail.
 */
export function isLocnativeApiError(
	error: unknown
): error is LocnativeApiError {
	if (error instanceof LocnativeApiError) {
		return true;
	}
	const errorName = (error as { name?: unknown })?.name;
	return (
		typeof error === "object" &&
		error !== null &&
		errorName === "LocnativeApiError" &&
		typeof (error as { status?: unknown }).status === "number"
	);
}

/** True when the error is a rate-limit response (HTTP 429 / `rate_limited`). */
export function isRateLimitError(error: unknown): error is LocnativeApiError {
	return (
		isLocnativeApiError(error) &&
		(error.status === 429 || error.code === "rate_limited")
	);
}

/** True when the error is a client-side validation/bad-request (HTTP 4xx). */
export function isClientError(error: unknown): error is LocnativeApiError {
	return (
		isLocnativeApiError(error) && error.status >= 400 && error.status < 500
	);
}
