import { Badge } from "@locnative/ui/components/badge";
import { buttonVariants } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { cn } from "@locnative/ui/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { PricingBackground } from "@/components/backgrounds/pricing-background";
import { PricingCalculator } from "@/components/pricing/pricing-calculator";

export const Route = createFileRoute("/_public/pricing")({
	component: PricingPage,
});

// Reflects the live usage-based billing meter. Source of truth: the
// `free_allotment` default in packages/database/src/schema/billing.ts (15,000)
// and the Stripe metered price of $0.0007/request ($0.70 per 1,000). Keep these
// figures in sync with routes/_protected/billing.tsx if the meter changes.
const FREE_REQUESTS = "15,000";
const RATE_PER_1K = "$0.70";

const FEATURES: readonly string[] = [
	`${FREE_REQUESTS} requests every month, free`,
	`Then ${RATE_PER_1K} per 1,000 requests`,
	"No minimums, no caps, no monthly fee",
	"Usage metered and billed monthly",
	"Address autocomplete, reverse geocoding & geofencing",
	"Webhooks, analytics, and team billing included",
];

function PricingPage() {
	return (
		<main className="relative isolate overflow-hidden">
			<PricingBackground />
			<div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-24">
				<header className="mx-auto flex max-w-2xl flex-col items-center text-center">
					<Badge variant="secondary">Pricing</Badge>
					<h1 className="mt-4 font-bold text-4xl tracking-tight sm:text-5xl">
						Geocoding that scales with you
					</h1>
					<p className="mt-4 text-balance text-muted-foreground">
						Address autocomplete, reverse geocoding, geofencing, and routing
						across the US, Australia, and a growing set of European countries.
						Pay only for what you use — start free, no card required.
					</p>
				</header>

				<section aria-label="Pricing" className="mx-auto mt-16 w-full max-w-md">
					<Card className="flex flex-col border-primary shadow-lg ring-1 ring-primary">
						<CardHeader>
							<div className="flex items-center justify-between gap-2">
								<CardTitle className="text-lg">Pay-as-you-go</CardTitle>
								<Badge>No card to start</Badge>
							</div>
							<CardDescription>
								Only pay for what you use, billed monthly.
							</CardDescription>
							<div className="mt-4 flex items-baseline gap-1">
								<span className="font-bold text-4xl tracking-tight">$0</span>
								<span className="text-muted-foreground text-sm">
									/month to start
								</span>
							</div>
							<p className="mt-1 text-muted-foreground text-sm">
								{FREE_REQUESTS} requests/month free, then {RATE_PER_1K} per
								1,000.
							</p>
						</CardHeader>

						<CardContent className="flex flex-1 flex-col">
							<ul className="flex flex-1 flex-col gap-3 text-sm">
								{FEATURES.map((feature) => (
									<li className="flex items-start gap-2" key={feature}>
										<CheckIcon
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-primary"
										/>
										<span>{feature}</span>
									</li>
								))}
							</ul>

							<Link
								className={cn(
									buttonVariants({ variant: "default", size: "lg" }),
									"mt-8 w-full"
								)}
								to="/sign-up"
							>
								Start for free
							</Link>
						</CardContent>
					</Card>
				</section>

				{/* Interactive cost estimate */}
				<section
					aria-label="Cost estimate"
					className="mx-auto mt-20 w-full max-w-2xl"
				>
					<div className="text-center">
						<h2 className="font-bold text-2xl tracking-tight sm:text-3xl">
							Estimate your monthly cost
						</h2>
						<p className="mt-2 text-balance text-muted-foreground text-sm">
							Drag to see what a given request volume costs. The first{" "}
							{FREE_REQUESTS} requests each month are always free.
						</p>
					</div>
					<div className="mt-8">
						<PricingCalculator />
					</div>
					<p className="mt-4 text-muted-foreground text-sm">
						<span className="font-medium text-foreground">
							What counts as a request?
						</span>{" "}
						Every successful API call — autocomplete, geocoding, reverse
						geocoding, or geofencing — counts as one request. Requests that fail
						authentication or validation aren't billed.
					</p>
				</section>

				{/* Enterprise / volume */}
				<section
					aria-label="Enterprise"
					className="mx-auto mt-16 w-full max-w-2xl"
				>
					<Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
						<div>
							<h2 className="font-semibold text-lg">
								Scaling past millions of requests?
							</h2>
							<p className="mt-1 max-w-md text-muted-foreground text-sm">
								Talk to us about volume pricing, committed-use discounts, an
								uptime SLA, SSO, and dedicated support for production workloads.
							</p>
						</div>
						<a
							className={cn(
								buttonVariants({ variant: "default", size: "lg" }),
								"shrink-0"
							)}
							href="mailto:hello@locnative.com"
						>
							Talk to us
						</a>
					</Card>
				</section>

				<p className="mt-16 text-center text-muted-foreground text-sm">
					All usage includes access to the full{" "}
					<Link className="underline underline-offset-4" to="/docs">
						API documentation
					</Link>
					. Questions about pricing?{" "}
					<a
						className="underline underline-offset-4"
						href="mailto:hello@locnative.com"
					>
						Get in touch
					</a>
					.
				</p>
			</div>
		</main>
	);
}
