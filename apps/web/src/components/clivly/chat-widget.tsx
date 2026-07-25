"use client";

import {
	ChatWidget,
	createClivlyTransport,
	createSessionFetcher,
} from "@clivly/chat-widget";

const getSession = createSessionFetcher({
	sessionUrl: "/api/clivly/chat/session",
});

const createTransport = createClivlyTransport();

export function ClivlyChatWidget() {
	const widgetId = import.meta.env.VITE_CLIVLY_WIDGET_ID?.trim();

	if (!widgetId) {
		return null;
	}

	return (
		<div className="pointer-events-none fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
			<div className="pointer-events-auto">
				<ChatWidget
					createTransport={createTransport}
					getSession={getSession}
					launcherLabel="Chat with us"
					widgetId={widgetId}
				/>
			</div>
		</div>
	);
}
