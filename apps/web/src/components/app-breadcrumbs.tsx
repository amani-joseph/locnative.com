import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@locnative/ui/components/breadcrumb";
import type { ReactNode } from "react";

/** Current page segment shown in the header — pass a nav item or `{ title, icon? }`. */
export interface AppBreadcrumbPage {
	icon?: ReactNode;
	title: string;
}

export function AppBreadcrumbs({ page }: { page?: AppBreadcrumbPage | null }) {
	if (!page?.title) {
		return null;
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbPage className="flex items-center gap-2 [&>svg]:size-3.5">
						{page.icon}
						{page.title}
					</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
