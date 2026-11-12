import {
	SidebarInset,
	SidebarProvider,
} from "@locnative/ui/components/sidebar";
import { cn } from "@locnative/ui/lib/utils";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<SidebarProvider className={cn("[--app-wrapper-max-width:80rem]")}>
			<AppSidebar />
			{/* Faint brand glow behind the top of every page. Decorative only. */}
			<SidebarInset className="relative isolate before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-72 before:bg-[radial-gradient(60%_100%_at_50%_0%,var(--color-primary)_0%,transparent_100%)] before:opacity-[0.06] dark:before:opacity-[0.08]">
				<AppHeader />
				{/* Skip-link target + primary landmark. tabIndex=-1 lets the
				    "Skip to main content" link move focus here. */}
				<main
					className={cn(
						"flex min-w-0 flex-1 flex-col p-4 pb-24 md:p-6",
						"mx-auto w-full max-w-(--app-wrapper-max-width)"
					)}
					id="main-content"
					tabIndex={-1}
				>
					{children}
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
