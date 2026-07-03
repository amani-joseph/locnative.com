import { beforeAll, describe, expect, it } from "vitest";

// Deterministic 64-hex test key (32 bytes). Must be set BEFORE importing
// the module under test because `serverEnv` is evaluated at import time.
const TEST_KEY =
	"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CIPHERTEXT_REGEX = /^[0-9a-f]+:[0-9a-f]+$/;
const IV_REGEX = /^[0-9a-f]{24}$/;

beforeAll(() => {
	process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
	process.env.BETTER_AUTH_SECRET ??=
		"test-better-auth-secret-value-32-chars-minimum";
	process.env.BETTER_AUTH_URL ??= "http://localhost:3003";
	process.env.GITHUB_CLIENT_ID ??= "test-client-id";
	process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret";
	process.env.WEB_BASE_URL ??= "http://localhost:3001";
	process.env.RESEND_API_KEY ??= "test-resend-key";
	process.env.EMAIL_FROM ??= "test@example.com";
	process.env.KEY_ENC_KEY = TEST_KEY;
});

describe("api-key-crypto", () => {
	it("encrypts then decrypts to the original plaintext", async () => {
		const { encryptSecret, decryptSecret } = await import(
			"./api-key-crypto.ts"
		);

		const plaintext = "sk_live_super_secret_api_key_value_123";
		const encrypted = encryptSecret(plaintext);

		expect(encrypted.ciphertext).toMatch(CIPHERTEXT_REGEX);
		expect(encrypted.iv).toMatch(IV_REGEX); // 12 bytes = 24 hex chars

		const decrypted = decryptSecret(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it("produces different ciphertext and iv for the same plaintext (IV randomness)", async () => {
		const { encryptSecret } = await import("./api-key-crypto.ts");

		const plaintext = "same-plaintext-value";
		const first = encryptSecret(plaintext);
		const second = encryptSecret(plaintext);

		expect(first.iv).not.toBe(second.iv);
		expect(first.ciphertext).not.toBe(second.ciphertext);
	});

	it("throws when the ciphertext is tampered with (auth tag mismatch)", async () => {
		const { encryptSecret, decryptSecret } = await import(
			"./api-key-crypto.ts"
		);

		const plaintext = "tamper-me";
		const encrypted = encryptSecret(plaintext);

		// Flip the last hex char in the encrypted portion after the ":"
		const [authTagHex, encryptedHex] = encrypted.ciphertext.split(":");
		const lastChar = encryptedHex.at(-1) ?? "0";
		const flipped = lastChar === "f" ? "0" : "f";
		const tamperedHex = encryptedHex.slice(0, -1) + flipped;
		const tampered = {
			ciphertext: `${authTagHex}:${tamperedHex}`,
			iv: encrypted.iv,
		};

		expect(() => decryptSecret(tampered)).toThrow();
	});
});
