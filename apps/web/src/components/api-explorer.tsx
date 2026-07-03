"use client";

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
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Textarea } from "@locnative/ui/components/textarea";
import { Link } from "@tanstack/react-router";
import {
	ChevronDownIcon,
	ChevronRightIcon,
	CopyIcon,
	KeyRoundIcon,
	LoaderIcon,
	PlayIcon,
	ShieldCheckIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type ApiEndpoint,
	apiExplorerEndpoints,
	buildApiExplorerUrl,
} from "@/lib/api-explorer-endpoints";
import { orpcClient } from "@/lib/orpc";

type ApiKeyListItem = Awaited<
	ReturnType<typeof orpcClient.apiKeys.list>
>[number];

type ExplorerAuthMode = "managed" | "raw";

interface ExplorerAuthState {
	isReady: boolean;
	managedKeyId: string;
	mode: ExplorerAuthMode;
	rawApiKey: string;
}

const buildMissingParamError = (
	missingRequiredParams: ApiEndpoint["params"]
): string =>
	`Missing required parameter${missingRequiredParams.length === 1 ? "" : "s"}: ${missingRequiredParams
		.map((param) => param.name)
		.join(", ")}`;

const buildAuthNotReadyError = (mode: ExplorerAuthMode): string =>
	mode === "managed"
		? "Choose a managed API key before sending a test request."
		: "Paste a raw API key before sending a test request.";

const getApiKeyLoadErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : "Failed to load managed API keys.";

function methodColor(method: string): string {
	switch (method) {
		case "GET":
			return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
		case "POST":
			return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
		case "PUT":
			return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
		case "DELETE":
			return "bg-red-500/15 text-red-700 dark:text-red-400";
		default:
			return "bg-muted text-muted-foreground";
	}
}

function useExplorerApiKeys() {
	const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([]);
	const [authMode, setAuthMode] = useState<ExplorerAuthMode>("managed");
	const [selectedManagedKeyId, setSelectedManagedKeyId] = useState("");
	const [rawApiKey, setRawApiKey] = useState("");
	const [loadingKeys, setLoadingKeys] = useState(true);
	const [keyLoadError, setKeyLoadError] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;

		const loadKeys = async () => {
			setLoadingKeys(true);
			setKeyLoadError(null);

			try {
				const keys = await orpcClient.apiKeys.list();
				if (!isMounted) {
					return;
				}

				setApiKeys(keys);
				setSelectedManagedKeyId((current) => current || keys[0]?.id || "");
				if (keys.length === 0) {
					setAuthMode("raw");
				}
			} catch (error) {
				if (!isMounted) {
					return;
				}

				setKeyLoadError(getApiKeyLoadErrorMessage(error));
			} finally {
				if (isMounted) {
					setLoadingKeys(false);
				}
			}
		};

		loadKeys();

		return () => {
			isMounted = false;
		};
	}, []);

	useEffect(() => {
		if (
			selectedManagedKeyId &&
			apiKeys.some((key) => key.id === selectedManagedKeyId)
		) {
			return;
		}

		setSelectedManagedKeyId(apiKeys[0]?.id ?? "");
	}, [apiKeys, selectedManagedKeyId]);

	return {
		apiKeys,
		authMode,
		keyLoadError,
		loadingKeys,
		rawApiKey,
		selectedManagedKeyId,
		setAuthMode,
		setRawApiKey,
		setSelectedManagedKeyId,
	};
}

