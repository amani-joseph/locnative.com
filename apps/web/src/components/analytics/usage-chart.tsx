import { cn } from "@locnative/ui/lib/utils";
import { useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	formatAxisDate,
	formatCompact,
	formatFullDate,
	USAGE_SERIES_UI,
	type UsageSeriesKey,
} from "./series-config";

export type UsagePoint = { date: string; total: number } & Record<
	UsageSeriesKey,
	number
>;

interface UsageChartProps {
	data: UsagePoint[];
	perSeriesTotals: Record<UsageSeriesKey, number>;
}

interface TooltipPayloadItem {
	color?: string;
	dataKey?: string | number;
	value?: number;
}

interface UsageTooltipProps {
	active?: boolean;
	label?: string;
	payload?: TooltipPayloadItem[];
}

function UsageTooltip({ active, payload, label }: UsageTooltipProps) {
	if (!(active && payload && payload.length > 0 && label)) {
		return null;
	}
	const dayTotal = payload.reduce((sum, item) => sum + (item.value ?? 0), 0);
	const rows = [...payload]
		.filter((item) => (item.value ?? 0) > 0)
		.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

	return (
		<div className="min-w-52 rounded-lg border border-border/60 bg-popover/95 p-3 shadow-xl backdrop-blur-sm">
			<p className="mb-2 font-medium text-popover-foreground text-xs">
				{formatFullDate(label)}
			</p>
			<div className="space-y-1.5">
				{rows.map((item) => {
					const def = USAGE_SERIES_UI.find((s) => s.key === item.dataKey);
					const value = item.value ?? 0;
					const pct = dayTotal > 0 ? Math.round((value / dayTotal) * 100) : 0;
					return (
						<div
							className="flex items-center gap-2 text-xs"
							key={String(item.dataKey)}
						>
							<span
								className="size-2.5 shrink-0 rounded-[3px]"
								style={{ backgroundColor: item.color }}
							/>
							<span className="text-muted-foreground">{def?.label}</span>
							<span className="ml-auto font-medium text-popover-foreground tabular-nums">
								{value.toLocaleString()}
							</span>
							<span className="w-9 text-right text-muted-foreground tabular-nums">
								{pct}%
							</span>
						</div>
					);
				})}
			</div>
			<div className="mt-2 flex items-center justify-between border-border/60 border-t pt-2 text-xs">
				<span className="text-muted-foreground">Total</span>
				<span className="font-semibold text-popover-foreground tabular-nums">
					{dayTotal.toLocaleString()}
				</span>
			</div>
		</div>
	);
}

export function UsageChart({ data, perSeriesTotals }: UsageChartProps) {
	const [hidden, setHidden] = useState<Set<UsageSeriesKey>>(new Set());

	const toggle = (key: UsageSeriesKey) => {
		setHidden((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	// Only render series that have traffic in the range, minus those toggled off.
	const present = useMemo(
		() => USAGE_SERIES_UI.filter((s) => (perSeriesTotals[s.key] ?? 0) > 0),
		[perSeriesTotals]
	);
	const visible = present.filter((s) => !hidden.has(s.key));

	return (
		<div className="flex flex-col gap-4">
			<div className="h-[340px] w-full">
				<ResponsiveContainer height="100%" width="100%">
					<AreaChart
						accessibilityLayer
						data={data}
						margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
					>
						<defs>
							{USAGE_SERIES_UI.map((s) => (
								<linearGradient
									id={`fill-${s.key}`}
									key={s.key}
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
									<stop offset="100%" stopColor={s.color} stopOpacity={0.04} />
								</linearGradient>
							))}
						</defs>
						<CartesianGrid
							stroke="var(--border)"
							strokeDasharray="3 3"
							strokeOpacity={0.5}
							vertical={false}
						/>
						<XAxis
							axisLine={false}
							dataKey="date"
							interval="preserveStartEnd"
							minTickGap={28}
							tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
							tickFormatter={formatAxisDate}
							tickLine={false}
							tickMargin={10}
						/>
						<YAxis
							allowDecimals={false}
							axisLine={false}
							tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
							tickFormatter={formatCompact}
							tickLine={false}
							width={44}
						/>
						<Tooltip
							content={<UsageTooltip />}
							cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
						/>
						{visible.map((s) => (
							<Area
								animationDuration={450}
								dataKey={s.key}
								fill={`url(#fill-${s.key})`}
								fillOpacity={1}
								key={s.key}
								stackId="usage"
								stroke={s.color}
								strokeWidth={2}
								type="monotone"
							/>
						))}
					</AreaChart>
				</ResponsiveContainer>
			</div>

			<ul aria-label="Toggle endpoint series" className="flex flex-wrap gap-2">
				{present.map((s) => {
					const isHidden = hidden.has(s.key);
					return (
						<li key={s.key}>
							<button
								aria-pressed={!isHidden}
								className={cn(
									"flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
									"hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									isHidden
										? "border-border/50 text-muted-foreground/60"
										: "border-border bg-card text-foreground"
								)}
								onClick={() => toggle(s.key)}
								type="button"
							>
								<span
									className={cn(
										"size-2.5 rounded-[3px] transition-opacity",
										isHidden && "opacity-30"
									)}
									style={{ backgroundColor: s.color }}
								/>
								<span className={cn(isHidden && "line-through")}>
									{s.label}
								</span>
								<span className="text-muted-foreground tabular-nums">
									{formatCompact(perSeriesTotals[s.key] ?? 0)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
