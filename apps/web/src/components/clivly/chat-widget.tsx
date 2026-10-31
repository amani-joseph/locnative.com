"use client";

import {
	ChatWidget,
	createClivlyTransport,
	createSessionFetcher,
} from "@clivly/chat-widget";
import type { CSSProperties } from "react";

const getSession = createSessionFetcher({
	sessionUrl: "/api/clivly/widget/session",
});

const createTransport = createClivlyTransport();

const chatWidgetStyle = { "--clivly-chat-z-index": 50 } as CSSProperties;

export function ClivlyChatWidget() {
	const widgetId = import.meta.env.VITE_CLIVLY_WIDGET_ID?.trim();

	if (!widgetId) {
		return import.meta.env.DEV ? (
			<div className="pointer-events-none fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
				<div className="pointer-events-auto rounded-full border border-amber-300 bg-amber-50 px-3 py-2 font-medium text-amber-900 text-xs shadow-lg">
					Set <code>VITE_CLIVLY_WIDGET_ID</code> to enable chat
				</div>
			</div>
		) : null;
	}

	// Since 0.16 the widget floats itself bottom-right (safe-area aware, full-
	// screen sheet on phones). Keep it at the z-50 layer it always sat on so the
	// app's own dialogs still stack above it.
	return (
		<ChatWidget
			createTransport={createTransport}
			getSession={getSession}
			launcherLabel="Chat with us"
			style={chatWidgetStyle}
			widgetId={widgetId}
		/>
	);
}
