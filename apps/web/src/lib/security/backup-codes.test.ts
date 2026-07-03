import { describe, expect, it } from "vitest";
import { backupCodesFilename, formatBackupCodes } from "./backup-codes.ts";

describe("formatBackupCodes", () => {
	it("renders one code per line with a header", () => {
		const out = formatBackupCodes(["AAAA-BBBB", "CCCC-DDDD"]);
		expect(out).toContain("Locnative backup codes");
		expect(out).toContain("AAAA-BBBB");
		expect(out.trim().split("\n").at(-1)).toBe("CCCC-DDDD");
	});
});

describe("backupCodesFilename", () => {
	it("derives a safe filename from the email", () => {
		expect(backupCodesFilename("jo@x.com")).toBe(
			"locnative-backup-codes-jo-at-x-com.txt"
		);
	});
	it("falls back when email missing", () => {
		expect(backupCodesFilename(null)).toBe("locnative-backup-codes.txt");
	});
});
