import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@locnative/env/server";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
	return Buffer.from(serverEnv.KEY_ENC_KEY, "hex");
}

/**
 * Encrypt a secret string with AES-256-GCM.
 *
 * Returns `{ ciphertext, iv }` where:
 * - `iv` is a 12-byte random IV encoded as hex (24 chars)
 * - `ciphertext` is `authTagHex + ":" + encryptedHex` so the auth tag travels
 *   alongside the ciphertext without needing a separate column.
 */
export function encryptSecret(plaintext: string): {
	ciphertext: string;
	iv: string;
} {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	return {
		ciphertext: `${authTag.toString("hex")}:${encrypted.toString("hex")}`,
		iv: iv.toString("hex"),
	};
}

/**
 * Decrypt a secret previously produced by `encryptSecret`.
 *
 * Throws if the auth tag fails (tamper detection) or if the ciphertext
 * format is invalid.
 */
export function decryptSecret({
	ciphertext,
	iv,
}: {
	ciphertext: string;
	iv: string;
}): string {
	const [authTagHex, encryptedHex] = ciphertext.split(":");
	if (!(authTagHex && encryptedHex)) {
		throw new Error("Invalid ciphertext format");
	}
	const decipher = createDecipheriv(
		ALGORITHM,
		getKey(),
		Buffer.from(iv, "hex"),
		{ authTagLength: AUTH_TAG_LENGTH }
	);
	decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(encryptedHex, "hex")),
		decipher.final(),
	]);
	return decrypted.toString("utf8");
}
