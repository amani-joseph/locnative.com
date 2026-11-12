import { cn } from "@locnative/ui/lib/utils";
import type { ReactNode } from "react";

interface EmptyStateProps {
	/** Buttons/links shown under the copy. */
	actions?: ReactNode;
	className?: string;
	description?: ReactNode;
	icon: ReactNode;
	title: ReactNode;
}

/**
 * Shared empty state: brand-tinted icon well over a faint radial glow, then
 * title, copy and optional actions. Use inside a Card or on its own.
 */
export function EmptyState({
	actions,
	className,
	description,
	icon,
	title,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-xl border border-dashed px-6 py-12 text-center",
				"before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-40 before:bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_70%)] before:opacity-[0.07]",
				className
			)}
		>
			<div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 [&_svg]:size-6">
				{icon}
			</div>
			<div className="space-y-1">
				<p className="font-semibold text-base">{title}</p>
				{description ? (
					<p className="mx-auto max-w-sm text-pretty text-muted-foreground text-sm">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex flex-wrap justify-center gap-3">{actions}</div>
			) : null}
		</div>
	);
}
