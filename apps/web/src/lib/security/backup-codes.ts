const NON_FILENAME_CHARS = /[^a-z0-9]+/g;
const TRIM_DASHES = /^-+|-+$/g;

/** Format backup codes as downloadable plain text. */
export function formatBackupCodes(codes: string[]): string {
	return [
		"Locnative backup codes",
		"Keep these somewhere safe. Each code can be used once.",
		"",
		...codes,
	].join("\n");
}

/** Build a filesystem-safe filename for the backup-codes download. */
export function backupCodesFilename(email: string | null | undefined): string {
	if (!email) {
		return "locnative-backup-codes.txt";
	}
	const slug = email
		.toLowerCase()
		.replace("@", "-at-")
		.replace(NON_FILENAME_CHARS, "-")
		.replace(TRIM_DASHES, "");
	return `locnative-backup-codes-${slug}.txt`;
}
