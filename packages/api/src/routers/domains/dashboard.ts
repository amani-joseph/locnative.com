import { apiKeys, apiUsageDaily } from "@locnative/database";
import { and, eq, gte, isNull, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../procedures.ts";
import {
	buildDateAxis,
	buildTimeSeries,
	USAGE_RANGES,
	type UsageRow,
} from "./usage-series.ts";

const REQUEST_SOURCE_PRODUCTION = "production";
const REQUEST_SOURCE_EXPLORER_TEST = "explorer_test";

const usageTimeSeriesInput = z.object({
	range: z.enum(["7d", "30d", "90d"]).default("7d"),
});

export const dashboardRouter = {
	/**
	 * Per-endpoint daily request volume for the selected range, zero-filled and
	 * bucketed (five named address endpoints + "Other"), plus range-scoped
	 * summary metrics. Production traffic only. Drives the analytics chart.
	 */
	getUsageTimeSeries: protectedProcedure
		.input(usageTimeSeriesInput)
		.handler(async ({ context, input }) => {
			const authUserId = context.session.user.id;
			const now = new Date();
			const days = USAGE_RANGES[input.range];
			const lowerBound = buildDateAxis(days, now)[0] ?? "1970-01-01";

			const rows = await context.db
				.select({
					usageDate: apiUsageDaily.usageDate,
					endpoint: apiUsageDaily.endpoint,
					count: sum(apiUsageDaily.requestCount),
				})
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.userId, authUserId),
						eq(apiUsageDaily.requestSource, REQUEST_SOURCE_PRODUCTION),
						gte(apiUsageDaily.usageDate, lowerBound)
					)
				)
				.groupBy(apiUsageDaily.usageDate, apiUsageDaily.endpoint);

			const mapped: UsageRow[] = rows.map((r) => ({
				usageDate: r.usageDate,
				endpoint: r.endpoint,
				count: Number(r.count ?? 0),
			}));

			return buildTimeSeries(mapped, input.range, now);
		}),

	getStats: protectedProcedure.handler(async ({ context }) => {
		const authUserId = context.session.user.id;
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const thirtyDaysAgoStr =
			thirtyDaysAgo.toISOString().split("T")[0] ?? "1970-01-01";

		const [
			activeKeysResult,
			totalUsageResult,
			recentUsageResult,
			explorerTestUsageResult,
			endpointResult,
			recentKeysResult,
		] = await Promise.all([
			context.db
				.select({ count: sql<number>`count(*)::int` })
				.from(apiKeys)
				.where(and(eq(apiKeys.userId, authUserId), isNull(apiKeys.revokedAt))),
			context.db
				.select({ total: sum(apiUsageDaily.requestCount) })
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.userId, authUserId),
						eq(apiUsageDaily.requestSource, REQUEST_SOURCE_PRODUCTION)
					)
				),
			context.db
				.select({ total: sum(apiUsageDaily.requestCount) })
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.userId, authUserId),
						gte(apiUsageDaily.usageDate, thirtyDaysAgoStr),
						eq(apiUsageDaily.requestSource, REQUEST_SOURCE_PRODUCTION)
					)
				),
			context.db
				.select({ total: sum(apiUsageDaily.requestCount) })
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.userId, authUserId),
						gte(apiUsageDaily.usageDate, thirtyDaysAgoStr),
						eq(apiUsageDaily.requestSource, REQUEST_SOURCE_EXPLORER_TEST)
					)
				),
			context.db
				.select({
					endpoint: apiUsageDaily.endpoint,
					count: sum(apiUsageDaily.requestCount),
				})
				.from(apiUsageDaily)
				.where(
					and(
						eq(apiUsageDaily.userId, authUserId),
						gte(apiUsageDaily.usageDate, thirtyDaysAgoStr),
						eq(apiUsageDaily.requestSource, REQUEST_SOURCE_PRODUCTION)
					)
				)
				.groupBy(apiUsageDaily.endpoint)
				.orderBy(sql`sum(${apiUsageDaily.requestCount}) desc`),
			context.db
				.select({
					id: apiKeys.id,
					name: apiKeys.name,
					secretDisplaySuffix: apiKeys.secretDisplaySuffix,
					lastUsedAt: apiKeys.lastUsedAt,
				})
				.from(apiKeys)
				.where(and(eq(apiKeys.userId, authUserId), isNull(apiKeys.revokedAt)))
				.orderBy(apiKeys.createdAt)
				.limit(5),
		]);

		return {
			activeKeys: activeKeysResult[0]?.count ?? 0,
			explorerTestRequests: Number(explorerTestUsageResult[0]?.total ?? 0),
			totalRequests: Number(totalUsageResult[0]?.total ?? 0),
			recentRequests: Number(recentUsageResult[0]?.total ?? 0),
			endpointBreakdown: endpointResult.map((result) => ({
				endpoint: result.endpoint,
				count: Number(result.count ?? 0),
			})),
			recentKeys: recentKeysResult.map((result) => ({
				id: result.id,
				name: result.name,
				displayLabel: `wh_${result.id.split("-")[0]}…${result.secretDisplaySuffix}`,
				lastUsedAt: result.lastUsedAt?.toISOString() ?? null,
			})),
		};
	}),
};
