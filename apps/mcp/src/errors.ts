import { isLocnativeApiError } from "@locnative/sdk";
import type { ToolResult } from "./types.ts";

export const ok = (data: unknown): ToolResult => ({
	content: [{ type: "text", text: JSON.stringify(data) }],
});

const errText = (text: string): ToolResult => ({
	content: [{ type: "text", text }],
	isError: true,
});

export const toToolError = (err: unknown): ToolResult => {
	if (isLocnativeApiError(err)) {
		const msg = err.payload?.error.message ?? err.message;
		switch (true) {
			case err.status === 400:
				return errText(`Invalid request: ${msg}`);
			case err.status === 401:
				return errText(`Authentication failed (check your API key): ${msg}`);
			case err.status === 402:
				return errText(`Quota or billing limit reached: ${msg}`);
			case err.status === 404:
				return errText(`Not found: ${msg}`);
			case err.status === 429:
				return errText("Rate limited — please retry after a short delay.");
			case err.status >= 500:
				return errText(
					"Upstream service temporarily unavailable. Try again shortly."
				);
			default:
				return errText(`Request failed (${err.status}): ${msg}`);
		}
	}
	return errText(
		`Unexpected error: ${err instanceof Error ? err.message : String(err)}`
	);
};
