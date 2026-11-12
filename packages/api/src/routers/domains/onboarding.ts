import { users } from "@locnative/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { recordMarketingConsent } from "../../clivly-consent.ts";
import type { Context } from "../../context.ts";
import { protectedProcedure } from "../../procedures.ts";
import {
	type ConsentSource,
	SERVICE_INTEREST_VALUES,
} from "../../shared/onboarding-options.ts";

const serviceInterestsSchema = z
	.array(z.enum(SERVICE_INTEREST_VALUES))
	.max(SERVICE_INTEREST_VALUES.length)
	.transform((values) => [...new Set(values)]);

const completeInputSchema = z.object({
	marketingConsent: z.boolean(),
	serviceInterests: serviceInterestsSchema,
	skipped: z.boolean().default(false),
});

const updatePreferencesInputSchema = z.object({
	marketingConsent: z.boolean().optional(),
	serviceInterests: serviceInterestsSchema.optional(),
});

export interface OnboardingPreferences {
	marketingConsent: boolean;
	onboardingCompletedAt: Date | null;
	serviceInterests: string[];
}

type Db = Context["db"];

interface SessionUser {
	email: string;
	id: string;
}

export interface ConsentEvent {
	email: string;
	granted: boolean;
	occurredAt: Date;
	source: ConsentSource;
	userId: string;
}

type ReportConsent = (event: ConsentEvent) => void;

export const completeOnboardingForUser = async (
	db: Db,
	{
		input,
		now,
		reportConsent,
		user,
	}: {
		input: z.output<typeof completeInputSchema>;
		now: Date;
		reportConsent: ReportConsent;
		user: SessionUser;
	}
): Promise<{ ok: true }> => {
	// Skipping records nothing: no opt-in, no interests.
	const marketingConsent = input.skipped ? false : input.marketingConsent;
	const serviceInterests = input.skipped ? [] : input.serviceInterests;

	await db
		.update(users)
		.set({
			marketingConsent,
			marketingConsentUpdatedAt: marketingConsent ? now : null,
			onboardingCompletedAt: now,
			serviceInterests,
			// Bumping updatedAt queues the contact for the next Clivly sync.
			updatedAt: now,
		})
		.where(eq(users.id, user.id));

	// Only an explicit tick is reported. An unticked box is "no answer", not an
	// opt-out, so it must not cancel a subscription made elsewhere.
	if (marketingConsent) {
		reportConsent({
			email: user.email,
			granted: true,
			occurredAt: now,
			source: "onboarding",
			userId: user.id,
		});
	}

	return { ok: true };
};

export const updatePreferencesForUser = async (
	db: Db,
	{
		input,
		now,
		reportConsent,
		user,
	}: {
		input: z.output<typeof updatePreferencesInputSchema>;
		now: Date;
		reportConsent: ReportConsent;
		user: SessionUser;
	}
): Promise<{ ok: true }> => {
	const [current] = await db
		.select({ marketingConsent: users.marketingConsent })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	const nextConsent = input.marketingConsent;
	const consentChanged =
		nextConsent !== undefined && nextConsent !== current?.marketingConsent;

	await db
		.update(users)
		.set({
			...(consentChanged
				? { marketingConsent: nextConsent, marketingConsentUpdatedAt: now }
				: {}),
			...(input.serviceInterests
				? { serviceInterests: input.serviceInterests }
				: {}),
			updatedAt: now,
		})
		.where(eq(users.id, user.id));

	// In Settings the toggle is an explicit choice either way, so an untick is
	// reported as an opt-out.
	if (consentChanged) {
		reportConsent({
			email: user.email,
			granted: nextConsent,
			occurredAt: now,
			source: "settings",
			userId: user.id,
		});
	}

	return { ok: true };
};

/** Fire-and-forget: a Clivly outage must not block onboarding or settings. */
const consentReporter =
	(context: Context): ReportConsent =>
	(event) => {
		const pending = recordMarketingConsent({
			...event,
			headers: context.req.raw.headers,
		}).catch(() => null);
		context.waitUntil?.(pending);
	};

export const onboardingRouter = {
	getPreferences: protectedProcedure.handler(
		async ({ context }): Promise<OnboardingPreferences> => {
			const [row] = await context.db
				.select({
					marketingConsent: users.marketingConsent,
					onboardingCompletedAt: users.onboardingCompletedAt,
					serviceInterests: users.serviceInterests,
				})
				.from(users)
				.where(eq(users.id, context.session.user.id))
				.limit(1);

			return (
				row ?? {
					marketingConsent: false,
					onboardingCompletedAt: null,
					serviceInterests: [],
				}
			);
		}
	),

	complete: protectedProcedure
		.input(completeInputSchema)
		.handler(({ context, input }) =>
			completeOnboardingForUser(context.db, {
				input,
				now: new Date(),
				reportConsent: consentReporter(context),
				user: context.session.user,
			})
		),

	updatePreferences: protectedProcedure
		.input(updatePreferencesInputSchema)
		.handler(({ context, input }) =>
			updatePreferencesForUser(context.db, {
				input,
				now: new Date(),
				reportConsent: consentReporter(context),
				user: context.session.user,
			})
		),
};
