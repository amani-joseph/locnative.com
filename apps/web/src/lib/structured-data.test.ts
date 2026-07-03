import { describe, expect, it } from "vitest";
import {
	breadcrumbJsonLd,
	jsonLdScript,
	organizationJsonLd,
	softwareApplicationJsonLd,
	techArticleJsonLd,
} from "./structured-data.ts";

describe("organizationJsonLd", () => {
	it("is a well-formed Organization node", () => {
		const o = organizationJsonLd();
		expect(o["@context"]).toBe("https://schema.org");
		expect(o["@type"]).toBe("Organization");
		expect(typeof o.name).toBe("string");
		expect(typeof o.url).toBe("string");
	});

	it("uses an ImageObject logo at the brand logo path", () => {
		const o = organizationJsonLd();
		const logo = o.logo as Record<string, unknown>;
		expect(logo["@type"]).toBe("ImageObject");
		expect(String(logo.url)).toContain("/brand/png/logo-mark-512.png");
	});
});

describe("softwareApplicationJsonLd", () => {
	const s = softwareApplicationJsonLd();

	it("is a SoftwareApplication with a developer category", () => {
		expect(s["@type"]).toBe("SoftwareApplication");
		expect(s.applicationCategory).toBe("DeveloperApplication");
	});

	it("lists product features", () => {
		expect(Array.isArray(s.featureList)).toBe(true);
		expect((s.featureList as string[]).length).toBeGreaterThan(0);
	});

	it("carries an offers node", () => {
		expect(s.offers).toBeTruthy();
	});
});

describe("techArticleJsonLd", () => {
	it("is a TechArticle with a headline and absolute url", () => {
		const a = techArticleJsonLd({
			title: "Docs",
			description: "d",
			path: "/docs",
		});
		expect(a["@type"]).toBe("TechArticle");
		expect(a.headline).toBe("Docs");
		expect(String(a.url).startsWith("https://locnative.com/")).toBe(true);
	});
});

describe("breadcrumbJsonLd", () => {
	it("builds an ordered BreadcrumbList", () => {
		const b = breadcrumbJsonLd([
			{ name: "Home", path: "/" },
			{ name: "Documentation", path: "/docs" },
		]);
		expect(b["@type"]).toBe("BreadcrumbList");
		const items = b.itemListElement as Record<string, unknown>[];
		expect(items).toHaveLength(2);
		expect(items[0].position).toBe(1);
		expect(items[1].position).toBe(2);
	});
});

describe("jsonLdScript", () => {
	it("wraps data into an ld+json script whose children parse back", () => {
		const tag = jsonLdScript({ a: 1 });
		expect(tag.type).toBe("application/ld+json");
		expect(JSON.parse(tag.children)).toEqual({ a: 1 });
	});
});
