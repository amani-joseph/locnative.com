// @vitest-environment jsdom
import type { WidgetSessionPayload } from "@clivly/chat-widget";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClivlyChatWidget } from "./chat-widget";

const { useSession, getSession } = vi.hoisted(() => ({
	useSession: vi.fn(),
	getSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ useSession }));
vi.mock("@clivly/chat-widget", async (importOriginal) => {
	const widget = await importOriginal<typeof import("@clivly/chat-widget")>();
	return {
		...widget,
		createSessionFetcher: () => getSession,
		createClivlyTransport: widget.createLoopbackTransport,
	};
});

beforeEach(() => {
	vi.stubEnv("VITE_CLIVLY_WIDGET_ID", "support");
	localStorage.clear();
	useSession.mockReturnValue({ data: null, isPending: false });
	getSession.mockResolvedValue({
		token: "test-token",
		visitorToken: "test-visitor",
		expiresAt: "2099-01-01T00:00:00.000Z",
		widget: { widgetId: "support", name: "Support", config: {} },
		conversation: { id: "test-conversation", status: "open" },
		contact: { id: "test-contact", name: "Alex", email: "alex@example.com" },
		messages: [],
	} satisfies WidgetSessionPayload);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllEnvs();
});

it("starts a signed-in user's chat with their session identity", async () => {
	useSession.mockReturnValue({
		data: { user: { id: "alex", name: "Alex", email: "alex@example.com" } },
		isPending: false,
	});
	render(<ClivlyChatWidget />);
	fireEvent.click(screen.getByRole("button", { name: "Chat with us" }));
	await waitFor(() =>
		expect(getSession).toHaveBeenCalledWith({
			visitor: { name: "Alex", email: "alex@example.com" },
			visitorToken: null,
			widgetId: "support",
		})
	);
	expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
	expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
	await waitFor(() =>
		expect(screen.getByText("Conversation ready")).toBeTruthy()
	);
});

it("keeps the pre-chat form for visitors who are signed out", () => {
	render(<ClivlyChatWidget />);
	fireEvent.click(screen.getByRole("button", { name: "Chat with us" }));
	expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
	expect(screen.getByRole("textbox", { name: "Email" })).toBeTruthy();
	expect(getSession).not.toHaveBeenCalled();
});

it("waits for authentication to resolve before showing chat", () => {
	useSession.mockReturnValue({ data: null, isPending: true });
	render(<ClivlyChatWidget />);
	expect(screen.queryByRole("button", { name: "Chat with us" })).toBeNull();
});

it("clears the signed-in conversation when the user signs out", async () => {
	useSession.mockReturnValue({
		data: { user: { id: "alex", name: "Alex", email: "alex@example.com" } },
		isPending: false,
	});
	const view = render(<ClivlyChatWidget />);
	fireEvent.click(screen.getByRole("button", { name: "Chat with us" }));
	await waitFor(() =>
		expect(screen.getByText("Conversation ready")).toBeTruthy()
	);
	useSession.mockReturnValue({ data: null, isPending: false });
	view.rerender(<ClivlyChatWidget />);
	fireEvent.click(screen.getByRole("button", { name: "Chat with us" }));
	expect(
		screen.getByRole("textbox", { name: "Name" }).getAttribute("value")
	).toBe("");
	expect(
		screen.getByRole("textbox", { name: "Email" }).getAttribute("value")
	).toBe("");
	expect(screen.queryByText("Conversation ready")).toBeNull();
});
