"use client";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, MapPin, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type GlobeCoordinate,
	HeroGlobe,
} from "@/components/shadcn-space/blocks/hero-15/hero-globe";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DemoSuggestion {
	label: string;
	meta: string;
}

interface DemoScenario {
	/** Coordinates of the selected (correct) address — drives the globe. */
	coordinate: GlobeCoordinate;
	query: string;
	selectedIndex: number;
	suggestions: readonly DemoSuggestion[];
}

type DemoPhase = "typing" | "matching" | "selecting" | "resting" | "clearing";

const DEMO_SCENARIOS = [
	{
		query: "1600 Amp",
		selectedIndex: 1,
		suggestions: [
			{
				label: "1600 Amber Grove Dr, Sacramento, CA 95834",
				meta: "Looks close, but different street.",
			},
			{
				label: "1600 Amphitheatre Pkwy, Mountain View, CA 94043",
				meta: "Exact rooftop match for a real destination.",
			},
			{
				label: "1600 Amsterdam Ave, New York, NY 10031",
				meta: "Similar prefix, wrong city and route.",
			},
		],
		coordinate: { lat: 37.422, lng: -122.0841 },
	},
	{
		query: "350 Fifth",
		selectedIndex: 0,
		suggestions: [
			{
				label: "350 Fifth Ave, New York, NY 10118",
				meta: "Canonical building address with postcode.",
			},
			{
				label: "350 Fifth St, Marysville, OH 43040",
				meta: "Valid street, but clearly the wrong locality.",
			},
			{
				label: "350 Fifth Avenue N, Seattle, WA 98109",
				meta: "Another plausible option from a different state.",
			},
		],
		coordinate: { lat: 40.7484, lng: -73.9857 },
	},
	{
		query: "10 Down",
		selectedIndex: 1,
		suggestions: [
			{
				label: "10 Downes St, Redan VIC 3350",
				meta: "A nearby typo trap your users should avoid.",
			},
			{
				label: "10 Downing St, London SW1A 2AA",
				meta: "Precise address selected from confident suggestions.",
			},
			{
				label: "10 Downshire Hill, London NW3 1NR",
				meta: "Looks right at a glance, but isn't the same place.",
			},
		],
		coordinate: { lat: 51.5034, lng: -0.1276 },
	},
] as const satisfies readonly DemoScenario[];

const DEMO_MARKERS: readonly GlobeCoordinate[] = DEMO_SCENARIOS.map(
	(scenario) => scenario.coordinate
);

const TYPE_MS = 52;
const DELETE_MS = 28;
const HIGHLIGHT_MS = 360;
const SUGGESTIONS_VISIBLE_AT = 3;
const PANEL_SETTLE_MS = 260;
const PAUSE_SELECTED_MS = 1200;
const PAUSE_FULL_MS = 900;
const PAUSE_EMPTY_MS = 500;

