"use client";
import {
	Atom,
	Component,
	FileJson,
	Package,
	Terminal,
	Webhook,
} from "lucide-react";
import { motion } from "motion/react";
import ParticleSphereAnimation from "@/components/shadcn-space/blocks/integration-01/particalsphear";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Integration = () => {
	return (
		<section
			className="dark flex flex-col items-center justify-center overflow-hidden bg-background pt-10"
			id="why"
		>
			<div className="relative z-20 mx-auto max-w-7xl px-4 lg:px-8 xl:px-16">
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
					initial={{ opacity: 0, y: -20 }}
					transition={{ duration: 0.8, ease: "easeOut" }}
				>
					<Badge
						className="h-auto rounded-full px-3 py-1 font-normal text-sm"
						variant={"outline"}
					>
						Built to integrate
					</Badge>
					<div className="flex flex-col items-center gap-4">
						<h2 className="font-semibold text-3xl text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
							Every location workflow, one API
						</h2>
						<p className="max-w-xl font-normal text-base text-muted-foreground">
							Address autocomplete, geocoding, geofencing, routing, device
							tracking, and webhooks — ship location features without the
							complexity. Call Locnative with plain REST from your backend or
							edge, no map SDK required.
						</p>
					</div>
					<a
						className={cn(
							buttonVariants({ variant: "default" }),
							"h-auto cursor-pointer rounded-full px-5 py-2.5 font-medium text-sm"
						)}
						href="#features"
					>
						See what you get
					</a>
				</motion.div>
			</div>
			<div className="relative flex h-110 w-full justify-center overflow-hidden md:h-160">
				<div className="pointer-events-none absolute bottom-0 left-1/2 aspect-square w-75 -translate-x-1/2 translate-y-1/2 md:w-145">
					<ParticleSphereAnimation />
				</div>
				{/* Responsive Rings with Icons — animated along orbit */}
				<style>{`
          @keyframes orbit-cw {
            from { transform: rotate(var(--start-angle)) }
            to   { transform: rotate(calc(var(--start-angle) + 360deg)) }
          }
          @keyframes orbit-ccw {
            from { transform: rotate(var(--start-angle)) }
            to   { transform: rotate(calc(var(--start-angle) - 360deg)) }
          }
          @keyframes counter-cw {
            from { transform: rotate(var(--counter-offset, 0deg)) }
            to   { transform: rotate(calc(var(--counter-offset, 0deg) - 360deg)) }
          }
          @keyframes counter-ccw {
            from { transform: rotate(var(--counter-offset, 0deg)) }
            to   { transform: rotate(calc(var(--counter-offset, 0deg) + 360deg)) }
          }
        `}</style>
				{[
					{
						size: "w-110 h-110 md:w-180 md:h-180",
						duration: 18,
						icons: [
							{ icon: Terminal, alt: "REST API", angle: -60 },
							{ icon: Package, alt: "@locnative/sdk", angle: 0 },
							{ icon: Webhook, alt: "Webhooks", angle: 60 },
						],
					},
					{
						size: "w-150 h-150 md:w-220 md:h-220",
						duration: 24,
						icons: [
							{ icon: Atom, alt: "React UI", angle: 0 },
							{ icon: Component, alt: "Vue UI", angle: -90 },
						],
					},
					{
						size: "w-180 h-180 md:w-265 md:h-265",
						duration: 30,
						icons: [
							{ icon: FileJson, alt: "OpenAPI", angle: -60 },
							{ icon: Terminal, alt: "curl", angle: 0 },
							{ icon: Package, alt: "npm", angle: 60 },
						],
					},
				].map((orbit, orbitIndex) => {
					// Odd orbits go clockwise, even go counter-clockwise
					const isCW = orbitIndex % 2 === 0;
					const orbitAnim = isCW ? "orbit-cw" : "orbit-ccw";
					const counterAnim = isCW ? "counter-cw" : "counter-ccw";

					// Build full icon list: original angles + mirrored (angle + 180) duplicates
					const allIcons = [
						...orbit.icons,
						...orbit.icons.map((ic) => ({
							...ic,
							angle: ic.angle + 180,
							alt: `${ic.alt}-mirror`,
						})),
					];

					return (
						<div
							className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-border ${orbit.size}`}
							key={orbit.size}
						>
							{allIcons.map((iconData) => (
								<div
									className="absolute top-0 left-1/2 -ml-8 flex h-1/2 origin-bottom flex-col items-center justify-start"
									key={`${iconData.alt}-${iconData.angle}`}
									style={
										{
											"--start-angle": `${iconData.angle}deg`,
											animation: `${orbitAnim} ${orbit.duration}s linear infinite`,
										} as React.CSSProperties
									}
								>
									{/* Counter-rotate so the icon stays upright */}
									<div
										className="relative z-10 -mt-8 rounded-full border border-border bg-background p-3 sm:p-4"
										style={
											{
												"--counter-offset": `${-iconData.angle}deg`,
												animation: `${counterAnim} ${orbit.duration}s linear infinite`,
											} as React.CSSProperties
										}
									>
										<iconData.icon
											aria-label={iconData.alt}
											className="h-6 w-6 text-foreground md:h-8 md:w-8"
										/>
									</div>
								</div>
							))}
						</div>
					);
				})}
			</div>
		</section>
	);
};

export default Integration;
