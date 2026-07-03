import { apiUsageDaily, teamMembers, teams } from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { and, eq, gte, sql, sum } from "drizzle-orm";
import { z } from "zod";
import {
	type BillingOwner,
	getOrCreateBillingAccount,
} from "../../billing/account.ts";
import {
	createCheckoutUrl,
	createPortalUrl,
	ensureStripeCustomer,
} from "../../billing/customer.ts";
import { protectedProcedure } from "../../procedures.ts";

const PRODUCTION = "production";
const RETURN_BASE = serverEnv.WEB_BASE_URL;

const contextInput = z.object({ teamId: z.string().uuid().nullable() });

async function ownerForContext(
	db: Parameters<typeof getOrCreateBillingAccount>[0],
	userId: string,
	teamId: string | null
): Promise<BillingOwner> {
	if (!teamId) {
		return { ownerType: "user", teamId: null, userId };
	}
	const [member] = await db
		.select({ id: teamMembers.id })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
		.limit(1);
	if (!member) {
		throw new Error("Not a member of this team");
	}
	return { ownerType: "team", teamId, userId: null };
}

function monthStartStr(now: Date): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export const billingRouter = {
	listContexts: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const memberTeams = await context.db
			.select({ id: teams.id, name: teams.name })
			.from(teamMembers)
			.innerJoin(teams, eq(teams.id, teamMembers.teamId))
			.where(eq(teamMembers.userId, userId));
		return {
			personal: { label: "Personal", teamId: null as string | null },
			teams: memberTeams.map((t) => ({ label: t.name, teamId: t.id })),
		};
	}),

	getAccount: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			return {
				blocked: account.blocked,
				currentPeriodRequests: account.currentPeriodRequests,
				freeAllotment: account.freeAllotment,
				hasPaymentMethod: account.hasPaymentMethod,
				status: account.status,
			};
		}),

	getUsageSummary: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			const monthStart = monthStartStr(new Date());

			const [totalRow] = await context.db
				.select({ total: sum(apiUsageDaily.requestCount) })
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.billingAccountId, account.id),
						eq(apiUsageDaily.requestSource, PRODUCTION),
						gte(apiUsageDaily.usageDate, monthStart)
					)
				);

			const byEndpoint = await context.db
				.select({
					count: sum(apiUsageDaily.requestCount),
					endpoint: apiUsageDaily.endpoint,
				})
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.billingAccountId, account.id),
						eq(apiUsageDaily.requestSource, PRODUCTION),
						gte(apiUsageDaily.usageDate, monthStart)
					)
				)
				.groupBy(apiUsageDaily.endpoint)
				.orderBy(sql`sum(${apiUsageDaily.requestCount}) desc`);

			const total = Number(totalRow?.total ?? 0);
			const billable = Math.max(0, total - account.freeAllotment);
			return {
				billableRequests: billable,
				byEndpoint: byEndpoint.map((r) => ({
					count: Number(r.count ?? 0),
					endpoint: r.endpoint,
				})),
				estimatedCents: Math.round((billable / 1000) * 100),
				freeAllotment: account.freeAllotment,
				totalRequests: total,
			};
		}),

	createCheckoutSession: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			const customerId = await ensureStripeCustomer(context.db, account, {
				email: context.session.user.email,
				label: owner.teamId
					? `Team ${owner.teamId}`
					: context.session.user.email,
			});
			return { url: await createCheckoutUrl(customerId, RETURN_BASE) };
		}),

	createPortalSession: protectedProcedure
		.input(contextInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const owner = await ownerForContext(context.db, userId, input.teamId);
			const account = await getOrCreateBillingAccount(context.db, owner);
			const customerId = await ensureStripeCustomer(context.db, account, {
				email: context.session.user.email,
				label: owner.teamId
					? `Team ${owner.teamId}`
					: context.session.user.email,
			});
			return { url: await createPortalUrl(customerId, RETURN_BASE) };
		}),
};
