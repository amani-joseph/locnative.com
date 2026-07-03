import { useReverseGeocode } from "@locnative/react";
import type { LocnativeClient } from "@locnative/sdk";
import { type ReactNode, useEffect } from "react";
import { cn } from "../utils/cn";

export interface ReverseGeocodeInputProps {
	/** Class applied to the input element. */
	className?: string;
	/** Required. SDK client created with `createLocnativeClient`. */
	client: LocnativeClient;
	/** Disable the input. */
	disabled?: boolean;
	/** id forwarded to the input element. */
	id?: string;
	/** Latitude to reverse-geocode. */
	latitude: number | null;
	/** Longitude to reverse-geocode. */
	longitude: number | null;
	/** Result callback, called whenever the resolved address changes. */
	onResult?: (result: {
		address: string | null;
		distance: number | null;
	}) => void;
	/** Input placeholder text. */
	placeholder?: string;
}

export function ReverseGeocodeInput({
	client,
	latitude,
	longitude,
	onResult,
	className,
	disabled,
	placeholder = "Address will appear here",
	id,
}: ReverseGeocodeInputProps): ReactNode {
	const { address, distance } = useReverseGeocode(
		client,
		latitude != null && longitude != null
			? { lat: latitude, lng: longitude }
			: null
	);

	useEffect(() => {
		onResult?.({
			address: address?.formattedAddress ?? null,
			distance: distance ?? null,
		});
	}, [address, distance, onResult]);

	const displayText = address?.formattedAddress ?? "";

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
