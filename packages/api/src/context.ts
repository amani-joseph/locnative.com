import { auth } from "@locnative/auth";
import type {
	accounts,
	sessions,
	users,
	verifications,
} from "@locnative/database";
import type { InferSelectModel } from "drizzle-orm";
import type { HonoRequest } from "hono";
import { db } from "./db.ts";

/**
 * A fetch-like function that routes requests through the Hono app
 * in-process, avoiding Cloudflare's self-subrequest restriction (error 1042).
 */
export type LocalFetch = (
	url: string | URL,
	init?: RequestInit
) => Promise<Response>;

/**
 * Cloudflare Worker environment bindings passed through to oRPC context.
 * Typed loosely here to avoid a hard dependency on @cloudflare/workers-types
 * in this package.
 */
export interface CloudflareEnv {
	// biome-ignore lint/suspicious/noExplicitAny: CF binding types not in this package
	BATCH_GEOCODE_QUEUE?: any;
	// biome-ignore lint/suspicious/noExplicitAny: CF binding types not in this package
	GEOCODE_RESULTS?: any;
	/**
	 * Durable Object namespace for the per-account real-time usage meter. Absent
	 * in local dev / tests, where the code falls back to the synchronous Postgres
	 * counter path. Typed loosely to avoid a @cloudflare/workers-types dependency.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: CF binding types not in this package
	USAGE_METER?: any;
	// biome-ignore lint/suspicious/noExplicitAny: CF binding types not in this package
	WEBHOOK_DELIVERY_QUEUE?: any;
}

/**
 * Registers background work that must outlive the response. On Cloudflare
 * Workers this maps to `ExecutionContext.waitUntil`; without it, any I/O still
 * in flight when the `fetch` handler returns is cancelled. Optional so non-Worker
 * runtimes (local Node, tests) can omit it — there the process stays alive and
 * the promise settles on its own.
 */
export type WaitUntil = (promise: Promise<unknown>) => void;

export interface CreateContextOptions {
	env?: CloudflareEnv;
	localFetch?: LocalFetch;
	req: HonoRequest;
	waitUntil?: WaitUntil;
}

export const createContext = async ({
	env,
	localFetch,
	req,
	waitUntil,
}: CreateContextOptions) => {
	const session = await auth.api.getSession({
		headers: req.raw.headers,
	});

	return {
		db,
		env,
		localFetch,
		req,
		session,
		waitUntil,
	};
};

export type Context = Awaited<ReturnType<typeof createContext>>;
export type AuthAccount = InferSelectModel<typeof accounts>;
export type AuthSession = InferSelectModel<typeof sessions>;
export type AuthUser = InferSelectModel<typeof users>;
export type AuthVerification = InferSelectModel<typeof verifications>;
