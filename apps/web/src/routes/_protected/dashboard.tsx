import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Progress } from "@locnative/ui/components/progress";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRightIcon,
	BarChart3Icon,
	BookOpenIcon,
	KeyRoundIcon,
	MapPinIcon,
	PlusIcon,
	RocketIcon,
	ZapIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";

type DashboardStats = Awaited<ReturnType<typeof orpcClient.dashboard.getStats>>;

export const Route = createFileRoute("/_protected/dashboard")({
	component: RouteComponent,
});

const PLAN_LIMIT = 100_000;

function StatsLoadingSkeleton() {
	return (
		<>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{[1, 2, 3, 4].map((i) => (
					<Card key={i}>
						<CardHeader className="pb-2">
							<Skeleton className="h-4 w-24" />
						</CardHeader>
						<CardContent>
							<Skeleton className="h-8 w-20" />
							<Skeleton className="mt-1 h-3 w-32" />
						</CardContent>
					</Card>
				))}
			</div>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<Skeleton className="h-5 w-32" />
					</CardHeader>
					<CardContent className="space-y-3">
						{[1, 2, 3].map((i) => (
							<Skeleton className="h-12 w-full" key={i} />
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton className="h-5 w-32" />
					</CardHeader>
					<CardContent className="space-y-3">
						{[1, 2, 3].map((i) => (
							<Skeleton className="h-12 w-full" key={i} />
						))}
					</CardContent>
				</Card>
			</div>
		</>
	);
}

function EmptyDashboard() {
	return (
		<Card className="border-dashed">
			<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
				<div className="flex size-16 items-center justify-center rounded-full bg-muted">
					<RocketIcon className="size-8 text-muted-foreground" />
				</div>
				<div>
					<p className="font-semibold text-lg">Get started with Locnative</p>
					<p className="mx-auto max-w-sm text-muted-foreground text-sm">
						Create your first API key and start geocoding addresses in minutes.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<Link to="/api-keys">
						<Button>
							<KeyRoundIcon className="size-4" />
							Create API Key
						</Button>
					</Link>
					<Link to="/docs">
						<Button variant="outline">
							<BookOpenIcon className="size-4" />
							Read the Docs
						</Button>
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}

function DashboardContent({ stats }: { stats: DashboardStats }) {
	const usagePct = Math.min((stats.recentRequests / PLAN_LIMIT) * 100, 100);
	const hasUsage = stats.recentRequests > 0;

	return (
		<>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardDescription>Active Keys</CardDescription>
						<KeyRoundIcon className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="font-bold text-2xl">{stats.activeKeys}</p>
						<Link
							className="text-muted-foreground text-xs hover:underline"
							to="/api-keys"
						>
							Manage keys
						</Link>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardDescription>Requests (30d)</CardDescription>
						<ZapIcon className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="font-bold text-2xl">
							{stats.recentRequests.toLocaleString()}
						</p>
						<p className="text-muted-foreground text-xs">
							of {PLAN_LIMIT.toLocaleString()} limit
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardDescription>Total Requests</CardDescription>
						<BarChart3Icon className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="font-bold text-2xl">
							{stats.totalRequests.toLocaleString()}
						</p>
						<Link
							className="text-muted-foreground text-xs hover:underline"
							to="/analytics"
						>
							View analytics
						</Link>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardDescription>Endpoints Used</CardDescription>
						<MapPinIcon className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="font-bold text-2xl">
							{stats.endpointBreakdown.length}
						</p>
						<p className="text-muted-foreground text-xs">
							{stats.endpointBreakdown.length > 0
								? "across your projects"
								: "make your first request"}
						</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Monthly Usage</CardTitle>
					<CardDescription>
						{stats.recentRequests.toLocaleString()} /{" "}
						{PLAN_LIMIT.toLocaleString()} production requests used this period
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Progress className="h-3" value={usagePct} />
					<div className="mt-2 flex justify-between text-muted-foreground text-xs">
						<span>{Math.round(usagePct)}% used</span>
						<span>
							{(PLAN_LIMIT - stats.recentRequests).toLocaleString()} remaining
						</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Explorer Test Traffic</CardTitle>
					<CardDescription>
						Interactive API explorer requests are counted separately from
						production usage.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center justify-between gap-4">
					<div>
						<p className="font-bold text-2xl">
							{stats.explorerTestRequests.toLocaleString()}
						</p>
						<p className="text-muted-foreground text-xs">
							test requests in the last 30 days
						</p>
					</div>
					<Link to="/api-docs">
						<Button size="sm" variant="outline">
							API Explorer
						</Button>
					</Link>
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="text-base">API Keys</CardTitle>
							<Link to="/api-keys">
								<Button size="sm" variant="ghost">
									<PlusIcon className="size-4" />
									New Key
								</Button>
							</Link>
						</div>
						<CardDescription>
							{stats.activeKeys} active key{stats.activeKeys === 1 ? "" : "s"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{stats.recentKeys.length === 0 ? (
							<div className="py-4 text-center">
								<p className="text-muted-foreground text-sm">No API keys yet</p>
								<Link to="/api-keys">
									<Button className="mt-2" size="sm" variant="outline">
										Create your first key
									</Button>
								</Link>
							</div>
						) : (
							<div className="space-y-2">
								{stats.recentKeys.map((key) => (
									<div
										className="flex items-center justify-between rounded-md border px-3 py-2"
										key={key.id}
									>
										<div>
											<p className="font-medium text-sm">{key.name}</p>
											<p className="font-mono text-muted-foreground text-xs">
												{key.displayLabel}
											</p>
										</div>
										<Badge variant="secondary">
											{key.lastUsedAt ? "Active" : "Unused"}
										</Badge>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="text-base">Endpoint Usage</CardTitle>
							<Link to="/analytics">
								<Button size="sm" variant="ghost">
									Details
									<ArrowRightIcon className="size-4" />
								</Button>
							</Link>
						</div>
						<CardDescription>
							Production request distribution (30 days)
						</CardDescription>
					</CardHeader>
					<CardContent>
						{hasUsage ? (
							<div className="space-y-3">
								{stats.endpointBreakdown.map((ep) => {
									const pct =
										stats.totalRequests > 0
											? (ep.count / stats.recentRequests) * 100
											: 0;
									return (
										<div className="space-y-1" key={ep.endpoint}>
											<div className="flex items-center justify-between text-sm">
												<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
													{ep.endpoint}
												</code>
												<span className="text-muted-foreground text-xs">
													{ep.count.toLocaleString()}
												</span>
											</div>
											<Progress className="h-1.5" value={pct} />
										</div>
									);
								})}
							</div>
						) : (
							<div className="py-4 text-center">
								<p className="text-muted-foreground text-sm">
									No usage data yet
								</p>
								<Link to="/docs">
									<Button className="mt-2" size="sm" variant="outline">
										Quick start guide
									</Button>
								</Link>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Quick Start</CardTitle>
					<CardDescription>
						Make your first production API call, or use the explorer for
						separately tracked test traffic
					</CardDescription>
				</CardHeader>
				<CardContent>
					<pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm">
						<code>{`curl "https://api.locnative.com/api/v1/addresses/autocomplete?q=123+Main+St&country=AU" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</code>
					</pre>
					<div className="mt-3 flex gap-2">
						<Link to="/api-docs">
							<Button size="sm" variant="outline">
								API Explorer
							</Button>
						</Link>
						<Link to="/docs">
							<Button size="sm" variant="outline">
								Full Documentation
							</Button>
						</Link>
					</div>
				</CardContent>
			</Card>
		</>
	);
}

function RouteComponent() {
	const { data: session } = useSession();
	const user = session?.user;
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchStats = useCallback(async () => {
		try {
			const result = await orpcClient.dashboard.getStats();
			setStats(result);
		} catch {
			// Silently handle — dashboard shows empty state
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	const isNewUser =
		stats &&
		stats.activeKeys === 0 &&
		stats.totalRequests === 0 &&
		stats.explorerTestRequests === 0;
	let dashboardBody: ReactNode = null;
	if (loading) {
		dashboardBody = <StatsLoadingSkeleton />;
	} else if (isNewUser) {
		dashboardBody = <EmptyDashboard />;
	} else if (stats) {
		dashboardBody = <DashboardContent stats={stats} />;
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground text-sm">
					{user?.name
						? `Welcome back, ${user.name}`
						: "Your API overview at a glance"}
				</p>
			</div>

			{dashboardBody}
		</div>
	);
}
