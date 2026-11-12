import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull(),
		emailVerified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
		twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
		/** Set once the user finishes or skips the onboarding step. */
		onboardingCompletedAt: timestamp("onboarding_completed_at", {
			withTimezone: true,
		}),
		/**
		 * Local mirror of the marketing opt-in. Clivly holds the authoritative
		 * record (including unsubscribes made from an email link).
		 */
		marketingConsent: boolean("marketing_consent").notNull().default(false),
		marketingConsentUpdatedAt: timestamp("marketing_consent_updated_at", {
			withTimezone: true,
		}),
		/** Services the user said they plan to use; synced to Clivly contacts. */
		serviceInterests: text("service_interests")
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
	},
	(table) => [uniqueIndex("user_email_unique").on(table.email)]
);

export const sessions = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		geoCountry: text("geo_country"),
		geoRegion: text("geo_region"),
		geoCity: text("geo_city"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("session_token_unique").on(table.token),
		index("session_user_id_idx").on(table.userId),
	]
);

export const accounts = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		uniqueIndex("account_provider_account_unique").on(
			table.providerId,
			table.accountId
		),
		index("account_user_id_idx").on(table.userId),
	]
);

export const verifications = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("verification_identifier_value_unique").on(
			table.identifier,
			table.value
		),
	]
);

export const twoFactors = pgTable(
	"two_factor",
	{
		id: text("id").primaryKey(),
		secret: text("secret").notNull(),
		backupCodes: text("backup_codes").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [index("two_factor_user_id_idx").on(table.userId)]
);

export const authSchema = {
	account: accounts,
	session: sessions,
	twoFactor: twoFactors,
	user: users,
	verification: verifications,
};

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
export type TwoFactor = typeof twoFactors.$inferSelect;
export type NewTwoFactor = typeof twoFactors.$inferInsert;
