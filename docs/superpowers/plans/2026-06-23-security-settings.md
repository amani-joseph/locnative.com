# Security Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three stubs in Settings → Security (2FA, Active Sessions, Delete Account) with production-ready features built on BetterAuth's official capabilities.

**Architecture:** Add BetterAuth's `twoFactor` plugin + `deleteUser` flow to the shared `auth` instance (`packages/auth`), backed by new Drizzle tables/columns (`packages/database`). The web app (`apps/web`) gets a `twoFactorClient`, a post-sign-in `/two-factor` verify route, and three self-contained security cards composed of pure-logic helpers (TDD) plus React UI. A central BetterAuth `after` hook writes a `security_audit_log` row for every sensitive action; session geo is captured from Cloudflare `request.cf`.

**Tech Stack:** BetterAuth 1.5.6, Drizzle ORM 0.44, Neon Postgres, TanStack Start/Router, React 19, `@locnative/ui` (Base UI + shadcn), Vitest, `qrcode`, `ua-parser-js`.

## Global Constraints

- Indent with **tabs**; **double quotes**; self-closing JSX; sorted Tailwind classes (Biome/Ultracite). Run `pnpm dlx ultracite fix <files>` (scoped to touched files only — never unscoped).
- Relative imports in server-side `.ts` files include the `.ts` extension (e.g. `./db.ts`).
- Intra-app imports use `@/`; shared packages via `@locnative/*`; type-only imports use `import type`.
- Named exports preferred; no barrel files; no `console.log` in production code.
- **DB rule:** the agent MUST NOT run DDL against the shared Neon DB. Generate the migration only; the user runs `pnpm --filter @locnative/database db:migrate`.
- BetterAuth client methods return `{ data, error }` — always check `error` before using `data`.
- App name / TOTP issuer is exactly `"Locnative"`.
- Test convention: extract pure logic into modules; test with Vitest (`describe/it/expect`); no DOM renderer.

---

### Task 1: Database schema + migration

**Files:**
- Modify: `packages/database/src/schema/auth.ts` (add `twoFactors` table, `user.twoFactorEnabled`, session geo columns)
- Create: `packages/database/src/schema/security.ts` (audit log table)
- Modify: `packages/database/src/schema/index.ts` (re-export new tables/types)
- Modify: `packages/database/src/index.ts` (re-export new tables/types)
- Generated: `packages/database/drizzle/0016_*.sql` (via `db:generate`)

**Interfaces:**
- Produces: tables `twoFactors` (`two_factor`), `securityAuditLog` (`security_audit_log`); `users.twoFactorEnabled`; `sessions.geoCountry/geoRegion/geoCity`; types `SecurityAuditLog`, `NewSecurityAuditLog`.

- [ ] **Step 1: Add 2FA + geo columns to `auth.ts`**

In `packages/database/src/schema/auth.ts`, add `boolean` is already imported. Add to the `users` table definition (before the table-extras callback), a new column:

```ts
		twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
```

Add to the `sessions` table (after `userAgent`):

```ts
		geoCountry: text("geo_country"),
		geoRegion: text("geo_region"),
		geoCity: text("geo_city"),
```

Add a new `twoFactors` table at the end of the file (before `authSchema`):

```ts
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
```

Add `twoFactor: twoFactors` to the `authSchema` object, and add the inferred types:

```ts
export type TwoFactor = typeof twoFactors.$inferSelect;
export type NewTwoFactor = typeof twoFactors.$inferInsert;
```

- [ ] **Step 2: Create the audit-log schema file**

Create `packages/database/src/schema/security.ts`:

```ts
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth.ts";

export const securityAuditLog = pgTable(
	"security_audit_log",
	{
		id: text("id").primaryKey(),
		// Null after the user is deleted so audit history survives deletion.
		userId: text("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		action: text("action").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("security_audit_log_user_created_idx").on(
			table.userId,
			table.createdAt
		),
	]
);

export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type NewSecurityAuditLog = typeof securityAuditLog.$inferInsert;
```

- [ ] **Step 3: Re-export from schema index + package index**

