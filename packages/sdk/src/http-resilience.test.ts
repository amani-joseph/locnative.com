import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocnativeApiError } from "./errors.ts";
import { createRequester } from "./http.ts";

const okResponse = (body: unknown = { ok: true }): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});

const errorResponse = (
	status: number,
	code: string,
	headers: Record<string, string> = {}
): Response =>
	new Response(
		JSON.stringify({ error: { code, message: `status ${status}` } }),
		{
			status,
			headers: { "content-type": "application/json", ...headers },
		}
	);

describe("resilience — retries", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("retries a network failure then resolves within the retry budget", async () => {
		let calls = 0;
		const fetchImpl = (() => {
			calls++;
			if (calls < 2) {
				return Promise.reject(new TypeError("network down"));
			}
			return Promise.resolve(okResponse({ id: 1 }));
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });

		const promise = request<{ id: number }>({ method: "GET", path: "/x" });
		await vi.runAllTimersAsync();

		await expect(promise).resolves.toEqual({ id: 1 });
		expect(calls).toBe(2);
	});

	it("throws after exhausting retries on persistent network failure", async () => {
		let calls = 0;
		const fetchImpl = (() => {
			calls++;
			return Promise.reject(new TypeError("network down"));
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });

		const promise = request({ method: "GET", path: "/x" });
		const assertion = expect(promise).rejects.toThrow("network down");
		await vi.runAllTimersAsync();
		await assertion;
		// default maxRetries = 2 → 3 attempts total
		expect(calls).toBe(3);
	});

	it("retries retryable 5xx then succeeds", async () => {
		let calls = 0;
		const fetchImpl = (() => {
			calls++;
			return Promise.resolve(
				calls < 2 ? errorResponse(503, "internal_error") : okResponse()
			);
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });

		const promise = request({ method: "GET", path: "/x" });
		await vi.runAllTimersAsync();
		await expect(promise).resolves.toEqual({ ok: true });
		expect(calls).toBe(2);
	});

	it("does NOT retry a non-retryable 400/404", async () => {
		let calls = 0;
		const fetchImpl = (() => {
			calls++;
			return Promise.resolve(errorResponse(400, "bad_request"));
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });

		await expect(request({ method: "GET", path: "/x" })).rejects.toMatchObject({
			status: 400,
			code: "bad_request",
		});
		expect(calls).toBe(1);
	});

	it("honours Retry-After on a 429 before retrying", async () => {
		let calls = 0;
		const fetchImpl = (() => {
			calls++;
			return Promise.resolve(
				calls < 2
					? errorResponse(429, "rate_limited", { "retry-after": "2" })
					: okResponse()
			);
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });

		const promise = request({ method: "GET", path: "/x" });
		// After 1s the 2s Retry-After has not elapsed → no retry yet.
		await vi.advanceTimersByTimeAsync(1000);
		expect(calls).toBe(1);
		// Past 2s → retry fires.
		await vi.advanceTimersByTimeAsync(1500);
		await expect(promise).resolves.toEqual({ ok: true });
		expect(calls).toBe(2);
	});
});

describe("resilience — timeout & abort", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("aborts a hung request after timeoutMs and surfaces a timeout error", async () => {
		const fetchImpl = ((_url: unknown, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError"))
				);
			})) as typeof fetch;
		const request = createRequester({
			apiKey: "wh",
			fetch: fetchImpl,
			maxRetries: 0,
			timeoutMs: 100,
		});

		const promise = request({ method: "GET", path: "/x" });
		const assertion = expect(promise).rejects.toMatchObject({
			name: "LocnativeApiError",
			code: "timeout",
		});
		await vi.advanceTimersByTimeAsync(150);
		await assertion;
	});

	it("propagates a caller abort without retrying", async () => {
		let calls = 0;
		const controller = new AbortController();
		const fetchImpl = ((_url: unknown, init?: RequestInit) => {
			calls++;
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError"))
				);
			});
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });

		const promise = request({
			method: "GET",
			path: "/x",
			signal: controller.signal,
		});
		const assertion = expect(promise).rejects.toThrow("Aborted");
		controller.abort();
		await vi.runAllTimersAsync();
		await assertion;
		expect(calls).toBe(1);
	});
});

