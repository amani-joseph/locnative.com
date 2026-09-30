/**
 * Pure evaluation logic for the Neon usage monitor. No I/O: the Durable Object
 * (neon-monitor.ts) fetches a snapshot from the Neon API, feeds it through
 * these functions with the persisted state, and sends whatever they return.
 *
 * Background: docs/audits/neon-compute-audit-2026-09-30.md.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Keep a little more than a day of hourly samples for the 24h burn window. */
const SAMPLE_RETENTION_MS = DAY_MS + 2 * HOUR_MS;

export interface EndpointSnapshot {
	branchId: string;
	id: string;
	maxCu: number;
	minCu: number;
}

export interface ProjectSnapshot {
	/** Seconds the project's computes were active this billing period. */
	activeTimeSec: number;
	branches: Array<{ id: string; name: string }>;
	/** CU-seconds used this billing period. */
	cpuUsedSec: number;
	endpoints: EndpointSnapshot[];
	id: string;
	name: string;
}

export interface Sample {
	active: number;
	cpu: number;
	t: number;
}

interface ProjectBaseline {
	branches: string[];
	endpoints: string[];
}

export interface AlertRecord {
	firstSeen: number;
	lastNotified: number;
	message: string;
}

export interface MonitorState {
	alerts: Record<string, AlertRecord>;
	baseline: Record<string, ProjectBaseline>;
	/** False until the first run has recorded the org's existing inventory. */
	initialized: boolean;
	samples: Record<string, Sample[]>;
}

export interface ProjectLimits {
	burnCuHoursPerDay?: number;
	maxMinCu?: number;
}

export interface MonitorConfig {
	/** Share of the window a project must be active to count as always-on. */
	alwaysOnActiveRatio: number;
	alwaysOnWindowHours: number;
	burnCuHoursPerDay: number;
	maxMinCu: number;
	/** Per-project overrides, keyed by Neon project ID. */
	projectLimits: Record<string, ProjectLimits>;
	reminderIntervalMs: number;
}

export const DEFAULT_CONFIG: MonitorConfig = {
	alwaysOnActiveRatio: 0.9,
	alwaysOnWindowHours: 3,
	burnCuHoursPerDay: 2,
	maxMinCu: 0.25,
	projectLimits: {},
	reminderIntervalMs: DAY_MS,
};

export function emptyState(): MonitorState {
	return { alerts: {}, baseline: {}, initialized: false, samples: {} };
}

/** A condition that stays open until it clears (burn, drift, always-on). */
export interface ConditionFinding {
	key: string;
	kind: "condition";
	message: string;
}

/** A one-off event with no "resolved" state (new branch, endpoint, project). */
export interface NoticeFinding {
	key: string;
	kind: "notice";
	message: string;
}

export type Finding = ConditionFinding | NoticeFinding;

/**
 * Append this run's usage counters. Neon's counters are cumulative per billing
 * period, so a drop means the period rolled over: start the series again.
 */
export function recordSamples(
	samples: Record<string, Sample[]>,
	projects: ProjectSnapshot[],
	now: number
): Record<string, Sample[]> {
	const next: Record<string, Sample[]> = {};
	for (const project of projects) {
		const sample: Sample = {
			active: project.activeTimeSec,
			cpu: project.cpuUsedSec,
			t: now,
		};
		const previous = samples[project.id] ?? [];
		const last = previous.at(-1);
		const periodReset =
			last !== undefined &&
			(sample.cpu < last.cpu || sample.active < last.active);
		const kept = periodReset
			? []
			: previous.filter((s) => now - s.t <= SAMPLE_RETENTION_MS);
		next[project.id] = [...kept, sample];
	}
	return next;
}

/** Oldest sample no older than `windowMs`, paired with the latest sample. */
function windowBounds(
	series: Sample[],
	now: number,
	windowMs: number
): { first: Sample; last: Sample } | null {
	const last = series.at(-1);
	const first = series.find((s) => now - s.t <= windowMs);
	if (!(last && first) || first === last) {
		return null;
	}
	return { first, last };
}

function formatCuHours(cuSeconds: number): string {
	return (cuSeconds / 3600).toFixed(2);
}

function evaluateUsage(
	project: ProjectSnapshot,
	series: Sample[],
	now: number,
	config: MonitorConfig
): Finding[] {
	const findings: Finding[] = [];
	const limit =
		config.projectLimits[project.id]?.burnCuHoursPerDay ??
		config.burnCuHoursPerDay;

	// Burn: CU-hours actually consumed within the last 24h (no extrapolation,
	// so a short history can only under-report, never false-alarm).
	const day = windowBounds(series, now, DAY_MS);
	if (day) {
		const used = day.last.cpu - day.first.cpu;
		if (used / 3600 > limit) {
			const hours = ((day.last.t - day.first.t) / HOUR_MS).toFixed(1);
			findings.push({
				key: `burn:${project.id}`,
				kind: "condition",
				message: `${project.name}: used ${formatCuHours(used)} CU-h in the last ${hours}h (limit ${limit} CU-h/day).`,
			});
		}
	}

	// Always-on: active for nearly the whole window means something is
	// querying more often than the suspend timeout.
	const windowMs = config.alwaysOnWindowHours * HOUR_MS;
	const recent = windowBounds(series, now, windowMs);
	if (recent) {
		const span = recent.last.t - recent.first.t;
		const activeMs = (recent.last.active - recent.first.active) * 1000;
		const longEnough = span >= windowMs * 0.8;
		if (longEnough && activeMs / span >= config.alwaysOnActiveRatio) {
			findings.push({
				key: `always-on:${project.id}`,
				kind: "condition",
				message: `${project.name}: compute active ${Math.round((activeMs / span) * 100)}% of the last ${(span / HOUR_MS).toFixed(1)}h. Something is keeping it awake.`,
			});
		}
	}

	return findings;
}

