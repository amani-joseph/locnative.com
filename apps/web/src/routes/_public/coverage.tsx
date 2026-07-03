import { Badge } from "@locnative/ui/components/badge";
import { buttonVariants } from "@locnative/ui/components/button";
import { Input } from "@locnative/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";
import { cn } from "@locnative/ui/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CoverageBackground } from "@/components/backgrounds/coverage-background";
import {
	CAPABILITY_LABELS,
	type Capability,
	COVERAGE_COUNTRIES,
	filterCountries,
	iso2ToFlag,
} from "@/data/coverage";
import { buildSeo } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/structured-data";

const COVERAGE_TITLE = "Coverage — Countries with Address Data | Locnative";
const COVERAGE_DESCRIPTION =
	"See which countries the Locnative location API supports for geocoding, reverse geocoding, and address autocomplete before you integrate.";

const COUNTRY_COUNT = COVERAGE_COUNTRIES.length;

// Stable display order for the capability legend.
const CAPABILITIES: Capability[] = ["geocode", "reverse", "autocomplete"];

// Plain-language explanation of each capability, shown in the legend.
const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
	geocode: "Turn an address or place name into latitude/longitude coordinates.",
	reverse: "Turn coordinates into the nearest canonical street address.",
	autocomplete: "Suggest complete, valid addresses as a user types.",
};

export const Route = createFileRoute("/_public/coverage")({
	head: () => {
		const seo = buildSeo({
			title: COVERAGE_TITLE,
			description: COVERAGE_DESCRIPTION,
			path: "/coverage",
			ogType: "website",
		});
		return {
			meta: seo.meta,
			links: seo.links,
			scripts: [
				jsonLdScript(
					breadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Coverage", path: "/coverage" },
					])
				),
			],
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	const [query, setQuery] = useState("");
	const countries = useMemo(
		() => filterCountries(query, COVERAGE_COUNTRIES),
		[query]
	);

	return (
		<main className="relative isolate overflow-hidden">
			<CoverageBackground />
			<div className="relative z-10 mx-auto max-w-4xl px-4 py-16 md:px-6">
				<header className="mb-8">
					<h1 className="font-semibold text-3xl tracking-tight">Coverage</h1>
					<p className="mt-2 max-w-xl text-muted-foreground text-sm">
						Address data available through the Locnative API. Check which
						countries and capabilities are supported before you integrate.
					</p>
				</header>

				{/* Summary band */}
				<dl className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="rounded-xl border bg-card/60 p-4 backdrop-blur-sm">
						<dt className="text-muted-foreground text-sm">Countries</dt>
						<dd className="mt-1 font-semibold text-2xl tabular-nums">
							{COUNTRY_COUNT}
						</dd>
						<p className="mt-1 text-muted-foreground text-xs">
							Expanding continuously
						</p>
					</div>
					<div className="rounded-xl border bg-card/60 p-4 backdrop-blur-sm">
						<dt className="text-muted-foreground text-sm">Capabilities</dt>
						<dd className="mt-1 font-semibold text-2xl tabular-nums">
							{CAPABILITIES.length}
						</dd>
						<p className="mt-1 text-muted-foreground text-xs">
							Geocode · Reverse · Autocomplete
						</p>
					</div>
					<div className="rounded-xl border bg-card/60 p-4 backdrop-blur-sm">
						<dt className="text-muted-foreground text-sm">Regions</dt>
						<dd className="mt-1 font-semibold text-2xl tabular-nums">3</dd>
						<p className="mt-1 text-muted-foreground text-xs">
							Americas · Europe · Oceania
						</p>
					</div>
				</dl>

				<Input
					aria-label="Search countries"
					className="mb-6 max-w-sm"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search by country or code…"
					type="search"
					value={query}
				/>
				<p className="mb-2 text-muted-foreground text-xs">
					{countries.length === COUNTRY_COUNT
						? `${COUNTRY_COUNT} countries`
						: `${countries.length} of ${COUNTRY_COUNT} countries`}
				</p>

				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Country</TableHead>
							<TableHead>Code</TableHead>
							<TableHead>Capabilities</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{countries.length === 0 ? (
							<TableRow>
								<TableCell
									className="text-center text-muted-foreground"
									colSpan={3}
								>
									No countries match "{query}".
								</TableCell>
							</TableRow>
						) : (
							countries.map((country) => (
								<TableRow key={country.iso2}>
									<TableCell className="font-medium">
										<span aria-hidden="true" className="mr-2">
											{iso2ToFlag(country.iso2)}
										</span>
										{country.name}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{country.iso2}
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{country.capabilities.map((capability) => (
												<Badge key={capability} variant="secondary">
													{CAPABILITY_LABELS[capability]}
												</Badge>
											))}
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>

				{/* Capability legend */}
				<section aria-label="What each capability means" className="mt-12">
					<h2 className="font-semibold text-lg">What each capability means</h2>
					<dl className="mt-4 grid gap-4 sm:grid-cols-3">
						{CAPABILITIES.map((capability) => (
							<div className="rounded-xl border p-4" key={capability}>
								<dt>
									<Badge variant="secondary">
										{CAPABILITY_LABELS[capability]}
									</Badge>
								</dt>
								<dd className="mt-2 text-muted-foreground text-sm">
									{CAPABILITY_DESCRIPTIONS[capability]}
								</dd>
							</div>
						))}
					</dl>
				</section>

				{/* How the data works */}
				<section aria-label="How our data works" className="mt-12">
					<h2 className="font-semibold text-lg">How our data works</h2>
					<p className="mt-3 max-w-2xl text-muted-foreground text-sm">
						Coverage is built on authoritative open and national address
						datasets — Australia, for example, is powered by the official G-NAF
						dataset. Every supported country returns canonical street addresses
						with coordinates through the same geocoding, reverse-geocoding, and
						autocomplete endpoints. We add countries continuously; a country
						that isn't listed yet can't be queried by that region today.
					</p>
				</section>

				{/* CTAs */}
				<div className="mt-12 flex flex-wrap items-center gap-3">
					<Link
						className={cn(buttonVariants({ variant: "default" }))}
						to="/sign-up"
					>
						Start building
					</Link>
					<Link
						className={cn(buttonVariants({ variant: "outline" }))}
						to="/docs"
					>
						Read the docs
					</Link>
				</div>
				<p className="mt-6 text-muted-foreground text-sm">
					Don't see your country?{" "}
					<a
						className="underline underline-offset-4 hover:text-foreground"
						href="mailto:hello@locnative.com"
					>
						Request coverage <span aria-hidden="true">→</span>
					</a>
				</p>
			</div>
		</main>
	);
}
