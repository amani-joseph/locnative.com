export const MAX_BATCH = 1000;
const MIN_LEN = 5;
const LINE_BREAK_REGEX = /\r?\n/;

export interface ParseResult {
	addresses: string[];
	error: string | null;
}

/** Strip one layer of surrounding double quotes and unescape doubled quotes. */
function unquote(cell: string): string {
	const trimmed = cell.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		return trimmed.slice(1, -1).replace(/""/g, '"');
	}
	return trimmed;
}

/**
 * Extract the first CSV column from a line, handling quoted fields
 * that may contain commas.
 */
function firstColumn(line: string): string {
	const trimmed = line.trim();
	if (trimmed.startsWith('"')) {
		// Scan for the closing quote
		let i = 1;
		while (i < trimmed.length) {
			if (trimmed[i] === '"') {
				if (trimmed[i + 1] === '"') {
					i += 2;
					continue;
				}
				break;
			}
			i += 1;
		}
		return unquote(trimmed.slice(0, i + 1));
	}
	const comma = trimmed.indexOf(",");
	return unquote(comma === -1 ? trimmed : trimmed.slice(0, comma));
}

/**
 * Parse pasted text OR CSV into a list of address strings.
 * - One address per line; for CSV rows, the first column is used.
 * - Blank lines dropped; each surviving line must be >= 5 chars.
 */
export function parseAddresses(input: string): ParseResult {
	const lines = input
		.split(LINE_BREAK_REGEX)
		.map((line) => firstColumn(line))
		.filter((line) => line.length > 0);

	if (lines.length === 0) {
		return { addresses: [], error: "No addresses found in input." };
	}

	if (lines.length > MAX_BATCH) {
		return {
			addresses: [],
			error: `Too many addresses (${lines.length}). Maximum is 1,000 per job.`,
		};
	}

	const tooShort = lines.find((line) => line.length < MIN_LEN);
	if (tooShort) {
		return {
			addresses: [],
			error: `Each address must be at least 5 characters: "${tooShort}"`,
		};
	}

	return { addresses: lines, error: null };
}
