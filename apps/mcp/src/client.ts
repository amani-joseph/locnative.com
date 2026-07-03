import { createLocnativeClient, type LocnativeClient } from "@locnative/sdk";

export const buildClient = (
	apiKey: string,
	baseUrl: string,
	fetchImpl: typeof fetch = fetch
): LocnativeClient =>
	createLocnativeClient({ apiKey, baseUrl, fetch: fetchImpl });
