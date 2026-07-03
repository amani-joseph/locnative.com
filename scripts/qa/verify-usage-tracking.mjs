// Read-only verification of usage tracking + billing counter state.
// Usage: node scripts/qa/verify-usage-tracking.mjs
// Loads DATABASE_URL from apps/server/.env. Performs SELECTs only.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL_REGEX = /^DATABASE_URL=(.*)$/m;
const SURROUNDING_QUOTES_REGEX = /^["']|["']$/g;

function loadDbUrl() {
	if (process.env.DATABASE_URL) {
		return process.env.DATABASE_URL;
	}
	for (const p of ["apps/server/.env", "apps/web/.env", ".env"]) {
		try {
			const txt = readFileSync(p, "utf8");
			const m = txt.match(DATABASE_URL_REGEX);
			if (m) {
				return m[1].trim().replace(SURROUNDING_QUOTES_REGEX, "");
			}
		} catch {
			/* next */
		}
	}
	throw new Error("DATABASE_URL not found");
}

const sql = neon(loadDbUrl());

const out = {};

// Overall usage table state by source + recent dates
out.usageBySource = await sql`
	SELECT request_source,
	       count(*)::int AS rows,
	       coalesce(sum(request_count),0)::int AS total_requests
	FROM api_usage_daily
	GROUP BY request_source
	ORDER BY total_requests DESC`;

out.usageRecentDates = await sql`
	SELECT usage_date,
	       count(*)::int AS rows,
	       coalesce(sum(request_count),0)::int AS total_requests
	FROM api_usage_daily
	WHERE usage_date >= (current_date - 7)
	GROUP BY usage_date
	ORDER BY usage_date DESC`;

// Billing accounts: who has counters, ordered by most recently updated
out.billingAccounts = await sql`
	SELECT id, owner_type,
	       left(coalesce(user_id,''),8) AS user_prefix,
	       has_payment_method, free_allotment,
	       current_period_start, current_period_requests, blocked,
	       updated_at
	FROM billing_accounts
	ORDER BY updated_at DESC
	LIMIT 10`;

// Most recently used API keys (which account is active)
out.recentKeys = await sql`
	SELECT left(id::text,8) AS key_prefix,
	       left(user_id,8) AS user_prefix,
	       name, last_used_at
	FROM api_keys
	WHERE revoked_at IS NULL
	ORDER BY last_used_at DESC NULLS LAST
	LIMIT 10`;

// For the most-recently-updated billing account's user, cross-check usage rows
const topUser = out.billingAccounts.find((a) => a.user_prefix)?.user_prefix;
if (topUser) {
	out.topUserUsage = await sql`
		SELECT request_source, coalesce(sum(request_count),0)::int AS total
		FROM api_usage_daily
		WHERE left(user_id,8) = ${topUser}
		GROUP BY request_source`;
}

console.log(JSON.stringify(out, null, 2));
