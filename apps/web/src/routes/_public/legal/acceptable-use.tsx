import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { ACCEPTABLE_USE } from "@/data/legal";
import { buildSeo } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

export const Route = createFileRoute("/_public/legal/acceptable-use")({
	head: () => {
		const seo = buildSeo({
			title: "Acceptable Use Policy | Locnative",
			description:
				"Activities that are not permitted when using the Locnative service.",
			path: "/legal/acceptable-use",
			ogType: "website",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Acceptable Use Policy", path: "/legal/acceptable-use" },
					])
				),
			],
		};
	},
	component: () => <LegalPage content={ACCEPTABLE_USE} />,
});
