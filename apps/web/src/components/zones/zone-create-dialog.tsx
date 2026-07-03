import { Button } from "@locnative/ui/components/button";
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
import { useEffect, useState } from "react";

export interface ZoneCreateDialogProps {
	onCancel: () => void;
	onSubmit: (values: { name: string; description?: string }) => void;
	open: boolean;
	saving: boolean;
}

export function ZoneCreateDialog({
	open,
	saving,
	onCancel,
	onSubmit,
}: ZoneCreateDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	useEffect(() => {
		if (!open) {
			setName("");
			setDescription("");
		}
	}, [open]);

	return (
		<Dialog onOpenChange={(o) => !o && onCancel()} open={open}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Name your zone</DialogTitle>
					<DialogDescription>
						Give the polygon you drew a name to save it.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="zone-name">Name</Label>
						<Input
							id="zone-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Sydney CBD"
							value={name}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="zone-desc">Description (optional)</Label>
						<Input
							id="zone-desc"
							onChange={(e) => setDescription(e.target.value)}
							value={description}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={onCancel} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={saving || name.trim().length === 0}
						onClick={() =>
							onSubmit({
								name: name.trim(),
								description: description.trim() || undefined,
							})
						}
					>
						{saving ? "Saving…" : "Save zone"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
