// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	ACTIVE_PROJECT_STORAGE_KEY,
	readStoredProjectId,
	resolveActiveProjectId,
	writeStoredProjectId,
} from "./active-project.ts";

describe("active-project store", () => {
	beforeEach(() => {
		globalThis.localStorage?.clear?.();
	});

	it("resolveActiveProjectId prefers the stored id when it is still valid", () => {
		const ids = ["a", "b", "c"];
		expect(resolveActiveProjectId("b", ids)).toBe("b");
	});

	it("resolveActiveProjectId falls back to the first id when stored is missing", () => {
		expect(resolveActiveProjectId(null, ["a", "b"])).toBe("a");
	});

	it("resolveActiveProjectId falls back to first id when stored id no longer exists", () => {
		expect(resolveActiveProjectId("gone", ["a", "b"])).toBe("a");
	});

	it("resolveActiveProjectId returns null when there are no projects", () => {
		expect(resolveActiveProjectId("a", [])).toBeNull();
	});

	it("write then read round-trips via localStorage", () => {
		writeStoredProjectId("xyz");
		expect(readStoredProjectId()).toBe("xyz");
		expect(ACTIVE_PROJECT_STORAGE_KEY).toBe("locnative.activeProjectId");
	});
});
