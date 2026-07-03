import { Badge } from "@locnative/ui/components/badge";
import { Button, buttonVariants } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckIcon,
	CopyIcon,
	KeyRoundIcon,
	LoaderIcon,
	PlusIcon,
	ShieldAlertIcon,
	TrashIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { orpcClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

type ApiKeyListItem = Awaited<
	ReturnType<typeof orpcClient.apiKeys.list>
>[number];

export const Route = createFileRoute("/_protected/api-keys")({
	component: RouteComponent,
});

function timeAgo(dateStr: string | null): string {
	if (!dateStr) {
		return "Never";
	}
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) {
		return "Just now";
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function CopyButton({
	ariaLabel = "Copy to clipboard",
	text,
}: {
	ariaLabel?: string;
	text: string;
}) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Button
			aria-label={ariaLabel}
			className="size-8"
			onClick={copy}
			size="icon"
			variant="ghost"
		>
			{copied ? (
				<CheckIcon className="size-4 text-green-500" />
			) : (
				<CopyIcon className="size-4" />
			)}
		</Button>
	);
}

function RevealCopyButton({ keyId }: { keyId: string }) {
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(false);

	const handleCopy = async () => {
		setLoading(true);
		try {
			const { key } = await orpcClient.apiKeys.reveal({ id: keyId });
			if (!key) {
				toast.error("This key can't be retrieved", {
					description:
						"It was created before key reveal was enabled. Revoke it and create a new key.",
				});
				return;
			}
			await navigator.clipboard.writeText(key);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy API key");
		} finally {
			setLoading(false);
		}
	};

	const renderIcon = () => {
		if (loading) {
			return <LoaderIcon className="size-4 animate-spin" />;
		}
		if (copied) {
			return <CheckIcon className="size-4 text-green-500" />;
		}
		return <CopyIcon className="size-4" />;
	};

	return (
		<Button
			aria-label="Copy full API key"
			className="size-8"
			disabled={loading}
			onClick={handleCopy}
			size="icon"
			variant="ghost"
		>
			{renderIcon()}
		</Button>
	);
}

function KeyRow({
	apiKey,
	onRevoke,
}: {
	apiKey: ApiKeyListItem;
	onRevoke: (id: string) => void;
}) {
	const [revoking, setRevoking] = useState(false);

	const handleRevoke = () => {
		setRevoking(true);
		try {
			onRevoke(apiKey.id);
		} finally {
			setRevoking(false);
		}
	};

	return (
		<div className="flex items-center justify-between rounded-lg border px-4 py-3">
			<div className="flex items-center gap-3">
				<div className="flex size-9 items-center justify-center rounded-md bg-muted">
					<KeyRoundIcon className="size-4 text-muted-foreground" />
				</div>
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium text-sm">{apiKey.name}</p>
						<Badge
							variant={
								apiKey.assignmentStatus === "assigned" ? "default" : "secondary"
							}
						>
							{apiKey.assignmentStatus === "assigned"
								? `In use by ${apiKey.assignedProjectName ?? "project"}`
								: "Unassigned"}
						</Badge>
					</div>
					<p className="font-mono text-muted-foreground text-xs">
						{apiKey.displayLabel}
					</p>
				</div>
			</div>
			<div className="flex items-center gap-4">
				<span className="hidden text-muted-foreground text-xs sm:block">
					{apiKey.lastUsedAt
						? `Used ${timeAgo(apiKey.lastUsedAt)}`
						: "Never used"}
				</span>
				<span className="hidden text-muted-foreground text-xs sm:block">
					Created {timeAgo(apiKey.createdAt)}
				</span>
				<RevealCopyButton keyId={apiKey.id} />
				<Button
					className="size-8 text-destructive"
					disabled={revoking}
					onClick={handleRevoke}
					size="icon"
					variant="ghost"
				>
					{revoking ? (
						<LoaderIcon className="size-4 animate-spin" />
					) : (
						<TrashIcon className="size-4" />
					)}
				</Button>
			</div>
		</div>
	);
}

