/// <reference types="@cloudflare/workers-types" />

import { serverEnv } from "@locnative/env/server";
import {
	DEFAULT_CONFIG,
	emptyState,
	evaluate,
	type Finding,
	type MonitorState,
	type ProjectSnapshot,
	planAlerts,
} from "./core.ts";

const NEON_API = "https://console.neon.tech/api/v2";
const RESEND_API = "https://api.resend.com/emails";
const STATE_KEY = "state";
const API_ERROR_KEY = "monitor:neon-api";
const DISCORD_MAX_CHARS = 1900;

interface NeonProject {
	active_time: number;
	cpu_used_sec: number;
	id: string;
	name: string;
}
interface NeonEndpoint {
	autoscaling_limit_max_cu: number;
	autoscaling_limit_min_cu: number;
	branch_id: string;
	id: string;
}
interface NeonBranch {
	id: string;
	name: string;
}

async function neonGet<T>(path: string, apiKey: string): Promise<T> {
	const response = await fetch(`${NEON_API}${path}`, {
		headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
	});
	if (!response.ok) {
		throw new Error(`Neon API ${path} returned ${response.status}`);
	}
	return (await response.json()) as T;
}

/** Read every project in the org with its branches and computes. */
async function fetchOrgSnapshot(
	orgId: string,
	apiKey: string
): Promise<ProjectSnapshot[]> {
	const { projects } = await neonGet<{ projects: NeonProject[] }>(
		`/projects?org_id=${encodeURIComponent(orgId)}&limit=400`,
		apiKey
	);
	return await Promise.all(
		projects.map(async (project) => {
			const [{ branches }, { endpoints }] = await Promise.all([
				neonGet<{ branches: NeonBranch[] }>(
					`/projects/${project.id}/branches`,
					apiKey
				),
				neonGet<{ endpoints: NeonEndpoint[] }>(
					`/projects/${project.id}/endpoints`,
					apiKey
				),
			]);
			return {
				activeTimeSec: project.active_time,
				branches: branches.map((b) => ({ id: b.id, name: b.name })),
				cpuUsedSec: project.cpu_used_sec,
				endpoints: endpoints.map((e) => ({
					branchId: e.branch_id,
					id: e.id,
					maxCu: e.autoscaling_limit_max_cu,
					minCu: e.autoscaling_limit_min_cu,
				})),
				id: project.id,
				name: project.name,
			};
		})
	);
}

async function sendEmail(to: string, lines: string[]): Promise<void> {
	const response = await fetch(RESEND_API, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: serverEnv.EMAIL_FROM,
			to,
			subject: `Neon usage monitor: ${lines.length} update(s)`,
			text: `${lines.join("\n\n")}\n\nSent by the locnative-server Neon usage monitor.`,
		}),
	});
	if (!response.ok) {
		throw new Error(`Resend returned ${response.status}`);
	}
}

async function sendDiscord(webhookUrl: string, lines: string[]): Promise<void> {
	let content = `**Neon usage monitor**\n${lines.join("\n")}`;
	if (content.length > DISCORD_MAX_CHARS) {
		content = `${content.slice(0, DISCORD_MAX_CHARS)}\n… (truncated, see email)`;
	}
	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});
	if (!response.ok) {
		throw new Error(`Discord webhook returned ${response.status}`);
	}
}

/** Deliver to every configured channel; one failing channel doesn't block the other. */
async function notify(lines: string[]): Promise<void> {
	const deliveries: Promise<void>[] = [];
	const emailTo = serverEnv.NEON_MONITOR_ALERT_EMAIL;
	const webhook = serverEnv.NEON_MONITOR_DISCORD_WEBHOOK_URL;
	if (emailTo) {
		deliveries.push(sendEmail(emailTo, lines));
	}
	if (webhook) {
		deliveries.push(sendDiscord(webhook, lines));
	}
	const results = await Promise.allSettled(deliveries);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[neon-monitor] delivery failed:", result.reason);
		}
	}
}

/**
 * Hourly Neon usage monitor for the whole org. Talks only to Neon's control
 * plane API — never to Postgres — so running it never wakes a compute. A single
 * instance (see NEON_MONITOR_INSTANCE) keeps usage samples, the known branch /
 * endpoint inventory and open alerts in Durable Object storage.
 */
export class NeonMonitor implements DurableObject {
	private readonly storage: DurableObjectStorage;

	constructor(state: DurableObjectState) {
		this.storage = state.storage;
	}

	async fetch(): Promise<Response> {
		const summary = await this.run();
		return Response.json(summary);
	}

	private async run(): Promise<{ findings: number; sent: number }> {
		const apiKey = serverEnv.NEON_API_KEY;
		const orgId = serverEnv.NEON_ORG_ID;
		if (!(apiKey && orgId)) {
			console.warn(
				"[neon-monitor] NEON_API_KEY or NEON_ORG_ID not set; skipping"
			);
			return { findings: 0, sent: 0 };
		}

		const now = Date.now();
		const stored =
			(await this.storage.get<MonitorState>(STATE_KEY)) ?? emptyState();

		let findings: Finding[];
		let nextState: MonitorState;
		let canResolve: (key: string) => boolean;
		try {
			const snapshot = await fetchOrgSnapshot(orgId, apiKey);
			({ findings, state: nextState } = evaluate(
				snapshot,
				stored,
				now,
				DEFAULT_CONFIG
			));
			canResolve = () => true;
		} catch (error) {
			console.error("[neon-monitor] snapshot failed:", error);
			findings = [
				{
					key: API_ERROR_KEY,
					kind: "condition",
					message: `Could not read Neon usage: ${error instanceof Error ? error.message : String(error)}. Monitoring is blind until this clears.`,
				},
			];
			nextState = stored;
			// Without a snapshot, other alerts can't be judged — keep them open.
			canResolve = (key) => key === API_ERROR_KEY;
		}

		const plan = planAlerts(
			findings,
			stored.alerts,
			now,
			DEFAULT_CONFIG.reminderIntervalMs,
			canResolve
		);
		await this.storage.put(STATE_KEY, { ...nextState, alerts: plan.alerts });

		if (plan.lines.length > 0) {
			await notify(plan.lines);
		}
		return { findings: findings.length, sent: plan.lines.length };
	}
}

export const NEON_MONITOR_INSTANCE = "org";
