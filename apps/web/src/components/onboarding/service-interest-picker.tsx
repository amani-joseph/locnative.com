import {
	SERVICE_INTEREST_OPTIONS,
	type ServiceInterest,
} from "@locnative/api/shared/onboarding-options";
import { Checkbox } from "@locnative/ui/components/checkbox";
import { cn } from "@locnative/ui/lib/utils";

interface ServiceInterestPickerProps {
	disabled?: boolean;
	onChange: (next: ServiceInterest[]) => void;
	value: ServiceInterest[];
}

export function ServiceInterestPicker({
	disabled,
	onChange,
	value,
}: ServiceInterestPickerProps) {
	const toggle = (option: ServiceInterest, checked: boolean) => {
		onChange(
			checked
				? [...value, option]
				: value.filter((selected) => selected !== option)
		);
	};

	return (
		<fieldset className="grid gap-2 sm:grid-cols-2">
			<legend className="sr-only">Services you plan to use</legend>
			{SERVICE_INTEREST_OPTIONS.map((option) => {
				const id = `service-${option.value}`;
				const checked = value.includes(option.value);
				return (
					<label
						className={cn(
							"flex cursor-pointer items-start gap-3 border border-border p-3 transition-colors hover:bg-muted/50",
							checked && "border-primary bg-muted/40",
							disabled && "cursor-not-allowed opacity-60"
						)}
						htmlFor={id}
						key={option.value}
					>
						<Checkbox
							checked={checked}
							className="mt-0.5"
							disabled={disabled}
							id={id}
							onCheckedChange={(next) => toggle(option.value, next)}
						/>
						<span className="flex flex-col gap-0.5">
							<span className="font-medium text-foreground text-sm">
								{option.label}
							</span>
							<span className="text-muted-foreground text-xs">
								{option.description}
							</span>
						</span>
					</label>
				);
			})}
		</fieldset>
	);
}
