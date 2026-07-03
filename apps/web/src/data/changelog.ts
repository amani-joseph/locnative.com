/**
 * User-facing changelog entries, curated from the project's git history.
 * Keep newest-first. Each entry groups shipped, user-visible changes for a
 * date — internal refactors, lint, and WIP commits are intentionally omitted.
 */

export type ChangelogTag = "New" | "Improved" | "Fixed";

export interface ChangelogItem {
	tag: ChangelogTag;
	text: string;
}

export interface ChangelogEntry {
	/** ISO date (YYYY-MM-DD) the work landed. */
	date: string;
	items: ChangelogItem[];
	title: string;
}

export const CHANGELOG: readonly ChangelogEntry[] = [
	{
		date: "2026-06-22",
		title: "Marketing site polish",
		items: [
			{
				tag: "Improved",
				text: "Reworked the public navigation, footer, pricing, and homepage for a clearer developer-first experience.",
			},
			{
				tag: "New",
				text: "Added an interactive pricing calculator and a richer coverage page with a capability legend.",
			},
		],
	},
	{
		date: "2026-06-21",
		title: "Coverage page & refreshed landing",
		items: [
			{
				tag: "New",
				text: "Launched the Coverage page with a searchable country table.",
			},
			{
				tag: "New",
				text: "Rebuilt the hero with an interactive globe that flies to the selected address.",
			},
			{
				tag: "Improved",
				text: "Introduced a green-accent theme and a shared layout for the public pages.",
			},
		],
	},
	{
		date: "2026-06-20",
		title: "Teams, projects & internationalization",
		items: [
			{
				tag: "New",
				text: "Added team management — create teams, invite members, and manage membership.",
			},
			{
				tag: "New",
				text: "Project deletion is now available from the dashboard.",
			},
			{
				tag: "Improved",
				text: "Broadened international address parsing and country-name resolution.",
			},
		],
	},
	{
		date: "2026-06-19",
		title: "MCP server & SEO",
		items: [
			{
				tag: "New",
				text: "Shipped an MCP server (mcp.locnative.com) that fronts the location API with geocoding, routing, and zone tools.",
			},
			{
				tag: "New",
				text: "Published an RFC 9727 API catalog at /.well-known/api-catalog.",
			},
			{
				tag: "Improved",
				text: "Added structured metadata and JSON-LD across the landing, docs, and pricing pages.",
			},
		],
	},
	{
		date: "2026-06-16",
		title: "SDK & autocomplete improvements",
		items: [
			{
				tag: "Improved",
				text: "Hardened address autocomplete with proximity bias and session tokens, plus a WAI-ARIA combobox.",
			},
			{
				tag: "Improved",
				text: "SDK developer-experience upgrades: structured geocode fields, pagination, logging, and React hooks.",
			},
			{
				tag: "New",
				text: "Began international address ingestion across additional countries.",
			},
		],
	},
];
