import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { PRIVACY_POLICY } from "@/data/legal";
import { buildSeo } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

export const Route = createFileRoute("/_public/legal/privacy")({
	head: () => {
		const seo = buildSeo({
			title: "Privacy Policy | Locnative",
			description:
				"How Locnative collects, uses, and protects information across our website and location APIs.",
			path: "/legal/privacy",
			ogType: "website",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Privacy Policy", path: "/legal/privacy" },
					])
				),
			],
		};
	},
	component: () => <LegalPage content={PRIVACY_POLICY} />,
});
