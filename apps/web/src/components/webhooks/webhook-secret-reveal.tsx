import { Button } from "@locnative/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

export interface WebhookSecretRevealProps {
	onClose: () => void;
	secret: string | null;
}

export function WebhookSecretReveal({
	secret,
	onClose,
}: WebhookSecretRevealProps) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		if (!secret) {
			return;
		}
		await navigator.clipboard.writeText(secret);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};
	return (
		<Dialog onOpenChange={(o) => !o && onClose()} open={secret !== null}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Webhook signing secret</DialogTitle>
					<DialogDescription>
						Copy this now — it is shown once and cannot be retrieved later. Use
						it to verify the X-Locnative-Signature HMAC.
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-2 rounded-md border bg-muted p-2 font-mono text-sm">
					<span className="flex-1 truncate">{secret}</span>
					<Button
						aria-label="Copy secret"
						onClick={copy}
						size="icon"
						variant="ghost"
					>
						{copied ? (
							<CheckIcon className="size-4" />
						) : (
							<CopyIcon className="size-4" />
						)}
					</Button>
				</div>
				<DialogFooter>
					<Button onClick={onClose}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
