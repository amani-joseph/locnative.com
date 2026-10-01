import { describe, expect, it } from "vitest";
import {
	DEFAULT_CONFIG,
	emptyState,
	evaluate,
	type MonitorState,
	type ProjectSnapshot,
	planAlerts,
	recordSamples,
} from "./core.ts";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-10-01T00:30:00Z");

function project(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
	return {
		activeTimeSec: 0,
		branches: [{ id: "br-main", name: "production" }],
		cpuUsedSec: 0,
		endpoints: [{ branchId: "br-main", id: "ep-main", maxCu: 8, minCu: 0.25 }],
		id: "proj-1",
		name: "locnative",
		...overrides,
	};
}

/** Run `evaluate` hourly, with counters produced by `at(hour)`. */
function runHourly(
	hours: number,
	at: (hour: number) => Partial<ProjectSnapshot>
): ReturnType<typeof evaluate> {
	let state: MonitorState = emptyState();
	let result = evaluate([project(at(0))], state, T0);
	for (let h = 1; h <= hours; h++) {
		state = result.state;
		result = evaluate([project(at(h))], state, T0 + h * HOUR);
	}
	return result;
}

const keys = (result: ReturnType<typeof evaluate>) =>
	result.findings.map((f) => f.key);

describe("recordSamples", () => {
	it("restarts the series when the billing period resets", () => {
		const first = recordSamples({}, [project({ cpuUsedSec: 5000 })], T0);
		const next = recordSamples(first, [project({ cpuUsedSec: 10 })], T0 + HOUR);
		expect(next["proj-1"]).toEqual([{ active: 0, cpu: 10, t: T0 + HOUR }]);
	});

	it("drops samples older than ~26h", () => {
		let samples = recordSamples({}, [project()], T0);
		samples = recordSamples(samples, [project()], T0 + 30 * HOUR);
		expect(samples["proj-1"]).toHaveLength(1);
	});
});

describe("evaluate", () => {
	it("stays quiet at the pre-launch baseline", () => {
		// ~0.02 CU-h/day (one 5-min wake at 0.25 CU), active 5 min/day.
		const result = runHourly(24, (h) => ({
			activeTimeSec: h * 12,
			cpuUsedSec: h * 3,
		}));
		expect(result.findings).toEqual([]);
	});

	it("flags burn above 2 CU-h in the last 24h", () => {
		// 0.25 CU-h per hour → 6 CU-h per day.
		const result = runHourly(12, (h) => ({ cpuUsedSec: h * 900 }));
		expect(keys(result)).toContain("burn:proj-1");
	});

	it("honours a per-project burn limit", () => {
		let state = emptyState();
		state = evaluate([project({ cpuUsedSec: 0 })], state, T0).state;
		const result = evaluate(
			[project({ cpuUsedSec: 3 * 3600 })],
			state,
			T0 + HOUR,
			{
				...DEFAULT_CONFIG,
				projectLimits: { "proj-1": { burnCuHoursPerDay: 5 } },
			}
		);
		expect(keys(result)).not.toContain("burn:proj-1");
	});

	it("flags always-on compute after ~3h of continuous activity", () => {
		const result = runHourly(3, (h) => ({ activeTimeSec: h * 3600 }));
		expect(keys(result)).toContain("always-on:proj-1");
	});

	it("does not flag always-on with less than the window of history", () => {
		const result = runHourly(1, (h) => ({ activeTimeSec: h * 3600 }));
		expect(keys(result)).not.toContain("always-on:proj-1");
	});

	it("flags an endpoint whose min CU drifted above 0.25", () => {
		const result = evaluate(
			[
				project({
					endpoints: [
						{ branchId: "br-main", id: "ep-main", maxCu: 16, minCu: 8 },
					],
				}),
			],
			emptyState(),
			T0
		);
		expect(keys(result)).toEqual(["drift:ep-main"]);
	});

	it("records the existing inventory silently on the first run", () => {
		const result = evaluate([project()], emptyState(), T0);
		expect(result.findings).toEqual([]);
		expect(result.state.initialized).toBe(true);
	});

	it("reports new branches, endpoints and projects once", () => {
		const { state } = evaluate([project()], emptyState(), T0);
		const grown = project({
			branches: [
				{ id: "br-main", name: "production" },
				{ id: "br-test", name: "test" },
			],
			endpoints: [
				{ branchId: "br-main", id: "ep-main", maxCu: 8, minCu: 0.25 },
				{ branchId: "br-test", id: "ep-test", maxCu: 2, minCu: 0.25 },
			],
		});
		const other = project({ id: "proj-2", name: "other" });
		const first = evaluate([grown, other], state, T0 + HOUR);
		expect(keys(first).sort()).toEqual([
			"new-branch:br-test",
			"new-endpoint:ep-test",
			"new-project:proj-2",
		]);
		const second = evaluate([grown, other], first.state, T0 + 2 * HOUR);
		expect(second.findings).toEqual([]);
	});
});

describe("planAlerts", () => {
	const condition = {
		key: "burn:proj-1",
		kind: "condition" as const,
		message: "locnative: too much",
	};
	const DAY = 24 * HOUR;

	it("alerts once, reminds daily, then reports resolution", () => {
		const opened = planAlerts([condition], {}, T0, DAY);
		expect(opened.lines).toEqual(["🔴 locnative: too much"]);

		const quiet = planAlerts([condition], opened.alerts, T0 + HOUR, DAY);
		expect(quiet.lines).toEqual([]);

		const reminder = planAlerts([condition], quiet.alerts, T0 + DAY, DAY);
		expect(reminder.lines).toEqual(["⏰ Still happening: locnative: too much"]);

		const resolved = planAlerts([], reminder.alerts, T0 + DAY + HOUR, DAY);
		expect(resolved.lines).toEqual(["✅ Resolved: locnative: too much"]);
		expect(resolved.alerts).toEqual({});
	});

	it("sends notices without tracking them", () => {
		const plan = planAlerts(
			[{ key: "new-branch:b", kind: "notice", message: "new branch" }],
			{},
			T0,
			DAY
		);
		expect(plan.lines).toEqual(["🆕 new branch"]);
		expect(plan.alerts).toEqual({});
	});

	it("keeps alerts open when they can't be judged", () => {
		const opened = planAlerts([condition], {}, T0, DAY);
		const blind = planAlerts(
			[],
			opened.alerts,
			T0 + HOUR,
			DAY,
			(key) => key === "monitor:neon-api"
		);
		expect(blind.lines).toEqual([]);
		expect(Object.keys(blind.alerts)).toEqual(["burn:proj-1"]);
	});
});
