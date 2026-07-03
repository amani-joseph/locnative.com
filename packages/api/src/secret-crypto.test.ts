import { beforeAll, describe, expect, it, vi } from "vitest";
import {
	decryptSecret,
	encryptSecret,
	generateWebhookSecret,
} from "./secret-crypto.ts";

const HEX_SECRET_REGEX = /^[0-9a-f]{64}$/;

// KEY_ENC_KEY must be set before any function is called (lazy getKey()).
// 64 hex chars = 32 bytes for AES-256.
beforeAll(() => {
	vi.stubEnv("KEY_ENC_KEY", "00".repeat(32));
});

describe("secret-crypto", () => {
	describe("encryptSecret / decryptSecret", () => {
		it("round-trips a plaintext string", () => {
			const plain = "my-super-secret-hmac-key";
			const encoded = encryptSecret(plain);
			expect(decryptSecret(encoded)).toBe(plain);
		});

		it("produces a string with two colons (iv:authTag:ciphertext)", () => {
			const encoded = encryptSecret("hello");
			const parts = encoded.split(":");
			expect(parts).toHaveLength(3);
			// iv = 12 bytes = 24 hex chars
			expect(parts[0]).toHaveLength(24);
			// authTag = 16 bytes = 32 hex chars
			expect(parts[1]).toHaveLength(32);
		});

		it("produces different ciphertexts for the same plaintext (random IV)", () => {
			const plain = "same-plaintext";
			expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
		});

		it("throws on tampered ciphertext", () => {
			const encoded = encryptSecret("tamper-me");
			// Flip the last character of the ciphertext segment
			const tampered = `${encoded.slice(0, -1)}x`;
			expect(() => decryptSecret(tampered)).toThrow();
		});

		it("throws on invalid format (missing colons)", () => {
			expect(() => decryptSecret("notvalidatall")).toThrow(
				"Invalid ciphertext format"
			);
		});
	});

	describe("generateWebhookSecret", () => {
		it("returns a 64-char hex string (32 bytes)", () => {
			const secret = generateWebhookSecret();
			expect(secret).toHaveLength(64);
			expect(secret).toMatch(HEX_SECRET_REGEX);
		});

		it("returns a different value each call", () => {
			expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
		});
	});
});
