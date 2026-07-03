import { useAutocomplete, useCombobox } from "@locnative/react";
import type { LocnativeClient } from "@locnative/sdk";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAddressGeolocation } from "../hooks/use-address-geolocation";
import type { AddressI18nStrings, AddressWithParsed } from "../types";
import { cn } from "../utils/cn";
import { toAddressWithParsed } from "../utils/parse-address";

export interface AddressAutocompleteProps {
	/** Class applied to the root container. */
	className?: string;
	/** Required. SDK client created with `createLocnativeClient`. */
	client: LocnativeClient;
	/** Debounce in ms before querying the API. Default 300. */
	debounceMs?: number;
	/** Disable the input. */
	disabled?: boolean;
	/** Use the browser's geolocation to bias results by proximity. Default false. */
	enableGeolocation?: boolean;
	/** External error message to display. */
	error?: string;
	/** Override built-in UI strings (no results, retry, etc.). */
	i18nStrings?: Partial<AddressI18nStrings>;
	/** id forwarded to the input element. */
	id?: string;
	/** Maximum number of suggestions to show. Default 5. */
	maxSuggestions?: number;
	/** Minimum characters typed before searching. Default 2. */
	minCharsToSearch?: number;
	/** Called as the input text changes. */
	onQueryChange?: (query: string) => void;
	/** Called when a suggestion is selected. */
	onSelect?: (address: AddressWithParsed) => void;
	/** Input placeholder text. */
	placeholder?: string;
	/** Render a custom empty state. */
	renderEmpty?: () => ReactNode;
	/** Render a custom error state. */
	renderError?: (error: Error | null) => ReactNode;
	/** Render a custom loading state. */
	renderLoading?: () => ReactNode;
	/** Render a custom suggestion row. */
	renderSuggestion?: (
		address: AddressWithParsed,
		isActive: boolean
	) => ReactNode;
	/** Mark the input as required. */
	required?: boolean;
	/** Group a run of keystrokes into one billable search (see SDK `newSessionToken()`). */
	sessionToken?: string;
	/** Explicit latitude for proximity bias (instead of geolocation). */
	userLat?: number;
	/** Explicit longitude for proximity bias (instead of geolocation). */
	userLng?: number;
}

const DEFAULT_I18N: AddressI18nStrings = {
	noResults: "No addresses found",
	enterManually: "Enter address manually",
	errorRetry: "Try again",
	geolocationError: "Location access denied",
};

export interface DropdownPosition {
	left: number;
	top: number;
	width: number;
}

// Gap (px) between the input and the dropdown, matching the previous mt-1.
const DROPDOWN_GAP_PX = 4;

// Anchor the dropdown directly below the input using viewport (fixed) coordinates.
// Kept pure so it can be unit-tested without a DOM.
export function computeDropdownPosition(rect: {
	bottom: number;
	left: number;
	width: number;
}): DropdownPosition {
	return {
		top: rect.bottom + DROPDOWN_GAP_PX,
		left: rect.left,
		width: rect.width,
	};
}

