import { createChatSessionHandler } from "clivly/sdk";

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
});
