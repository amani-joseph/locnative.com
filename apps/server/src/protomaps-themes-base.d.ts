declare module "protomaps-themes-base" {
	export function namedTheme(name: string): unknown;
	export function layers(
		sourceName: string,
		theme: unknown,
		options?: { lang?: string }
	): unknown[];
}
