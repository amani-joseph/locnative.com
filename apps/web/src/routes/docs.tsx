import { createFileRoute } from "@tanstack/react-router";
import { DocsPage } from "@/components/docs-page";
import { buildSeo } from "@/lib/seo";
import {
	breadcrumbJsonLd,
	jsonLdScript,
	techArticleJsonLd,
} from "@/lib/structured-data";

const DOCS_TITLE =
	"API Documentation — Geocoding & Address Autocomplete | Locnative";
const DOCS_DESCRIPTION =
	"Developer docs for the Locnative location API: address autocomplete, reverse geocoding, nearby lookup, and canonical address retrieval with API-key auth.";

export const Route = createFileRoute("/docs")({
	head: () => {
		const seo = buildSeo({
			title: DOCS_TITLE,
			description: DOCS_DESCRIPTION,
			path: "/docs",
			ogType: "article",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					techArticleJsonLd({
						title: DOCS_TITLE,
						description: DOCS_DESCRIPTION,
						path: "/docs",
					})
				),
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Documentation", path: "/docs" },
					])
				),
			],
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <DocsPage />;
}