export function AddressAutocomplete({
	client,
	onQueryChange,
	onSelect,
	error: externalError,
	required,
	disabled,
	debounceMs = 300,
	minCharsToSearch = 2,
	maxSuggestions = 5,
	enableGeolocation,
	userLat,
	userLng,
	sessionToken,
	className,
	placeholder,
	renderSuggestion,
	renderEmpty,
	renderError,
	renderLoading,
	i18nStrings: customI18n,
	id: customId,
}: AddressAutocompleteProps) {
	const id = customId ?? "locnative-autocomplete";
	const i18n = useMemo(
		() => ({ ...DEFAULT_I18N, ...customI18n }),
		[customI18n]
	);

	// Geolocation
	const { lat: geoLat, lng: geoLng } = useAddressGeolocation(
		enableGeolocation ?? false
	);
	const effectiveLat = userLat ?? geoLat;
	const effectiveLng = userLng ?? geoLng;

	// Autocomplete hook
	const {
		query,
		setQuery,
		results,
		error: autocompleteError,
		status,
	} = useAutocomplete(client, {
		debounceMs,
		minLength: minCharsToSearch,
		limit: maxSuggestions,
		lat: effectiveLat,
		lng: effectiveLng,
		sessionToken,
		keepPreviousData: true,
	});

	// Combobox hook for keyboard navigation
	const { getInputProps, getListboxProps, getItemProps, isOpen } = useCombobox({
		id,
		count: results.length,
		onSelect: (index) => {
			const item = results[index];
			if (item) {
				const parsed = toAddressWithParsed(item);
				onSelect?.(parsed);
				setQuery("");
			}
		},
	});

	const inputRef = useRef<HTMLInputElement>(null);
	const [dropdownPosition, setDropdownPosition] =
		useState<DropdownPosition | null>(null);

	// The dropdown is portaled to <body> so no ancestor's overflow can clip it.
	// Track the input's viewport position while open so the portaled dropdown
	// stays anchored to it through scroll and resize.
	useEffect(() => {
		if (!isOpen) {
			return;
		}
		const updatePosition = () => {
			const el = inputRef.current;
			if (el) {
				setDropdownPosition(
					computeDropdownPosition(el.getBoundingClientRect())
				);
			}
		};
		updatePosition();
		// Capture phase catches scrolling in any ancestor, not just the window.
		window.addEventListener("scroll", updatePosition, true);
		window.addEventListener("resize", updatePosition);
		return () => {
			window.removeEventListener("scroll", updatePosition, true);
			window.removeEventListener("resize", updatePosition);
		};
	}, [isOpen]);

	const error =
		externalError || (status === "error" ? autocompleteError : null);
	const inputProps = getInputProps();

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		inputProps.onKeyDown?.(e);
	};

	return (
		<div
			className={cn("relative w-full", className)}
			data-slot="address-autocomplete"
		>
			<input
				{...inputProps}
				aria-invalid={error ? "true" : "false"}
				className="block h-8 w-full rounded-none border border-input bg-transparent px-2.5 py-1 text-foreground text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30"
				data-slot="address-input"
				disabled={disabled}
				onChange={(e) => {
					setQuery(e.target.value);
					onQueryChange?.(e.target.value);
				}}
				onKeyDown={handleKeyDown}
				placeholder={placeholder ?? i18n.noResults}
				ref={inputRef}
				required={required}
				type="text"
				value={query}
			/>

			{isOpen &&
				dropdownPosition &&
				typeof document !== "undefined" &&
				createPortal(
					<div
						className="z-50 overflow-hidden rounded-none border border-border bg-popover text-popover-foreground shadow-md"
						data-slot="address-dropdown"
						style={{
							position: "fixed",
							top: dropdownPosition.top,
							left: dropdownPosition.left,
							width: dropdownPosition.width,
						}}
					>
						<ul
							{...getListboxProps()}
							className="max-h-80 overflow-y-auto"
							data-slot="address-listbox"
						>
							{status === "loading" && (
								<li
									className="flex items-center justify-center px-3 py-2 text-muted-foreground text-sm"
									data-slot="address-item"
									data-status="loading"
								>
									{renderLoading?.() ?? "Loading..."}
								</li>
							)}

							{status === "error" && (
								<li
									className="flex items-center justify-center px-3 py-2 text-destructive text-sm"
									data-slot="address-item"
									data-status="error"
								>
									{renderError?.(error instanceof Error ? error : null) ??
										i18n.errorRetry}
								</li>
							)}

							{status === "empty" && (
								<li
									className="flex items-center justify-center px-3 py-2 text-muted-foreground text-sm"
									data-slot="address-item"
									data-status="empty"
								>
									{renderEmpty?.() ?? i18n.noResults}
								</li>
							)}

							{status === "success" &&
								results.map((result, index) => {
									const itemProps = getItemProps(index);
									const ariaSelected = itemProps["aria-selected"] as
										| boolean
										| string
										| undefined;
									const isActive =
										ariaSelected === true || ariaSelected === "true";
									const parsed = toAddressWithParsed(result);

									return (
										<div
											key={result.id}
											{...itemProps}
											className="flex cursor-pointer items-center rounded-none px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
											data-slot="address-item"
											onClick={() => {
												onSelect?.(parsed);
												setQuery("");
											}}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													onSelect?.(parsed);
													setQuery("");
												}
											}}
											onMouseDown={(e) => {
												e.preventDefault();
											}}
											role="option"
											tabIndex={-1}
										>
											{renderSuggestion ? (
												renderSuggestion(parsed, isActive)
											) : (
												<div className="flex-1">
													<div className="font-medium text-foreground text-sm">
														{parsed.streetAddress}
													</div>
													<div className="text-muted-foreground text-xs">
														{parsed.suburb}, {parsed.state} {parsed.postcode}
													</div>
												</div>
											)}
										</div>
									);
								})}
						</ul>

						{/* Locnative branding footer */}
						{status === "success" && results.length > 0 && (
							<div
								className="border-border border-t bg-muted/40 px-3 py-2"
								data-slot="address-powered-by"
							>
								<p className="text-muted-foreground text-xs">
									Suggestions powered by{" "}
									<a
										className="font-semibold text-foreground hover:underline"
										href="https://locnative.com"
										rel="noopener noreferrer"
										target="_blank"
									>
										Locnative
									</a>
								</p>
							</div>
						)}
					</div>,
					document.body
				)}
		</div>
	);
}
