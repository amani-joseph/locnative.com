"use client";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { NavUser } from "@/components/nav-user";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuPortal,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { useSession } from "@/lib/auth-client";
import { navItemMatchesPath } from "@/lib/nav-item-matches-path";
import { cn } from "@/lib/utils";

export interface NavigationSection {
	href: string;
	name: string;
}

interface NavbarProps {
	navigationData: NavigationSection[];
}

// Homepage section links ("/#why") stay plain anchors so they navigate home and
// scroll; real app routes use TanStack `Link` to keep navigation client-side.
const isRouteLink = (href: string) =>
	href.startsWith("/") && !href.includes("#");

const NavLink = ({
	item,
	active,
	onClick,
}: {
	item: NavigationSection;
	active?: boolean;
	onClick?: () => void;
}) => {
	const linkClassName = cn(
		"font-medium text-2xl leading-8 transition-colors duration-300 sm:text-3xl sm:leading-10",
		active ? "text-foreground" : "text-foreground/80"
	);
	return (
		<li
			className={cn(
				"group flex w-fit items-center transition-all duration-500 ease-in-out",
				active ? "gap-3" : "gap-0 hover:gap-3"
			)}
		>
			<div
				className={cn(
					"flex items-center overflow-hidden transition-all duration-500 ease-in-out",
					active
						? "max-w-6 opacity-100"
						: "max-w-0 opacity-0 group-hover:max-w-6 group-hover:opacity-100"
				)}
			>
				<div className="h-0.5 w-6 rounded-full bg-foreground" />
			</div>
			{isRouteLink(item.href) ? (
				<Link className={linkClassName} onClick={onClick} to={item.href}>
					{item.name}
				</Link>
			) : (
				<a className={linkClassName} href={item.href} onClick={onClick}>
					{item.name}
				</a>
			)}
		</li>
	);
};

const Navbar = ({ navigationData }: NavbarProps) => {
	const [menuOpen, setMenuOpen] = useState(false);
	const { data: session } = useSession();
	const isAuthenticated = Boolean(session?.user);
	const { pathname } = useLocation();

	// Only surface the Dashboard link to signed-in visitors; for logged-out
	// users it reads as a misplaced app link.
	const items = isAuthenticated
		? navigationData
		: navigationData.filter((item) => item.href !== "/dashboard");

	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth >= 1024) {
				setMenuOpen(false);
			}
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);
	return (
		<header className="sticky top-0 z-40 bg-background backdrop-blur-2xl">
			<div className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-8 xl:px-16">
				<nav className="flex items-center justify-between">
					<Link className="inline-flex items-center" to="/">
						<Logo imgClassName="h-12 sm:h-14" />
					</Link>
					<NavigationMenu className="max-lg:hidden">
						<NavigationMenuList className="gap-6">
							{items.map((navItem) => {
								const active = navItemMatchesPath(pathname, navItem.href);
								return (
									<NavigationMenuItem key={navItem.name}>
										<NavigationMenuLink
											className={cn(
												"p-0 font-normal text-base text-foreground hover:bg-transparent hover:text-foreground/80 focus:bg-transparent data-[state=open]:bg-transparent data-active:bg-transparent",
												active && "font-medium"
											)}
											render={
												isRouteLink(navItem.href) ? (
													<Link to={navItem.href} />
												) : (
													// biome-ignore lint/a11y/useAnchorContent: NavigationMenuLink merges the label as children via the Base UI render prop.
													<a href={navItem.href} />
												)
											}
										>
											{navItem.name}
										</NavigationMenuLink>
									</NavigationMenuItem>
								);
							})}
						</NavigationMenuList>
					</NavigationMenu>
					<div className="flex items-center gap-2 max-lg:hidden">
						{isAuthenticated ? (
							<NavUser />
						) : (
							<>
								<Link
									className={cn(
										buttonVariants({ variant: "outline" }),
										"h-auto cursor-pointer rounded-full px-5 py-2.5"
									)}
									to="/sign-in"
								>
									Log in
								</Link>
								<Link
									className={cn(
										buttonVariants({ variant: "default" }),
										"h-auto cursor-pointer rounded-full px-5 py-2.5"
									)}
									to="/sign-up"
								>
									Sign up
								</Link>
							</>
						)}
					</div>

					{/* Mobile Menu */}
					<div className="relative flex items-center gap-2 lg:hidden">
						{isAuthenticated ? <NavUser /> : null}
						<DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
							<AnimatePresence>
								{menuOpen && (
									<DropdownMenuPortal>
										<motion.div
											animate={{ opacity: 1 }}
											className="fixed inset-0 z-40 backdrop-blur-sm"
											exit={{ opacity: 0 }}
											initial={{ opacity: 0 }}
											onClick={() => setMenuOpen(false)}
										/>
									</DropdownMenuPortal>
								)}
							</AnimatePresence>
							<DropdownMenuTrigger className="h-auto cursor-pointer gap-2 rounded-full border border-border bg-muted p-2.5 hover:bg-muted/80">
								<Menu className="h-4 w-4 cursor-pointer text-foreground" />
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="dark z-50 -mt-12 min-w-xs rounded-3xl border border-border bg-background px-6 py-8 shadow-2xl sm:min-w-sm"
								sideOffset={10}
							>
								<div className="flex flex-col gap-6">
									{/* Header */}
									<div className="flex items-center justify-between">
										<p className="font-medium text-foreground text-lg">Menu</p>
										<Button
											className="h-auto cursor-pointer rounded-full p-2.5"
											onClick={() => setMenuOpen(false)}
											variant="outline"
										>
											<X size={20} />
										</Button>
									</div>
									<hr className="border-border" />
									{/* Navigation */}
									<ul className="flex flex-col gap-3.5">
										{items.map((item) => (
											<NavLink
												active={navItemMatchesPath(pathname, item.href)}
												item={item}
												key={item.href}
												onClick={() => setMenuOpen(false)}
											/>
										))}
									</ul>
									{isAuthenticated ? null : (
										<div className="flex w-full flex-col gap-2">
											<Link
												className={cn(
													buttonVariants({ variant: "outline" }),
													"h-auto w-full cursor-pointer rounded-full px-5 py-2.5 text-center"
												)}
												onClick={() => setMenuOpen(false)}
												to="/sign-in"
											>
												Log in
											</Link>
											<Link
												className={cn(
													buttonVariants({ variant: "default" }),
													"h-auto w-full cursor-pointer rounded-full px-5 py-2.5 text-center"
												)}
												onClick={() => setMenuOpen(false)}
												to="/sign-up"
											>
												Sign up
											</Link>
										</div>
									)}
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</nav>
			</div>
		</header>
	);
};

export default Navbar;
