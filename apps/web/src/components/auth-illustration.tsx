import { cn } from "@locnative/ui/lib/utils";
import { useCallback, useEffect, useState } from "react";

type Variant = "suburb" | "topographic";

const VARIANTS: readonly Variant[] = ["suburb", "topographic"] as const;

const SOURCES: Record<Variant, string> = {
	suburb: "/illustrations/auth-suburb.webp",
	topographic: "/illustrations/auth-topographic.webp",
};

const SuburbLabels = () => (
	<>
		<p className="absolute top-5 left-6 text-[11px] text-foreground/70 tracking-wide">
			-33.8688° S · 151.2093° E
		</p>
		<div className="absolute right-6 bottom-5 flex flex-col items-end gap-1.5 text-[11px] text-foreground/70 tracking-wide">
			<span className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-background/70 px-2.5 py-1.5 text-primary">
				<span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
				GEOFENCE · ENTER
			</span>
			<span>device_8f2 · 2.4 km · 6 min</span>
		</div>
	</>
);

const TopographicLabels = () => (
	<>
		<p className="absolute top-5 left-6 text-[11px] text-foreground/70 tracking-wide">
			ELEV · 0–420 M
		</p>
		<p className="absolute right-6 bottom-5 text-right text-[11px] text-foreground/70 tracking-wide">
			-33.8688° S
			<br />
			151.2093° E
		</p>
	</>
);

/**
 * Static illustration beside the auth forms. One of two scenes is picked per
 * visit on the client (picking during SSR would cause a hydration mismatch),
 * then faded in once loaded.
 */
export function AuthIllustration() {
	const [variant, setVariant] = useState<Variant | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		setVariant(
			VARIANTS[Math.floor(Math.random() * VARIANTS.length)] ?? "suburb"
		);
	}, []);

	// Reveal on the image's own load/error events. Do not use img.decode():
	// it can stay pending indefinitely, which left the scene invisible.
	const revealWhenLoaded = useCallback((node: HTMLImageElement | null) => {
		if (!node) {
			return;
		}
		if (node.complete) {
			setLoaded(true);
			return;
		}
		const reveal = () => setLoaded(true);
		node.addEventListener("load", reveal, { once: true });
		node.addEventListener("error", reveal, { once: true });
	}, []);

	return (
		<div aria-hidden="true" className="absolute inset-0 bg-[#0b0b10]">
			{variant ? (
				<div
					className={cn(
						"absolute inset-0 opacity-0 motion-safe:transition-opacity motion-safe:duration-700",
						loaded && "opacity-100"
					)}
				>
					<img
						alt=""
						className="absolute inset-0 size-full object-cover"
						decoding="async"
						height={1290}
						ref={revealWhenLoaded}
						src={SOURCES[variant]}
						width={1800}
					/>
					{variant === "suburb" ? <SuburbLabels /> : <TopographicLabels />}
				</div>
			) : null}
		</div>
	);
}