const PHASE_LABELS: Record<DemoPhase, string> = {
	typing: "Typing query",
	matching: "Showing matches",
	selecting: "Selecting result",
	resting: "Correct address captured",
	clearing: "Resetting demo",
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function eraseDemoAddress(
	full: string,
	setValue: (v: string) => void,
	isCancelled: () => boolean
): Promise<void> {
	for (let c = full.length; c >= 0 && !isCancelled(); c -= 1) {
		setValue(full.slice(0, c));
		await sleep(DELETE_MS);
	}
}

function renderSuggestionLabel(label: string, query: string) {
	const trimmedQuery = query.trim();

	if (!trimmedQuery) {
		return label;
	}

	const lowerLabel = label.toLowerCase();
	const lowerQuery = trimmedQuery.toLowerCase();
	const matchIndex = lowerLabel.indexOf(lowerQuery);

	if (matchIndex === -1) {
		return label;
	}

	const before = label.slice(0, matchIndex);
	const match = label.slice(matchIndex, matchIndex + trimmedQuery.length);
	const after = label.slice(matchIndex + trimmedQuery.length);

	return (
		<>
			{before}
			<span className="font-medium text-foreground">{match}</span>
			{after}
		</>
	);
}

function getPhaseBadgeClasses(hasSelection: boolean): string {
	if (hasSelection) {
		return "border-emerald-400/35 bg-emerald-400/10 text-emerald-300";
	}

	return "border-border/80 bg-background/75 text-muted-foreground";
}

function getSuggestionRowClasses(
	isSelected: boolean,
	isHighlighted: boolean
): string {
	if (isSelected) {
		return "border-emerald-400/35 bg-emerald-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
	}

	if (isHighlighted) {
		return "border-white/15 bg-white/6";
	}

	return "border-transparent bg-transparent";
}

function getSuggestionIconClasses(
	isSelected: boolean,
	isHighlighted: boolean
): string {
	if (isSelected) {
		return "border-emerald-400/35 bg-emerald-400/12 text-emerald-300";
	}

	if (isHighlighted) {
		return "border-white/15 bg-white/8 text-foreground";
	}

	return "border-border/70 bg-background/60 text-muted-foreground";
}

function getSuggestionPillClasses(
	isSelected: boolean,
	isHighlighted: boolean
): string {
	if (isSelected) {
		return "border-emerald-400/35 bg-emerald-400/10 text-emerald-300";
	}

	if (isHighlighted) {
		return "border-white/15 bg-white/8 text-foreground";
	}

	return "border-transparent bg-transparent text-muted-foreground";
}

function getSuggestionPillLabel(
	isSelected: boolean,
	isHighlighted: boolean
): string {
	if (isSelected) {
		return "Selected";
	}

	if (isHighlighted) {
		return "Choose";
	}

	return "Option";
}

interface DemoSuggestionRowProps {
	highlightedIndex: number | null;
	index: number;
	query: string;
	reduceMotion: boolean;
	selectedIndex: number | null;
	suggestion: DemoSuggestion;
}

function DemoSuggestionRow({
	index,
	query,
	selectedIndex,
	highlightedIndex,
	reduceMotion,
	suggestion,
}: DemoSuggestionRowProps) {
	const isHighlighted = highlightedIndex === index;
	const isSelected = selectedIndex === index;
	const rowClasses = getSuggestionRowClasses(isSelected, isHighlighted);
	const iconClasses = getSuggestionIconClasses(isSelected, isHighlighted);
	const pillClasses = getSuggestionPillClasses(isSelected, isHighlighted);
	const pillLabel = getSuggestionPillLabel(isSelected, isHighlighted);

	return (
		<motion.div
			animate={{
				opacity: 1,
				scale: isSelected ? 1.01 : 1,
				x: isSelected ? 4 : 0,
			}}
			className={cn(
				"items-start gap-3 rounded-[1.15rem] border px-2.5 py-2 transition-colors md:px-3.5",
				index === 2 ? "hidden md:flex" : "flex",
				rowClasses
			)}
			initial={reduceMotion ? false : { opacity: 0, y: 10 }}
			transition={{
				duration: reduceMotion ? 0 : 0.18,
				ease: [0.21, 0.47, 0.32, 0.98],
			}}
		>
			<div
				className={cn(
					"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors md:size-8",
					iconClasses
				)}
			>
				{isSelected ? (
					<Check className="size-4" />
				) : (
					<MapPin className="size-4" />
				)}
			</div>

			<div className="min-w-0 flex-1">
				<p className="truncate text-[13px] text-foreground md:text-sm">
					{renderSuggestionLabel(suggestion.label, query)}
				</p>
				<p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground md:text-xs">
					{suggestion.meta}
				</p>
			</div>

			<div className="pt-0.5">
				<div
					className={cn(
						"rounded-full border px-2 py-1 font-medium text-[9px] uppercase tracking-[0.18em] transition-colors md:text-[10px]",
						pillClasses
					)}
				>
					{pillLabel}
				</div>
			</div>
		</motion.div>
	);
}

interface DemoSuggestionsPanelProps {
	highlightedIndex: number | null;
	query: string;
	reduceMotion: boolean;
	scenario: DemoScenario;
	selectedIndex: number | null;
	showPanel: boolean;
}

function DemoSuggestionsPanel({
	highlightedIndex,
	query,
	reduceMotion,
	scenario,
	selectedIndex,
	showPanel,
}: DemoSuggestionsPanelProps) {
	if (!showPanel) {
		return null;
	}

	// This floating result chip is a deliberately dark, emerald-accented popover
	// (mirrors the navbar mobile menu). The `dark` class scopes it as a dark
	// island so its token-based children and white glass overlays render
	// correctly in both light and dark themes.
	return (
		<motion.div
			animate={{ opacity: 1, y: 0, scale: 1 }}
			className="dark overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.82))] p-2.5 shadow-[0_34px_90px_-48px_rgba(0,0,0,1)] backdrop-blur-xl"
			exit={{ opacity: 0, y: -8, scale: 0.985 }}
			initial={{ opacity: 0, y: -10, scale: 0.985 }}
			transition={{
				duration: reduceMotion ? 0 : 0.22,
				ease: [0.21, 0.47, 0.32, 0.98],
			}}
		>
			<div className="flex items-center justify-between px-2.5 pt-0.5 pb-2">
				<div className="flex items-center gap-2">
					<div className="size-1.5 rounded-full bg-emerald-300/80" />
					<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
						Possible addresses
					</p>
				</div>
				<div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-emerald-300">
					Exact match confidence
				</div>
			</div>

			<div className="space-y-1">
				{scenario.suggestions.map((suggestion, index) => (
					<DemoSuggestionRow
						highlightedIndex={highlightedIndex}
						index={index}
						key={`${scenario.query}-${suggestion.label}`}
						query={query}
						reduceMotion={reduceMotion}
						selectedIndex={selectedIndex}
						suggestion={suggestion}
					/>
				))}
			</div>

			<div className="mt-2 flex items-center justify-center gap-1.5 border-white/5 border-t px-2.5 pt-2">
				<MapPin className="size-3 text-emerald-300/70" />
				<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
					Powered by <span className="text-foreground">Locnative</span>
				</p>
			</div>
		</motion.div>
	);
}

interface PlayDemoScenarioOptions {
	isCancelled: () => boolean;
	onResolve: (coordinate: GlobeCoordinate) => void;
	scenario: DemoScenario;
	scenarioIndex: number;
	setHighlightedIndex: (value: number | null) => void;
	setIsPanelOpen: (value: boolean) => void;
	setPhase: (value: DemoPhase) => void;
	setScenarioIndex: (value: number) => void;
	setSelectedIndex: (value: number | null) => void;
	setValue: (value: string) => void;
}

async function playDemoScenario({
	isCancelled,
	onResolve,
	scenario,
	scenarioIndex,
	setHighlightedIndex,
	setIsPanelOpen,
	setPhase,
	setScenarioIndex,
	setSelectedIndex,
	setValue,
}: PlayDemoScenarioOptions): Promise<void> {
	setScenarioIndex(scenarioIndex);
	setValue("");
	setIsPanelOpen(false);
	setHighlightedIndex(null);
	setSelectedIndex(null);
	setPhase("typing");
	await sleep(PAUSE_EMPTY_MS);

	for (let c = 0; c <= scenario.query.length && !isCancelled(); c += 1) {
		setValue(scenario.query.slice(0, c));
		if (c >= SUGGESTIONS_VISIBLE_AT) {
			setIsPanelOpen(true);
		}
		await sleep(TYPE_MS);
	}

	if (isCancelled()) {
		return;
	}

	setIsPanelOpen(true);
	setPhase("matching");
	await sleep(PANEL_SETTLE_MS);

	for (
		let suggestionIndex = 0;
		suggestionIndex <= scenario.selectedIndex && !isCancelled();
		suggestionIndex += 1
	) {
		setHighlightedIndex(suggestionIndex);
		await sleep(HIGHLIGHT_MS);
	}

	if (isCancelled()) {
		return;
	}

	const selectedSuggestion = scenario.suggestions[scenario.selectedIndex];
	setPhase("selecting");
	setHighlightedIndex(scenario.selectedIndex);
	setSelectedIndex(scenario.selectedIndex);
	setValue(selectedSuggestion.label);
	onResolve(scenario.coordinate);
	await sleep(PAUSE_SELECTED_MS);

	if (isCancelled()) {
		return;
	}

	setPhase("resting");
	await sleep(PAUSE_FULL_MS);
	setIsPanelOpen(false);
	setPhase("clearing");
	await eraseDemoAddress(selectedSuggestion.label, setValue, isCancelled);

	if (isCancelled()) {
		return;
	}

	setHighlightedIndex(null);
	setSelectedIndex(null);
}

interface AddressDemoInputProps {
	onResolve: (coordinate: GlobeCoordinate) => void;
}

function AddressDemoInput({ onResolve }: AddressDemoInputProps) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [value, setValue] = useState("");
	const [scenarioIndex, setScenarioIndex] = useState(0);
	const [isPanelOpen, setIsPanelOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [phase, setPhase] = useState<DemoPhase>("typing");

	// Held in a ref so changing the callback identity never restarts the loop.
	const onResolveRef = useRef(onResolve);
	useEffect(() => {
		onResolveRef.current = onResolve;
	}, [onResolve]);

	useEffect(() => {
		if (shouldReduceMotion) {
			// No animation loop; surface the static scenario's location once.
			onResolveRef.current(DEMO_SCENARIOS[0].coordinate);
			return;
		}

		let cancelled = false;
		const isCancelled = () => cancelled;
		let nextScenarioIndex = 0;

		const task = async () => {
			while (!isCancelled()) {
				const currentScenarioIndex = nextScenarioIndex % DEMO_SCENARIOS.length;
				const scenario = DEMO_SCENARIOS[currentScenarioIndex];

				await playDemoScenario({
					isCancelled,
					onResolve: (coordinate) => onResolveRef.current(coordinate),
					scenario,
					scenarioIndex: currentScenarioIndex,
					setHighlightedIndex,
					setIsPanelOpen,
					setPhase,
					setScenarioIndex,
					setSelectedIndex,
					setValue,
				});

				if (isCancelled()) {
					break;
				}

				nextScenarioIndex += 1;
			}
		};

		task().catch(() => {
			// demo loop stopped on unmount; ignore
		});

		return () => {
			cancelled = true;
		};
	}, [shouldReduceMotion]);

	const currentScenario = DEMO_SCENARIOS[scenarioIndex];
	const staticScenario = DEMO_SCENARIOS[0];
	const displayScenario = shouldReduceMotion ? staticScenario : currentScenario;
	const displaySelectedIndex = shouldReduceMotion
		? staticScenario.selectedIndex
		: selectedIndex;
	const displayHighlightedIndex = shouldReduceMotion
		? staticScenario.selectedIndex
		: highlightedIndex;
	const displayValue = shouldReduceMotion
		? staticScenario.suggestions[staticScenario.selectedIndex].label
		: value;
	const displayQuery =
		shouldReduceMotion || displaySelectedIndex !== null
			? displayScenario.query
			: value;
	const showPanel =
		shouldReduceMotion || isPanelOpen || displaySelectedIndex !== null;
	const currentPhase: DemoPhase = shouldReduceMotion ? "resting" : phase;

	return (
		<div aria-hidden="true" className="mx-auto w-full max-w-xl text-left">
			<div className="relative h-[21.25rem] overflow-visible rounded-[2rem] border border-foreground/10 bg-background/70 p-2.5 shadow-[0_28px_90px_-52px_rgba(0,0,0,1)] ring-1 ring-foreground/5 backdrop-blur-xl md:h-[25.25rem] md:p-4">
				<div className="mb-3 flex items-center justify-between gap-3 px-1">
					<div className="flex items-center gap-2">
						<div className="size-1.5 rounded-full bg-emerald-300" />
						<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
							Live address search
						</p>
					</div>
					<div
						className={cn(
							"rounded-full border px-2.5 py-1 font-medium text-[10px] uppercase tracking-[0.18em] transition-colors",
							getPhaseBadgeClasses(displaySelectedIndex !== null)
						)}
					>
						{PHASE_LABELS[currentPhase]}
					</div>
				</div>

				<div className="relative">
					<Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						aria-label="Example address autocomplete"
						className="h-12 rounded-[1.35rem] border-foreground/15 bg-background/80 pr-4 pl-11 text-left text-sm shadow-[0_18px_40px_-30px_rgba(0,0,0,0.95)] backdrop-blur-sm md:h-13 md:text-[15px]"
						readOnly
						tabIndex={-1}
						value={displayValue}
					/>
				</div>

				<div className="relative">
					<AnimatePresence initial={false}>
						{showPanel ? (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className="absolute inset-x-0 top-3"
								exit={{ opacity: 0, y: -6 }}
								initial={{ opacity: 0, y: -8 }}
								transition={{
									duration: shouldReduceMotion ? 0 : 0.18,
									ease: [0.21, 0.47, 0.32, 0.98],
								}}
							>
								<DemoSuggestionsPanel
									highlightedIndex={displayHighlightedIndex}
									query={displayQuery}
									reduceMotion={shouldReduceMotion}
									scenario={displayScenario}
									selectedIndex={displaySelectedIndex}
									showPanel={showPanel}
								/>
							</motion.div>
						) : null}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}

const HeroSection = () => {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [activeLocation, setActiveLocation] = useState<GlobeCoordinate | null>(
		null
	);
	const handleResolve = useCallback((coordinate: GlobeCoordinate) => {
		setActiveLocation(coordinate);
	}, []);

	// Entrance animates position only (opacity stays 1) so the server and the
	// client's first render produce identical, visible markup — no hydration
	// mismatch and no blank flash before hydration. Driven on mount instead of
	// useInView (a client-only hook) since the hero is always above the fold.
	const containerVariants = {
		hidden: {},
		visible: {
			transition: {
				staggerChildren: 0.12,
				delayChildren: 0.05,
			},
		},
	};

	const itemVariants = {
		hidden: { y: 16 },
		visible: {
			y: 0,
			transition: {
				duration: 0.7,
				ease: [0.21, 0.47, 0.32, 0.98] as [number, number, number, number],
			},
		},
	};

	const h1Variants = {
		hidden: {},
		visible: {
			transition: {
				staggerChildren: 0.015,
			},
		},
	};

	const charVariants = {
		hidden: { y: 8 },
		visible: {
			y: 0,
			transition: {
				duration: 0.4,
			},
		},
	};

	return (
		<section className="relative overflow-hidden" id="top">
			{/* Variant 03 backdrop — dark radial glow toward the globe + radar sweep. */}
			<div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_42%,rgba(10,28,24,0.75),transparent_68%)]" />
				<motion.div
					animate={shouldReduceMotion ? undefined : { rotate: 360 }}
					className="absolute top-[42%] left-[80%] hidden h-[1200px] w-[1200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_180deg,rgba(52,211,153,0.12),transparent_24%)] lg:block"
					transition={{
						duration: 9,
						ease: "linear",
						repeat: Number.POSITIVE_INFINITY,
					}}
				/>
				<div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent via-background/30 to-background" />
			</div>

			<motion.div
				animate="visible"
				className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-10 md:py-14 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-20 xl:px-16"
				initial="hidden"
				variants={containerVariants}
			>
				{/* Left column — copy, CTAs, and the live address-search demo. */}
				<div className="flex flex-col items-start gap-5 text-left">
					<motion.div
						className="flex w-fit items-center gap-1.5 rounded-full border border-emerald-300/30 bg-background/60 px-3 py-1 backdrop-blur-sm"
						variants={itemVariants}
					>
						<div className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]" />
						<p className="font-normal text-foreground text-sm">
							Location &amp; geocoding API
						</p>
						<ArrowRight className="text-foreground" size={16} />
					</motion.div>

					<motion.h1
						className="max-w-xl text-wrap text-balance font-semibold text-2xl text-foreground leading-[1.05] tracking-tight sm:text-4xl md:text-3xl"
						variants={h1Variants}
					>
						{"Production-ready APIs for every location workflows"
							.split("")
							.map((char, i, chars) => (
								<motion.span
									key={`h1-${chars.slice(0, i + 1).join("")}`}
									variants={charVariants}
								>
									{char}
								</motion.span>
							))}
					</motion.h1>

					{/*<motion.p
						className="max-w-lg text-pretty font-normal text-base text-muted-foreground md:text-lg"
						variants={itemVariants}
					>
						Address autocomplete, geocoding, geofencing, routing, device
						tracking, and webhooks — ship location features without the
						complexity.
					</motion.p>*/}

					<motion.div
						className="flex flex-wrap gap-2 pt-1"
						variants={itemVariants}
					>
						<Link
							className={cn(
								buttonVariants({ variant: "default" }),
								"h-auto cursor-pointer rounded-full px-5 py-2.5 font-semibold shadow-[0_8px_30px_-10px_rgba(52,211,153,0.6)] md:px-6 md:py-3.5"
							)}
							to="/sign-up"
						>
							Get API access
						</Link>
						<Link
							className={cn(
								buttonVariants({ variant: "outline" }),
								"inline-flex h-auto cursor-pointer items-center gap-2 rounded-full border-foreground/20 bg-foreground/5 px-5 py-2.5 font-medium text-foreground transition-colors hover:bg-foreground/10 md:px-6 md:py-3.5"
							)}
							to="/docs"
						>
							Read the docs
							<ArrowRight className="text-foreground" size={16} />
						</Link>
					</motion.div>

					<motion.p
						className="text-muted-foreground text-sm"
						variants={itemVariants}
					>
						Start free — 15,000 requests every month, no credit card required.
					</motion.p>

					<motion.div className="w-full pt-2" variants={itemVariants}>
						<AddressDemoInput onResolve={handleResolve} />
					</motion.div>
				</div>

				{/* Right column — interactive globe that flies to the resolved address. */}
				<motion.div
					className="relative order-first w-full lg:order-none"
					variants={itemVariants}
				>
					<div className="absolute top-2 right-2 z-10 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-[rgba(5,12,10,0.7)] px-3 py-1.5 text-emerald-200/90 text-xs backdrop-blur-sm">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
						LIVE · drag to spin
					</div>
					<HeroGlobe
						className="mx-auto w-full max-w-md sm:max-w-lg lg:w-[141%] lg:max-w-none lg:translate-x-[4%] lg:translate-y-[7%]"
						markers={DEMO_MARKERS}
						reduceMotion={shouldReduceMotion}
						target={activeLocation}
					/>
				</motion.div>
			</motion.div>
		</section>
	);
};

export default HeroSection;
