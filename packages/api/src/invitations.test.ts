import { buildInviteHtml, buildInviteText } from "@locnative/auth/invitations";
import { describe, expect, it } from "vitest";

describe("invite templates", () => {
	it("renders the team and inviter into the HTML body and CTA link", () => {
		const html = buildInviteHtml({
			teamName: "Acme",
			inviterName: "Ada",
			inviterEmail: "ada@example.com",
			inviteUrl: "https://app.example.com/invite/abc",
		});
		expect(html).toContain("Acme");
		expect(html).toContain("Ada");
		expect(html).toContain("https://app.example.com/invite/abc");
	});

	it("includes the raw URL on its own line in the text body", () => {
		const text = buildInviteText({
			teamName: "Acme",
			inviterName: "Ada",
			inviteUrl: "https://app.example.com/invite/abc",
		});
		expect(text).toContain("https://app.example.com/invite/abc");
	});
});
