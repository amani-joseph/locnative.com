import { createFileRoute } from "@tanstack/react-router";
import clivly from "../../../../clivly.config";

const handler = clivly.createClivlyHandler();

export const Route = createFileRoute("/api/clivly/tick")({
	server: {
		handlers: {
			POST: ({ request }) => handler(request),
		},
	},
});
