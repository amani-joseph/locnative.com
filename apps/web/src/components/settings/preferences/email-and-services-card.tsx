import type { ServiceInterest } from "@locnative/api/shared/onboarding-options";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MarketingConsentCheckbox } from "@/components/onboarding/marketing-consent-checkbox";
import { ServiceInterestPicker } from "@/components/onboarding/service-interest-picker";
import { orpcClient } from "@/lib/orpc";

interface Preferences {
	marketingConsent: boolean;
	serviceInterests: ServiceInterest[];
}

export function EmailAndServicesCard() {
	const [saved, setSaved] = useState<Preferences | null>(null);
	const [draft, setDraft] = useState<Preferences | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		orpcClient.onboarding
			.getPreferences()
			.then((result) => {
				if (cancelled) {
					return;
				}
				const next: Preferences = {
					marketingConsent: result.marketingConsent,
					serviceInterests: result.serviceInterests as ServiceInterest[],
				};
				setSaved(next);
				setDraft(next);
			})
			.catch(() => {
				if (!cancelled) {
					toast.error("Could not load your preferences.");
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const isDirty =
		saved !== null &&
		draft !== null &&
		(saved.marketingConsent !== draft.marketingConsent ||
			[...saved.serviceInterests].sort().join() !==
				[...draft.serviceInterests].sort().join());

	const save = async () => {
		if (!draft) {
			return;
		}
		setIsSaving(true);
		try {
			await orpcClient.onboarding.updatePreferences(draft);
			setSaved(draft);
			toast.success("Preferences saved.");
		} catch {
			toast.error("Could not save your preferences.");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Email & Services</CardTitle>
				<CardDescription>
					Marketing emails are opt-in. Account, billing, security and usage
					emails are always sent.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{draft ? (
					<>
						<MarketingConsentCheckbox
							checked={draft.marketingConsent}
							disabled={isSaving}
							onChange={(marketingConsent) =>
								setDraft({ ...draft, marketingConsent })
							}
						/>
						<div className="space-y-3">
							<p className="font-medium text-sm">Services you plan to use</p>
							<ServiceInterestPicker
								disabled={isSaving}
								onChange={(serviceInterests) =>
									setDraft({ ...draft, serviceInterests })
								}
								value={draft.serviceInterests}
							/>
						</div>
						<div className="flex justify-end">
							<Button
								disabled={!isDirty || isSaving}
								onClick={save}
								type="button"
							>
								{isSaving ? "Saving..." : "Save preferences"}
							</Button>
						</div>
					</>
				) : (
					<Skeleton className="h-48 w-full" />
				)}
			</CardContent>
		</Card>
	);
}
