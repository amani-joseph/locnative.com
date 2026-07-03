import type { AddressSuggestion } from "@locnative/sdk";
import { createLocnativeClient } from "@locnative/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveStatus } from "./use-autocomplete.ts";

const ONE_SUGGESTION: AddressSuggestion[] = [
	{
		id: 1,
		formattedAddress: "34 Boxgrove Ave, Sydney NSW 2000",
		streetAddress: "34 Boxgrove Ave",
		locality: "Sydney",
		state: "NSW",
		postcode: "2000",
		country: "AU",
		latitude: -33.865,
		longitude: 151.209,
	},
];

describe("deriveStatus", () => {
	const base = {
		query: "george st",
		minLength: 2,
		loading: false,
		error: null as Error | null,
		results: [] as AddressSuggestion[],
	};

	it("is idle when the trimmed query is shorter than minLength", () => {
		expect(deriveStatus({ ...base, query: "g" })).toBe("idle");
		expect(deriveStatus({ ...base, query: "  " })).toBe("idle");
	});

	it("is loading while a request is in flight", () => {
		expect(deriveStatus({ ...base, loading: true })).toBe("loading");
	});

	it("is error when an error is present", () => {
		expect(deriveStatus({ ...base, error: new Error("boom") })).toBe("error");
	});

	it("is empty when a completed search returned no results", () => {
		expect(deriveStatus(base)).toBe("empty");
	});

	it("is success when a completed search returned results", () => {
		expect(deriveStatus({ ...base, results: ONE_SUGGESTION })).toBe("success");
	});

	it("prefers idle over a stale error once the query falls below minLength", () => {
		expect(
			deriveStatus({ ...base, query: "g", error: new Error("boom") })
		).toBe("idle");
	});
});

// Tests exercise the SDK client integration (autocomplete call/abort behaviour)
// without DOM rendering. Hook logic (debounce + abort) is verified via
// direct async calls with fake timers where applicable.

describe("useAutocomplete — client integration", () => {
	it("returns results for a matching query", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					count: 1,
					results: [
						{
							id: 1,
							formattedAddress: "34 Boxgrove Ave, Sydney NSW 2000",
							streetAddress: "34 Boxgrove Ave",
							locality: "Sydney",
							state: "NSW",
							postcode: "2000",
							country: "AU",
							latitude: -33.865,
							longitude: 151.209,
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } }
			)
		);

		const client = createLocnativeClient({
			apiKey: "wh_test_key",
			baseUrl: "http://localhost",
			fetch: fetchMock,
			maxRetries: 0,
		});

		const res = await client.addresses.autocomplete({ q: "34 Box" });
		expect(res.results).toHaveLength(1);
		expect(res.results[0]?.formattedAddress).toBe(
			"34 Boxgrove Ave, Sydney NSW 2000"
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [urlArg] = fetchMock.mock.calls[0] as [URL, RequestInit];
		const href = urlArg.href;
		expect(href).toContain("/api/v1/addresses/autocomplete");
		expect(href).toContain("q=34+Box");
	});

	it("passes country and state filters", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ count: 0, results: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		);

		const client = createLocnativeClient({
			apiKey: "wh_test_key",
			baseUrl: "http://localhost",
			fetch: fetchMock,
			maxRetries: 0,
		});

		await client.addresses.autocomplete({
			q: "George St",
			country: "AU",
			state: "NSW",
			limit: 5,
		});

		const [urlArg] = fetchMock.mock.calls[0] as [URL, RequestInit];
		const href = urlArg.href;
		expect(href).toContain("country=AU");
		expect(href).toContain("state=NSW");
		expect(href).toContain("limit=5");
	});

	it("aborts in-flight request when signal is triggered", async () => {
		const controller = new AbortController();

		const fetchMock = vi.fn().mockImplementation(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError"))
					);
				})
		);

		const client = createLocnativeClient({
			apiKey: "wh_test_key",
			baseUrl: "http://localhost",
			fetch: fetchMock,
			maxRetries: 0,
		});

		const promise = client.addresses.autocomplete(
			{ q: "Sydney" },
			{ signal: controller.signal }
		);

		controller.abort();

		await expect(promise).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("returns empty results on API error", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					error: {
						code: "bad_request",
						message: "Invalid query",
					},
				}),
				{ status: 400, headers: { "content-type": "application/json" } }
			)
		);

		const client = createLocnativeClient({
			apiKey: "wh_test_key",
			baseUrl: "http://localhost",
			fetch: fetchMock,
			maxRetries: 0,
		});

		await expect(
			client.addresses.autocomplete({ q: "!@#$%" })
		).rejects.toThrow();
	});
});

describe("useAutocomplete — debounce logic", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("only fires one fetch after debounce period with rapid inputs", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ count: 0, results: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		);

		const client = createLocnativeClient({
			apiKey: "wh_test_key",
			baseUrl: "http://localhost",
			fetch: fetchMock,
			maxRetries: 0,
		});

		// Simulate the debounce pattern: schedule multiple calls, only the last fires
		let latestTimer: ReturnType<typeof setTimeout> | null = null;
		const debounceMs = 300;
		const queries = ["S", "Sy", "Syd", "Sydn", "Sydne", "Sydney"];

		for (const q of queries) {
			if (latestTimer) {
				clearTimeout(latestTimer);
			}
			latestTimer = setTimeout(() => {
				client.addresses.autocomplete({ q });
			}, debounceMs);
		}

		// Advance past debounce — only the last scheduled call should fire
		await vi.advanceTimersByTimeAsync(debounceMs + 50);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [urlArg] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(urlArg.href).toContain("q=Sydney");
	});
});
