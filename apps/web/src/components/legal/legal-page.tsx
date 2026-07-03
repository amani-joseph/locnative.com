import { RouteBackground } from "@/components/backgrounds/route-background";

export interface LegalSection {
	body: string[];
	heading: string;
}

export interface LegalContent {
	/** Plain-language summary shown under the title. */
	intro: string;
	lastUpdated: string;
	sections: LegalSection[];
	title: string;
}

/**
 * Shared layout for the draft legal pages. These are structural drafts pending
 * review by counsel — the banner makes that explicit so nothing here reads as a
 * final, binding policy.
 */
export function LegalPage({ content }: { content: LegalContent }) {
	return (
		<main className="relative isolate overflow-hidden">
			<RouteBackground />
			<div className="relative z-10 mx-auto max-w-3xl px-4 py-16 md:px-6">
				<header className="mb-8">
					<h1 className="font-semibold text-3xl tracking-tight">
						{content.title}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Last updated {content.lastUpdated}
					</p>
				</header>

				<div
					className="mb-10 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
					role="note"
				>
					<p className="font-medium text-foreground">
						Draft — pending legal review
					</p>
					<p className="mt-1 text-muted-foreground">
						This document is a working draft provided for transparency. It is
						not yet a final or binding agreement. Questions?{" "}
						<a
							className="underline underline-offset-4"
							href="mailto:hello@locnative.com"
						>
							Contact us
						</a>
						.
					</p>
				</div>

				<p className="text-muted-foreground leading-relaxed">{content.intro}</p>

				<div className="mt-10 space-y-10">
					{content.sections.map((section) => (
						<section key={section.heading}>
							<h2 className="font-semibold text-xl">{section.heading}</h2>
							{section.body.map((paragraph) => (
								<p
									className="mt-3 text-muted-foreground leading-relaxed"
									key={paragraph}
								>
									{paragraph}
								</p>
							))}
						</section>
					))}
				</div>
			</div>
		</main>
	);
}
