import { useCallback, useEffect, useState } from "react";

export const ACTIVE_PROJECT_STORAGE_KEY = "locnative.activeProjectId";

export function readStoredProjectId(): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
}

export function writeStoredProjectId(projectId: string): void {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
}

/** Choose the active project: stored id if still present, else first, else null. */
export function resolveActiveProjectId(
	storedId: string | null,
	availableIds: string[]
): string | null {
	if (availableIds.length === 0) {
		return null;
	}
	if (storedId && availableIds.includes(storedId)) {
		return storedId;
	}
	return availableIds[0] ?? null;
}

/** React hook: tracks the active projectId given the user's project ids. */
export function useActiveProject(availableIds: string[]) {
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		setActiveId(resolveActiveProjectId(readStoredProjectId(), availableIds));
	}, [availableIds]);

	const select = useCallback((projectId: string) => {
		writeStoredProjectId(projectId);
		setActiveId(projectId);
	}, []);

	return { activeId, select };
}
