import { createLocnativeClient } from "@locnative/sdk";
import { describe, expect, it, vi } from "vitest";
import { runResource } from "./async-resource.ts";

function clientWith(fetchMock: typeof fetch) {
	return createLocnativeClient({
		apiKey: "wh_test_key",
		baseUrl: "http://localhost",
		fetch: fetchMock,
		maxRetries: 0,
	});
}

function jsonResponse(body: unknown) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function actions() {
	return { onSuccess: vi.fn(), onError: vi.fn(), onSettled: vi.fn() };
}

// These exercise the exact data path the routing hooks use: the SDK call wired
// through `runResource` with an AbortController (no DOM render needed).

describe("useDirections data path", () => {
	it("resolves directions and encodes from/to/profile in the request", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				distance_m: 4200,
				duration_s: 360,
				geometry: { type: "LineString", coordinates: [] },
				query: {
					from: { lat: 1, lng: 2 },
					to: { lat: 3, lng: 4 },
					profile: "driving",
				},
			})
		);
		const client = clientWith(fetchMock);
		const controller = new AbortController();
		const a = actions();

		await runResource(
			client.routing.directions(
				{ from: "1,2", to: "3,4", profile: "driving" },
				{ signal: controller.signal }
			),
			controller.signal,
			a
		);

		expect(a.onSuccess).toHaveBeenCalledTimes(1);
		expect(a.onSuccess.mock.calls[0]?.[0]).toMatchObject({ distance_m: 4200 });
		expect(a.onSettled).toHaveBeenCalledTimes(1);
		const [urlArg] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(urlArg.href).toContain("/api/v1/routing/directions");
		expect(urlArg.href).toContain("from=1%2C2");
		expect(urlArg.href).toContain("profile=driving");
	});
});

describe("useMatrix data path", () => {
	it("resolves a matrix and encodes sources/destinations", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				sources: [{ lat: 1, lng: 2 }],
				destinations: [{ lat: 3, lng: 4 }],
				durations: [[360]],
				distances: [[4200]],
				query: { profile: "driving" },
			})
		);
		const client = clientWith(fetchMock);
		const controller = new AbortController();
		const a = actions();

		await runResource(
			client.routing.matrix(
				{ sources: "1,2", destinations: "3,4" },
				{ signal: controller.signal }
			),
			controller.signal,
			a
		);

		expect(a.onSuccess.mock.calls[0]?.[0]).toMatchObject({
			durations: [[360]],
		});
		const [urlArg] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(urlArg.href).toContain("/api/v1/routing/matrix");
		expect(urlArg.href).toContain("sources=1%2C2");
		expect(urlArg.href).toContain("destinations=3%2C4");
	});
});

describe("useIsochrone data path", () => {
	it("resolves an isochrone and encodes origin/durationSeconds", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				polygon: { type: "Polygon", coordinates: [] },
				query: { origin: { lat: 1, lng: 2 }, profile: "walking" },
			})
		);
		const client = clientWith(fetchMock);
		const controller = new AbortController();
		const a = actions();

		await runResource(
			client.routing.isochrone(
				{ origin: "1,2", durationSeconds: 600, profile: "walking" },
				{ signal: controller.signal }
			),
			controller.signal,
			a
		);

		expect(a.onSuccess).toHaveBeenCalledTimes(1);
		const [urlArg] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(urlArg.href).toContain("/api/v1/routing/isochrone");
		expect(urlArg.href).toContain("durationSeconds=600");
	});
});

describe("routing data path — abort", () => {
	it("suppresses callbacks when the request is aborted", async () => {
		const fetchMock = vi.fn().mockImplementation(
			(_url: URL, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError"))
					);
				})
		);
		const client = clientWith(fetchMock);
		const controller = new AbortController();
		const a = actions();

		const pending = runResource(
			client.routing.directions(
				{ from: "1,2", to: "3,4" },
				{ signal: controller.signal }
			),
			controller.signal,
			a
		);
		controller.abort();
		await pending;

		expect(a.onSuccess).not.toHaveBeenCalled();
		expect(a.onError).not.toHaveBeenCalled();
		expect(a.onSettled).not.toHaveBeenCalled();
	});
});
