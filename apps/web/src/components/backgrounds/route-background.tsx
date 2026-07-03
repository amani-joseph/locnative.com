import { cn } from "@locnative/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Decorative background layer host. Enforces the project's background contract
 * (see docs/design/background-effects-direction.md): a full-bleed, clipped,
 * non-interactive, screen-reader-invisible layer that sits behind content.
 *
 * Mount it as the first child of a `relative isolate overflow-hidden` section,
 * with the real content in a sibling `relative z-10` container. Compose the
 * actual effect layers (base wash, texture, motion, scrim) as children.
 */
export function RouteBackground({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 z-0 select-none overflow-hidden",
				className
			)}
		>
			{children}
		</div>
	);
}
