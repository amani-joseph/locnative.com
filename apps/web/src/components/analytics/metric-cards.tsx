import { Card, CardContent } from "@locnative/ui/components/card";
import { cn } from "@locnative/ui/lib/utils";
import {
	ActivityIcon,
	CrownIcon,
	GaugeIcon,
	type LucideIcon,
	SunIcon,
	TrendingUpIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatAxisDate } from "./series-config";

export interface UsageSummary {
	avgPerDay: number;
	mostActive: { key: string; label: string; count: number } | null;
	peakDay: { date: string; count: number } | null;
	requestsToday: number;
	totalRequests: number;
}

interface MetricCardProps {
	accent?: boolean;
	hint: string;
	icon: LucideIcon;
	label: string;
	value: ReactNode;
}

function MetricCard({
	label,
	value,
	hint,
	icon: Icon,
	accent,
}: MetricCardProps) {
	return (
		<Card className="relative overflow-hidden">
			<span
				aria-hidden
				className={cn(
					"absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
					accent ? "via-primary/60" : "via-border"
				)}
			/>
			<CardContent className="flex flex-col gap-3 pt-5">
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground text-xs">{label}</span>
					<span
						className={cn(
							"flex size-7 items-center justify-center rounded-md",
							accent
								? "bg-primary/10 text-primary"
								: "bg-muted text-muted-foreground"
						)}
					>
						<Icon className="size-4" />
					</span>
				</div>
				<p className="truncate font-semibold text-2xl tabular-nums tracking-tight">
					{value}
				</p>
				<p className="truncate text-muted-foreground text-xs">{hint}</p>
			</CardContent>
		</Card>
	);
}

interface MetricCardsProps {
	rangeLabel: string;
	summary: UsageSummary;
}

export function MetricCards({ summary, rangeLabel }: MetricCardsProps) {
	const peak = summary.peakDay;
	const mostActive = summary.mostActive;

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
			<MetricCard
				accent
				hint={rangeLabel}
				icon={ActivityIcon}
				label="Total Requests"
				value={summary.totalRequests.toLocaleString()}
			/>
			<MetricCard
				hint="since 00:00 UTC"
				icon={SunIcon}
				label="Requests Today"
				value={summary.requestsToday.toLocaleString()}
			/>
			<MetricCard
				hint={`average per day · ${rangeLabel}`}
				icon={GaugeIcon}
				label="Avg / Day"
				value={summary.avgPerDay.toLocaleString()}
			/>
			<MetricCard
				hint={peak ? `on ${formatAxisDate(peak.date)}` : "no traffic yet"}
				icon={TrendingUpIcon}
				label="Peak Day"
				value={peak ? peak.count.toLocaleString() : "—"}
			/>
			<MetricCard
				hint={
					mostActive
						? `${mostActive.count.toLocaleString()} requests`
						: "no traffic yet"
				}
				icon={CrownIcon}
				label="Most Active Endpoint"
				value={mostActive ? mostActive.label : "—"}
			/>
		</div>
	);
}
