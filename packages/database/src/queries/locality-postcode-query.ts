import { localityQuery } from "./locality-query.ts";
import { barePostcode } from "./postcode-query.ts";

export interface LocalityPostcodeQuery {
	locality: string;
	postcode: string;
}

/**
 * Detect `<locality> <postcode>` queries such as `Parramatta 2150`.
 *
 * These are not bare postcodes, and they are not pure locality names because
 * the trailing digits make localityQuery() reject them. Parsing them
 * explicitly lets autocomplete keep returning suburb results rather than
 * falling through to street-name prefix matches such as "PARRAMATTA COURT".
 */
export function parseLocalityPostcodeQuery(
	query: string,
	country?: string
): LocalityPostcodeQuery | null {
	if (!country) {
		return null;
	}

	const trimmed = query.trim();
	const lastSpaceIndex = trimmed.lastIndexOf(" ");
	if (lastSpaceIndex <= 0) {
		return null;
	}

	const localityPart = trimmed.slice(0, lastSpaceIndex).trim();
	const postcodePart = trimmed.slice(lastSpaceIndex + 1).trim();
	const postcode = barePostcode(postcodePart, country);
	const locality = localityQuery(localityPart, country);

	if (!(postcode && locality)) {
		return null;
	}

	return { locality, postcode };
}
