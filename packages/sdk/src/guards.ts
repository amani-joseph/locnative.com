import { WheraboutsApiError } from "./errors.ts";

/**
 * Narrow an unknown thrown value to `WheraboutsApiError`. Uses `instanceof`
 * with a `name`-based fallback so it still works if two copies of the SDK are
 * loaded (e.g. duplicate dep versions), where `instanceof` can fail.
 */
export function isWheraboutsApiError(
	error: unknown
): error is WheraboutsApiError {
	if (error instanceof WheraboutsApiError) {
		return true;
	}
	const errorName = (error as { name?: unknown })?.name;
	return (
		typeof error === "object" &&
		error !== null &&
		(errorName === "WheraboutsApiError" || errorName === "LocnativeApiError") &&
		typeof (error as { status?: unknown }).status === "number"
	);
}

export const isLocnativeApiError = isWheraboutsApiError;

/** True when the error is a rate-limit response (HTTP 429 / `rate_limited`). */
export function isRateLimitError(error: unknown): error is WheraboutsApiError {
	return (
		isWheraboutsApiError(error) &&
		(error.status === 429 || error.code === "rate_limited")
	);
}

/** True when the error is a client-side validation/bad-request (HTTP 4xx). */
export function isClientError(error: unknown): error is WheraboutsApiError {
	return (
		isWheraboutsApiError(error) && error.status >= 400 && error.status < 500
	);
}
