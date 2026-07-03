import { createLocnativeClient } from "@locnative/sdk";
import { describe, expect, it, vi } from "vitest";

describe("useReverseGeocode — client integration", () => {
	it("reverse geocodes correctly given lat/lng", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					address: {
						id: 1,
						formattedAddress: "34 Boxgrove Ave, Sydney NSW 2000",
						streetAddress: "34 Boxgrove Ave",
						locality: "Sydney",
						state: "NSW",
						postcode: "2000",
						country: "AU",
						latitude: -33.865,
						longitude: 151.209,
						confidence: 0.95,
					},
					distance: 12.3,
					query: { lat: -33.865, lng: 151.209 },
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

		const res = await client.addresses.reverse({
			lat: -33.865,
			lng: 151.209,
		});

		expect(res.address.formattedAddress).toContain("Boxgrove");
		expect(res.distance).toBe(12.3);
		expect(fetchMock).toHaveBeenCalledTimes(1);
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

		const promise = client.addresses.reverse(
			{ lat: -33.865, lng: 151.209 },
			{ signal: controller.signal }
		);

		controller.abort();

		await expect(promise).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("returns empty state on API error", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					error: {
						code: "not_found",
						message: "No address found at coordinates",
					},
				}),
				{ status: 404, headers: { "content-type": "application/json" } }
			)
		);

		const client = createLocnativeClient({
			apiKey: "wh_test_key",
			baseUrl: "http://localhost",
			fetch: fetchMock,
			maxRetries: 0,
		});

		await expect(
			client.addresses.reverse({ lat: 0, lng: 0 })
		).rejects.toThrow();
	});
});
