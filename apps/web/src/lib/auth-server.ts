import { getRequestHeaders } from "@tanstack/react-start/server";

const getServerUrl = (): string | null =>
	// In local dev, the web Worker can see Wrangler vars from `wrangler.toml`,
	// which point at production. Prefer the server-side auth URL first so SSR
	// and proxy routes stay on the local backend when `pnpm dev` runs both apps.
	process.env.BETTER_AUTH_URL?.trim() ||
	process.env.VITE_SERVER_URL?.trim() ||
	import.meta.env.VITE_SERVER_URL?.trim() ||
	null;

/**
 * Resolve the fetch implementation used to reach the API server.
 *
 * In production the web Worker and the API Worker share the same Cloudflare
 * zone, and a public worker→worker subrequest over the edge is blocked with a
 * 403 (the request never reaches the API). That silently breaks SSR
 * `getSession` and the `/api/v1/*` + `/api/auth/*` proxy routes. A same-zone
 * Service Binding bypasses the edge, so prefer it when present.
 *
 * The binding only exists in the deployed Worker (workerd). Local dev runs the
 * two Workers in separate Miniflare instances with no usable binding, so guard
 * on `import.meta.env.PROD` and fall back to public `fetch` (which targets the
 * backend via BETTER_AUTH_URL / VITE_SERVER_URL) in dev.
 */
const getServerFetch = async (): Promise<typeof fetch> => {
	if (import.meta.env.PROD) {
		try {
			const { env } = await import("cloudflare:workers");
			const binding = (
				env as Record<string, { fetch?: typeof fetch } | undefined>
			).SERVER;
			// Bind to the binding: its `fetch` is a method and would throw
			// "Illegal invocation" if called detached.
			if (binding?.fetch) {
				return binding.fetch.bind(binding);
			}
		} catch {
			// `cloudflare:workers` is unavailable outside the Workers runtime.
			// Fall through to the public fetch below.
		}
	}
	return fetch;
};

export const getServerTargetUrl = (
	path: string,
	requestUrl?: string
): URL | null => {
	const serverUrl = getServerUrl();
	if (!serverUrl) {
		return null;
	}

	if (requestUrl) {
		const sourceUrl = new URL(requestUrl);
		return new URL(`${path}${sourceUrl.search}`, serverUrl);
	}

	return new URL(path, serverUrl);
};

export const proxyRequestToServer = async (
	request: Request
): Promise<Response> => {
	const targetUrl = getServerTargetUrl(
		new URL(request.url).pathname,
		request.url
	);
	if (!targetUrl) {
		return Response.json(
			{ error: "Backend server URL is not configured." },
			{ status: 503 }
		);
	}

	const headers = new Headers(request.headers);
	headers.delete("host");
	const body =
		request.method === "GET" || request.method === "HEAD"
			? undefined
			: await request.arrayBuffer();

	const serverFetch = await getServerFetch();
	return serverFetch(targetUrl, {
		method: request.method,
		headers,
		body,
		redirect: "manual",
		signal: AbortSignal.timeout(30_000),
	});
};

export const handler = proxyRequestToServer;

export interface BetterAuthSession {
	session: {
		id: string;
		userId: string;
	};
	user: {
		email?: string | null;
		id: string;
		image?: string | null;
		name?: string | null;
	};
}

export const getSession = async (
	request?: Request
): Promise<BetterAuthSession | null> => {
	const targetUrl = getServerTargetUrl("/api/auth/get-session");
	if (!targetUrl) {
		return null;
	}

	const headers = new Headers(request?.headers ?? getRequestHeaders());
	headers.delete("content-length");
	headers.delete("transfer-encoding");
	headers.set("accept-encoding", "identity");

	const serverFetch = await getServerFetch();
	const response = await serverFetch(targetUrl, {
		cache: "no-store",
		headers,
	});

	if (!response.ok) {
		return null;
	}

	const session = (await response.json()) as BetterAuthSession | null;
	return session;
};
