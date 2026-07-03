export const SITE_URL = "https://locnative.com";
export const SITE_NAME = "Locnative";
export const DEFAULT_OG_IMAGE = "/brand/png/og-image-1200x630.png";

export type SeoMetaTag = Record<string, string>;
export type SeoLinkTag = Record<string, string>;

export interface SeoInput {
	description: string;
	image?: string;
	keywords?: string;
	ogType?: string;
	path: string;
	title: string;
}

export interface SeoHead {
	links: SeoLinkTag[];
	meta: SeoMetaTag[];
}

/** Resolve a root-relative path to an absolute URL; pass absolutes through. */
export function absoluteUrl(pathPrefixOrUrl: string): string {
	if (
		pathPrefixOrUrl.startsWith("http://") ||
		pathPrefixOrUrl.startsWith("https://")
	) {
		return pathPrefixOrUrl;
	}
	const suffix = pathPrefixOrUrl.startsWith("/")
		? pathPrefixOrUrl
		: `/${pathPrefixOrUrl}`;
	return `${SITE_URL}${suffix}`;
}

export function buildSeo(input: SeoInput): SeoHead {
	const ogType = input.ogType ?? "website";
	const canonical = absoluteUrl(input.path);
	const imageUrl = absoluteUrl(input.image ?? DEFAULT_OG_IMAGE);

	const meta: SeoMetaTag[] = [
		{ title: input.title },
		{ name: "description", content: input.description },
		{ property: "og:type", content: ogType },
		{ property: "og:url", content: canonical },
		{ property: "og:title", content: input.title },
		{ property: "og:description", content: input.description },
		{ property: "og:image", content: imageUrl },
		{ property: "og:site_name", content: SITE_NAME },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: input.title },
		{ name: "twitter:description", content: input.description },
		{ name: "twitter:image", content: imageUrl },
	];

	if (input.keywords) {
		meta.push({ name: "keywords", content: input.keywords });
	}

	return {
		meta,
		links: [{ rel: "canonical", href: canonical }],
	};
}