In `packages/database/src/schema/index.ts`, add exports for `twoFactors`, `securityAuditLog`, and the new types (follow the file's existing export style). In `packages/database/src/index.ts`, add `twoFactors` and `securityAuditLog` to the value re-export block and `SecurityAuditLog`, `NewSecurityAuditLog`, `TwoFactor`, `NewTwoFactor` to the type re-export block (keep alphabetical ordering as in the file).

- [ ] **Step 4: Typecheck the schema**

Run: `pnpm --filter @locnative/database exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 5: Generate the migration (DO NOT migrate)**

Run: `pnpm --filter @locnative/database db:generate`
Expected: a new file `packages/database/drizzle/0016_*.sql` containing `CREATE TABLE "two_factor"`, `CREATE TABLE "security_audit_log"`, `ALTER TABLE "user" ADD COLUMN "two_factor_enabled"`, and three `ALTER TABLE "session" ADD COLUMN "geo_*"`. Open the file and confirm. **Do not run `db:migrate`.**

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/schema/auth.ts packages/database/src/schema/security.ts packages/database/src/schema/index.ts packages/database/src/index.ts packages/database/drizzle/
git commit -m "feat(db): schema + migration for 2FA, session geo, security audit log"
```

---

### Task 2: Audit-action mapper (pure logic, TDD)

**Files:**
- Create: `packages/auth/src/audit.ts`
- Test: `packages/auth/src/audit.test.ts`

**Interfaces:**
- Produces: `mapAuditAction(path: string): string | null` — maps a BetterAuth endpoint path to a stable audit action name, or `null` for paths that should not be audited.

- [ ] **Step 1: Write the failing test**

Create `packages/auth/src/audit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapAuditAction } from "./audit.ts";

describe("mapAuditAction", () => {
	it("maps two-factor endpoints", () => {
		expect(mapAuditAction("/two-factor/enable")).toBe("two_factor.enable");
		expect(mapAuditAction("/two-factor/disable")).toBe("two_factor.disable");
		expect(mapAuditAction("/two-factor/verify-totp")).toBe(
			"two_factor.verify"
		);
		expect(mapAuditAction("/two-factor/generate-backup-codes")).toBe(
			"two_factor.regenerate_backup_codes"
		);
	});

	it("maps session + deletion endpoints", () => {
		expect(mapAuditAction("/revoke-session")).toBe("session.revoke");
		expect(mapAuditAction("/revoke-sessions")).toBe("session.revoke_all");
		expect(mapAuditAction("/revoke-other-sessions")).toBe(
			"session.revoke_others"
		);
		expect(mapAuditAction("/delete-user")).toBe("account.delete");
	});

	it("maps sign-in and ignores everything else", () => {
		expect(mapAuditAction("/sign-in/email")).toBe("auth.sign_in");
		expect(mapAuditAction("/get-session")).toBeNull();
		expect(mapAuditAction("/unknown")).toBeNull();
	});

	it("tolerates a leading base path", () => {
		expect(mapAuditAction("/api/auth/two-factor/enable")).toBe(
			"two_factor.enable"
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @locnative/auth exec vitest run src/audit.test.ts`
Expected: FAIL ("Cannot find module './audit.ts'").

- [ ] **Step 3: Write the implementation**

Create `packages/auth/src/audit.ts`:

```ts
const ACTION_BY_SUFFIX: Record<string, string> = {
	"/two-factor/enable": "two_factor.enable",
	"/two-factor/disable": "two_factor.disable",
	"/two-factor/verify-totp": "two_factor.verify",
	"/two-factor/verify-backup-code": "two_factor.verify",
	"/two-factor/generate-backup-codes": "two_factor.regenerate_backup_codes",
	"/revoke-session": "session.revoke",
	"/revoke-sessions": "session.revoke_all",
	"/revoke-other-sessions": "session.revoke_others",
	"/delete-user": "account.delete",
};

const SIGN_IN_PREFIX = "/sign-in/";

/**
 * Map a BetterAuth endpoint path to a stable audit action name. Returns null
 * for paths that should not be recorded. Tolerates an optional `/api/auth`
 * base prefix so it works whether or not the handler strips it.
 */
export function mapAuditAction(path: string): string | null {
	const normalized = path.replace(/^\/api\/auth/, "");
	for (const [suffix, action] of Object.entries(ACTION_BY_SUFFIX)) {
		if (normalized === suffix) {
			return action;
		}
	}
	if (normalized.startsWith(SIGN_IN_PREFIX)) {
		return "auth.sign_in";
	}
	return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @locnative/auth exec vitest run src/audit.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/audit.ts packages/auth/src/audit.test.ts
git commit -m "feat(auth): audit-action path mapper with tests"
```

---

### Task 3: Wire 2FA, deletion, audit hook, geo capture, rate limits into auth config

**Files:**
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/package.json` (no new deps — `better-auth` already present; verify `nanoid` or use `crypto.randomUUID()` for audit ids)

**Interfaces:**
- Consumes: `mapAuditAction` (Task 2); `securityAuditLog`, `db` (Task 1).
- Produces: an `auth` instance exposing `/api/auth/two-factor/*`, `/api/auth/delete-user`, and writing audit rows; sessions populated with geo.

- [ ] **Step 1: Add imports + plugin + deletion config**

In `packages/auth/src/index.ts`, add imports near the top:

```ts
import { securityAuditLog } from "@locnative/database";
import { twoFactor } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { mapAuditAction } from "./audit.ts";
```

In the `betterAuth({ ... })` call, add `appName`, `plugins`, and a `user.deleteUser` block (place `appName` near `baseURL`):

```ts
	appName: "Locnative",
	plugins: [twoFactor()],
	user: {
		deleteUser: { enabled: true },
	},
```

- [ ] **Step 2: Add the audit `after` hook**

Add a top-level `hooks` block to the config. It reads the request IP/UA and writes an audit row; failures are swallowed so auth responses never break:

```ts
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
				const userId = ctx.context.session?.user?.id ?? null;
				await db.insert(securityAuditLog).values({
					id: crypto.randomUUID(),
					userId,
					action,
					ipAddress,
					userAgent,
					metadata: null,
				});
			} catch {
				// Audit logging must never fail the auth response.
			}
		}),
	},
```

> Note: `ctx.context.session` may be undefined on sign-in (session not yet established). `userId` null in that case is acceptable.

- [ ] **Step 3: Capture session geo from Cloudflare `request.cf`**

Extend the existing `databaseHooks` object with a `session.create.before` hook (the file already has `databaseHooks.user.create.after`; add a sibling `session` key):

```ts
		session: {
			create: {
				before: (session, ctx) => {
					try {
						const cf = (
							ctx?.request as { cf?: Record<string, unknown> } | undefined
						)?.cf;
						if (!cf) {
							return { data: session };
						}
						return {
							data: {
								...session,
								geoCountry: (cf.country as string | undefined) ?? null,
								geoRegion:
									(cf.region as string | undefined) ??
									(cf.regionCode as string | undefined) ??
									null,
								geoCity: (cf.city as string | undefined) ?? null,
							},
						};
					} catch {
						return { data: session };
					}
				},
			},
		},
```

- [ ] **Step 4: Tighten rate limits for sensitive paths**

Replace the existing `rateLimit` block with one that keeps the global default and adds stricter custom rules:

```ts
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
```

- [ ] **Step 5: Typecheck the auth package**

Run: `pnpm --filter @locnative/auth exec tsc --noEmit`
Expected: PASS. If `ctx.context.session` typing complains, narrow with optional chaining as written above.

- [ ] **Step 6: Build the server to confirm plugin wiring resolves**

Run: `pnpm --filter @locnative/server exec tsc --noEmit`
Expected: PASS (the Worker imports `auth` and must still typecheck).

- [ ] **Step 7: Commit**

```bash
git add packages/auth/src/index.ts packages/auth/package.json
git commit -m "feat(auth): enable twoFactor + deleteUser, audit hook, session geo, rate limits"
```

---

### Task 4: Auth client — twoFactorClient + dependencies

**Files:**
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `apps/web/package.json` (add `qrcode`, `ua-parser-js`, `@types/qrcode`)

**Interfaces:**
- Produces: exports `twoFactor`, `listSessions`, `revokeSession`, `revokeSessions`, `revokeOtherSessions`, `deleteUser` from `@/lib/auth-client`; sign-in redirects to `/two-factor` when 2FA is required.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @locnative/web add qrcode ua-parser-js && pnpm --filter @locnative/web add -D @types/qrcode`
Expected: deps added to `apps/web/package.json`; lockfile updated. (`ua-parser-js` ships its own types.)

- [ ] **Step 2: Add the twoFactorClient plugin + exports**

Replace the body of `apps/web/src/lib/auth-client.ts` after `getAuthBaseUrl` with:

```ts
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: getAuthBaseUrl(),
	fetchOptions: {
		credentials: "include",
	},
	plugins: [
		twoFactorClient({
			onTwoFactorRedirect() {
				if (typeof window !== "undefined") {
					window.location.href = "/two-factor";
				}
			},
		}),
	],
});

export const {
	useSession,
	signIn,
	signUp,
	signOut,
	requestPasswordReset,
	resetPassword,
	twoFactor,
	listSessions,
	revokeSession,
	revokeSessions,
	revokeOtherSessions,
	deleteUser,
} = authClient;
```

(Keep the existing `import { createAuthClient } from "better-auth/react";` and the `getAuthBaseUrl` function unchanged.)

- [ ] **Step 3: Typecheck the web app**

Run: `pnpm --filter @locnative/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth-client.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add twoFactorClient + session/deletion client exports"
```

---

### Task 5: Security helper library (pure logic, TDD)

**Files:**
- Create: `apps/web/src/lib/security/ua.ts`
- Test: `apps/web/src/lib/security/ua.test.ts`
- Create: `apps/web/src/lib/security/backup-codes.ts`
- Test: `apps/web/src/lib/security/backup-codes.test.ts`
- Create: `apps/web/src/lib/security/totp-uri.ts`
- Test: `apps/web/src/lib/security/totp-uri.test.ts`
- Create: `apps/web/src/lib/security/delete-confirmation.ts`
- Test: `apps/web/src/lib/security/delete-confirmation.test.ts`

**Interfaces:**
- Produces:
  - `parseUserAgent(ua: string | null | undefined): { device: string; browser: string; os: string }`
  - `formatBackupCodes(codes: string[]): string`
  - `backupCodesFilename(email: string | null | undefined): string`
  - `extractTotpSecret(uri: string): string | null`
  - `validateDeleteConfirmation(input: DeleteConfirmationInput): { valid: boolean; errors: Record<string, string> }`

- [ ] **Step 1: Write failing tests for UA parsing**

Create `apps/web/src/lib/security/ua.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./ua.ts";

const CHROME_MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SAFARI_IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("parseUserAgent", () => {
	it("parses a desktop browser", () => {
		const r = parseUserAgent(CHROME_MAC);
		expect(r.browser).toContain("Chrome");
		expect(r.os).toContain("mac");
		expect(r.device).toBe("Desktop");
	});

	it("parses a mobile browser", () => {
		const r = parseUserAgent(SAFARI_IPHONE);
		expect(r.device).toBe("Mobile");
		expect(r.os).toContain("iOS");
	});

	it("falls back to Unknown for empty input", () => {
		expect(parseUserAgent(null)).toEqual({
			device: "Unknown",
			browser: "Unknown",
			os: "Unknown",
		});
	});
});
```

- [ ] **Step 2: Run UA test (fails)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/ua.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement UA parsing**

Create `apps/web/src/lib/security/ua.ts`:

```ts
import { UAParser } from "ua-parser-js";

export type ParsedUserAgent = {
	device: string;
	browser: string;
	os: string;
};

const UNKNOWN: ParsedUserAgent = {
	device: "Unknown",
	browser: "Unknown",
	os: "Unknown",
};

/** Parse a session user-agent string into human-readable device/browser/os. */
export function parseUserAgent(
	ua: string | null | undefined
): ParsedUserAgent {
	if (!ua) {
		return UNKNOWN;
	}
	const parsed = new UAParser(ua).getResult();
	const deviceType = parsed.device.type;
	let device = "Desktop";
	if (deviceType === "mobile") {
		device = "Mobile";
	} else if (deviceType === "tablet") {
		device = "Tablet";
	}
	const browser = parsed.browser.name
		? `${parsed.browser.name}${parsed.browser.version ? ` ${parsed.browser.version.split(".")[0]}` : ""}`
		: "Unknown";
	const os = parsed.os.name
		? `${parsed.os.name}${parsed.os.version ? ` ${parsed.os.version}` : ""}`
		: "Unknown";
	return { device, browser, os };
}
```

- [ ] **Step 4: Run UA test (passes)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/ua.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing tests for backup codes**

Create `apps/web/src/lib/security/backup-codes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backupCodesFilename, formatBackupCodes } from "./backup-codes.ts";

