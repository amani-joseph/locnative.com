import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckIcon,
	CopyIcon,
	FolderOpenIcon,
	KeyRoundIcon,
	LoaderIcon,
	PlusIcon,
	ShieldAlertIcon,
	Trash2Icon,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { orpcClient } from "@/lib/orpc";

type ApiKeyListItem = Awaited<
	ReturnType<typeof orpcClient.apiKeys.list>
>[number];
type CreateApiKeyResult = Awaited<ReturnType<typeof orpcClient.apiKeys.create>>;
type ProjectListItem = Awaited<
	ReturnType<typeof orpcClient.projects.list>
>[number];

export const Route = createFileRoute("/_protected/projects")({
	component: RouteComponent,
});

const AUTO_GENERATE_VALUE = "__auto_generate__";

function formatCreatedDate(dateStr: string): string {
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(dateStr));
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Button className="size-8" onClick={copy} size="icon" variant="ghost">
			{copied ? (
				<CheckIcon className="size-4 text-green-500" />
			) : (
				<CopyIcon className="size-4" />
			)}
		</Button>
	);
}

function ApiKeyOptionLabel({
	apiKey,
	currentProjectId,
}: {
	apiKey: ApiKeyListItem;
	currentProjectId?: string;
}) {
	const isAssignedElsewhere =
		apiKey.assignmentStatus === "assigned" &&
		apiKey.assignedProjectId !== currentProjectId;

	return (
		<div className="flex w-full items-center justify-between gap-3">
			<div className="min-w-0">
				<p className="truncate font-medium text-sm">{apiKey.name}</p>
				<p className="truncate font-mono text-muted-foreground text-xs">
					{apiKey.displayLabel}
				</p>
			</div>
			{isAssignedElsewhere ? (
				<span className="shrink-0 text-muted-foreground text-xs">
					In use by {apiKey.assignedProjectName ?? "another project"}
				</span>
			) : null}
		</div>
	);
}

