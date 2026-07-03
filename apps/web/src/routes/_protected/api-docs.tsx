import { createFileRoute } from "@tanstack/react-router";
import { ApiExplorer } from "@/components/api-explorer";

export const Route = createFileRoute("/_protected/api-docs")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">API Docs</h1>
				<p className="text-muted-foreground text-sm">
					Explore and test the Locnative API endpoints with managed keys or a
					temporary raw key, while keeping explorer traffic separate from
					production usage
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
					<a
						className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm"
						href="/docs"
					>
						Public docs
					</a>
					<a href="/api/openapi.json" rel="noopener" target="_blank">
						<span className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm">
							OpenAPI JSON
						</span>
					</a>
					<a href="/api/health" rel="noopener" target="_blank">
						<span className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm">
							Health check
						</span>
					</a>
				</div>
			</div>
			<ApiExplorer />
		</div>
	);
}
