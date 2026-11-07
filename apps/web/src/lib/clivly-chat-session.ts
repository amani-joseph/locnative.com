import type { ClivlyUser } from "clivly/sdk";
import { createChatSessionHandler } from "clivly/sdk";
import { getSession } from "@/lib/auth-server";

export const resolveClivlyChatUser = async (
	request: Request
): Promise<ClivlyUser | null> => {
	const session = await getSession(request);
	const email = session?.user.email?.trim();
	if (!(session && email)) {
		return null;
	}
	return {
		id: session.user.id,
		email,
		name: session.user.name?.trim() || email,
	};
};

const defaultAllowedOrigins = [
	process.env.WEB_BASE_URL,
	"http://localhost:3001",
	"https://locnative.com",
	"https://www.locnative.com",
]
	.map((origin) => origin?.trim())
	.filter((origin): origin is string => Boolean(origin));

export const clivlyChatSessionHandler = createChatSessionHandler({
	apiKey: process.env.CLIVLY_SECRET_KEY ?? process.env.CLIVLY_API_KEY ?? "",
	allowedOrigins: defaultAllowedOrigins,
	resolveUser: resolveClivlyChatUser,
});
