import { describe, expect, it } from "vitest";
import { extractTotpSecret } from "./totp-uri.ts";

describe("extractTotpSecret", () => {
	it("extracts the secret query param", () => {
		const uri =
			"otpauth://totp/Locnative:jo@x.com?secret=JBSWY3DPEHPK3PXP&issuer=Locnative";
		expect(extractTotpSecret(uri)).toBe("JBSWY3DPEHPK3PXP");
	});
	it("returns null when absent or malformed", () => {
		expect(extractTotpSecret("not-a-uri")).toBeNull();
		expect(extractTotpSecret("otpauth://totp/x?issuer=y")).toBeNull();
	});
	it("returns null for a malformed percent-encoded secret (RED→GREEN)", () => {
		// decodeURIComponent throws on invalid sequences like %ZZ or truncated %E0%A4%A
		expect(extractTotpSecret("otpauth://totp/x?secret=%ZZ")).toBeNull();
		expect(extractTotpSecret("otpauth://totp/x?secret=%E0%A4%A")).toBeNull();
	});
});