function evaluateDrift(
	project: ProjectSnapshot,
	config: MonitorConfig
): Finding[] {
	const maxMinCu =
		config.projectLimits[project.id]?.maxMinCu ?? config.maxMinCu;
	return project.endpoints
		.filter((endpoint) => endpoint.minCu > maxMinCu)
		.map((endpoint) => ({
			key: `drift:${endpoint.id}`,
			kind: "condition" as const,
			message: `${project.name}: endpoint ${endpoint.id} has min ${endpoint.minCu} CU (expected ≤ ${maxMinCu}), max ${endpoint.maxCu} CU.`,
		}));
}

function evaluateInventory(
	project: ProjectSnapshot,
	baseline: ProjectBaseline | undefined,
	initialized: boolean
): { findings: Finding[]; next: ProjectBaseline } {
	const next: ProjectBaseline = {
		branches: project.branches.map((b) => b.id),
		endpoints: project.endpoints.map((e) => e.id),
	};
	if (!initialized) {
		return { findings: [], next };
	}
	if (!baseline) {
		return {
			findings: [
				{
					key: `new-project:${project.id}`,
					kind: "notice",
					message: `New Neon project "${project.name}" (${project.id}) with ${project.branches.length} branch(es).`,
				},
			],
			next,
		};
	}
	const findings: Finding[] = [];
	const knownBranches = new Set(baseline.branches);
	for (const branch of project.branches) {
		if (!knownBranches.has(branch.id)) {
			findings.push({
				key: `new-branch:${branch.id}`,
				kind: "notice",
				message: `${project.name}: new branch "${branch.name}" (${branch.id}).`,
			});
		}
	}
	const knownEndpoints = new Set(baseline.endpoints);
	for (const endpoint of project.endpoints) {
		if (!knownEndpoints.has(endpoint.id)) {
			findings.push({
				key: `new-endpoint:${endpoint.id}`,
				kind: "notice",
				message: `${project.name}: new compute ${endpoint.id} on branch ${endpoint.branchId} (${endpoint.minCu}–${endpoint.maxCu} CU).`,
			});
		}
	}
	return { findings, next };
}

/** Evaluate one snapshot of the org against the persisted state. */
export function evaluate(
	projects: ProjectSnapshot[],
	state: MonitorState,
	now: number,
	config: MonitorConfig = DEFAULT_CONFIG
): { findings: Finding[]; state: MonitorState } {
	const samples = recordSamples(state.samples, projects, now);
	const baseline: Record<string, ProjectBaseline> = {};
	const findings: Finding[] = [];

	for (const project of projects) {
		findings.push(
			...evaluateUsage(project, samples[project.id] ?? [], now, config),
			...evaluateDrift(project, config)
		);
		const inventory = evaluateInventory(
			project,
			state.baseline[project.id],
			state.initialized
		);
		findings.push(...inventory.findings);
		baseline[project.id] = inventory.next;
	}

	return {
		findings,
		state: { ...state, baseline, initialized: true, samples },
	};
}

export interface AlertPlan {
	alerts: Record<string, AlertRecord>;
	lines: string[];
}

/**
 * Turn findings into messages: alert when a condition first appears, remind
 * once per `reminderIntervalMs` while it lasts, and report when it clears.
 * Notices are sent once. `canResolve` limits which open alerts may be marked
 * resolved (e.g. only the API-error alert when the snapshot could not be read).
 */
export function planAlerts(
	findings: Finding[],
	alerts: Record<string, AlertRecord>,
	now: number,
	reminderIntervalMs: number,
	canResolve: (key: string) => boolean = () => true
): AlertPlan {
	const lines: string[] = [];
	const next: Record<string, AlertRecord> = {};
	const current = new Set<string>();

	for (const finding of findings) {
		if (finding.kind === "notice") {
			lines.push(`🆕 ${finding.message}`);
			continue;
		}
		current.add(finding.key);
		const existing = alerts[finding.key];
		if (!existing) {
			lines.push(`🔴 ${finding.message}`);
			next[finding.key] = {
				firstSeen: now,
				lastNotified: now,
				message: finding.message,
			};
		} else if (now - existing.lastNotified >= reminderIntervalMs) {
			lines.push(`⏰ Still happening: ${finding.message}`);
			next[finding.key] = {
				...existing,
				lastNotified: now,
				message: finding.message,
			};
		} else {
			next[finding.key] = { ...existing, message: finding.message };
		}
	}

	for (const [key, record] of Object.entries(alerts)) {
		if (current.has(key)) {
			continue;
		}
		if (canResolve(key)) {
			lines.push(`✅ Resolved: ${record.message}`);
		} else {
			next[key] = record;
		}
	}

	return { alerts: next, lines };
}
