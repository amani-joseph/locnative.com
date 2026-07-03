"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@locnative/ui/components/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@locnative/ui/components/sidebar";
import { useRouterState } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import type { SidebarNavGroup } from "@/components/app-shared";
import { sidebarNavRender } from "@/components/sidebar-nav-link";
import { navItemMatchesPath } from "@/lib/nav-item-matches-path";

export function NavGroup({ label, items }: SidebarNavGroup) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) => {
					const itemActive = navItemMatchesPath(pathname, item.path);
					const subActive = item.subItems?.some((sub) =>
						navItemMatchesPath(pathname, sub.path)
					);
					return (
						<Collapsible
							className="group/collapsible"
							defaultOpen={itemActive || !!subActive}
							key={item.title}
							render={<SidebarMenuItem />}
						>
							{item.subItems?.length ? (
								<>
									<CollapsibleTrigger
										render={<SidebarMenuButton isActive={itemActive} />}
									>
										{item.icon}
										<span>{item.title}</span>
										<ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
									</CollapsibleTrigger>
									<CollapsibleContent>
										<SidebarMenuSub>
											{item.subItems?.map((subItem) => (
												<SidebarMenuSubItem key={subItem.title}>
													<SidebarMenuSubButton
														isActive={navItemMatchesPath(
															pathname,
															subItem.path
														)}
														render={sidebarNavRender(subItem.path)}
													>
														{subItem.icon}
														<span>{subItem.title}</span>
													</SidebarMenuSubButton>
												</SidebarMenuSubItem>
											))}
										</SidebarMenuSub>
									</CollapsibleContent>
								</>
							) : (
								<SidebarMenuButton
									isActive={itemActive}
									render={sidebarNavRender(item.path)}
								>
									{item.icon}
									<span>{item.title}</span>
								</SidebarMenuButton>
							)}
						</Collapsible>
					);
				})}
			</SidebarMenu>
		</SidebarGroup>
	);
}