export function ApiEndpointCard({
	authState,
	baseUrl: _baseUrl,
	endpoint,
}: {
	authState: ExplorerAuthState;
	baseUrl: string;
	endpoint: ApiEndpoint;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [paramValues, setParamValues] = useState<Record<string, string>>({});
	const [response, setResponse] = useState<string | null>(null);
	const [statusCode, setStatusCode] = useState<number | null>(null);
	const [durationMs, setDurationMs] = useState<number | null>(null);
	const [loading, setLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	// Every allowlisted endpoint is executable. Non-GET endpoints carry a JSON
	// body (seeded from exampleBody) the user can edit before sending.
	const isExecutable = true;
	const [bodyText, setBodyText] = useState<string>(
		endpoint.exampleBody ? JSON.stringify(endpoint.exampleBody, null, 2) : ""
	);
	const [bodyError, setBodyError] = useState<string | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const requestUrl = buildApiExplorerUrl(endpoint, paramValues);
	const missingRequiredParams = endpoint.params.filter(
		(param) => param.required && !paramValues[param.name]?.trim()
	);

	const parseBody = (): Record<string, unknown> | undefined => {
		if (endpoint.method === "GET" || bodyText.trim() === "") {
			return undefined;
		}
		return JSON.parse(bodyText) as Record<string, unknown>;
	};

	const runRequest = async () => {
		setLoading(true);
		setResponse(null);
		setStatusCode(null);
		setDurationMs(null);
		setBodyError(null);
		try {
			let parsedBody: Record<string, unknown> | undefined;
			try {
				parsedBody = parseBody();
			} catch {
				setBodyError("Request body is not valid JSON.");
				setLoading(false);
				return;
			}
			const result = await orpcClient.apiExplorer.sendRequest({
				authMode: authState.mode,
				endpointId: endpoint.id,
				managedKeyId:
					authState.mode === "managed" ? authState.managedKeyId : undefined,
				paramValues,
				rawApiKey: authState.mode === "raw" ? authState.rawApiKey : undefined,
				body: parsedBody,
			});
			setStatusCode(result.statusCode);
			setDurationMs(result.durationMs);
			setResponse(JSON.stringify(result.body, null, 2));
		} catch (err) {
			setStatusCode(0);
			setDurationMs(null);
			setResponse(
				JSON.stringify(
					{ error: err instanceof Error ? err.message : "Request failed" },
					null,
					2
				)
			);
		} finally {
			setLoading(false);
		}
	};

	const handleSend = async () => {
		if (!authState.isReady) {
			setStatusCode(0);
			setDurationMs(null);
			setResponse(
				JSON.stringify(
					{ error: buildAuthNotReadyError(authState.mode) },
					null,
					2
				)
			);
			return;
		}

		if (missingRequiredParams.length > 0) {
			setStatusCode(0);
			setDurationMs(null);
			setResponse(
				JSON.stringify(
					{ error: buildMissingParamError(missingRequiredParams) },
					null,
					2
				)
			);
			return;
		}

		if (endpoint.method === "DELETE") {
			setConfirmOpen(true);
			return;
		}
		await runRequest();
	};

	const handleCopy = async () => {
		if (!response) {
			return;
		}
		await navigator.clipboard.writeText(response);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const fillExamples = () => {
		const examples: Record<string, string> = {};
		for (const param of endpoint.params) {
			if (param.example) {
				examples[param.name] = param.example;
			}
		}
		setParamValues(examples);
	};

	return (
		<Card>
			<CardHeader className="p-0">
				<button
					className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
					onClick={() => setIsOpen(!isOpen)}
					type="button"
				>
					{isOpen ? (
						<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
					)}
					<Badge
						className={`font-mono font-semibold text-xs ${methodColor(endpoint.method)}`}
						variant="secondary"
					>
						{endpoint.method}
					</Badge>
					<code className="font-mono text-sm">{endpoint.path}</code>
					<span className="ml-auto text-muted-foreground text-sm">
						{endpoint.summary}
					</span>
				</button>
			</CardHeader>

			{isOpen && (
				<CardContent className="border-t px-4 pt-4 pb-4">
					<p className="mb-4 text-muted-foreground text-sm">
						{endpoint.description}
					</p>

					{/* Parameters */}
					<div className="mb-4">
						<div className="mb-2 flex items-center justify-between">
							<CardTitle className="text-sm">Parameters</CardTitle>
							<Button
								className="h-7 text-xs"
								onClick={fillExamples}
								size="sm"
								variant="ghost"
							>
								Fill examples
							</Button>
						</div>
						<div className="space-y-3">
							{endpoint.params.map((param) => {
								const isPathParam = endpoint.path.includes(`{${param.name}}`);
								return (
									<div
										className="grid grid-cols-[180px_1fr] items-start gap-3"
										key={param.name}
									>
										<div className="flex flex-col gap-0.5 pt-2">
											<div className="flex items-center gap-2">
												<code className="font-mono text-sm">{param.name}</code>
												{param.required && (
													<Badge
														className="border-red-500/30 text-[10px] text-red-600 dark:text-red-400"
														variant="outline"
													>
														required
													</Badge>
												)}
											</div>
											<span className="text-muted-foreground text-xs">
												{param.type}
												{isPathParam ? " (path)" : " (query)"}
											</span>
											<span className="text-muted-foreground text-xs">
												{param.description}
											</span>
										</div>
										<Input
											className="font-mono text-sm"
											onChange={(e) =>
												setParamValues((prev) => ({
													...prev,
													[param.name]: e.target.value,
												}))
											}
											placeholder={param.example ?? param.name}
											value={paramValues[param.name] ?? ""}
										/>
									</div>
								);
							})}
						</div>
					</div>

					{/* JSON body editor for non-GET endpoints */}
					{endpoint.method !== "GET" && (
						<div className="mb-4 flex flex-col gap-1">
							<label
								className="font-medium text-sm"
								htmlFor={`body-${endpoint.id}`}
							>
								Request body (JSON)
							</label>
							<Textarea
								className="font-mono text-xs"
								id={`body-${endpoint.id}`}
								onChange={(e) => setBodyText(e.target.value)}
								rows={8}
								value={bodyText}
							/>
							{bodyError ? (
								<p className="text-destructive text-xs">{bodyError}</p>
							) : null}
						</div>
					)}

					{isExecutable && (
						<>
							{/* Request URL Preview */}
							<div className="mb-4 rounded-md bg-muted/50 p-3">
								<div className="mb-1 flex items-center justify-between gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
									Request URL
									<Badge className="gap-1" variant="outline">
										<ShieldCheckIcon className="size-3" />
										Test request
									</Badge>
								</div>
								<code className="break-all font-mono text-sm">
									{requestUrl}
								</code>
							</div>

							{/* Send Button */}
							<div className="mb-4 flex flex-col gap-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="secondary">
										{authState.mode === "managed"
											? "Managed key proxy"
											: "Raw key proxy"}
									</Badge>
									<Badge variant="outline">Usage: explorer_test</Badge>
								</div>
								<Button
									disabled={
										loading ||
										!authState.isReady ||
										missingRequiredParams.length > 0
									}
									onClick={handleSend}
								>
									{loading ? (
										<LoaderIcon className="size-4 animate-spin" />
									) : (
										<PlayIcon className="size-4" />
									)}
									{loading ? "Sending..." : "Send Test Request"}
								</Button>
								{missingRequiredParams.length > 0 ? (
									<p className="text-muted-foreground text-xs">
										Add{" "}
										{missingRequiredParams
											.map((param) => param.name)
											.join(", ")}{" "}
										before sending this request.
									</p>
								) : null}
							</div>
						</>
					)}

					{/* Response */}
					{response !== null && (
						<div className="rounded-md border">
							<div className="flex items-center justify-between border-b px-3 py-2">
								<div className="flex items-center gap-2">
									<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										Response
									</span>
									{statusCode !== null && (
										<Badge
											className={
												statusCode >= 200 && statusCode < 300
													? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
													: "bg-red-500/15 text-red-700 dark:text-red-400"
											}
											variant="secondary"
										>
											{statusCode === 0 ? "Error" : statusCode}
										</Badge>
									)}
									{durationMs === null ? null : (
										<span className="text-muted-foreground text-xs">
											{durationMs} ms
										</span>
									)}
								</div>
								<Button
									className="h-7 text-xs"
									onClick={handleCopy}
									size="sm"
									variant="ghost"
								>
									<CopyIcon className="size-3" />
									{copied ? "Copied" : "Copy"}
								</Button>
							</div>
							<pre className="max-h-96 overflow-auto p-3 font-mono text-xs leading-relaxed">
								{response}
							</pre>
						</div>
					)}
				</CardContent>
			)}

			<Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Run {endpoint.method} {endpoint.path}?
						</DialogTitle>
					</DialogHeader>
					<p className="text-muted-foreground text-sm">
						This sends a real {endpoint.method} request with your API key and
						may permanently change data. This cannot be undone.
					</p>
					<DialogFooter>
						<Button onClick={() => setConfirmOpen(false)} variant="outline">
							Cancel
						</Button>
						<Button
							onClick={async () => {
								setConfirmOpen(false);
								await runRequest();
							}}
							variant="destructive"
						>
							Run {endpoint.method}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

export function ApiExplorer() {
	const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
	const {
		apiKeys,
		authMode,
		keyLoadError,
		loadingKeys,
		rawApiKey,
		selectedManagedKeyId,
		setAuthMode,
		setRawApiKey,
		setSelectedManagedKeyId,
	} = useExplorerApiKeys();

	const selectedManagedKey = useMemo(
		() => apiKeys.find((key) => key.id === selectedManagedKeyId) ?? null,
		[apiKeys, selectedManagedKeyId]
	);
	const authState: ExplorerAuthState = {
		isReady:
			authMode === "managed"
				? Boolean(selectedManagedKeyId)
				: rawApiKey.trim().length > 0,
		managedKeyId: selectedManagedKeyId,
		mode: authMode,
		rawApiKey,
	};
	const managedSummary = selectedManagedKey
		? `${selectedManagedKey.name} (${selectedManagedKey.displayLabel})`
		: "Choose a managed API key";
	let managedPlaceholder = "Choose an API key";
	if (loadingKeys) {
		managedPlaceholder = "Loading API keys...";
	} else if (apiKeys.length === 0) {
		managedPlaceholder = "No active API keys yet";
	}

	let managedStatusText = `Current proxy key: ${managedSummary}`;
	if (keyLoadError) {
		managedStatusText = keyLoadError;
	} else if (apiKeys.length === 0) {
		managedStatusText =
			"Create an API key first, or switch to raw key mode for a temporary manual test.";
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Base URL info */}
			<Card>
				<CardContent className="flex items-center gap-4 p-4">
					<div>
						<div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
							Base URL
						</div>
						<code className="font-mono text-sm">{baseUrl}/api/v1</code>
					</div>
					<Badge className="ml-auto" variant="outline">
						v1
					</Badge>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Interactive testing auth</CardTitle>
					<CardDescription>
						Use a managed key by default so the explorer can proxy requests
						safely without asking for the raw secret. All explorer traffic is
						labeled as test traffic and tracked separately from production
						usage.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() => setAuthMode("managed")}
							size="sm"
							variant={authMode === "managed" ? "default" : "outline"}
						>
							<KeyRoundIcon className="size-4" />
							Managed key
						</Button>
						<Button
							onClick={() => setAuthMode("raw")}
							size="sm"
							variant={authMode === "raw" ? "default" : "outline"}
						>
							<ShieldCheckIcon className="size-4" />
							Raw key
						</Button>
					</div>

					<div className="rounded-lg border bg-muted/30 p-4">
						<div className="mb-2 flex flex-wrap items-center gap-2">
							<Badge variant="secondary">
								{authMode === "managed" ? "Recommended" : "Temporary fallback"}
							</Badge>
							<Badge variant="outline">Traffic type: explorer_test</Badge>
						</div>
						<p className="text-muted-foreground text-sm leading-6">
							{authMode === "managed"
								? "Choose one of your active API keys. The explorer sends the request through an authenticated server-side proxy, so your raw key never has to be pasted for routine testing."
								: "Paste a raw API key only for manual validation. The key is kept in this page state only and is cleared when the tab refreshes or closes."}
						</p>
					</div>

					{authMode === "managed" ? (
						<div className="space-y-3">
							<div className="space-y-2">
								<label
									className="font-medium text-sm"
									htmlFor="managed-api-key"
								>
									Managed API key
								</label>
								<select
									className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
									disabled={loadingKeys || apiKeys.length === 0}
									id="managed-api-key"
									onChange={(event) =>
										setSelectedManagedKeyId(event.target.value)
									}
									value={selectedManagedKeyId}
								>
									<option value="">{managedPlaceholder}</option>
									{apiKeys.map((apiKey) => (
										<option key={apiKey.id} value={apiKey.id}>
											{apiKey.name} ({apiKey.displayLabel})
										</option>
									))}
								</select>
							</div>
							<p className="text-muted-foreground text-xs">
								{managedStatusText}
							</p>
							{apiKeys.length === 0 ? (
								<Link to="/api-keys">
									<Button size="sm" variant="outline">
										Create API key
									</Button>
								</Link>
							) : null}
						</div>
					) : (
						<div className="space-y-3">
							<div className="space-y-2">
								<label className="font-medium text-sm" htmlFor="raw-api-key">
									Raw API key
								</label>
								<Input
									id="raw-api-key"
									onChange={(event) => setRawApiKey(event.target.value)}
									placeholder="wh_<id>_<secret>"
									type="password"
									value={rawApiKey}
								/>
							</div>
							<p className="text-muted-foreground text-xs">
								Raw keys are never saved to the database from this explorer. Use
								this only when you need to verify a specific bearer token
								manually.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Endpoints */}
			<div className="flex flex-col gap-2">
				{apiExplorerEndpoints.map((endpoint) => (
					<ApiEndpointCard
						authState={authState}
						baseUrl={baseUrl}
						endpoint={endpoint}
						key={`${endpoint.method}-${endpoint.path}`}
					/>
				))}
			</div>
		</div>
	);
}
