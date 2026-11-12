import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";
import { ListIcon, RefreshCwIcon, TrashIcon, WebhookIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export interface WebhookRow {
	active: boolean;
	createdAt: string;
	events: string[];
	failing: boolean;
	id: number;
	url: string;
	zoneId: number | null;
}

export interface WebhookListProps {
	onDelete: (id: number) => void;
	onReactivate: (id: number) => void;
	onViewDeliveries: (id: number) => void;
	webhooks: WebhookRow[];
}

export function WebhookList({
	webhooks,
	onDelete,
	onReactivate,
	onViewDeliveries,
}: WebhookListProps) {
	if (webhooks.length === 0) {
		return (
			<EmptyState
				className="border-0 py-8"
				description="Webhooks notify your endpoint when devices enter or leave a zone."
				icon={<WebhookIcon />}
				title="No webhooks yet"
			/>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>URL</TableHead>
					<TableHead>Events</TableHead>
					<TableHead>Zone</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{webhooks.map((wh) => (
					<TableRow key={wh.id}>
						<TableCell className="max-w-[240px] truncate font-mono text-xs">
							{wh.url}
						</TableCell>
						<TableCell>{wh.events.join(", ")}</TableCell>
						<TableCell>
							{wh.zoneId === null ? "All" : `#${wh.zoneId}`}
						</TableCell>
						<TableCell>
							{wh.failing ? (
								<Badge variant="destructive">Failing</Badge>
							) : (
								<Badge variant="secondary">Active</Badge>
							)}
						</TableCell>
						<TableCell className="text-right">
							<Button
								aria-label="View deliveries"
								onClick={() => onViewDeliveries(wh.id)}
								size="icon"
								variant="ghost"
							>
								<ListIcon className="size-4" />
							</Button>
							{wh.failing ? (
								<Button
									aria-label="Reactivate"
									onClick={() => onReactivate(wh.id)}
									size="icon"
									variant="ghost"
								>
									<RefreshCwIcon className="size-4" />
								</Button>
							) : null}
							<Button
								aria-label="Delete webhook"
								onClick={() => onDelete(wh.id)}
								size="icon"
								variant="ghost"
							>
								<TrashIcon className="size-4" />
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
