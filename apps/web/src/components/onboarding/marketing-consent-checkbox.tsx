import { MARKETING_CONSENT_WORDING } from "@locnative/api/shared/onboarding-options";
import { Checkbox } from "@locnative/ui/components/checkbox";

interface MarketingConsentCheckboxProps {
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}

/** Renders the exact wording reported to Clivly as proof of consent. */
export function MarketingConsentCheckbox({
	checked,
	disabled,
	onChange,
}: MarketingConsentCheckboxProps) {
	return (
		<label
			className="flex cursor-pointer items-start gap-3 border border-border p-3"
			htmlFor="marketing-consent"
		>
			<Checkbox
				checked={checked}
				className="mt-0.5"
				disabled={disabled}
				id="marketing-consent"
				onCheckedChange={onChange}
			/>
			<span className="text-foreground text-sm">{MARKETING_CONSENT_WORDING}</span>
		</label>
	);
}