describe("formatBackupCodes", () => {
	it("renders one code per line with a header", () => {
		const out = formatBackupCodes(["AAAA-BBBB", "CCCC-DDDD"]);
		expect(out).toContain("Locnative backup codes");
		expect(out).toContain("AAAA-BBBB");
		expect(out.trim().split("\n").at(-1)).toBe("CCCC-DDDD");
	});
});

describe("backupCodesFilename", () => {
	it("derives a safe filename from the email", () => {
		expect(backupCodesFilename("jo@x.com")).toBe(
			"locnative-backup-codes-jo-at-x-com.txt"
		);
	});
	it("falls back when email missing", () => {
		expect(backupCodesFilename(null)).toBe("locnative-backup-codes.txt");
	});
});
```

- [ ] **Step 6: Run backup-codes test (fails)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/backup-codes.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement backup codes**

Create `apps/web/src/lib/security/backup-codes.ts`:

```ts
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
```

- [ ] **Step 8: Run backup-codes test (passes)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/backup-codes.test.ts`
Expected: PASS.

- [ ] **Step 9: Write failing tests for TOTP secret extraction**

Create `apps/web/src/lib/security/totp-uri.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractTotpSecret } from "./totp-uri.ts";

describe("extractTotpSecret", () => {
	it("extracts the secret query param", () => {
		const uri =
			"otpauth://totp/Locnative:jo@x.com?secret=JBSWY3DPEHPK3PXP&issuer=Locnative";
		expect(extractTotpSecret(uri)).toBe("JBSWY3DPEHPK3PXP");
	});
	it("returns null when absent or malformed", () => {
		expect(extractTotpSecret("not-a-uri")).toBeNull();
		expect(extractTotpSecret("otpauth://totp/x?issuer=y")).toBeNull();
	});
});
```

