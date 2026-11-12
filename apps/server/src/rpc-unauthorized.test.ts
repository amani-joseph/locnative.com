import type { Context } from "@locnative/api/context";
import { protectedProcedure } from "@locnative/api/procedures";
import { RPCHandler } from "@orpc/server/fetch";
import { describe, expect, it } from "vitest";

/**
 * `protectedProcedure` throws ORPCError from @locnative/api's copy of
 * @orpc/server, but this Worker's RPCHandler comes from its own copy. The
 * handler recognises the error by class, so if the two copies ever differ in
 * version, UNAUTHORIZED is reported as a 500. One catalog version prevents it.
 */
describe("RPC auth errors", () => {
	it("returns 401 (not 500) for a signed-out call to a protected procedure", async () => {
		const handler = new RPCHandler({
			ping: protectedProcedure.handler(() => "pong"),
		});

		const { response } = await handler.handle(
			new Request("https://api.test/rpc/ping", {
				body: JSON.stringify({ json: {} }),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
			{ context: { session: null } as unknown as Context, prefix: "/rpc" }
		);

		expect(response?.status).toBe(401);
		const body = (await response?.json()) as { json: { code: string } };
		expect(body.json.code).toBe("UNAUTHORIZED");
	});
});
