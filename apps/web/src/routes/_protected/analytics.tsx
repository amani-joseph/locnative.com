import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@locnative/ui/components/tabs";
import { cn } from "@locnative/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MetricCards } from "@/components/analytics/metric-cards";
import type { UsageSeriesKey } from "@/components/analytics/series-config";
import {
	UsageChart,
	type UsagePoint,
} from "@/components/analytics/usage-chart";
import { orpcClient } from "@/lib/orpc";

type TimeSeries = Awaited<
	ReturnType<typeof orpcClient.dashboard.getUsageTimeSeries>
>;
type Range = "7d" | "30d" | "90d";

const RANGE_OPTIONS: { value: Range; label: string; full: string }[] = [
	{ value: "7d", label: "7 days", full: "Last 7 days" },
	{ value: "30d", label: "30 days", full: "Last 30 days" },
	{ value: "90d", label: "90 days", full: "Last 90 days" },
];

export const Route = createFileRoute("/_protected/analytics")({
	component: RouteComponent,
});

function AnalyticsLoadingSkeleton() {
	return (
		<>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
				{[1, 2, 3, 4, 5].map((card) => (
					<Card key={card}>
						<CardContent className="space-y-3 pt-5">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-7 w-24" />
							<Skeleton className="h-3 w-28" />
						</CardContent>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<Skeleton className="h-5 w-44" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-[340px] w-full" />
				</CardContent>
			</Card>
		</>
	);
}

function EmptyAnalyticsState() {
	return (
		<Card className="border-dashed">
			<CardContent className="py-14 text-center">
				<p className="font-medium text-sm">No usage data yet</p>
				<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
					Make a production request with one of your API keys to start
					populating live usage analytics. Charts update within seconds.
				</p>
			</CardContent>
		</Card>
	);
}

function RangeTabs({
	range,
	onChange,
}: {
	range: Range;
	onChange: (range: Range) => void;
}) {
	return (
		<Tabs onValueChange={(value) => onChange(value as Range)} value={range}>
			<TabsList>
				{RANGE_OPTIONS.map((option) => (
					<TabsTrigger key={option.value} value={option.value}>
						{option.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

function RouteComponent() {
	const [range, setRange] = useState<Range>("7d");
	const [data, setData] = useState<TimeSeries | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const loadedOnce = useRef(false);

	const fetchSeries = useCallback(async (selected: Range, initial: boolean) => {
		if (initial) {
			setLoading(true);
		} else {
			setRefreshing(true);
		}
		try {
			const result = await orpcClient.dashboard.getUsageTimeSeries({
				range: selected,
			});
			setData(result);
		} catch {
			setData(null);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		// Full skeleton on first load; subtle dim on subsequent range switches.
		fetchSeries(range, !loadedOnce.current);
		loadedOnce.current = true;
	}, [range, fetchSeries]);

	const rangeFull =
		RANGE_OPTIONS.find((option) => option.value === range)?.full ?? "";
	const hasUsage = (data?.summary.totalRequests ?? 0) > 0;

	let content = <EmptyAnalyticsState />;
	if (loading) {
		content = <AnalyticsLoadingSkeleton />;
	} else if (data) {
		content = (
			<>
				<MetricCards rangeLabel={rangeFull} summary={data.summary} />
				<Card>
					<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<BarChart3Icon className="size-5" />
								API Request Volume
							</CardTitle>
							<CardDescription>
								Production requests by endpoint · {rangeFull}
							</CardDescription>
						</div>
						<RangeTabs onChange={setRange} range={range} />
					</CardHeader>
					<CardContent
						className={cn(
							"transition-opacity",
							refreshing && "pointer-events-none opacity-60"
						)}
					>
						{hasUsage ? (
							<UsageChart
								data={data.series as UsagePoint[]}
								perSeriesTotals={
									data.perSeriesTotals as Record<UsageSeriesKey, number>
								}
							/>
						) : (
							<div className="flex h-[340px] items-center justify-center text-muted-foreground text-sm">
								No production requests in this period.
							</div>
						)}
					</CardContent>
				</Card>
			</>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Analytics</h1>
				<p className="text-muted-foreground text-sm">
					Real-time API request volume across your endpoints
				</p>
			</div>
			{content}
		</div>
	);
}