- [ ] **Step 10: Run totp-uri test (fails)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/totp-uri.test.ts`
Expected: FAIL.

- [ ] **Step 11: Implement TOTP secret extraction**

Create `apps/web/src/lib/security/totp-uri.ts`:

```ts
/** Extract the base32 `secret` from an otpauth:// TOTP URI for manual entry. */
export function extractTotpSecret(uri: string): string | null {
	const match = uri.match(/[?&]secret=([^&]+)/i);
	if (!match) {
		return null;
	}
	return decodeURIComponent(match[1]);
}
```

- [ ] **Step 12: Run totp-uri test (passes)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/totp-uri.test.ts`
Expected: PASS.

- [ ] **Step 13: Write failing tests for delete confirmation**

Create `apps/web/src/lib/security/delete-confirmation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDeleteConfirmation } from "./delete-confirmation.ts";

const base = {
	typedEmail: "jo@x.com",
	accountEmail: "jo@x.com",
	password: "supersecret",
	twoFactorEnabled: false,
	totpCode: "",
};

describe("validateDeleteConfirmation", () => {
	it("passes when email matches and password present (no 2FA)", () => {
		expect(validateDeleteConfirmation(base).valid).toBe(true);
	});
	it("fails on email mismatch", () => {
		const r = validateDeleteConfirmation({ ...base, typedEmail: "no@x.com" });
		expect(r.valid).toBe(false);
		expect(r.errors.email).toBeDefined();
	});
	it("requires a password", () => {
		const r = validateDeleteConfirmation({ ...base, password: "" });
		expect(r.valid).toBe(false);
		expect(r.errors.password).toBeDefined();
	});
	it("requires a 6-digit code when 2FA is on", () => {
		const r = validateDeleteConfirmation({
			...base,
			twoFactorEnabled: true,
			totpCode: "123",
		});
		expect(r.valid).toBe(false);
		expect(r.errors.totpCode).toBeDefined();
	});
	it("passes with valid code when 2FA is on", () => {
		expect(
			validateDeleteConfirmation({
				...base,
				twoFactorEnabled: true,
				totpCode: "123456",
			}).valid
		).toBe(true);
	});
});
```

- [ ] **Step 14: Run delete-confirmation test (fails)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/delete-confirmation.test.ts`
Expected: FAIL.

- [ ] **Step 15: Implement delete confirmation**

Create `apps/web/src/lib/security/delete-confirmation.ts`:

```ts
export type DeleteConfirmationInput = {
	typedEmail: string;
	accountEmail: string | null | undefined;
	password: string;
	twoFactorEnabled: boolean;
	totpCode: string;
};

const SIX_DIGITS = /^\d{6}$/;

