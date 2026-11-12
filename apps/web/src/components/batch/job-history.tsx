import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";
import { ListChecksIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export interface JobHistoryItem {
	createdAt: string;
	id: string;
	inputCount: number;
	processedCount: number;
	status: string;
}

export interface JobHistoryProps {
	jobs: JobHistoryItem[];
	onSelect: (jobId: string) => void;
}

export function JobHistory({ jobs, onSelect }: JobHistoryProps) {
	if (jobs.length === 0) {
		return (
			<EmptyState
				className="border-0 py-8"
				description="Submitted batches and their progress will show up here."
				icon={<ListChecksIcon />}
				title="No jobs yet"
			/>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Job</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Size</TableHead>
					<TableHead>Created</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{jobs.map((j) => (
					<TableRow
						className="cursor-pointer"
						key={j.id}
						onClick={() => onSelect(j.id)}
					>
						<TableCell className="font-mono text-xs">
							{j.id.slice(0, 8)}
						</TableCell>
						<TableCell className="text-xs capitalize">{j.status}</TableCell>
						<TableCell className="text-xs">{j.inputCount}</TableCell>
						<TableCell className="text-xs">
							{new Date(j.createdAt).toLocaleString()}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
