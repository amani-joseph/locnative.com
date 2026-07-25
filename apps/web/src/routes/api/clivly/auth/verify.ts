import { auth } from "@locnative/auth";
import { createFileRoute } from "@tanstack/react-router";
import { createBetterAuthAdapter } from "clivly/auth/better-auth";
import clivly from "../../../../../clivly.config";

const adapter = createBetterAuthAdapter({ auth });
const resolveUser = (req: Request) => adapter.getUser(req);
const handler = clivly.createAuthVerifyHandler(resolveUser);

export const Route = createFileRoute("/api/clivly/auth/verify")({
	server: {
		handlers: {
			POST: ({ request }) => handler(request),
		},
	},
});
