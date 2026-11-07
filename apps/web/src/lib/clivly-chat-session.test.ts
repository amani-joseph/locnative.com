import { beforeEach, expect, it, vi } from "vitest";
import { getSession } from "@/lib/auth-server";
import { resolveClivlyChatUser } from "./clivly-chat-session";

vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("verifies the incoming session instead of trusting browser-supplied identity", async () => {
	vi.mocked(getSession).mockResolvedValue({
		session: { id: "session", userId: "alex" },
		user: { id: "alex", name: "Alex", email: "alex@example.com" },
	});
	const request = new Request(
		"https://locnative.com/api/clivly/widget/session",
		{
			method: "POST",
			headers: { cookie: "better-auth.session_token=test-session" },
			body: JSON.stringify({
				visitor: { name: "Someone else", email: "other@example.com" },
			}),
		}
	);
	expect(await resolveClivlyChatUser(request)).toEqual({
		id: "alex",
		name: "Alex",
		email: "alex@example.com",
	});
	expect(getSession).toHaveBeenCalledWith(request);
});

it("leaves signed-out visitors unverified", async () => {
	vi.mocked(getSession).mockResolvedValue(null);
	expect(
		await resolveClivlyChatUser(new Request("https://locnative.com"))
	).toBeNull();
});

it("uses the session email when the account has no display name", async () => {
	vi.mocked(getSession).mockResolvedValue({
		session: { id: "session", userId: "alex" },
		user: { id: "alex", name: " ", email: "alex@example.com" },
	});
	expect(
		await resolveClivlyChatUser(new Request("https://locnative.com"))
	).toEqual({
		id: "alex",
		name: "alex@example.com",
		email: "alex@example.com",
	});
});