function CreateProjectDialog({
	apiKeyOptions,
	onCreated,
}: {
	apiKeyOptions: ApiKeyListItem[];
	onCreated: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [selectedApiKeyId, setSelectedApiKeyId] = useState(AUTO_GENERATE_VALUE);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [generatedKey, setGeneratedKey] = useState<CreateApiKeyResult | null>(
		null
	);

	const handleClose = () => {
		setOpen(false);
		setName("");
		setSelectedApiKeyId(AUTO_GENERATE_VALUE);
		setCreating(false);
		setError(null);
		setGeneratedKey(null);
	};

	const handleCreate = async () => {
		if (!name.trim()) {
			return;
		}

		setCreating(true);
		setError(null);

		try {
			const result = await orpcClient.projects.create({
				name: name.trim(),
				selectedApiKeyId:
					selectedApiKeyId === AUTO_GENERATE_VALUE
						? undefined
						: selectedApiKeyId,
			});

			await onCreated();

			if (result.generatedKey) {
				setGeneratedKey(result.generatedKey);
				return;
			}

			handleClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create project");
		} finally {
			setCreating(false);
		}
	};

	return (
		<Dialog
			onOpenChange={(nextOpen) => {
				if (nextOpen) {
					setOpen(true);
					return;
				}

				handleClose();
			}}
			open={open}
		>
			<DialogTrigger
				render={
					<Button>
						<PlusIcon className="size-4" />
						New Project
					</Button>
				}
			/>
			<DialogContent>
				{generatedKey ? (
					<>
						<DialogHeader>
							<DialogTitle>Project Created</DialogTitle>
							<DialogDescription>
								A new API key was generated for this project. Copy it now, as
								you won&apos;t be able to see the full key again.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							<div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
								<code className="flex-1 break-all font-mono text-sm">
									{generatedKey.key}
								</code>
								<CopyButton text={generatedKey.key} />
							</div>
							<Card className="relative overflow-hidden border-red-500/40 bg-red-500/5 dark:border-red-400/30 dark:bg-red-400/5">
								<div className="absolute inset-y-0 left-0 w-1 bg-red-500 dark:bg-red-400" />
								<CardContent className="flex items-start gap-4 py-3 pl-5">
									<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-red-500/10 dark:bg-red-400/10">
										<ShieldAlertIcon className="size-4 text-red-600 dark:text-red-400" />
									</div>
									<p className="font-medium text-foreground text-xs leading-relaxed">
										This key is now listed on the API Keys page, but only its
										masked label will be visible there.
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
							<DialogTitle>Create Project</DialogTitle>
							<DialogDescription>
								Choose an existing API key or let Locnative generate a new key
								named after this project.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="project-name">Project Name</Label>
								<Input
									disabled={creating}
									id="project-name"
									maxLength={128}
									onChange={(event) => setName(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											handleCreate();
										}
									}}
									placeholder="e.g. Delivery App"
									value={name}
								/>
							</div>
							<div className="space-y-2">
								<Label>API Key</Label>
								<Select
									onValueChange={(value) =>
										setSelectedApiKeyId(value ?? AUTO_GENERATE_VALUE)
									}
									value={selectedApiKeyId}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={AUTO_GENERATE_VALUE}>
											Auto-generate a new API key from the project name
										</SelectItem>
										{apiKeyOptions.map((apiKey) => (
											<SelectItem
												disabled={apiKey.assignmentStatus === "assigned"}
												key={apiKey.id}
												value={apiKey.id}
											>
												<ApiKeyOptionLabel apiKey={apiKey} />
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-muted-foreground text-xs">
									Keys already selected by other projects stay visible here, but
									they cannot be reused.
								</p>
							</div>
							{error ? (
								<p className="text-destructive text-sm">{error}</p>
							) : null}
						</div>
						<DialogFooter>
							<Button
								disabled={!name.trim() || creating}
								onClick={handleCreate}
							>
								{creating ? (
									<LoaderIcon className="size-4 animate-spin" />
								) : null}
								Create Project
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function AssignApiKeyDialog({
	apiKeyOptions,
	onAssigned,
	project,
}: {
	apiKeyOptions: ApiKeyListItem[];
	onAssigned: () => Promise<void>;
	project: ProjectListItem;
}) {
	const [open, setOpen] = useState(false);
	const [selectedApiKeyId, setSelectedApiKeyId] = useState(
		project.apiKey?.id ?? ""
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			return;
		}

		setSelectedApiKeyId(project.apiKey?.id ?? "");
		setError(null);
	}, [open, project.apiKey?.id]);

	const selectableOptions = useMemo(
		() =>
			apiKeyOptions.filter(
				(apiKey) =>
					apiKey.assignmentStatus === "available" ||
					apiKey.assignedProjectId === project.id
			),
		[apiKeyOptions, project.id]
	);

	const handleAssign = async () => {
		if (!selectedApiKeyId) {
			return;
		}

		setSaving(true);
		setError(null);

		try {
			await orpcClient.projects.assignApiKey({
				projectId: project.id,
				apiKeyId: selectedApiKeyId,
			});
			await onAssigned();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to assign API key");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button variant="outline">
						{project.apiKey ? "Change API Key" : "Assign API Key"}
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{project.apiKey ? "Change API Key" : "Assign API Key"}
					</DialogTitle>
					<DialogDescription>
						Choose which key this project should use. Keys already assigned to
						other projects remain visible but unavailable.
					</DialogDescription>
				</DialogHeader>
				{selectableOptions.length === 0 ? (
					<Card className="border-dashed">
						<CardContent className="space-y-2 py-6 text-center">
							<KeyRoundIcon className="mx-auto size-8 text-muted-foreground" />
							<p className="font-medium text-sm">No available API keys</p>
							<p className="text-muted-foreground text-xs">
								Create a key from the API Keys page, then return here to assign
								it.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label>API Key</Label>
							<Select
								onValueChange={(value) => setSelectedApiKeyId(value ?? "")}
								value={selectedApiKeyId}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{apiKeyOptions.map((apiKey) => {
										const disabled =
											apiKey.assignmentStatus === "assigned" &&
											apiKey.assignedProjectId !== project.id;

										return (
											<SelectItem
												disabled={disabled}
												key={apiKey.id}
												value={apiKey.id}
											>
												<ApiKeyOptionLabel
													apiKey={apiKey}
													currentProjectId={project.id}
												/>
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>
						{error ? <p className="text-destructive text-sm">{error}</p> : null}
					</div>
				)}
				<DialogFooter>
					<Button
						disabled={
							!selectedApiKeyId || saving || selectableOptions.length === 0
						}
						onClick={handleAssign}
					>
						{saving ? <LoaderIcon className="size-4 animate-spin" /> : null}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteProjectDialog({
	onDeleted,
	project,
}: {
	onDeleted: () => Promise<void>;
	project: ProjectListItem;
}) {
	const [open, setOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleOpenChange = (nextOpen: boolean) => {
		if (deleting) {
			return;
		}

		setOpen(nextOpen);
		if (!nextOpen) {
			setError(null);
		}
	};

	const handleDelete = async () => {
		setDeleting(true);
		setError(null);

		try {
			await orpcClient.projects.delete({ projectId: project.id });
			await onDeleted();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete project");
		} finally {
			setDeleting(false);
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogTrigger
				render={
					<Button
						aria-label={`Delete ${project.name}`}
						size="icon"
						variant="ghost"
					>
						<Trash2Icon className="size-4 text-muted-foreground" />
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete project</DialogTitle>
					<DialogDescription>
						This permanently removes{" "}
						<span className="font-medium text-foreground">{project.name}</span>.
						{project.apiKey
							? " Its API key will be unassigned but stays active, so existing requests keep working."
							: ""}
					</DialogDescription>
				</DialogHeader>
				{error ? <p className="text-destructive text-sm">{error}</p> : null}
				<DialogFooter>
					<Button
						disabled={deleting}
						onClick={() => handleOpenChange(false)}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={deleting}
						onClick={handleDelete}
						variant="destructive"
					>
						{deleting ? <LoaderIcon className="size-4 animate-spin" /> : null}
						Delete project
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ProjectsLoadingSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			{[1, 2, 3].map((index) => (
				<Card key={index}>
					<CardHeader>
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<Skeleton className="size-10 rounded-lg" />
								<div className="space-y-2">
									<Skeleton className="h-4 w-28" />
									<Skeleton className="h-3 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-24" />
						</div>
					</CardHeader>
					<CardContent className="space-y-4">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-9 w-28" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function EmptyProjectsState({
	apiKeyOptions,
	onCreated,
}: {
	apiKeyOptions: ApiKeyListItem[];
	onCreated: () => Promise<void>;
}) {
	return (
		<Card className="border-dashed">
			<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
				<div className="flex size-16 items-center justify-center rounded-full bg-muted">
					<FolderOpenIcon className="size-8 text-muted-foreground" />
				</div>
				<div>
					<p className="font-semibold text-lg">No projects yet</p>
					<p className="mx-auto max-w-sm text-muted-foreground text-sm">
						Create a project to attach an existing API key or auto-generate a
						new one from the project name.
					</p>
				</div>
				<CreateProjectDialog
					apiKeyOptions={apiKeyOptions}
					onCreated={onCreated}
				/>
			</CardContent>
		</Card>
	);
}

function ProjectsGrid({
	apiKeyOptions,
	onAssigned,
	onDeleted,
	projects,
}: {
	apiKeyOptions: ApiKeyListItem[];
	onAssigned: () => Promise<void>;
	onDeleted: () => Promise<void>;
	projects: ProjectListItem[];
}) {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			{projects.map((project) => (
				<Card className="group relative" key={project.id}>
					<CardHeader>
						<div className="flex items-start justify-between gap-3">
							<div className="flex items-center gap-3">
								<div className="flex size-10 items-center justify-center rounded-lg bg-muted">
									<FolderOpenIcon className="size-5 text-muted-foreground" />
								</div>
								<div>
									<CardTitle className="text-base">{project.name}</CardTitle>
									<CardDescription className="text-xs">
										Created {formatCreatedDate(project.createdAt)}
									</CardDescription>
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Badge variant={project.apiKey ? "default" : "secondary"}>
									{project.apiKey ? "Key assigned" : "No key assigned"}
								</Badge>
								<DeleteProjectDialog onDeleted={onDeleted} project={project} />
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="rounded-lg border bg-muted/50 p-4">
							{project.apiKey ? (
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<KeyRoundIcon className="size-4 text-muted-foreground" />
										<p className="font-medium text-sm">{project.apiKey.name}</p>
									</div>
									<p className="font-mono text-muted-foreground text-xs">
										{project.apiKey.displayLabel}
									</p>
								</div>
							) : (
								<div className="space-y-1">
									<p className="font-medium text-sm">No API key assigned</p>
									<p className="text-muted-foreground text-xs">
										This project can&apos;t make authenticated requests until a
										key is assigned.
									</p>
								</div>
							)}
						</div>
						<div className="flex items-center justify-between gap-3">
							<p className="text-muted-foreground text-xs">
								Slug: <span className="font-mono">{project.slug}</span>
							</p>
							<AssignApiKeyDialog
								apiKeyOptions={apiKeyOptions}
								onAssigned={onAssigned}
								project={project}
							/>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function RouteComponent() {
	const [projects, setProjects] = useState<ProjectListItem[]>([]);
	const [apiKeyOptions, setApiKeyOptions] = useState<ApiKeyListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			const [projectResults, keyResults] = await Promise.all([
				orpcClient.projects.list(),
				orpcClient.projects.listApiKeyOptions(),
			]);
			setProjects(projectResults);
			setApiKeyOptions(keyResults);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load projects");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	let content: ReactNode = null;
	if (loading) {
		content = <ProjectsLoadingSkeleton />;
	} else if (projects.length === 0) {
		content = (
			<EmptyProjectsState apiKeyOptions={apiKeyOptions} onCreated={fetchData} />
		);
	} else {
		content = (
			<ProjectsGrid
				apiKeyOptions={apiKeyOptions}
				onAssigned={fetchData}
				onDeleted={fetchData}
				projects={projects}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">Projects</h1>
					<p className="text-muted-foreground text-sm">
						Organize your API keys by application or use case
					</p>
				</div>
				<CreateProjectDialog
					apiKeyOptions={apiKeyOptions}
					onCreated={fetchData}
				/>
			</div>

			{error ? (
				<Card className="border-destructive">
					<CardContent className="pt-4">
						<p className="text-destructive text-sm">{error}</p>
					</CardContent>
				</Card>
			) : null}

			{content}
		</div>
	);
}
