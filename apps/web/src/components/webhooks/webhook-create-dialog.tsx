import { Button } from "@locnative/ui/components/button";
import { Checkbox } from "@locnative/ui/components/checkbox";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { useEffect, useState } from "react";

export interface WebhookZoneOption {
	id: number;
	name: string;
}

export interface WebhookCreateValues {
	events: ("entry" | "exit")[];
	url: string;
	zoneId?: number;
}

export interface WebhookCreateDialogProps {
	onCancel: () => void;
	onSubmit: (values: WebhookCreateValues) => void;
	open: boolean;
	saving: boolean;
	zones: WebhookZoneOption[];
}

export function WebhookCreateDialog({
	open,
	saving,
	zones,
	onSubmit,
	onCancel,
}: WebhookCreateDialogProps) {
	const [url, setUrl] = useState("");
	const [entry, setEntry] = useState(true);
	const [exit, setExit] = useState(true);
	const [zoneId, setZoneId] = useState("all");

	// Reset form when dialog opens
	useEffect(() => {
		if (open) {
			setUrl("");
			setEntry(true);
			setExit(true);
			setZoneId("all");
		}
	}, [open]);

	const events: ("entry" | "exit")[] = [
		...(entry ? (["entry"] as const) : []),
		...(exit ? (["exit"] as const) : []),
	];

	return (
		<Dialog onOpenChange={(o) => !o && onCancel()} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create webhook</DialogTitle>
					<DialogDescription>
						Receive a signed POST when a device crosses a zone boundary.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="wh-url">Endpoint URL</Label>
						<Input
							id="wh-url"
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://example.com/webhooks/locnative"
							value={url}
						/>
					</div>
					<div className="space-y-2">
						<Label>Events</Label>
						<div className="flex gap-4">
							<label
								className="flex items-center gap-2 text-sm"
								htmlFor="wh-event-entry"
							>
								<Checkbox
									checked={entry}
									id="wh-event-entry"
									onCheckedChange={(v) => setEntry(v === true)}
								/>
								Entry
							</label>
							<label
								className="flex items-center gap-2 text-sm"
								htmlFor="wh-event-exit"
							>
								<Checkbox
									checked={exit}
									id="wh-event-exit"
									onCheckedChange={(v) => setExit(v === true)}
								/>
								Exit
							</label>
						</div>
					</div>
					<div className="space-y-1">
						<Label htmlFor="wh-zone">Zone</Label>
						<Select
							onValueChange={(value) => setZoneId(value ?? "all")}
							value={zoneId}
						>
							<SelectTrigger id="wh-zone">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All zones</SelectItem>
								{zones.map((z) => (
									<SelectItem key={z.id} value={String(z.id)}>
										{z.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={onCancel} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={saving || url.trim().length === 0 || events.length === 0}
						onClick={() =>
							onSubmit({
								url: url.trim(),
								events,
								zoneId: zoneId === "all" ? undefined : Number(zoneId),
							})
						}
					>
						{saving ? "Creating…" : "Create webhook"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
