import type { ServiceInterest } from "@locnative/api/shared/onboarding-options";
import { Button } from "@locnative/ui/components/button";
import {
	createFileRoute,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MarketingConsentCheckbox } from "@/components/onboarding/marketing-consent-checkbox";
import { ServiceInterestPicker } from "@/components/onboarding/service-interest-picker";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/onboarding")({
	beforeLoad: ({ context }) => {
		if (!context.isAuthenticated) {
			throw redirect({ to: "/sign-in" });
		}
		if (!context.needsOnboarding) {
			throw redirect({ to: "/dashboard" });
		}
	},
	head: () => ({ meta: [{ title: "Set up your account — Locnative" }] }),
	component: RouteComponent,
});

function RouteComponent() {
	const router = useRouter();
	const navigate = useNavigate();
	const [serviceInterests, setServiceInterests] = useState<ServiceInterest[]>(
		[]
	);
	const [marketingConsent, setMarketingConsent] = useState(false);
	const [pending, setPending] = useState<"save" | "skip" | null>(null);

	const finish = async (skipped: boolean) => {
		setPending(skipped ? "skip" : "save");
		try {
			await orpcClient.onboarding.complete({
				marketingConsent,
				serviceInterests,
				skipped,
			});
			// Re-run the root beforeLoad so needsOnboarding flips to false.
			await router.invalidate();
			await navigate({ to: "/dashboard" });
		} catch {
			toast.error("Could not save your choices. Please try again.");
			setPending(null);
		}
	};

	const isBusy = pending !== null;

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<div className="flex w-full max-w-2xl flex-col gap-8">
				<header className="flex flex-col gap-2">
					<p className="text-muted-foreground text-sm">Welcome to Locnative</p>
					<h1 className="font-semibold text-3xl text-foreground">
						Set up your account
					</h1>
					<p className="text-muted-foreground text-sm">
						Two quick questions. Both are optional and you can change them later
						in Settings.
					</p>
				</header>

				<section
					aria-labelledby="services-heading"
					className="flex flex-col gap-3"
				>
					<div>
						<h2
							className="font-medium text-foreground text-lg"
							id="services-heading"
						>
							What do you plan to build with?
						</h2>
						<p className="text-muted-foreground text-sm">
							Select all that apply.
						</p>
					</div>
					<ServiceInterestPicker
						disabled={isBusy}
						onChange={setServiceInterests}
						value={serviceInterests}
					/>
				</section>

				<section
					aria-labelledby="email-heading"
					className="flex flex-col gap-3"
				>
					<h2
						className="font-medium text-foreground text-lg"
						id="email-heading"
					>
						Email preferences
					</h2>
					<MarketingConsentCheckbox
						checked={marketingConsent}
						disabled={isBusy}
						onChange={setMarketingConsent}
					/>
					<p className="text-muted-foreground text-xs">
						We'll always email you about your account, billing, security and
						usage limits — these aren't marketing and can't be turned off.
					</p>
				</section>

				<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
					<Button
						disabled={isBusy}
						onClick={() => finish(true)}
						type="button"
						variant="ghost"
					>
						{pending === "skip" ? "Skipping..." : "Skip for now"}
					</Button>
					<Button disabled={isBusy} onClick={() => finish(false)} type="button">
						{pending === "save" ? "Saving..." : "Continue to dashboard"}
					</Button>
				</div>
			</div>
		</main>
	);
}
