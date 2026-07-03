import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import type { AddressAutocompleteProps } from "./address-autocomplete";
import { AddressAutocomplete } from "./address-autocomplete";

export interface AddressFormFieldProps extends AddressAutocompleteProps {
	/** Class applied to the error text element. */
	errorClassName?: string;
	/** Required. Field label rendered above the input. */
	label: string;
	/** Class applied to the label element. */
	labelClassName?: string;
}

export function AddressFormField({
	label,
	labelClassName,
	errorClassName,
	error,
	required,
	disabled,
	id: customId,
	className,
	...autocompleteProps
}: AddressFormFieldProps): ReactNode {
	const id = customId ?? "locnative-field";

	return (
		<div className="flex flex-col gap-2" data-slot="address-form-field">
			<label
				className={cn(
					"block font-medium text-gray-900 text-sm",
					labelClassName
				)}
				htmlFor={id}
			>
				{label}
				{required && (
					<span aria-hidden="true" className="ml-1 text-red-600">
						*
					</span>
				)}
			</label>

			<AddressAutocomplete
				{...autocompleteProps}
				className={className}
				disabled={disabled}
				error={error}
				id={id}
				required={required}
			/>

			{error && (
				<p
					aria-live="polite"
					className={cn("text-red-600 text-sm", errorClassName)}
					role="alert"
				>
					{error}
				</p>
			)}
		</div>
	);
}