describe("idempotency & request id", () => {
	it("auto-sends a stable Idempotency-Key on writes across retries", async () => {
		vi.useFakeTimers();
		const keys: (string | null)[] = [];
		let calls = 0;
		const fetchImpl = ((_url: unknown, init?: RequestInit) => {
			calls++;
			keys.push(new Headers(init?.headers).get("idempotency-key"));
			return Promise.resolve(
				calls < 2 ? errorResponse(503, "internal_error") : okResponse({ id: 9 })
			);
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });

		const promise = request({
			method: "POST",
			path: "/api/v1/zones",
			body: { name: "depot" },
		});
		await vi.runAllTimersAsync();
		await promise;
		vi.useRealTimers();

		expect(calls).toBe(2);
		expect(keys[0]).toBeTruthy();
		// Same key reused on retry so the server can dedupe safely.
		expect(keys[0]).toBe(keys[1]);
	});

	it("does not add an Idempotency-Key to GET reads", async () => {
		let captured: string | null = "unset";
		const fetchImpl = ((_url: unknown, init?: RequestInit) => {
			captured = new Headers(init?.headers).get("idempotency-key");
			return Promise.resolve(okResponse());
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });
		await request({ method: "GET", path: "/x" });
		expect(captured).toBeNull();
	});

	it("respects a caller-supplied idempotencyKey", async () => {
		let captured: string | null = null;
		const fetchImpl = ((_url: unknown, init?: RequestInit) => {
			captured = new Headers(init?.headers).get("idempotency-key");
			return Promise.resolve(okResponse());
		}) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });
		await request({
			method: "POST",
			path: "/api/v1/zones",
			body: {},
			idempotencyKey: "caller-key-123",
		});
		expect(captured).toBe("caller-key-123");
	});

	it("surfaces requestId, docUrl, and fields from an error response", async () => {
		const fetchImpl = (() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						error: {
							code: "unprocessable",
							message: "Invalid",
							request_id: "req_abc",
							doc_url: "https://docs.locnative.com/errors/unprocessable",
							fields: [{ path: "lat", message: "required" }],
						},
					}),
					{ status: 422, headers: { "content-type": "application/json" } }
				)
			)) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });
		const error = await request({ method: "POST", path: "/x", body: {} }).catch(
			(e: unknown) => e
		);
		expect(error).toBeInstanceOf(LocnativeApiError);
		const apiError = error as LocnativeApiError;
		expect(apiError.requestId).toBe("req_abc");
		expect(apiError.docUrl).toContain("/errors/unprocessable");
		expect(apiError.fields).toEqual([{ path: "lat", message: "required" }]);
	});

	it("reads requestId from the X-Request-Id header when absent from body", async () => {
		const fetchImpl = (() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ error: { code: "not_found", message: "x" } }),
					{
						status: 404,
						headers: {
							"content-type": "application/json",
							"x-request-id": "req_header_1",
						},
					}
				)
			)) as typeof fetch;
		const request = createRequester({ apiKey: "wh", fetch: fetchImpl });
		const error = (await request({ method: "GET", path: "/x" }).catch(
			(e: unknown) => e
		)) as LocnativeApiError;
		expect(error.requestId).toBe("req_header_1");
	});
});

describe("per-call overrides", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("a per-call maxRetries overrides the client default", async () => {
		let calls = 0;
		const fetchImpl = (() => {
			calls++;
			return Promise.reject(new TypeError("down"));
		}) as typeof fetch;
		const request = createRequester({
			apiKey: "wh",
			fetch: fetchImpl,
			maxRetries: 5,
		});
		const promise = request({ method: "GET", path: "/x", maxRetries: 1 });
		const assertion = expect(promise).rejects.toThrow("down");
		await vi.runAllTimersAsync();
		await assertion;
		// maxRetries 1 → 2 attempts, not 6
		expect(calls).toBe(2);
	});
});
