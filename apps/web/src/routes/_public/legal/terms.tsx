import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { TERMS_OF_SERVICE } from "@/data/legal";
import { buildSeo } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

export const Route = createFileRoute("/_public/legal/terms")({
	head: () => {
		const seo = buildSeo({
			title: "Terms of Service | Locnative",
			description:
				"The terms that govern your access to and use of the Locnative website and APIs.",
			path: "/legal/terms",
			ogType: "website",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Terms of Service", path: "/legal/terms" },
					])
				),
			],
		};
	},
	component: () => <LegalPage content={TERMS_OF_SERVICE} />,
});
