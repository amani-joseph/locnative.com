import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { applyServerTiming } from "../../lib/api-response";
import { getDb } from "../../lib/db";
import { PLATFORM_SLOS } from "../../lib/platform-slos";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				const startedAt = performance.now();

				try {
					await getDb().execute(sql`select 1`);

					return applyServerTiming(
						Response.json(
							{
								ok: true,
								service: "locnative-public-api",
								timestamp: new Date().toISOString(),
								slos: {
									healthcheckMaxLatencyMs:
										PLATFORM_SLOS.healthcheckMaxLatencyMs,
									publicApiP95LatencyMs: PLATFORM_SLOS.publicApiP95LatencyMs,
									uptimeTargetPct: PLATFORM_SLOS.uptimeTargetPct,
								},
							},
							{
								headers: {
									"cache-control": "no-store",
								},
							}
						),
						performance.now() - startedAt,
						"health"
					);
				} catch (error) {
					return applyServerTiming(
						Response.json(
							{
								ok: false,
								service: "locnative-public-api",
								timestamp: new Date().toISOString(),
								error:
									error instanceof Error
										? error.message
										: "Health check failed.",
							},
							{
								status: 503,
								headers: {
									"cache-control": "no-store",
								},
							}
						),
						performance.now() - startedAt,
						"health"
					);
				}
			},
		},
	},
});