/** Validate the multi-step delete-account form before allowing submission. */
export function validateDeleteConfirmation(
	input: DeleteConfirmationInput
): { valid: boolean; errors: Record<string, string> } {
	const errors: Record<string, string> = {};
	const account = (input.accountEmail ?? "").trim().toLowerCase();
	if (!account || input.typedEmail.trim().toLowerCase() !== account) {
		errors.email = "Type your account email exactly to confirm.";
	}
	if (!input.password) {
		errors.password = "Password is required.";
	}
	if (input.twoFactorEnabled && !SIX_DIGITS.test(input.totpCode.trim())) {
		errors.totpCode = "Enter the 6-digit code from your authenticator.";
	}
	return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 16: Run all security helper tests (pass)**

Run: `pnpm --filter @locnative/web exec vitest run src/lib/security/`
Expected: PASS (all four suites).

- [ ] **Step 17: Commit**

```bash
git add apps/web/src/lib/security/
git commit -m "feat(web): security helpers (ua, backup codes, totp uri, delete validation) + tests"
```

---

### Task 6: Post-sign-in `/two-factor` verification route

**Files:**
- Create: `apps/web/src/routes/_auth/two-factor.tsx`

**Interfaces:**
- Consumes: `twoFactor` from `@/lib/auth-client` (Task 4).
- Produces: route `/two-factor` that verifies a TOTP or backup code and redirects to `/dashboard` on success.

> Confirm the dashboard landing path by checking the existing post-sign-in redirect in `apps/web/src/routes/_auth/sign-in.tsx`; use the same target (referred to below as `DASHBOARD_PATH`).

- [ ] **Step 1: Create the route component**

Create `apps/web/src/routes/_auth/two-factor.tsx`:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { useState } from "react";
import { toast } from "sonner";
import { twoFactor } from "@/lib/auth-client";

const DASHBOARD_PATH = "/dashboard";

export const Route = createFileRoute("/_auth/two-factor")({
	component: TwoFactorRoute,
});

function TwoFactorRoute() {
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const [useBackup, setUseBackup] = useState(false);
	const [trustDevice, setTrustDevice] = useState(false);
	const [loading, setLoading] = useState(false);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		setLoading(true);
		const result = useBackup
			? await twoFactor.verifyBackupCode({ code: code.trim() })
			: await twoFactor.verifyTotp({ code: code.trim(), trustDevice });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Invalid code. Try again.");
			return;
		}
		navigate({ to: DASHBOARD_PATH });
	};

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-sm items-center px-4">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>Two-factor authentication</CardTitle>
					<CardDescription>
						{useBackup
							? "Enter one of your backup codes."
							: "Enter the 6-digit code from your authenticator app."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" onSubmit={submit}>
						<div className="space-y-2">
							<Label htmlFor="code">
								{useBackup ? "Backup code" : "Authentication code"}
							</Label>
							<Input
								autoComplete="one-time-code"
								autoFocus
								id="code"
								inputMode={useBackup ? "text" : "numeric"}
								onChange={(e) => setCode(e.target.value)}
								placeholder={useBackup ? "XXXXX-XXXXX" : "123456"}
								value={code}
							/>
						</div>
						{!useBackup && (
							<label className="flex items-center gap-2 text-muted-foreground text-sm">
								<input
									checked={trustDevice}
									onChange={(e) => setTrustDevice(e.target.checked)}
									type="checkbox"
								/>
								Trust this device for 30 days
							</label>
						)}
						<Button className="w-full" disabled={loading} type="submit">
							{loading ? "Verifying…" : "Verify"}
						</Button>
						<Button
							className="w-full"
							onClick={() => {
								setUseBackup((v) => !v);
								setCode("");
							}}
							type="button"
							variant="ghost"
						>
							{useBackup ? "Use authenticator app" : "Use a backup code"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
```

- [ ] **Step 2: Regenerate the route tree + typecheck**

Run: `pnpm --filter @locnative/web exec tsc --noEmit`
Expected: PASS. (The TanStack Router plugin regenerates `routeTree.gen.ts` on dev/build; if `tsc` complains the route isn't in the tree, run `pnpm --filter @locnative/web dev` briefly or the router generate script, then re-typecheck.)

- [ ] **Step 3: Lint touched files**

Run: `pnpm dlx ultracite fix apps/web/src/routes/_auth/two-factor.tsx`
Expected: file formatted, no remaining errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_auth/two-factor.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): post-sign-in two-factor verification route"
```

---

### Task 7: Two-Factor card component

**Files:**
- Create: `apps/web/src/components/settings/security/two-factor-card.tsx`

**Interfaces:**
- Consumes: `twoFactor`, `useSession` (Task 4); `extractTotpSecret`, `formatBackupCodes`, `backupCodesFilename` (Task 5).
- Produces: `<TwoFactorCard />` default-styled card with enable/disable/regenerate flows.

- [ ] **Step 1: Implement the component**

Create `apps/web/src/components/settings/security/two-factor-card.tsx`:

```tsx
import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { twoFactor, useSession } from "@/lib/auth-client";
import {
	backupCodesFilename,
	formatBackupCodes,
} from "@/lib/security/backup-codes.ts";
import { extractTotpSecret } from "@/lib/security/totp-uri.ts";

type Step = "password" | "scan" | "verify" | "backup";

function downloadBackupCodes(codes: string[], email: string | null | undefined) {
	const blob = new Blob([formatBackupCodes(codes)], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = backupCodesFilename(email);
	a.click();
	URL.revokeObjectURL(url);
}

export function TwoFactorCard() {
	const { data: session } = useSession();
	const enabled = Boolean(session?.user?.twoFactorEnabled);
	const email = session?.user?.email ?? null;

	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("password");
	const [password, setPassword] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [qrDataUrl, setQrDataUrl] = useState("");
	const [code, setCode] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [disableOpen, setDisableOpen] = useState(false);

	useEffect(() => {
		if (!totpUri) {
			return;
		}
		QRCode.toDataURL(totpUri, { width: 200 })
			.then(setQrDataUrl)
			.catch(() => setQrDataUrl(""));
	}, [totpUri]);

	const reset = () => {
		setStep("password");
		setPassword("");
		setTotpUri("");
		setQrDataUrl("");
		setCode("");
		setBackupCodes([]);
	};

	const startEnable = async () => {
		setLoading(true);
		const result = await twoFactor.enable({ password });
		setLoading(false);
		if (result.error || !result.data) {
			toast.error(result.error?.message ?? "Could not start 2FA setup.");
			return;
		}
		setTotpUri(result.data.totpURI);
		setBackupCodes(result.data.backupCodes);
		setStep("scan");
	};

	const verifyEnable = async () => {
		setLoading(true);
		const result = await twoFactor.verifyTotp({ code: code.trim() });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Invalid code. Try again.");
			return;
		}
		setStep("backup");
		toast.success("Two-factor authentication enabled.");
	};

	const disable = async (pw: string) => {
		setLoading(true);
		const result = await twoFactor.disable({ password: pw });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Could not disable 2FA.");
			return;
		}
		setDisableOpen(false);
		toast.success("Two-factor authentication disabled.");
	};

	const regenerate = async (pw: string) => {
		setLoading(true);
		const result = await twoFactor.generateBackupCodes({ password: pw });
		setLoading(false);
		if (result.error || !result.data) {
			toast.error(result.error?.message ?? "Could not regenerate codes.");
			return;
		}
		setBackupCodes(result.data.backupCodes);
		setStep("backup");
		setOpen(true);
		toast.success("New backup codes generated. Old codes no longer work.");
	};

	const manualKey = totpUri ? extractTotpSecret(totpUri) : null;

	return (
		<div className="flex items-center justify-between">
			<div>
				<div className="flex items-center gap-2">
					<p className="font-medium text-sm">Two-Factor Authentication</p>
					<Badge variant={enabled ? "default" : "outline"}>
						{enabled ? "Enabled" : "Disabled"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-xs">
					Add an extra layer of security to your account
				</p>
			</div>

			{enabled ? (
				<Button
					onClick={() => setDisableOpen(true)}
					size="sm"
					variant="outline"
				>
					Manage
				</Button>
			) : (
				<Button
					onClick={() => {
						reset();
						setOpen(true);
					}}
					size="sm"
					variant="outline"
				>
					Enable
				</Button>
			)}

			{/* Enable / backup-codes dialog */}
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					{step === "password" && (
						<>
							<DialogHeader>
								<DialogTitle>Enable two-factor authentication</DialogTitle>
								<DialogDescription>
									Confirm your password to begin setup.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-2">
								<Label htmlFor="tf-pw">Password</Label>
								<Input
									id="tf-pw"
									onChange={(e) => setPassword(e.target.value)}
									type="password"
									value={password}
								/>
							</div>
							<DialogFooter>
								<Button disabled={!password || loading} onClick={startEnable}>
									Continue
								</Button>
							</DialogFooter>
						</>
					)}

					{step === "scan" && (
						<>
							<DialogHeader>
								<DialogTitle>Scan the QR code</DialogTitle>
								<DialogDescription>
									Scan with Google Authenticator, 1Password, Authy, or
									Microsoft Authenticator. Then enter the 6-digit code.
								</DialogDescription>
							</DialogHeader>
							<div className="flex flex-col items-center gap-3">
								{qrDataUrl ? (
									<img alt="2FA QR code" height={200} src={qrDataUrl} width={200} />
								) : (
									<p className="text-muted-foreground text-sm">Generating…</p>
								)}
								{manualKey && (
									<p className="break-all text-center text-muted-foreground text-xs">
										Manual key: <span className="font-mono">{manualKey}</span>
									</p>
								)}
							</div>
							<DialogFooter>
								<Button onClick={() => setStep("verify")}>Next</Button>
							</DialogFooter>
						</>
					)}

					{step === "verify" && (
						<>
							<DialogHeader>
								<DialogTitle>Verify your code</DialogTitle>
								<DialogDescription>
									Enter the current 6-digit code to finish enabling 2FA.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-2">
								<Label htmlFor="tf-code">Authentication code</Label>
								<Input
									id="tf-code"
									inputMode="numeric"
									onChange={(e) => setCode(e.target.value)}
									placeholder="123456"
									value={code}
								/>
							</div>
							<DialogFooter>
								<Button disabled={code.trim().length < 6 || loading} onClick={verifyEnable}>
									Verify &amp; enable
								</Button>
							</DialogFooter>
						</>
					)}

					{step === "backup" && (
						<>
							<DialogHeader>
								<DialogTitle>Save your backup codes</DialogTitle>
								<DialogDescription>
									Store these somewhere safe. Each code works once and they
									won&apos;t be shown again.
								</DialogDescription>
							</DialogHeader>
							<ul className="grid grid-cols-2 gap-1 rounded-md bg-muted p-3 font-mono text-sm">
								{backupCodes.map((c) => (
									<li key={c}>{c}</li>
								))}
							</ul>
							<DialogFooter>
								<Button
									onClick={() => downloadBackupCodes(backupCodes, email)}
									variant="outline"
								>
									Download
								</Button>
								<Button onClick={() => setOpen(false)}>Done</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* Manage (disable / regenerate) dialog */}
			<ManageDialog
				loading={loading}
				onDisable={disable}
				onOpenChange={setDisableOpen}
				onRegenerate={regenerate}
				open={disableOpen}
			/>
		</div>
	);
}

function ManageDialog({
	open,
	onOpenChange,
	onDisable,
	onRegenerate,
	loading,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onDisable: (password: string) => void;
	onRegenerate: (password: string) => void;
	loading: boolean;
}) {
	const [password, setPassword] = useState("");
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Manage two-factor authentication</DialogTitle>
					<DialogDescription>
						Confirm your password to disable 2FA or generate new backup codes.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="tf-manage-pw">Password</Label>
					<Input
						id="tf-manage-pw"
						onChange={(e) => setPassword(e.target.value)}
						type="password"
						value={password}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={!password || loading}
						onClick={() => onRegenerate(password)}
						variant="outline"
					>
						Regenerate backup codes
					</Button>
					<Button
						disabled={!password || loading}
						onClick={() => onDisable(password)}
						variant="destructive"
					>
						Disable 2FA
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @locnative/web exec tsc --noEmit && pnpm dlx ultracite fix apps/web/src/components/settings/security/two-factor-card.tsx`
Expected: PASS, file formatted. (If `result.data.backupCodes` / `totpURI` typing differs, inspect the return type via the BetterAuth client types and adjust property access — do not cast to `any`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/settings/security/two-factor-card.tsx
git commit -m "feat(web): two-factor settings card (enable/verify/backup/disable/regenerate)"
```

---

### Task 8: Active Sessions card component

**Files:**
- Create: `apps/web/src/components/settings/security/active-sessions-card.tsx`

**Interfaces:**
- Consumes: `listSessions`, `revokeSession`, `revokeOtherSessions`, `useSession` (Task 4); `parseUserAgent` (Task 5).
- Produces: `<ActiveSessionsCard />`.

- [ ] **Step 1: Implement the component**

Create `apps/web/src/components/settings/security/active-sessions-card.tsx`:

```tsx
import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	listSessions,
	revokeOtherSessions,
	revokeSession,
	useSession,
} from "@/lib/auth-client";
import { parseUserAgent } from "@/lib/security/ua.ts";

type SessionRow = {
	id: string;
	token: string;
	userAgent?: string | null;
	ipAddress?: string | null;
	geoCity?: string | null;
	geoRegion?: string | null;
	geoCountry?: string | null;
	updatedAt: string | Date;
};

function locationLabel(s: SessionRow): string {
	const parts = [s.geoCity, s.geoRegion, s.geoCountry].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

function lastActive(value: string | Date): string {
	const d = typeof value === "string" ? new Date(value) : value;
	return d.toLocaleString();
}

export function ActiveSessionsCard() {
	const { data: current } = useSession();
	const currentToken = current?.session?.token;
	const [sessions, setSessions] = useState<SessionRow[] | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const result = await listSessions();
		if (result.error || !result.data) {
			setSessions([]);
			return;
		}
		setSessions(result.data as unknown as SessionRow[]);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const revokeOne = async (token: string) => {
		const previous = sessions;
		setSessions((s) => s?.filter((row) => row.token !== token) ?? null);
		const result = await revokeSession({ token });
		if (result.error) {
			setSessions(previous ?? null);
			toast.error("Could not revoke session.");
			return;
		}
		toast.success("Session revoked.");
		void load();
	};

	const revokeOthers = async () => {
		setBusy(true);
		const result = await revokeOtherSessions();
		setBusy(false);
		if (result.error) {
			toast.error("Could not sign out other devices.");
			return;
		}
		toast.success("Signed out of all other devices.");
		void load();
	};

	if (sessions === null) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-sm">Active Sessions</p>
					<p className="text-muted-foreground text-xs">
						Devices where you&apos;re signed in
					</p>
				</div>
				<Button
					disabled={busy || sessions.length <= 1}
					onClick={revokeOthers}
					size="sm"
					variant="outline"
				>
					Sign out other devices
				</Button>
			</div>

			{sessions.length === 0 ? (
				<p className="text-muted-foreground text-sm">No active sessions.</p>
			) : (
				<ul className="divide-y rounded-md border">
					{sessions.map((s) => {
						const ua = parseUserAgent(s.userAgent);
						const isCurrent = s.token === currentToken;
						return (
							<li
								className="flex items-center justify-between gap-3 p-3"
								key={s.id}
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<p className="truncate font-medium text-sm">
											{ua.browser} · {ua.os}
										</p>
										{isCurrent && <Badge>This device</Badge>}
									</div>
									<p className="truncate text-muted-foreground text-xs">
										{ua.device} · {s.ipAddress ?? "Unknown IP"} ·{" "}
										{locationLabel(s)}
									</p>
									<p className="text-muted-foreground text-xs">
										Last active {lastActive(s.updatedAt)}
									</p>
								</div>
								{!isCurrent && (
									<Button
										onClick={() => revokeOne(s.token)}
										size="sm"
										variant="ghost"
									>
										Revoke
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @locnative/web exec tsc --noEmit && pnpm dlx ultracite fix apps/web/src/components/settings/security/active-sessions-card.tsx`
Expected: PASS. (The `as unknown as SessionRow[]` bridges BetterAuth's session type with our geo columns; if the client type already includes the geo fields, drop the cast.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/settings/security/active-sessions-card.tsx
git commit -m "feat(web): active sessions card with revoke + optimistic UI"
```

---

### Task 9: Delete Account card component

**Files:**
- Create: `apps/web/src/components/settings/security/delete-account-card.tsx`

**Interfaces:**
- Consumes: `deleteUser`, `useSession`, `twoFactor` (Task 4); `validateDeleteConfirmation` (Task 5).
- Produces: `<DeleteAccountCard />`.

- [ ] **Step 1: Implement the component**

Create `apps/web/src/components/settings/security/delete-account-card.tsx`:

```tsx
import { Button } from "@locnative/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { useState } from "react";
import { toast } from "sonner";
import { deleteUser, twoFactor, useSession } from "@/lib/auth-client";
import { validateDeleteConfirmation } from "@/lib/security/delete-confirmation.ts";

export function DeleteAccountCard() {
	const { data: session } = useSession();
	const email = session?.user?.email ?? null;
	const twoFactorEnabled = Boolean(session?.user?.twoFactorEnabled);

	const [open, setOpen] = useState(false);
	const [acknowledged, setAcknowledged] = useState(false);
	const [typedEmail, setTypedEmail] = useState("");
	const [password, setPassword] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [loading, setLoading] = useState(false);

	const { valid, errors } = validateDeleteConfirmation({
		typedEmail,
		accountEmail: email,
		password,
		twoFactorEnabled,
		totpCode,
	});

	const reset = () => {
		setAcknowledged(false);
		setTypedEmail("");
		setPassword("");
		setTotpCode("");
	};

	const confirmDelete = async () => {
		setLoading(true);
		// When 2FA is on, verify the TOTP code first so deletion is gated on it.
		if (twoFactorEnabled) {
			const verify = await twoFactor.verifyTotp({ code: totpCode.trim() });
			if (verify.error) {
				setLoading(false);
				toast.error("Invalid 2FA code.");
				return;
			}
		}
		const result = await deleteUser({ password, callbackURL: "/" });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Could not delete account.");
			return;
		}
		toast.success("Account deleted.");
		window.location.href = "/";
	};

	return (
		<div className="flex items-center justify-between">
			<div>
				<p className="font-medium text-destructive text-sm">Delete Account</p>
				<p className="text-muted-foreground text-xs">
					Permanently delete your account and all data
				</p>
			</div>
			<Button
				onClick={() => {
					reset();
					setOpen(true);
				}}
				size="sm"
				variant="destructive"
			>
				Delete
			</Button>

			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					{acknowledged ? (
						<>
							<DialogHeader>
								<DialogTitle>Confirm account deletion</DialogTitle>
								<DialogDescription>
									Type your email and re-enter your password to continue.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-3">
								<div className="space-y-2">
									<Label htmlFor="del-email">
										Type your email ({email}) to confirm
									</Label>
									<Input
										autoComplete="off"
										id="del-email"
										onChange={(e) => setTypedEmail(e.target.value)}
										value={typedEmail}
									/>
									{typedEmail && errors.email && (
										<p className="text-destructive text-xs">{errors.email}</p>
									)}
								</div>
								<div className="space-y-2">
									<Label htmlFor="del-pw">Password</Label>
									<Input
										id="del-pw"
										onChange={(e) => setPassword(e.target.value)}
										type="password"
										value={password}
									/>
								</div>
								{twoFactorEnabled && (
									<div className="space-y-2">
										<Label htmlFor="del-totp">Authentication code</Label>
										<Input
											id="del-totp"
											inputMode="numeric"
											onChange={(e) => setTotpCode(e.target.value)}
											placeholder="123456"
											value={totpCode}
										/>
									</div>
								)}
							</div>
							<DialogFooter>
								<Button onClick={() => setOpen(false)} variant="outline">
									Cancel
								</Button>
								<Button
									disabled={!valid || loading}
									onClick={confirmDelete}
									variant="destructive"
								>
									{loading ? "Deleting…" : "Permanently delete"}
								</Button>
							</DialogFooter>
						</>
					) : (
						<>
							<DialogHeader>
								<DialogTitle>Delete your account?</DialogTitle>
								<DialogDescription>
									This action is permanent and cannot be undone.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-3 text-sm">
								<div>
									<p className="font-medium">This will permanently delete:</p>
									<ul className="list-disc pl-5 text-muted-foreground">
										<li>Your account and profile</li>
										<li>All projects and API keys</li>
										<li>All active sessions and 2FA settings</li>
										<li>Team memberships you own</li>
									</ul>
								</div>
								<div>
									<p className="font-medium">Retained for legal/compliance:</p>
									<ul className="list-disc pl-5 text-muted-foreground">
										<li>Billing and invoice records</li>
										<li>Security audit logs (anonymized)</li>
									</ul>
								</div>
							</div>
							<DialogFooter>
								<Button onClick={() => setOpen(false)} variant="outline">
									Cancel
								</Button>
								<Button
									onClick={() => setAcknowledged(true)}
									variant="destructive"
								>
									I understand, continue
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @locnative/web exec tsc --noEmit && pnpm dlx ultracite fix apps/web/src/components/settings/security/delete-account-card.tsx`
Expected: PASS, formatted.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/settings/security/delete-account-card.tsx
git commit -m "feat(web): delete-account card with multi-step confirmation + reauth"
```

---

### Task 10: Wire the cards into the Settings security tab

**Files:**
- Modify: `apps/web/src/routes/_protected/settings.tsx` (replace the security `TabsContent` body)

**Interfaces:**
- Consumes: `TwoFactorCard` (Task 7), `ActiveSessionsCard` (Task 8), `DeleteAccountCard` (Task 9).

- [ ] **Step 1: Import the cards**

In `apps/web/src/routes/_protected/settings.tsx`, add near the other imports:

```tsx
import { ActiveSessionsCard } from "@/components/settings/security/active-sessions-card.tsx";
import { DeleteAccountCard } from "@/components/settings/security/delete-account-card.tsx";
import { TwoFactorCard } from "@/components/settings/security/two-factor-card.tsx";
```

- [ ] **Step 2: Replace the security tab content**

Replace the three stub blocks inside `<TabsContent value="security">` → `<CardContent className="space-y-6">` (the Two-Factor / Active Sessions / Delete Account `<div>`s and their `<Separator />`s) with:

```tsx
							<TwoFactorCard />
							<Separator />
							<ActiveSessionsCard />
							<Separator />
							<DeleteAccountCard />
```

(Keep the surrounding `Card`, `CardHeader`, `CardContent`. `Separator` is already imported.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @locnative/web exec tsc --noEmit && pnpm dlx ultracite fix apps/web/src/routes/_protected/settings.tsx`
Expected: PASS, formatted.

- [ ] **Step 4: Full web test + build**

Run: `pnpm --filter @locnative/web exec vitest run && pnpm --filter @locnative/web build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_protected/settings.tsx
git commit -m "feat(web): wire production security cards into settings"
```

---

## Final verification (after all tasks)

- [ ] **Run the whole affected test suite**

Run: `pnpm --filter @locnative/auth exec vitest run && pnpm --filter @locnative/web exec vitest run`
Expected: all PASS.

- [ ] **Typecheck the three touched packages**

Run: `pnpm --filter @locnative/database exec tsc --noEmit && pnpm --filter @locnative/auth exec tsc --noEmit && pnpm --filter @locnative/web exec tsc --noEmit`
Expected: all PASS.

- [ ] **Hand the migration to the user**

Tell the user the generated migration `packages/database/drizzle/0016_*.sql` is ready and must be applied with `pnpm --filter @locnative/database db:migrate` against the shared Neon DB (agent must not run it). 2FA, sessions geo, and the audit log will not function until the migration is applied.

- [ ] **Manual smoke test (user, after migration)**
  1. Enable 2FA → scan QR in an authenticator → verify code → download backup codes.
  2. Sign out, sign back in → redirected to `/two-factor` → verify with TOTP and with a backup code.
  3. Open Settings → Security → confirm sessions list shows device/browser/OS/IP/location/last-active and "This device"; revoke another session; "Sign out other devices".
  4. Regenerate backup codes; disable 2FA.
  5. Delete a throwaway account end-to-end; confirm sessions invalidated and audit rows written.

## Spec coverage check

- 2FA enable/disable/verify/QR/manual key/backup codes/regenerate/status/states → Tasks 3,4,7 (+ helpers 5).
- 2FA required at authentication → Tasks 3 (plugin), 4 (`onTwoFactorRedirect`), 6 (`/two-factor`).
- Sessions list w/ device/browser/OS/IP/location/last-active/current + revoke one/others + immediate server-side invalidation + real-time UI → Tasks 1 (geo), 3 (geo capture), 8.
- Account deletion: reauth + 2FA gate + multi-step modal + data retention copy + session invalidation + cascade cleanup → Tasks 3 (deleteUser + cascades), 9.
- Audit logging → Tasks 1, 2, 3.
- Rate limiting → Task 3. Input validation → Zod/BetterAuth + Task 5 helpers. Responsiveness/design-system consistency → Tasks 7–10 (UI package primitives).
- Migrations/schema → Task 1 (generated, user-applied).
