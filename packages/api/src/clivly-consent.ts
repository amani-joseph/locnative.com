import { serverEnv } from "@locnative/env/server";
import {
	type ClivlyConsentResult,
	type ClivlySDK,
	createClivlySDK,
	memoryCursorStore,
} from "clivly/sdk";
import {
	type ConsentSource,
	MARKETING_CONSENT_WORDING,
	MARKETING_CONSENT_WORDING_VERSION,
} from "./shared/onboarding-options.ts";

let cachedSdk: ClivlySDK | null | undefined;

/** Lazily built so deploy-time validation never needs the secret. */
const getClivly = (): ClivlySDK | null => {
	if (cachedSdk === undefined) {
		const apiKey = serverEnv.CLIVLY_SECRET_KEY;
		// This Worker only records consent and never syncs, so an in-memory
		// cursor store is enough (and silences the serverless warning).
		cachedSdk = apiKey
			? createClivlySDK({ apiKey, cursorStore: memoryCursorStore() })
			: null;
	}
	return cachedSdk;
};

export interface RecordMarketingConsentInput {
	email: string;
	granted: boolean;
	headers: Headers;
	occurredAt: Date;
	source: ConsentSource;
	userId: string;
}

/**
 * Reports a marketing opt-in/opt-out to Clivly with the exact wording shown.
 * Never throws; returns null when Clivly is not configured.
 */
export const recordMarketingConsent = async ({
	email,
	granted,
	headers,
	occurredAt,
	source,
	userId,
}: RecordMarketingConsentInput): Promise<ClivlyConsentResult | null> => {
	const clivly = getClivly();
	if (!clivly) {
		return null;
	}

	const ip =
		headers.get("cf-connecting-ip") ??
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		undefined;

	return await clivly.recordConsent({
		email,
		granted,
		// One record per user, decision and moment — safe to retry.
		idempotencyKey: `${userId}:${source}:${granted ? "in" : "out"}:${occurredAt.toISOString()}`,
		ip,
		label: source,
		occurredAt,
		pageUrl: headers.get("referer") ?? undefined,
		userAgent: headers.get("user-agent") ?? undefined,
		wording: MARKETING_CONSENT_WORDING,
		wordingVersion: MARKETING_CONSENT_WORDING_VERSION,
	});
};
