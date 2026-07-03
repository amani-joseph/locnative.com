import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Switch } from "@locnative/ui/components/switch";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRightIcon, CheckCircleIcon, WebhookIcon } from "lucide-react";

export const Route = createFileRoute("/_protected/integrations")({
	// Hidden for now — Integrations is a future feature. Redirect any direct
	// navigation back to the dashboard until it ships.
	beforeLoad: () => {
		throw redirect({ to: "/dashboard" });
	},
	component: RouteComponent,
});

const integrations = [
	{
		name: "Webhooks",
		description: "Receive real-time notifications when geocoding events occur",
		icon: <WebhookIcon className="size-5" />,
		connected: true,
		category: "Events",
	},
	{
		name: "Mapbox",
		description: "Render geocoded addresses on interactive Mapbox maps",
		icon: <span className="font-bold text-sm">MB</span>,
		connected: true,
		category: "Maps",
	},
	{
		name: "Google Maps",
		description: "Display results using Google Maps Platform",
		icon: <span className="font-bold text-sm">GM</span>,
		connected: false,
		category: "Maps",
	},
	{
		name: "Salesforce",
		description: "Enrich CRM records with verified address data",
		icon: <span className="font-bold text-sm">SF</span>,
		connected: false,
		category: "CRM",
	},
	{
		name: "Zapier",
		description: "Connect Locnative to 5,000+ apps with no-code workflows",
		icon: <span className="font-bold text-sm">ZP</span>,
		connected: false,
		category: "Automation",
	},
	{
		name: "Slack",
		description: "Get alerts for usage spikes, errors, and billing events",
		icon: <span className="font-bold text-sm">SL</span>,
		connected: true,
		category: "Notifications",
	},
];

function RouteComponent() {
	const connected = integrations.filter((i) => i.connected);
	const available = integrations.filter((i) => !i.connected);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Integrations</h1>
				<p className="text-muted-foreground text-sm">
					Connect Locnative with your favorite tools and services
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<CheckCircleIcon className="size-5 text-green-500" />
						Connected
					</CardTitle>
					<CardDescription>
						{connected.length} active integrations
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{connected.map((integration) => (
						<div
							className="flex items-center justify-between rounded-lg border px-4 py-3"
							key={integration.name}
						>
							<div className="flex items-center gap-3">
								<div className="flex size-10 items-center justify-center rounded-md bg-muted">
									{integration.icon}
								</div>
								<div>
									<p className="font-medium text-sm">{integration.name}</p>
									<p className="text-muted-foreground text-xs">
										{integration.description}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-3">
								<Badge variant="secondary">{integration.category}</Badge>
								<Switch defaultChecked />
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			<div>
				<h2 className="mb-4 font-semibold text-lg">Available Integrations</h2>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{available.map((integration) => (
						<Card key={integration.name}>
							<CardHeader>
								<div className="flex items-center gap-3">
									<div className="flex size-10 items-center justify-center rounded-md bg-muted">
										{integration.icon}
									</div>
									<div>
										<CardTitle className="text-base">
											{integration.name}
										</CardTitle>
										<Badge className="mt-1 text-xs" variant="outline">
											{integration.category}
										</Badge>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<p className="text-muted-foreground text-sm">
									{integration.description}
								</p>
								<Button className="w-full" variant="outline">
									Connect
									<ArrowRightIcon className="size-4" />
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</div>
	);
}
