/**
 * Log an unexpected error to the console in development.
 *
 * The data-fetching hooks catch errors and surface them only as a localized
 * error state in the UI. That makes genuinely unexpected failures — a
 * misconfigured client, a network/CORS problem, or the SDK throwing before a
 * request is even sent — nearly invisible to developers.
 *
 * This logs such errors loudly during development and no-ops in production. It
 * deliberately skips `AbortError` (an expected outcome of cancelled requests)
 * so the console isn't flooded by normal cancellations.
 */
// Module-local ambient declaration: this is a browser package without Node
// types, but bundlers (webpack/Vite/Next) define `process.env.NODE_ENV`. The
// `typeof` guard below keeps it safe where `process` is truly undeclared.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

export function logDevError(context: string, error: unknown): void {
	if (
		typeof process !== "undefined" &&
		process.env?.NODE_ENV === "production"
	) {
		return;
	}
	if (error instanceof Error && error.name === "AbortError") {
		return;
	}
	console.error(`[locnative] ${context}`, error);
}
