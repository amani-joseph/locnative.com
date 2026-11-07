declare module "cloudflare:workers" {
	export const env: {
		CLIVLY_CURSORS?: import("clivly/sdk").CursorKV;
		SERVER?: { fetch: typeof fetch };
	};
}
