"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Marquee } from "@/components/shadcn-space/animations/marquee";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const reviews = [
	{
		id: "ts-1",
		name: "Priya Nair",
		role: "Staff Engineer",
		company: "Routora",
		body: "We wired address autocomplete and checkout validation in an afternoon—plain HTTP from our API route, no embedded map SDK to ship.",
	},
	{
		id: "ts-2",
		name: "Daniel Okafor",
		role: "Product Lead",
		company: "Saveo",
		body: "Geocoding our signups cut bad addresses to near zero. Clear errors meant we weren't guessing why a lookup failed between staging and production.",
	},
	{
		id: "ts-3",
		name: "Sofia Almeida",
		role: "Co-founder & CTO",
		company: "Parcela",
		body: "From API key to a working geocode was minutes with the SDK. We spent our time on product logic, not console setup.",
	},
	{
		id: "ts-4",
		name: "Marcus Lindqvist",
		role: "Platform Engineer",
		company: "Fleetbird",
		body: "Zones and webhooks let us geofence depots and get notified on entry without standing up our own spatial stack.",
	},
	{
		id: "ts-5",
		name: "Aisha Rahman",
		role: "Mobile Engineer",
		company: "Wayfare",
		body: "Place search feels native in the app—fast suggestions without pulling in a full maps client just to validate a venue.",
	},
	{
		id: "ts-6",
		name: "Tom Becker",
		role: "Engineering Manager",
		company: "Gridline",
		body: "Batch geocoding let us backfill millions of addresses overnight, and the pricing was something we could actually forecast.",
	},
];

const firstRow = reviews.slice(0, reviews.length / 2);
const secondRow = reviews.slice(reviews.length / 2);
const thirdRow = reviews.slice(0, reviews.length / 2);

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part.charAt(0))
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

const ReviewCard = ({
	name,
	role,
	company,
	body,
}: {
	name: string;
	role: string;
	company: string;
	body: string;
}) => {
	return (
		<Card className="border p-6 shadow-none ring-0">
			<CardContent className="flex flex-col gap-4 p-0">
				<div className="flex items-center gap-3">
					<div className="flex size-12 items-center justify-center rounded-full border border-border bg-muted font-medium text-foreground text-sm">
						{getInitials(name)}
					</div>
					<div>
						<p className="font-medium text-base">{name}</p>
						<p className="text-muted-foreground text-sm">
							{role} · {company}
						</p>
					</div>
				</div>
				<Separator />
				<p className="text-foreground text-lg">{body}</p>
			</CardContent>
		</Card>
	);
};

export default function Testimonial() {
	const sectionRef = useRef<HTMLElement>(null);
	const isInView = useInView(sectionRef, { once: true, amount: 0.1 });

	/* ---------------- variants ---------------- */

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.15,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 40 },
		visible: {
			opacity: 1,
			y: 0,
			transition: {
				duration: 0.8,
				ease: [0.21, 0.47, 0.32, 0.98] as [number, number, number, number],
			},
		},
	};

	/* ---------------- render ---------------- */

	return (
		<section className="py-10" id="testimonials" ref={sectionRef}>
			<div className="mx-auto w-full max-w-7xl px-4 lg:px-8 xl:px-16">
				<motion.div
					animate={isInView ? "visible" : "hidden"}
					className="flex flex-col gap-8 sm:gap-12"
					initial="hidden"
					variants={containerVariants}
				>
					{/* Header */}
					<div className="flex flex-col items-center justify-center gap-4">
						<motion.div variants={itemVariants}>
							<Badge
								className="h-7 px-3 py-1 font-normal text-sm"
								variant="outline"
							>
								Testimonials
							</Badge>
						</motion.div>
						<div className="flex flex-col items-center gap-3">
							<motion.h2
								className="text-center font-medium text-3xl sm:text-4xl lg:text-5xl"
								variants={itemVariants}
							>
								What teams are building with Locnative
							</motion.h2>
							<motion.p
								className="max-w-xs text-center text-lg text-muted-foreground sm:max-w-2xl sm:text-xl"
								variants={itemVariants}
							>
								Engineers and product teams shipping location features in
								production—autocomplete, geocoding, geofencing, and more.
							</motion.p>
						</div>
					</div>
					<motion.div
						className="relative flex h-full max-h-96 w-full flex-row items-center justify-center gap-6 overflow-hidden"
						variants={itemVariants}
					>
						<div className="flex flex-row items-center gap-5">
							<Marquee
								className="p-0 [--duration:20s] [--gap:1.25rem]"
								pauseOnHover
								vertical
							>
								{firstRow.map(({ id, ...review }) => (
									<ReviewCard key={id} {...review} />
								))}
							</Marquee>
							<Marquee
								className="hidden p-0 [--duration:20s] [--gap:1.25rem] sm:flex"
								pauseOnHover
								reverse
								vertical
							>
								{secondRow.map(({ id, ...review }) => (
									<ReviewCard key={id} {...review} />
								))}
							</Marquee>
							<Marquee
								className="hidden p-0 [--duration:20s] [--gap:1.25rem] lg:flex"
								pauseOnHover
								vertical
							>
								{thirdRow.map(({ id, ...review }) => (
									<ReviewCard key={id} {...review} />
								))}
							</Marquee>
						</div>
						<div className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-background" />
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-background" />
					</motion.div>
				</motion.div>
			</div>
		</section>
	);
}
