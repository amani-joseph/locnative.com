import type { Database } from "@locnative/database";
import { describe, expect, it } from "vitest";
import { generateApiKeySecretPart, validateApiKey } from "./api-key-auth.ts";

const KEY_ID = "0b1f6c3e-8a2d-4c5b-9e7f-1a2b3c4d5e6f";

// Any DB access fails the test: malformed tokens must be rejected before a
// query can wake Neon.
const untouchableDb = new Proxy({} as Database, {
	get() {
		throw new Error("validateApiKey touched the database");
	},
});

describe("validateApiKey format pre-check", () => {
	it.each([
		["garbage", "not-a-key"],
		["missing secret", `wh_${KEY_ID}_`],
		["short secret", `wh_${KEY_ID}_abc`],
		["long secret", `wh_${KEY_ID}_${"a".repeat(33)}`],
		["bad secret chars", `wh_${KEY_ID}_${"a".repeat(31)}!`],
		["bad uuid", `wh_not-a-uuid_${"a".repeat(32)}`],
	])("rejects %s without a DB call", async (_label, token) => {
		await expect(validateApiKey(untouchableDb, token)).resolves.toBeNull();
	});

	it("lets a well-formed key through to the DB lookup", async () => {
		const token = `wh_${KEY_ID}_${generateApiKeySecretPart()}`;
		await expect(validateApiKey(untouchableDb, token)).rejects.toThrow(
			"touched the database"
		);
	});
});
