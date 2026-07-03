import { Badge } from "@locnative/ui/components/badge";
import { createFileRoute } from "@tanstack/react-router";
import { RouteBackground } from "@/components/backgrounds/route-background";
import { CHANGELOG, type ChangelogTag } from "@/data/changelog";
import { buildSeo } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

const CHANGELOG_TITLE = "Changelog | Locnative";
const CHANGELOG_DESCRIPTION =
	"What's new in the Locnative location API and developer platform — new features, improvements, and fixes.";

const TAG_VARIANT: Record<ChangelogTag, "default" | "secondary" | "outline"> = {
	New: "default",
	Improved: "secondary",
	Fixed: "outline",
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
});

function formatDate(iso: string): string {
	// Parse as UTC to avoid the date shifting by a day in negative timezones.
	const [year, month, day] = iso.split("-").map(Number);
	return dateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

export const Route = createFileRoute("/_public/changelog")({
	head: () => {
		const seo = buildSeo({
			title: CHANGELOG_TITLE,
			description: CHANGELOG_DESCRIPTION,
			path: "/changelog",
			ogType: "website",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Changelog", path: "/changelog" },
					])
				),
			],
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="relative isolate overflow-hidden">
			<RouteBackground />
			<div className="relative z-10 mx-auto max-w-3xl px-4 py-16 md:px-6">
				<header className="mb-12">
					<h1 className="font-semibold text-3xl tracking-tight">Changelog</h1>
					<p className="mt-2 max-w-xl text-muted-foreground text-sm">
						New features, improvements, and fixes across the Locnative API and
						platform.
					</p>
				</header>

				<ol className="space-y-12">
					{CHANGELOG.map((entry) => (
						<li
							className="border-border/60 border-l pl-6 md:grid md:grid-cols-[10rem_1fr] md:gap-6 md:border-l-0 md:pl-0"
							key={entry.date}
						>
							<div className="md:text-right">
								<time
									className="font-medium text-muted-foreground text-sm"
									dateTime={entry.date}
								>
									{formatDate(entry.date)}
								</time>
							</div>
							<div>
								<h2 className="font-semibold text-lg">{entry.title}</h2>
								<ul className="mt-4 space-y-3">
									{entry.items.map((item) => (
										<li className="flex items-start gap-3" key={item.text}>
											<Badge
												className="mt-0.5 shrink-0"
												variant={TAG_VARIANT[item.tag]}
											>
												{item.tag}
											</Badge>
											<span className="text-muted-foreground text-sm">
												{item.text}
											</span>
										</li>
									))}
								</ul>
							</div>
						</li>
					))}
				</ol>
			</div>
		</main>
	);
}
