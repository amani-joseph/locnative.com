import { createFileRoute } from "@tanstack/react-router";
import { SmartphoneIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_protected/devices")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Track device locations and see which zones each device is in."
				title="Devices"
			/>
			<EmptyState
				description="Device tracking is coming in a later release. Zones and webhooks are ready to use today."
				icon={<SmartphoneIcon />}
				title="Coming soon"
			/>
		</div>
	);
}
