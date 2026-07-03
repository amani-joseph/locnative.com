import { Toaster } from "@locnative/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense, useEffect } from "react";
import {
	LiveAnnouncerProvider,
	useAnnounce,
} from "@/components/a11y/live-announcer";
import { SkipLink } from "@/components/a11y/skip-link";
import { authClient } from "@/lib/auth-client";
import { type BetterAuthSession, getSession } from "@/lib/auth-server";

import { absoluteUrl, DEFAULT_OG_IMAGE, SITE_NAME } from "@/lib/seo";
import { jsonLdScript, organizationJsonLd } from "@/lib/structured-data";

import appCss from "../index.css?url";

// Client-only: the devtools browser build touches `window` at module scope,
// which crashes SSR in the workerd runtime.
const TanStackRouterDevtools =
	typeof window === "undefined"
		? () => null
		: lazy(() =>
				import("@tanstack/react-router-devtools").then((m) => ({
					default: m.TanStackRouterDevtools,
				}))
			);

const fetchSession = createServerFn({ method: "GET" }).handler(async () => {
	return await getSession();
});

export interface RouterAppContext {
	isAuthenticated?: boolean;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
			},
			{
				title: "Locnative — Locations API for developers",
			},
			{
				name: "description",
				content:
					"Production-ready location APIs — address autocomplete, geocoding, geofencing, routing, and device tracking. US & Australia coverage.",
			},
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:type", content: "website" },
			{
				property: "og:image",
				content: absoluteUrl(DEFAULT_OG_IMAGE),
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{
				name: "twitter:image",
				content: absoluteUrl(DEFAULT_OG_IMAGE),
			},
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/brand/favicon.svg",
			},
			{
				rel: "apple-touch-icon",
				href: "/brand/png/apple-touch-icon-180x180.png",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
		scripts: [jsonLdScript(organizationJsonLd())],
	}),

	component: RootDocument,
	beforeLoad: async () => {
		// Server-side (SSR): forward incoming request headers to the auth server.
		if (typeof window === "undefined") {
			let session: BetterAuthSession | null = null;
			try {
				session = await fetchSession();
			} catch {
				// fetchSession may throw when request context is unavailable.
			}
			return { isAuthenticated: Boolean(session?.session) };
		}

		// Client-side (SPA navigation): check the session directly with the
		// auth server. The browser includes the cross-origin auth cookie
		// (SameSite=None) which the server function route cannot forward.
		try {
			const { data } = await authClient.getSession();
			return { isAuthenticated: Boolean(data?.session) };
		} catch {
			return { isAuthenticated: false };
		}
	},
});

// Announces each client-side route change to screen readers. SPA navigations
// don't reload the document, so assistive tech otherwise gives no feedback that
// the page changed. Subscribing to `onResolved` skips the very first load
// (which the browser announces natively) and reads the per-route <title> that
// HeadContent has just written.
function RouteAnnouncer() {
	const router = useRouter();
	const announce = useAnnounce();

	useEffect(() => {
		const unsubscribe = router.subscribe("onResolved", () => {
			const read = () => {
				const title = typeof document === "undefined" ? "" : document.title;
				if (title) {
					announce(title);
				}
			};
			// Defer a frame so the route's <title> has flushed to the document.
			if (typeof requestAnimationFrame === "function") {
				requestAnimationFrame(read);
			} else {
				read();
			}
		});
		return unsubscribe;
	}, [router, announce]);

	return null;
}

function RootDocument() {
	return (
		// suppressHydrationWarning: next-themes sets the `class`/`color-scheme`
		// on <html> via an inline script before React hydrates, so the server
		// markup (no theme class) intentionally differs from the client.
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					disableTransitionOnChange={false}
					enableColorScheme
					enableSystem
					storageKey="locnative-theme"
				>
					<LiveAnnouncerProvider>
						<SkipLink />
						<div className="grid h-svh grid-rows-[auto_1fr]">
							<Outlet />
						</div>
						<RouteAnnouncer />
					</LiveAnnouncerProvider>
					<Toaster richColors />
				</ThemeProvider>
				<Suspense>
					<TanStackRouterDevtools position="bottom-left" />
				</Suspense>
				<Scripts />
			</body>
		</html>
	);
}
