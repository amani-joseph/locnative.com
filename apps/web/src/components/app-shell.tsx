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
			<SidebarInset>
				<AppHeader />
				{/* Skip-link target + primary landmark. tabIndex=-1 lets the
				    "Skip to main content" link move focus here. */}
				<main
					className={cn(
						"flex flex-1 flex-col p-4 md:p-6",
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
