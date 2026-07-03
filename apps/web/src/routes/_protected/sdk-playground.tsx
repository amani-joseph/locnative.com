import { createFileRoute } from "@tanstack/react-router";
import { SdkPlayground } from "@/components/sdk-playground";

export const Route = createFileRoute("/_protected/sdk-playground")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">
					SDK Playground
				</h1>
				<p className="text-muted-foreground text-sm">
					Pick a method, fill in inputs, see the equivalent @locnative/sdk code,
					and run it against the live API.
				</p>
			</div>
			<SdkPlayground />
		</div>
	);
}
