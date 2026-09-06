import { useEffect, useRef, useState } from "react";
import { orpcClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { AutocompleteCache } from "./autocomplete-cache.ts";
import { coordValueFromCandidate, isValidLatLng } from "./location-value.ts";

interface Candidate {
	formattedAddress: string;
	id: number;
	latitude: number;
	locality: string;
	longitude: number;
	postcode: string;
	state: string;
}

interface LocationInputProps {
	id: string;
	label: string;
	onChange: (sentValue: string) => void;
	onResolvedLabelChange?: (label: string | null) => void;
	placeholder?: string;
	value: string;
}

// Trimmed from 250 ms. Debounce sits on top of a ~90-190 ms request, so it was
// the single largest contributor to perceived latency on the fast path. Safe to
// shorten now that superseded requests are aborted rather than left in flight.
const DEBOUNCE_MS = 150;
const MIN_QUERY = 3;
const CACHE_CAPACITY = 50;

export function LocationInput({
	id,
	label,
	placeholder,
	value,
	onChange,
	onResolvedLabelChange,
}: LocationInputProps) {
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Monotonic id for the latest in-flight autocomplete request. A slower
	// earlier response must not clobber a newer one (last-response-wins race),
	// and responses arriving after unmount must be ignored.
	const requestSeq = useRef(0);
	// Aborts the request that requestSeq has just superseded. The seq guard
	// alone only discards the response — the HTTP request kept running to
	// completion, so a user typing ten characters left several dead requests
	// competing for the connection and the origin's DB pool.
	const inFlight = useRef<AbortController | null>(null);
	// Per-instance so two LocationInputs (e.g. origin/destination) cannot evict
	// each other's entries. Ref, not state: writing to it must never re-render.
	const cache = useRef(new AutocompleteCache<Candidate[]>(CACHE_CAPACITY));

	useEffect(() => {
		return () => {
			// Invalidate any in-flight request so its resolution is a no-op.
			requestSeq.current++;
			inFlight.current?.abort();
			if (debounceTimer.current) {
				clearTimeout(debounceTimer.current);
			}
			if (blurTimer.current) {
				clearTimeout(blurTimer.current);
			}
		};
	}, []);

	const runQuery = (q: string) => {
		const seq = ++requestSeq.current;
		// Cancel the request this one supersedes before opening a new one.
		inFlight.current?.abort();
		const controller = new AbortController();
		inFlight.current = controller;
		setLoading(true);
		setOpen(true);
		orpcClient.geocode
			.autocomplete({ q }, { signal: controller.signal })
			.then((res) => {
				// Cache before the staleness guard: the response is valid for `q`
				// regardless of what the user has typed since, so it is still worth
				// keeping for when they backspace to it.
				cache.current.set(q, res.results);
				if (seq !== requestSeq.current) {
					return;
				}
				setCandidates(res.results);
				setOpen(true);
			})
			.catch(() => {
				// An abort lands here too. Bail on the seq guard rather than
				// inspecting the error: a superseded request must not clear the
				// candidates its successor is about to fill in.
				if (seq !== requestSeq.current) {
					return;
				}
				setCandidates([]);
			})
			.finally(() => {
				if (seq !== requestSeq.current) {
					return;
				}
				setLoading(false);
			});
	};

	const handleText = (next: string) => {
		onChange(next);
		onResolvedLabelChange?.(null);
		setActiveIndex(-1);
		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
		}
		if (next.length < MIN_QUERY || isValidLatLng(next)) {
			// Nothing will be requested for this input, so drop any request still
			// running for a previous one.
			requestSeq.current++;
			inFlight.current?.abort();
			setCandidates([]);
			setOpen(false);
			setLoading(false);
			return;
		}

		// Cache hit: render synchronously, skipping both debounce and network.
		// This is the common case when backspacing or retyping a prefix.
		const cached = cache.current.get(next);
		if (cached) {
			requestSeq.current++;
			inFlight.current?.abort();
			setCandidates(cached);
			setOpen(true);
			setLoading(false);
			return;
		}

		debounceTimer.current = setTimeout(() => runQuery(next), DEBOUNCE_MS);
	};

	const selectCandidate = (c: Candidate) => {
		onChange(coordValueFromCandidate(c));
		onResolvedLabelChange?.(`${c.locality} ${c.state}`.trim());
		setOpen(false);
		setCandidates([]);
		setActiveIndex(-1);
	};

	const handleKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open) {
			if (ev.key === "ArrowDown" && candidates.length > 0) {
				ev.preventDefault();
				setOpen(true);
				setActiveIndex(-1);
			}
			return;
		}
		if (ev.key === "ArrowDown") {
			ev.preventDefault();
			setActiveIndex((prev) => Math.min(prev + 1, candidates.length - 1));
			return;
		}
		if (ev.key === "ArrowUp") {
			ev.preventDefault();
			setActiveIndex((prev) => Math.max(prev - 1, 0));
			return;
		}
		if (ev.key === "Enter") {
			if (activeIndex >= 0 && candidates[activeIndex]) {
				ev.preventDefault();
				selectCandidate(candidates[activeIndex]);
			}
			return;
		}
		if (ev.key === "Escape") {
			setOpen(false);
			setActiveIndex(-1);
		}
	};

	const listboxId = `${id}-listbox`;
	const activeOptionId =
		open && activeIndex >= 0 && candidates[activeIndex]
			? `${id}-opt-${candidates[activeIndex].id}`
			: undefined;
	const showEmptyState = candidates.length === 0;

	return (
		<div className="relative flex flex-col gap-1">
			<label className="text-sm" htmlFor={id}>
				{label}
			</label>
			<input
				aria-activedescendant={activeOptionId}
				aria-autocomplete="list"
				aria-controls={listboxId}
				aria-expanded={open}
				autoComplete="off"
				className="rounded border px-2 py-1 text-sm"
				id={id}
				onBlur={() => {
					blurTimer.current = setTimeout(() => setOpen(false), 120);
				}}
				onChange={(ev) => handleText(ev.target.value)}
				onFocus={() => {
					if (blurTimer.current) {
						clearTimeout(blurTimer.current);
					}
					if (candidates.length > 0) {
						setOpen(true);
					}
				}}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				role="combobox"
				value={value}
			/>
			{open ? (
				<div
					className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded border bg-popover text-sm shadow"
					id={listboxId}
					role="listbox"
				>
					{showEmptyState ? (
						<div className="px-2 py-1.5 text-muted-foreground">
							{loading ? "Searching…" : "No matches — paste lat,lng instead."}
						</div>
					) : (
						candidates.map((c, index) => (
							<button
								aria-selected={index === activeIndex}
								className={cn(
									"block w-full px-2 py-1.5 text-left hover:bg-accent",
									index === activeIndex && "bg-accent"
								)}
								id={`${id}-opt-${c.id}`}
								key={c.id}
								onClick={() => selectCandidate(c)}
								onMouseEnter={() => setActiveIndex(index)}
								role="option"
								type="button"
							>
								<span className="block font-medium">{c.formattedAddress}</span>
								<span className="block text-muted-foreground text-xs">
									{c.latitude},{c.longitude}
								</span>
							</button>
						))
					)}
				</div>
			) : null}
		</div>
	);
}
