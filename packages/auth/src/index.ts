import {
	authSchema,
	securityAuditLog,
	teamMembers,
	teams,
} from "@locnative/database";
import { serverEnv } from "@locnative/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { Resend } from "resend";
import { mapAuditAction } from "./audit.ts";
import { db } from "./db.ts";

const asString = (v: unknown): string | null =>
	typeof v === "string" ? v : null;

const TRAILING_SLASH_REGEX = /\/$/;
const SLUG_SANITIZE_REGEX = /[^a-z0-9]+/g;
const SLUG_TRIM_REGEX = /^-+|-+$/g;
const DEPLOYED_WEB_ORIGIN =
	process.env.DEPLOYED_WEB_ORIGIN ?? "https://locnative.com";

/**
 * Build the HTML body for the password-reset email. Mirrors the invite
 * template contract: single-column, 600px max, mono font stack, CTA
 * bg #dedede / text #1a1a1a / radius 8px.
 */
function buildResetPasswordHtml(resetUrl: string): string {
	const fontStack = "ui-monospace, 'Courier New', monospace";
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Reset your Locnative password</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;font-family:${fontStack};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 0 24px 0;font-family:${fontStack};font-size:14px;font-weight:600;color:#1a1a1a;letter-spacing:0.02em;">
                Locnative
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 16px 0;font-family:${fontStack};font-size:24px;font-weight:600;line-height:1.3;color:#1a1a1a;">
                Reset your password
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;font-family:${fontStack};font-size:14px;line-height:1.5;color:#1a1a1a;">
                We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;">
                <a href="${resetUrl}" style="display:inline-block;background:#dedede;color:#1a1a1a;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:${fontStack};font-size:14px;font-weight:600;">Reset password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 0 0 0;border-top:1px solid #ececec;font-family:${fontStack};font-size:12px;line-height:1.5;color:#6b6b6b;">
                If you didn't request a password reset, you can safely ignore this email — your password won't change.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Plain-text fallback for the password-reset email, with the full URL on
 * its own line for clients that don't render HTML.
 */
function buildResetPasswordText(resetUrl: string): string {
	return [
		"Reset your Locnative password.",
		"",
		"We received a request to reset your password. Open the link below to choose a new one. It expires in 1 hour.",
		"",
		resetUrl,
		"",
		"If you didn't request this, you can safely ignore this email — your password won't change.",
	].join("\n");
}

type Auth = ReturnType<typeof buildAuth>;

let cachedAuth: Auth | undefined;

function buildAuth() {
	const trustedOrigins = Array.from(
		new Set([
			serverEnv.WEB_BASE_URL.replace(TRAILING_SLASH_REGEX, ""),
			DEPLOYED_WEB_ORIGIN,
			"http://localhost:3001",
			"https://locnative.com",
			"https://api.locnative.com",
		])
	);
	// On localhost the auth server runs at localhost:3003 and the web app at
	// localhost:3001. A cookie scoped to Domain=.locnative.com would not match
	// the `localhost` host, so the browser silently drops the session cookie and
	// the user never appears authenticated. Only attach the production cookie
	// domain when the auth server is not running on localhost.
	const isLocalhostAuth = serverEnv.BETTER_AUTH_URL.includes("localhost");
	const cookieDomain = isLocalhostAuth
		? undefined
		: serverEnv.AUTH_COOKIE_DOMAIN?.trim();

	return betterAuth({
		appName: "Locnative",
		baseURL: serverEnv.BETTER_AUTH_URL,
		secret: serverEnv.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: authSchema,
		}),
		trustedOrigins,
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
			sendResetPassword: async ({ user, token }) => {
				const resend = new Resend(serverEnv.RESEND_API_KEY);
				// Build the link to the web app directly (not the API origin) so the
				// reset-password page can read the token from the query string.
				const resetUrl = `${serverEnv.WEB_BASE_URL.replace(
					TRAILING_SLASH_REGEX,
					""
				)}/reset-password?token=${token}`;
				await resend.emails.send({
					from: serverEnv.EMAIL_FROM,
					to: user.email,
					subject: "Reset your Locnative password",
					html: buildResetPasswordHtml(resetUrl),
					text: buildResetPasswordText(resetUrl),
				});
			},
		},
		plugins: [twoFactor({ issuer: "Locnative" })],
		user: {
			deleteUser: { enabled: true },
		},
		socialProviders: {
			github: {
				clientId: serverEnv.GITHUB_CLIENT_ID,
				clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
			},
		},
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				const action = mapAuditAction(ctx.path);
				if (!action) {
					return;
				}
				try {
					const headers = ctx.request?.headers;
					const ipAddress =
						headers?.get("cf-connecting-ip") ??
						headers?.get("x-forwarded-for") ??
						null;
					const userAgent = headers?.get("user-agent") ?? null;
					// Prefer the resolved session user id; fall back to the freshly
					// created session (covers sign-in / verify flows where the new
					// session is returned instead of the existing one).
					const userId =
						ctx.context.session?.user?.id ??
						ctx.context.newSession?.user?.id ??
						null;
					// Record the attempted email when there is no resolved user id
					// (e.g. a failed login). This is NOT stored as userId — it goes
					// into metadata only, so it is never confused with a real user id.
					// NOTE: ctx.context.returned does not expose the HTTP response
					// status in BetterAuth's after-hook context; success cannot be
					// derived reliably from the typed context, so ok is omitted here.
					const attemptedEmail =
						userId === null
							? ((ctx.body as { email?: string } | undefined)?.email ?? null)
							: null;
					const metadata = attemptedEmail === null ? null : { attemptedEmail };
					await db.insert(securityAuditLog).values({
						id: crypto.randomUUID(),
						userId,
						action,
						ipAddress,
						userAgent,
						metadata,
					});
				} catch {
					// Audit logging must never fail the auth response.
				}
			}),
		},
		advanced: {
			// In production the web app and auth API live on different subdomains of
			// locnative.com, so the session cookie must be cross-site capable
			// (SameSite=None; Secure) and shared across the parent domain. On
			// localhost both apps are same-site (host `localhost`, different ports),
			// where SameSite=Lax without Secure works reliably over plain http and
			// avoids browsers dropping a Secure cookie served over http.
			defaultCookieAttributes: isLocalhostAuth
				? {
						sameSite: "lax",
						secure: false,
						httpOnly: true,
					}
				: {
						sameSite: "none",
						secure: true,
						httpOnly: true,
						...(cookieDomain ? { domain: cookieDomain } : {}),
					},
		},
		rateLimit: {
			enabled: true,
			window: 10,
			max: 100,
			customRules: {
				"/two-factor/verify-totp": { window: 60, max: 10 },
				"/two-factor/verify-backup-code": { window: 60, max: 10 },
				"/two-factor/enable": { window: 60, max: 5 },
				"/two-factor/disable": { window: 60, max: 5 },
				"/delete-user": { window: 300, max: 5 },
			},
		},
		databaseHooks: {
			session: {
				create: {
					before: (session, ctx) => {
						try {
							const cf = (
								ctx?.request as { cf?: Record<string, unknown> } | undefined
							)?.cf;
							if (!cf) {
								return Promise.resolve({ data: session });
							}
							return Promise.resolve({
								data: {
									...session,
									geoCountry: asString(cf.country),
									geoRegion: asString(cf.region) ?? asString(cf.regionCode),
									geoCity: asString(cf.city),
								},
							});
						} catch {
							return Promise.resolve({ data: session });
						}
					},
				},
			},
			user: {
				create: {
					after: async (user) => {
						const displayName = user.name ?? user.email.split("@")[0] ?? "user";
						const baseSlug = displayName
							.toLowerCase()
							.replace(SLUG_SANITIZE_REGEX, "-")
							.replace(SLUG_TRIM_REGEX, "");
						const slug = `${baseSlug || "user"}-${user.id.slice(0, 8)}`;
						const [team] = await db
							.insert(teams)
							.values({
								name: `${displayName}'s Personal`,
								slug,
							})
							.returning();
						if (!team) {
							throw new Error(
								"Failed to auto-create Personal team for new user"
							);
						}
						await db.insert(teamMembers).values({
							teamId: team.id,
							userId: user.id,
							role: "owner",
						});
					},
				},
			},
		},
	});
}

/**
 * Lazily-initialized BetterAuth instance.
 *
 * `betterAuth({...})` reads secret env vars at construction (BETTER_AUTH_SECRET,
 * GITHUB_CLIENT_ID/SECRET) via `serverEnv`. Building it at module scope would
 * run during Cloudflare's deploy-time startup validation, where those secrets
 * are absent — failing the deploy. The Proxy defers construction to first use
 * (request time), while preserving the `auth.X` API so no call sites change.
 */
export const auth: Auth = new Proxy({} as Auth, {
	get(_target, prop) {
		cachedAuth ??= buildAuth();
		const value = Reflect.get(cachedAuth as object, prop);
		return typeof value === "function" ? value.bind(cachedAuth) : value;
	},
});
