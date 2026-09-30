import { createFileRoute } from "@tanstack/react-router";
import clivly from "../../../../clivly.config";

const handler = clivly.createClivlyHandler();

// Each Clivly Cloud tick wakes Neon (heartbeat + users/teams sync). Setting
// CLIVLY_SYNC_PAUSED=true on the Worker answers ticks without touching the
// database, e.g. pre-launch when there is nothing new to sync.
const isSyncPaused = (): boolean => process.env.CLIVLY_SYNC_PAUSED === "true";

export const Route = createFileRoute("/api/clivly/tick")({
	server: {
		handlers: {
			POST: ({ request }) =>
				isSyncPaused() ? new Response(null, { status: 204 }) : handler(request),
		},
	},
});
