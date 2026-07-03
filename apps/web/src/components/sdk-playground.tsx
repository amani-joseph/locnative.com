import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { Textarea } from "@locnative/ui/components/textarea";
import { useEffect, useMemo, useState } from "react";
import { apiExplorerEndpoints } from "@/lib/api-explorer-endpoints";
import { orpcClient } from "@/lib/orpc";
import { buildSdkSnippet } from "@/lib/sdk-snippet";
import {
	type ApiKeyAuthValue,
	ApiKeyComboboxField,
} from "./sdk-playground/api-key-combobox";
import { LocationInput } from "./sdk-playground/location-input";

export function SdkPlayground() {
	const [endpointId, setEndpointId] = useState(
		apiExplorerEndpoints[0]?.id ?? ""
	);
	const endpoint = useMemo(
		() => apiExplorerEndpoints.find((e) => e.id === endpointId),
		[endpointId]
	);
	const [paramValues, setParamValues] = useState<Record<string, string>>({});
	const [bodyText, setBodyText] = useState<string>("");
	const [authValue, setAuthValue] = useState<ApiKeyAuthValue | null>(null);
	const [locationComments, setLocationComments] = useState<
		Record<string, string>
	>({});
	const [result, setResult] = useState<string | null>(null);
	const [running, setRunning] = useState(false);

	// Switching methods clears the previous method's inputs so stale params,
	// body, and resolved place-name comments don't bleed into the next method's
	// request or generated snippet.
	// biome-ignore lint/correctness/useExhaustiveDependencies: endpointId is the trigger, not a value read in the body
	useEffect(() => {
		setParamValues({});
		setBodyText("");
		setLocationComments({});
		setResult(null);
	}, [endpointId]);

	const parseBodyOrUndefined = (): Record<string, unknown> | undefined => {
		if (!endpoint || endpoint.method === "GET" || bodyText.trim() === "") {
			return undefined;
		}
		return JSON.parse(bodyText) as Record<string, unknown>;
	};

	let snippetBody: Record<string, unknown> | undefined;
	try {
		snippetBody = parseBodyOrUndefined();
	} catch {
		snippetBody = undefined;
	}

	const snippet = endpoint
		? buildSdkSnippet(endpoint.id, paramValues, snippetBody, locationComments)
		: "";

	const run = async () => {
		if (!endpoint) {
			return;
		}
		setRunning(true);
		setResult(null);
		try {
			let parsedBody: Record<string, unknown> | undefined;
			try {
				parsedBody = parseBodyOrUndefined();
			} catch {
				setResult("Request body is not valid JSON.");
				setRunning(false);
				return;
			}
			if (!authValue) {
				setResult("Select a saved API key or paste a raw key first.");
				setRunning(false);
				return;
			}
			const auth =
				authValue.mode === "managed"
					? {
							authMode: "managed" as const,
							managedKeyId: authValue.managedKeyId,
						}
					: { authMode: "raw" as const, rawApiKey: authValue.rawApiKey };
			const res = await orpcClient.apiExplorer.sendRequest({
				...auth,
				endpointId: endpoint.id,
				paramValues,
				body: parsedBody,
			});
			setResult(JSON.stringify(res.body, null, 2));
		} catch (err) {
			setResult(err instanceof Error ? err.message : "Request failed");
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Method</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Select
						onValueChange={(value) => {
							// Base UI passes null when the selection clears; keep the last pick.
							if (value !== null) {
								setEndpointId(value);
							}
						}}
						value={endpointId}
					>
						<SelectTrigger>
							<SelectValue placeholder="Pick an SDK method" />
						</SelectTrigger>
						<SelectContent>
							{apiExplorerEndpoints.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									{e.id}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{endpoint?.params.map((p) => {
						const isLocation =
							endpoint.id === "routing.directions" &&
							(p.name === "from" || p.name === "to");
						if (isLocation) {
							return (
								<LocationInput
									id={`pg-${p.name}`}
									key={p.name}
									label={`${p.name}${p.required ? " *" : ""}`}
									onChange={(sent) =>
										setParamValues((prev) => ({ ...prev, [p.name]: sent }))
									}
									onResolvedLabelChange={(lbl) =>
										setLocationComments((prev) => {
											const next = { ...prev };
											if (lbl) {
												next[p.name] = lbl;
											} else {
												delete next[p.name];
											}
											return next;
										})
									}
									placeholder={p.example ?? "Place name or lat,lng"}
									value={paramValues[p.name] ?? ""}
								/>
							);
						}
						return (
							<div className="flex flex-col gap-1" key={p.name}>
								<label className="text-sm" htmlFor={`pg-${p.name}`}>
									{p.name}
									{p.required ? " *" : ""}
								</label>
								<input
									className="rounded border px-2 py-1 text-sm"
									id={`pg-${p.name}`}
									onChange={(ev) =>
										setParamValues((prev) => ({
											...prev,
											[p.name]: ev.target.value,
										}))
									}
									placeholder={p.example ?? ""}
									value={paramValues[p.name] ?? ""}
								/>
							</div>
						);
					})}
					{endpoint && endpoint.method !== "GET" ? (
						<Textarea
							className="font-mono text-xs"
							onChange={(ev) => setBodyText(ev.target.value)}
							placeholder={
								endpoint.exampleBody
									? JSON.stringify(endpoint.exampleBody, null, 2)
									: "{}"
							}
							rows={6}
							value={bodyText}
						/>
					) : null}
					<ApiKeyComboboxField onChange={setAuthValue} value={authValue} />
					<Button disabled={running || !endpoint} onClick={run}>
						{running ? "Running…" : "Run"}
					</Button>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>SDK code</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<pre className="overflow-auto rounded bg-muted p-3 text-xs">
						<code>{snippet}</code>
					</pre>
					{result === null ? null : (
						<pre className="overflow-auto rounded bg-muted p-3 text-xs">
							<code>{result}</code>
						</pre>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
