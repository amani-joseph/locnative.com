import type { NavigationSection } from "@/components/shadcn-space/blocks/hero-15/navbar";

// Shared top-nav source of truth for both the landing hero and the
// `_public` layout (pricing, coverage) so the marketing nav stays in sync.
// Homepage section links are root-relative (e.g. "/#capabilities") so they
// resolve from any public page, not just "/". The Dashboard entry is only
// shown to authenticated users (filtered in the navbar).
export const navigationData: NavigationSection[] = [
	{
		name: "Dashboard",
		href: "/dashboard",
	},
	{
		name: "Why Locnative",
		href: "/#why",
	},
	{
		name: "Capabilities",
		href: "/#capabilities",
	},
	{
		name: "API",
		href: "/#api",
	},
	{
		name: "Docs",
		href: "/docs",
	},
	{
		name: "Coverage",
		href: "/coverage",
	},
	{
		name: "Pricing",
		href: "/pricing",
	},
];
