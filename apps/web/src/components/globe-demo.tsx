"use client";

import { motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { GlobeArcDatum, GlobeConfig } from "@/components/ui/globe";
import { cn } from "@/lib/utils";

// Lazy-load so three-globe stays out of the SSR module graph — its browser
// build reads `window` at module scope, which crashes the workerd runtime.
const World = lazy(() =>
	import("@/components/ui/globe").then((m) => ({ default: m.World }))
);

const ARC_COLORS = ["#22d3ee", "#3b82f6", "#6366f1"] as const;

const BASE_ARCS = [
	{
		arcAlt: 0.28,
		endLat: -33.8688,
		endLng: 151.2093,
		order: 1,
		startLat: -37.8136,
		startLng: 144.9631,
	},
	{
		arcAlt: 0.2,
		endLat: -31.9505,
		endLng: 115.8605,
		order: 2,
		startLat: -34.9285,
		startLng: 138.6007,
	},
	{
		arcAlt: 0.24,
		endLat: -27.4698,
		endLng: 153.0251,
		order: 3,
		startLat: -33.8688,
		startLng: 151.2093,
	},
	{
		arcAlt: 0.42,
		endLat: 1.3521,
		endLng: 103.8198,
		order: 4,
		startLat: -33.8688,
		startLng: 151.2093,
	},
	{
		arcAlt: 0.46,
		endLat: 35.6762,
		endLng: 139.6503,
		order: 5,
		startLat: -37.8136,
		startLng: 144.9631,
	},
	{
		arcAlt: 0.48,
		endLat: 51.5072,
		endLng: -0.1276,
		order: 6,
		startLat: -33.8688,
		startLng: 151.2093,
	},
	{
		arcAlt: 0.52,
		endLat: 37.7749,
		endLng: -122.4194,
		order: 7,
		startLat: -37.8136,
		startLng: 144.9631,
	},
	{
		arcAlt: 0.5,
		endLat: 40.7128,
		endLng: -74.006,
		order: 8,
		startLat: -33.8688,
		startLng: 151.2093,
	},
	{
		arcAlt: 0.22,
		endLat: -34.6037,
		endLng: -58.3816,
		order: 9,
		startLat: -22.9068,
		startLng: -43.1729,
	},
	{
		arcAlt: 0.26,
		endLat: 48.8566,
		endLng: 2.3522,
		order: 10,
		startLat: 51.5072,
		startLng: -0.1276,
	},
	{
		arcAlt: 0.3,
		endLat: 52.52,
		endLng: 13.405,
		order: 11,
		startLat: 48.8566,
		startLng: 2.3522,
	},
	{
		arcAlt: 0.18,
		endLat: 31.2304,
		endLng: 121.4737,
		order: 12,
		startLat: 35.6762,
		startLng: 139.6503,
	},
] as const;

const GLOBE_CONFIG: GlobeConfig = {
	ambientLight: "#67e8f9",
	arcLength: 0.85,
	arcTime: 1200,
	atmosphereAltitude: 0.08,
	atmosphereColor: "#1e3a8a",
	autoRotate: true,
	autoRotateSpeed: 0.6,
	directionalLeftLight: "#ffffff",
	directionalTopLight: "#ffffff",
	emissive: "#062056",
	emissiveIntensity: 0.12,
	globeColor: "#062056",
	maxRings: 3,
	pointLight: "#ffffff",
	pointSize: 4,
	polygonColor: "rgba(255,255,255,0.75)",
	rings: 1,
	shininess: 0.9,
	showAtmosphere: true,
};

function GlobeFallback() {
	return (
		<div className="relative h-120 w-full">
			<div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.1),rgba(6,32,86,0.04)_50%,transparent_72%)] blur-3xl" />
			<div className="absolute inset-x-[12%] top-[14%] h-[72%] rounded-full border border-white/5 bg-white/[0.015] backdrop-blur-[2px]" />
		</div>
	);
}

interface GlobeDemoProps {
	className?: string;
	decorative?: boolean;
	globeHeightClassName?: string;
}

export function GlobeDemo({
	className,
	decorative = false,
	globeHeightClassName,
}: GlobeDemoProps = {}) {
	const [isMounted, setIsMounted] = useState(false);
	const arcs = useMemo<GlobeArcDatum[]>(() => {
		return BASE_ARCS.map((arc, index) => ({
			...arc,
			color: ARC_COLORS[index % ARC_COLORS.length] ?? ARC_COLORS[0],
		}));
	}, []);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	return (
		<div className={cn("relative w-full", className)}>
			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-linear-to-b from-transparent via-background/20 to-background" />
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className={cn(
					"relative mx-auto w-full max-w-6xl px-4",
					decorative ? "overflow-visible" : "overflow-hidden"
				)}
				initial={{ opacity: 0, y: 20 }}
				transition={{ duration: 0.8 }}
			>
				{decorative ? null : (
					<div className="mx-auto mb-8 max-w-2xl text-center">
						<h2 className="text-balance font-semibold text-foreground text-xl md:text-3xl">
							Search infrastructure that feels instantly local
						</h2>
						<p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground text-sm md:text-base">
							Locnative powers address lookup flows used across Australian
							products, with low-latency delivery and globally distributed
							clients.
						</p>
					</div>
				)}

				<div
					className={cn("relative h-120 w-full md:h-152", globeHeightClassName)}
				>
					{isMounted ? (
						<Suspense fallback={<GlobeFallback />}>
							<World data={arcs} globeConfig={GLOBE_CONFIG} />
						</Suspense>
					) : (
						<GlobeFallback />
					)}
				</div>
			</motion.div>
		</div>
	);
}

export default GlobeDemo;
