import type { AppRouter } from "@locnative/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

const getServerBaseUrl = (): string => {
	// Local dev: point at the local server Worker.
	if (
		typeof window !== "undefined" &&
		window.location.hostname === "localhost"
	) {
		return "http://localhost:3003";
	}

	// Production: point directly at the server Worker so the browser sends
	// the cross-origin auth cookie (SameSite=None). Proxying through the web
	// Worker loses the cookie because it lives on the server Worker's domain.
	return (
		import.meta.env.VITE_SERVER_URL ??
		process.env.BETTER_AUTH_URL ??
		"http://localhost:3003"
	);
};

const getRpcUrl = (): string => {
	return new URL("/rpc", getServerBaseUrl()).toString();
};

const link = new RPCLink({
	url: getRpcUrl(),
	fetch(url, options) {
		return fetch(url, {
			...options,
			credentials: "include",
		});
	},
});

export const orpcClient = createORPCClient(link) as RouterClient<AppRouter>;

/** TanStack Query utils for type-safe query keys and cache management */
export const orpc = createTanstackQueryUtils(orpcClient);
