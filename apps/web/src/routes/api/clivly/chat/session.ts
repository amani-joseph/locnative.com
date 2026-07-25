import { createFileRoute } from "@tanstack/react-router";

const defaultAllowedOrigins = [
	process.env.WEB_BASE_URL,
	"http://localhost:3001",
	"https://locnative.com",
	"https://www.locnative.com",
]
	.map((origin) => origin?.trim())
	.filter((origin): origin is string => Boolean(origin));

const allowedOrigins = new Set(defaultAllowedOrigins);
const apiUrl = process.env.CLIVLY_API_URL?.trim() || "https://api.clivly.com";
const chatSessionEndpoint = new URL(
	"/clivly/widget/session",
	apiUrl
).toString();

type ChatSessionPayload = {
	widgetId: string;
	visitor: {
		email: string;
		name: string;
	};
	visitorToken?: string;
};

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
		},
	});

const isChatSessionPayload = (value: unknown): value is ChatSessionPayload => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const payload = value as Partial<ChatSessionPayload>;
	const visitor = payload.visitor;

	return (
		typeof payload.widgetId === "string" &&
		payload.widgetId.trim().length > 0 &&
		typeof visitor === "object" &&
		visitor !== null &&
		typeof visitor.name === "string" &&
		visitor.name.trim().length > 0 &&
		typeof visitor.email === "string" &&
		visitor.email.trim().length > 0 &&
		(payload.visitorToken === undefined ||
			typeof payload.visitorToken === "string")
	);
};

const handleChatSession = async (request: Request) => {
	if (request.method !== "POST") {
		return json({ error: "method_not_allowed" }, 405);
	}

	const apiKey = process.env.CLIVLY_API_KEY?.trim();
	if (!apiKey) {
		return json({ error: "clivly_not_configured" }, 503);
	}

	const origin = request.headers.get("origin")?.trim();
	if (origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
		return json({ error: "origin_not_allowed" }, 403);
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return json({ error: "invalid_json" }, 400);
	}

	if (!isChatSessionPayload(payload)) {
		return json({ error: "invalid_payload" }, 400);
	}

	// The Clivly backend requires `origin` in the request *body* (not just the
	// header) — see the widget-session validation. Fall back to the request's
	// own origin when the browser didn't send an Origin header.
	const resolvedOrigin = origin ?? new URL(request.url).origin;

	try {
		const upstreamResponse = await fetch(chatSessionEndpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
				origin: resolvedOrigin,
			},
			body: JSON.stringify({ ...payload, origin: resolvedOrigin }),
		});

		const responseBody = await upstreamResponse.text();

		return new Response(responseBody, {
			status: upstreamResponse.status,
			headers: {
				"content-type":
					upstreamResponse.headers.get("content-type") ??
					"application/json; charset=utf-8",
			},
		});
	} catch {
		return json(
			{
				error: "clivly_upstream_unreachable",
			},
			502
		);
	}
};

export const Route = createFileRoute("/api/clivly/chat/session")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) => handleChatSession(request),
		},
	},
});