function CreateKeyDialog({ onCreated }: { onCreated: () => void }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const [newKey, setNewKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleCreate = async () => {
		if (!name.trim()) {
			return;
		}
		setCreating(true);
		setError(null);
		try {
			const result = await orpcClient.apiKeys.create({ name: name.trim() });
			setNewKey(result.key);
			onCreated();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create key");
		} finally {
			setCreating(false);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setName("");
		setNewKey(null);
		setError(null);
	};

	return (
		<Dialog
			onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
			open={open}
		>
			<DialogTrigger
				className={cn(buttonVariants({ variant: "default" }), "gap-2")}
			>
				<PlusIcon className="size-4" />
				Create Key
			</DialogTrigger>
			<DialogContent>
				{newKey ? (
					<>
						<DialogHeader>
							<DialogTitle>API Key Created</DialogTitle>
							<DialogDescription>
								Copy your key now. You won't be able to see it again.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							<div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
								<code className="flex-1 break-all font-mono text-sm">
									{newKey}
								</code>
								<CopyButton text={newKey} />
							</div>
							<Card className="relative overflow-hidden border-red-500/40 bg-red-500/5 dark:border-red-400/30 dark:bg-red-400/5">
								<div className="absolute inset-y-0 left-0 w-1 bg-red-500 dark:bg-red-400" />
								<CardContent className="flex items-start gap-4 py-3 pl-5">
									<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-red-500/10 dark:bg-red-400/10">
										<ShieldAlertIcon className="size-4 text-red-600 dark:text-red-400" />
									</div>
									<p className="font-medium text-foreground text-xs leading-relaxed">
										Store this key securely. It will not be shown again.
									</p>
								</CardContent>
							</Card>
						</div>
						<DialogFooter>
							<Button onClick={handleClose}>Done</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Create API Key</DialogTitle>
							<DialogDescription>
								Give your key a name to identify it later. Keys created here
								stay unassigned until you attach them to a project.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							<div className="space-y-2">
								<Label htmlFor="key-name">Key Name</Label>
								<Input
									disabled={creating}
									id="key-name"
									maxLength={128}
									onChange={(e) => setName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleCreate();
										}
									}}
									placeholder="e.g. Production, Staging, My App"
									value={name}
								/>
							</div>
							{error && <p className="text-destructive text-sm">{error}</p>}
						</div>
						<DialogFooter>
							<Button
								disabled={!name.trim() || creating}
								onClick={handleCreate}
							>
								{creating && <LoaderIcon className="size-4 animate-spin" />}
								Create Key
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function KeysLoadingSkeleton() {
	return (
		<div className="space-y-3">
			{[1, 2, 3].map((i) => (
				<div
					className="flex items-center justify-between rounded-lg border px-4 py-3"
					key={i}
				>
					<div className="flex items-center gap-3">
						<Skeleton className="size-9 rounded-md" />
						<div className="space-y-1.5">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-3 w-36" />
						</div>
					</div>
					<Skeleton className="h-8 w-8" />
				</div>
			))}
		</div>
	);
}

function RouteComponent() {
	const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchKeys = useCallback(async () => {
		try {
			const result = await orpcClient.apiKeys.list();
			setKeys(result);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load API keys");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchKeys();
	}, [fetchKeys]);

	const handleRevoke = async (id: string) => {
		try {
			await orpcClient.apiKeys.revoke({ id });
			setKeys((prev) => prev.filter((k) => k.id !== id));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke key");
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">API Keys</h1>
					<p className="text-muted-foreground text-sm">
						Create and manage API keys for authenticating requests
					</p>
				</div>
				<CreateKeyDialog onCreated={fetchKeys} />
			</div>

			<Card className="relative overflow-hidden border-red-500/40 bg-red-500/5 dark:border-red-400/30 dark:bg-red-400/5">
				<div className="absolute inset-y-0 left-0 w-1 bg-red-500 dark:bg-red-400" />
				<CardContent className="flex items-start gap-4 py-4 pl-5">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 dark:bg-red-400/10">
						<ShieldAlertIcon className="size-5 text-red-600 dark:text-red-400" />
					</div>
					<div className="space-y-1">
						<p className="font-semibold text-foreground text-sm tracking-tight">
							Keep your API keys secure
						</p>
						<ul className="list-inside list-disc space-y-0.5 text-muted-foreground text-xs leading-relaxed">
							<li>
								Never expose keys in client-side code or public repositories
							</li>
							<li>Use environment variables and server-side requests only</li>
							<li>
								Revoking a key assigned to a project will leave that project
								unassigned
							</li>
						</ul>
					</div>
				</CardContent>
			</Card>

			{error && (
				<Card className="border-destructive">
					<CardContent className="pt-4">
						<p className="text-destructive text-sm">{error}</p>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Your Keys</CardTitle>
					<CardDescription>
						{loading
							? "Loading..."
							: `${keys.length} active key${keys.length === 1 ? "" : "s"}`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{loading ? <KeysLoadingSkeleton /> : null}
					{!loading && keys.length === 0 ? (
						<div className="flex flex-col items-center gap-3 py-8 text-center">
							<KeyRoundIcon className="size-10 text-muted-foreground" />
							<div>
								<p className="font-medium text-sm">No API keys yet</p>
								<p className="text-muted-foreground text-xs">
									Create your first key to start making API requests or attach
									it to a project later
								</p>
							</div>
						</div>
					) : null}
					{!loading && keys.length > 0 ? (
						<div className="space-y-3">
							{keys.map((key) => (
								<KeyRow apiKey={key} key={key.id} onRevoke={handleRevoke} />
							))}
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Quick Start</CardTitle>
					<CardDescription>
						Use your API key in requests like this
					</CardDescription>
				</CardHeader>
				<CardContent>
					<pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm">
						<code>{`curl -X GET "https://api.locnative.com/api/v1/addresses/autocomplete?q=123+Main&country=AU" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</code>
					</pre>
				</CardContent>
			</Card>
		</div>
	);
}
