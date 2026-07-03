import { describe, expect, it } from "vitest";
import { LocnativeApiError } from "./errors.ts";
import { createRequester } from "./http.ts";
import type { RequestLogEvent } from "./shared-types.ts";

interface Captured {
	body: string | null;
	headers: Record<string, string>;
	method: string;
	url: string;
}

function mockFetch(
	status: number,
	jsonBody: unknown
): { fetch: typeof fetch; captured: Captured[] } {
	const captured: Captured[] = [];
	const fetchImpl = ((input: URL | Request | string, init?: RequestInit) => {
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((v, k) => {
			headers[k] = v;
		});
		captured.push({
			url: String(input),
			method: init?.method ?? "GET",
			headers,
			body: (init?.body as string | undefined) ?? null,
		});
		return Promise.resolve(
			new Response(JSON.stringify(jsonBody), {
				status,
				headers: { "content-type": "application/json" },
			})
		);
	}) as typeof fetch;
	return { fetch: fetchImpl, captured };
}

describe("createRequester", () => {
	it("builds a GET with query params and auth + sdk headers", async () => {
		const { fetch, captured } = mockFetch(200, { ok: true });
		const request = createRequester({ apiKey: "wh_test", fetch });
		await request({
			method: "GET",
			path: "/api/v1/addresses/autocomplete",
			query: { q: "123 Main", limit: 5, country: undefined },
		});
		expect(captured).toHaveLength(1);
		const c = captured[0];
		if (!c) {
			throw new Error("No captured request");
		}
		expect(c.method).toBe("GET");
		expect(c.url).toBe(
			"https://api.locnative.com/api/v1/addresses/autocomplete?q=123+Main&limit=5"
		);
		expect(c.headers.authorization).toBe("Bearer wh_test");
		expect(c.headers["x-locnative-sdk"]).toContain("js-ts/");
		expect(c.body).toBeNull();
	});

	it("keeps a zero-valued query param but drops undefined", async () => {
		const { fetch, captured } = mockFetch(200, { ok: true });
		const request = createRequester({ apiKey: "wh_test", fetch });
		await request({
			method: "GET",
			path: "/api/v1/addresses/nearby",
			query: { limit: 0, radius: undefined },
		});
		const c = captured[0];
		if (!c) {
			throw new Error("No captured request");
		}
		expect(c.url).toBe(
			"https://api.locnative.com/api/v1/addresses/nearby?limit=0"
		);
	});

	it("serializes a JSON body for POST with content-type", async () => {
		const { fetch, captured } = mockFetch(200, { id: 1 });
		const request = createRequester({ apiKey: "wh_test", fetch });
		await request({
			method: "POST",
			path: "/api/v1/zones",
			body: { name: "depot" },
		});
		const c = captured[0];
		if (!c) {
			throw new Error("No captured request");
		}
		expect(c.method).toBe("POST");
		expect(c.headers["content-type"]).toBe("application/json");
		expect(c.body).toBe('{"name":"depot"}');
	});

	it("invokes the default global fetch with a global `this` (no Illegal invocation)", async () => {
		// Browsers' native fetch throws `TypeError: Illegal invocation` when called
		// with a `this` other than window/globalThis. Internally the requester calls
		// the fetch impl as `ctx.fetchImpl(...)` (a method call), which would set
		// `this` to the context object. This simulates the browser's strict check on
		// the *default* fetch path (config.fetch omitted) to lock in the binding fix.
		const original = globalThis.fetch;
		let capturedThis: unknown = "unset";
		const strictFetch = function (this: unknown) {
			capturedThis = this;
			if (this !== globalThis && this !== undefined) {
				throw new TypeError(
					"Failed to execute 'fetch' on 'Window': Illegal invocation"
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			);
		} as unknown as typeof fetch;
		globalThis.fetch = strictFetch;
		try {
			const request = createRequester({ apiKey: "wh_test" });
			await expect(
				request({ method: "GET", path: "/api/v1/ping" })
			).resolves.toBeDefined();
			expect(capturedThis === globalThis || capturedThis === undefined).toBe(
				true
			);
		} finally {
			globalThis.fetch = original;
		}
	});

	it("resolves undefined for a 204 empty response", async () => {
		const fetchImpl = (async () =>
			new Response(null, { status: 204 })) as typeof fetch;
		const request = createRequester({ apiKey: "wh_test", fetch: fetchImpl });
		const result = await request({ method: "DELETE", path: "/api/v1/zones/1" });
		expect(result).toBeUndefined();
	});

	it("throws LocnativeApiError on a non-2xx body", async () => {
		const { fetch } = mockFetch(404, {
			error: { code: "not_found", message: "Zone not found." },
		});
		const request = createRequester({ apiKey: "wh_test", fetch });
		await expect(
			request({ method: "GET", path: "/api/v1/zones/999" })
		).rejects.toMatchObject({
			name: "LocnativeApiError",
			status: 404,
			code: "not_found",
		});
		await expect(
			request({ method: "GET", path: "/api/v1/zones/999" })
		).rejects.toBeInstanceOf(LocnativeApiError);
	});

	it("calls logger after each request with method, path, status, and durationMs", async () => {
		const events: RequestLogEvent[] = [];
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ count: 0, results: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})) as typeof fetch;
		const request = createRequester({
			apiKey: "wh_test",
			baseUrl: "http://localhost",
			logger: (e) => events.push(e),
			fetch: fetchImpl,
		});
		await request({
			method: "GET",
			path: "/api/v1/addresses/autocomplete",
			query: { q: "34 Box" },
		});
		expect(events).toHaveLength(1);
		expect(events[0]).toBeDefined();
		if (!events[0]) {
			throw new Error("No event");
		}
		expect(events[0].method).toBe("GET");
		expect(events[0].path).toBe("/api/v1/addresses/autocomplete");
		expect(events[0].status).toBe(200);
		expect(typeof events[0].durationMs).toBe("number");
		expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
	});

	it("calls logger even on error responses (4xx/5xx)", async () => {
		const events: RequestLogEvent[] = [];
		const fetchImpl = (async () =>
			new Response(
				JSON.stringify({ error: { code: "unauthorized", message: "bad key" } }),
				{ status: 401, headers: { "content-type": "application/json" } }
			)) as typeof fetch;
		const request = createRequester({
			apiKey: "wh_test_key",
			baseUrl: "http://localhost",
			maxRetries: 0,
			logger: (e) => events.push(e),
			fetch: fetchImpl,
		});
		try {
			await request({
				method: "GET",
				path: "/api/v1/addresses/autocomplete",
				query: { q: "34 Box" },
			});
		} catch {
			// expected
		}
		expect(events).toHaveLength(1);
		expect(events[0]).toBeDefined();
		if (!events[0]) {
			throw new Error("No event");
		}
		expect(events[0].status).toBe(401);
		expect(events[0].method).toBe("GET");
		expect(events[0].path).toBe("/api/v1/addresses/autocomplete");
	});
});
