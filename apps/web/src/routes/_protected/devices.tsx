import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/devices")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Devices</CardTitle>
				<CardDescription>Coming in a later phase.</CardDescription>
			</CardHeader>
		</Card>
	);
}
