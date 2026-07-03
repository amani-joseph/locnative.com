import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ActiveProjectSelector } from "@/components/active-project-selector";
import { BatchInput } from "@/components/batch/batch-input";
import {
	JobHistory,
	type JobHistoryItem,
} from "@/components/batch/job-history";
import { JobProgress } from "@/components/batch/job-progress";
import { parseAddresses } from "@/components/batch/parse-addresses";
import { ResultsMap } from "@/components/batch/results-map";
import {
	type BatchResultRow,
	ResultsTable,
} from "@/components/batch/results-table";
import { useActiveProject } from "@/lib/active-project";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/batch")({
	component: RouteComponent,
});

interface PollResult {
	completedAt: Date | string | null;
	error: string | null;
	inputCount: number;
	jobId: string;
	processedCount: number;
	status: string;
}

function RouteComponent() {
	const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
	const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
	const { activeId, select } = useActiveProject(projectIds);

	const [submitting, setSubmitting] = useState(false);
	const [job, setJob] = useState<PollResult | null>(null);
	const [results, setResults] = useState<BatchResultRow[] | null>(null);
	const [resultView, setResultView] = useState<"table" | "map">("map");
	const [jobs, setJobs] = useState<JobHistoryItem[]>([]);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		orpcClient.projects
			.list()
			.then((rows) =>
				setProjects(rows.map((r) => ({ id: r.id, name: r.name })))
			)
			.catch(() => toast.error("Failed to load projects."));
	}, []);

	const stopPolling = useCallback(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
	}, []);

	useEffect(() => stopPolling, [stopPolling]);

	const loadResults = useCallback(async (projectId: string, jobId: string) => {
		try {
			const res = await orpcClient.geocode.batchResults({ projectId, jobId });
			setResults(res.results as BatchResultRow[]);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to load results."
			);
		}
	}, []);

	const refreshJobs = useCallback(async (projectId: string) => {
		try {
			const res = await orpcClient.geocode.batchList({ projectId });
			setJobs(
				res.jobs.map((j) => ({
					id: j.id,
					status: j.status,
					inputCount: j.inputCount,
					processedCount: j.processedCount,
					createdAt:
						typeof j.createdAt === "string"
							? j.createdAt
							: new Date(j.createdAt).toISOString(),
				}))
			);
		} catch {
			// non-critical — job history is best-effort
		}
	}, []);

	useEffect(() => {
		if (activeId) {
			refreshJobs(activeId);
		}
	}, [activeId, refreshJobs]);

	const startPolling = useCallback(
		(projectId: string, jobId: string) => {
			stopPolling();
			pollRef.current = setInterval(async () => {
				try {
					const res = await orpcClient.geocode.batchPoll({ projectId, jobId });
					setJob(res);
					if (res.status === "completed" || res.status === "failed") {
						stopPolling();
						if (res.status === "completed") {
							await loadResults(projectId, jobId);
						}
						await refreshJobs(projectId);
					}
				} catch {
					stopPolling();
				}
			}, 1500);
		},
		[stopPolling, loadResults, refreshJobs]
	);

	const handleSubmit = async (text: string) => {
		if (!activeId) {
			return;
		}
		const parsed = parseAddresses(text);
		if (parsed.error) {
			toast.error(parsed.error);
			return;
		}
		setSubmitting(true);
		setResults(null);
		try {
			const res = await orpcClient.geocode.batchSubmit({
				projectId: activeId,
				addresses: parsed.addresses,
			});
			setJob({
				jobId: res.jobId,
				status: res.status,
				inputCount: res.inputCount,
				processedCount: 0,
				completedAt: null,
				error: null,
			});
			startPolling(activeId, res.jobId);
			toast.success("Batch submitted.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to submit batch."
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="space-y-4">
			<ActiveProjectSelector
				activeId={activeId}
				onSelect={select}
				projects={projects}
			/>
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Batch geocoding</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<BatchInput onSubmit={handleSubmit} submitting={submitting} />
					{job ? (
						<JobProgress
							error={job.error}
							inputCount={job.inputCount}
							processedCount={job.processedCount}
							status={job.status}
						/>
					) : null}
					{results ? (
						<div className="space-y-2">
							<div className="flex justify-end gap-1">
								<Button
									onClick={() => setResultView("map")}
									size="sm"
									type="button"
									variant={resultView === "map" ? "secondary" : "ghost"}
								>
									Map
								</Button>
								<Button
									onClick={() => setResultView("table")}
									size="sm"
									type="button"
									variant={resultView === "table" ? "secondary" : "ghost"}
								>
									Table
								</Button>
							</div>
							{resultView === "map" ? (
								<ResultsMap results={results} />
							) : (
								<ResultsTable results={results} />
							)}
						</div>
					) : null}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Recent jobs</CardTitle>
				</CardHeader>
				<CardContent>
					<JobHistory
						jobs={jobs}
						onSelect={(id) => {
							if (activeId) {
								loadResults(activeId, id);
							}
						}}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
