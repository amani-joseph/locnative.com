import type { LocnativeClient } from "@locnative/sdk";
import { type ReactNode, useEffect } from "react";
import { useForwardGeocode } from "../hooks/use-forward-geocode";
import { cn } from "../utils/cn";

export interface ForwardGeocodeInputProps {
	/** Class applied to the input element. */
	className?: string;
	/** Required. SDK client created with `createLocnativeClient`. */
	client: LocnativeClient;
	/** Disable the input. */
	disabled?: boolean;
	/** id forwarded to the input element. */
	id?: string;
	/** Geocode result callback, called whenever the resolved result changes. */
	onResult?: (result: {
		latitude: number | null;
		longitude: number | null;
		formattedAddress: string | null;
	}) => void;
	/** Input placeholder text. */
	placeholder?: string;
	/** Address text to geocode. */
	query: string | null;
}

export function ForwardGeocodeInput({
	client,
	query,
	onResult,
	className,
	disabled,
	placeholder = "Coordinates will appear here",
	id,
}: ForwardGeocodeInputProps): ReactNode {
	const { data } = useForwardGeocode(client, query);

	useEffect(() => {
		onResult?.({
			latitude: data?.latitude ?? null,
			longitude: data?.longitude ?? null,
			formattedAddress: data?.formattedAddress ?? null,
		});
	}, [data, onResult]);

	const displayText = data
		? `${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`
		: "";

	return (
		<input
			className={cn(
				"block h-8 w-full cursor-default rounded-none border border-input bg-muted/40 px-2.5 py-1 text-foreground text-xs",
				className
			)}
			data-slot="geocode-input"
			disabled={disabled}
			id={id}
			placeholder={placeholder}
			readOnly
			type="text"
			value={displayText}
		/>
	);
}
