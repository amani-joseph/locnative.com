import type { ReactNode } from "react";
import { AuthIllustration } from "@/components/auth-illustration";

/** Hairline that extends a framed row's bottom border to both viewport edges. */
const ROW_RULE =
	"relative mx-auto w-full max-w-7xl border-border border-x border-b before:absolute before:right-full before:-bottom-px before:h-px before:w-screen before:bg-border after:absolute after:-bottom-px after:left-full after:h-px after:w-screen after:bg-border";

interface AuthFrameProps {
	children: ReactNode;
	/** Small line above the title. */
	eyebrow?: string;
	title: ReactNode;
}

/**
 * Shared editorial frame for every auth screen: ruled header row with the
 * page title, then illustration (md+) beside the form column. Spacer rows
 * grow equally so the frame sits vertically centred on tall viewports.
 */
export function AuthFrame({
	children,
	eyebrow = "Welcome to Locnative",
	title,
}: AuthFrameProps) {
	return (
		<section className="flex min-h-svh flex-col overflow-hidden bg-background font-sans selection:bg-primary selection:text-primary-foreground">
			<div
				aria-hidden
				className="mx-auto w-full max-w-7xl flex-1 border-border border-x"
			/>

			<div className={ROW_RULE}>
				<div className="flex flex-col gap-3 px-6 py-10 sm:px-8 md:gap-4 md:py-16">
					<div className="flex items-center gap-1.5">
						<span aria-hidden className="size-1.5 rounded-full bg-primary" />
						<p className="text-muted-foreground text-sm md:text-base">
							{eyebrow}
						</p>
					</div>
					<h1 className="text-balance font-semibold text-4xl text-foreground tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
						{title}
					</h1>
				</div>
			</div>

			<div className={ROW_RULE}>
				<div className="relative grid grid-cols-1 overflow-hidden md:grid-cols-12">
					<div className="relative hidden overflow-hidden md:col-span-7 md:block md:min-h-[420px]">
						<AuthIllustration />
					</div>
					<div className="flex flex-col justify-center px-6 py-10 sm:px-8 md:col-span-5">
						<div className="mx-auto flex w-full max-w-sm flex-col gap-6">
							{children}
						</div>
					</div>
				</div>
			</div>

			<div
				aria-hidden
				className="mx-auto w-full max-w-7xl flex-1 border-border border-x py-8 md:py-16"
			/>
		</section>
	);
}
