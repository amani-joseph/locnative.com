import { cn } from "@locnative/ui/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
	/** Right-aligned controls (buttons, selectors). Stack under the title on mobile. */
	actions?: ReactNode;
	className?: string;
	description?: ReactNode;
	title: ReactNode;
}

/** Standard title block for every dashboard route. */
export function PageHeader({
	actions,
	className,
	description,
	title,
}: PageHeaderProps) {
	return (
		<header
			className={cn(
				"flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
				className
			)}
		>
			<div className="min-w-0 space-y-1">
				<h1 className="text-balance font-semibold text-2xl tracking-tight">
					{title}
				</h1>
				{description ? (
					<p className="max-w-2xl text-pretty text-muted-foreground text-sm">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			) : null}
		</header>
	);
}
