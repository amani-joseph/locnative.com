import { createFileRoute } from "@tanstack/react-router";
import { clivlyChatSessionHandler } from "@/lib/clivly-chat-session";

export const Route = createFileRoute("/api/clivly/widget/session")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				clivlyChatSessionHandler(request),
		},
	},
});
