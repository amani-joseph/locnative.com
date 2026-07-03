import { env } from "@locnative/env/web";
import {
	AddressAutocomplete,
	AddressFieldGroup,
	type AddressFieldGroupValue,
	AddressFormField,
	type AddressWithParsed,
	ForwardGeocodeInput,
	ReverseGeocodeInput,
} from "@locnative/react-ui";
import type { LocnativeClient } from "@locnative/sdk";
import { createLocnativeClient } from "@locnative/sdk";
import { Badge } from "@locnative/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { Skeleton } from "@locnative/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@locnative/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Component } from "vue";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { VueIsland } from "@/components/vue-island";

export const Route = createFileRoute("/_protected/components")({
	component: RouteComponent,
});

// Stable loaders for the live Vue demos. Kept at module scope so each
// VueIsland mounts once (the loader identity never changes), and written as
// dynamic imports so the Vue runtime + vue-ui bundle stay out of the SSR graph.
const loadVueAutocomplete = (): Promise<Component> =>
	import("@locnative/vue-ui").then((m) => m.AddressAutocomplete);
const loadVueFormField = (): Promise<Component> =>
	import("@locnative/vue-ui").then((m) => m.AddressFormField);
const loadVueFieldGroup = (): Promise<Component> =>
	import("@locnative/vue-ui").then((m) => m.AddressFieldGroup);
const loadVueForwardGeocode = (): Promise<Component> =>
	import("@locnative/vue-ui").then((m) => m.ForwardGeocodeInput);
const loadVueReverseGeocode = (): Promise<Component> =>
	import("@locnative/vue-ui").then((m) => m.ReverseGeocodeInput);

// Sentinel used when no demo key is configured. The live demos can't reach the
// API without a publishable key, so we detect this and show an explicit notice
// instead of letting every component fire a doomed request that surfaces only as
// a bare red (aria-invalid) border with no explanation.
const DEMO_KEY_FALLBACK = "demo-key-not-configured";

// Whether a real publishable demo key is configured (VITE_DEMO_API_KEY). When
// false, the live demos are gated behind DemoKeyNotice.
const demoKeyConfigured = Boolean(env.VITE_DEMO_API_KEY);

// Demo client factory.
// Call the backend API directly via VITE_SERVER_URL (api.locnative.com in
// production, the local backend in dev). The public /api/v1/* endpoints send
// permissive CORS, so a cross-origin browser call works without a preflight
// failure. We deliberately do NOT route through the same-origin /api/v1/*
// proxy: in production that proxy issues a Worker→Worker subrequest to
// api.locnative.com on the same Cloudflare zone, which Cloudflare blocks with
// a 403 (the request never reaches the backend). SDK resource paths are
// absolute (/api/v1/...), so VITE_SERVER_URL (origin only) is the correct base.
const createDemoClient = (): LocnativeClient => {
	const apiKey = env.VITE_DEMO_API_KEY || DEMO_KEY_FALLBACK;
	return createLocnativeClient({
		apiKey,
		baseUrl: env.VITE_SERVER_URL,
	});
};

interface ResultState<T> {
	data: T | null;
	error: string | null;
	isLoading: boolean;
}

function ResultCard<T>({
	title,
	result,
	isLoading,
	error,
	renderData,
}: {
	title: string;
	result: ResultState<T>;
	isLoading: boolean;
	error?: string | null;
	renderData: (data: T) => React.ReactNode;
}) {
	// Announce async outcomes to screen readers. One effect here covers every
	// live demo (React + Vue) since they all surface results through ResultCard.
	const announce = useAnnounce();
	const errorMessage = error || result.error;
	const hasResult = Boolean(result.data) && !isLoading && !errorMessage;
	useEffect(() => {
		if (errorMessage) {
			announce(`${title} failed: ${errorMessage}`, { assertive: true });
		} else if (hasResult) {
			announce(`${title} ready`);
		}
	}, [hasResult, errorMessage, title, announce]);

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-sm">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading...
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</CardContent>
			</Card>
		);
	}

	if (error || result.error) {
		return (
			<Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-red-600 text-sm dark:text-red-400">
						<AlertCircle className="h-4 w-4" />
						Error
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-red-600 text-sm dark:text-red-400">
						{error || result.error}
					</p>
				</CardContent>
			</Card>
		);
	}

	if (!result.data) {
		return (
			<Card className="border-dashed">
				<CardContent className="pt-6 text-center text-muted-foreground text-sm">
					Results will appear here after submission
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-green-600 text-sm dark:text-green-400">
					<CheckCircle2 className="h-4 w-4" />
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>{renderData(result.data)}</CardContent>
		</Card>
	);
}

function ComponentDocumentation({
	name,
	description,
	features,
	props,
	usage,
	packageName = "@locnative/react-ui",
}: {
	name: string;
	description: string;
	features: string[];
	props: string;
	usage: string;
	packageName?: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">{name}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div>
					<h4 className="mb-2 font-semibold text-sm">Features</h4>
					<div className="flex flex-wrap gap-2">
						{features.map((feature) => (
							<Badge className="text-xs" key={feature} variant="outline">
								{feature}
							</Badge>
						))}
					</div>
				</div>

				<div>
					<h4 className="mb-1 font-semibold text-sm">Props</h4>
					<pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
						<code>{props}</code>
					</pre>
				</div>

				<div>
					<h4 className="mb-1 font-semibold text-sm">Usage</h4>
					<pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
						<code>{usage}</code>
					</pre>
				</div>

				<p className="text-muted-foreground text-xs">
					<strong>Package:</strong>{" "}
					<code className="rounded bg-black/20 px-1">{packageName}</code>
				</p>
			</CardContent>
		</Card>
	);
}

// Shown in place of the live demos when no publishable demo key is configured.
// Without a key every component would just render a red error border, which
// looks like a broken demo rather than a configuration gap.
function DemoKeyNotice() {
	return (
		<Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-amber-700 text-base dark:text-amber-400">
					<AlertCircle className="h-4 w-4" />
					Live demos need a demo API key
				</CardTitle>
				<CardDescription className="text-amber-700/80 dark:text-amber-400/80">
					These components query the live API, which requires a publishable key.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3 text-amber-800 text-sm dark:text-amber-300">
				<p>
					Set{" "}
					<code className="rounded bg-black/10 px-1">VITE_DEMO_API_KEY</code> to
					a publishable key (starts with{" "}
					<code className="rounded bg-black/10 px-1">wh_</code>) in{" "}
					<code className="rounded bg-black/10 px-1">apps/web/.env</code>, then
					restart the dev server. The documentation and usage examples below
					stay available without a key.
				</p>
				<pre className="overflow-x-auto rounded bg-black/10 p-2 text-xs">
					<code>VITE_DEMO_API_KEY=wh_live_...</code>
				</pre>
			</CardContent>
		</Card>
	);
}

function AddressAutocompleteDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [selected, setSelected] = useState<AddressWithParsed | null>(null);

	return (
		<>
			<Card className="border-2 border-blue-200 dark:border-blue-900">
				<CardHeader className="bg-blue-50 dark:bg-blue-950/30">
					<CardTitle className="text-base">Live Demo</CardTitle>
					<CardDescription>
						Interactive component — queries live database
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-6">
					<Label htmlFor="autocomplete-demo">Address Search</Label>
					<div className="contents">
						<AddressAutocomplete
							client={client}
							id="autocomplete-demo"
							minCharsToSearch={3}
							onSelect={setSelected}
							placeholder="e.g., 34 Boxgrove Avenue, Belmore NSW"
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						Type an Australian address — suggestions stream in as you type, and
						the field stays editable while results load.
					</p>
				</CardContent>
			</Card>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="space-y-2 text-sm">
						<div>
							<span className="font-semibold">Street:</span>{" "}
							{data.streetAddress}
						</div>
						<div>
							<span className="font-semibold">Suburb:</span> {data.suburb}
						</div>
						<div>
							<span className="font-semibold">State:</span> {data.state}
						</div>
						<div>
							<span className="font-semibold">Postcode:</span> {data.postcode}
						</div>
					</div>
				)}
				result={{ data: selected, isLoading: false, error: null }}
				title="Address Result"
			/>
		</>
	);
}

function AddressFormFieldDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [selected, setSelected] = useState<AddressWithParsed | null>(null);

	return (
		<>
			<Card className="border-2 border-blue-200 dark:border-blue-900">
				<CardHeader className="bg-blue-50 dark:bg-blue-950/30">
					<CardTitle className="text-base">Live Demo</CardTitle>
					<CardDescription>
						Interactive component — queries live database
					</CardDescription>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="contents">
						<AddressFormField
							client={client}
							label="Address"
							minCharsToSearch={3}
							onSelect={setSelected}
							placeholder="Enter your address"
						/>
					</div>
				</CardContent>
			</Card>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="space-y-2 text-sm">
						<div className="flex items-start gap-2">
							<MapPin className="mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
							<div>
								<div className="font-semibold">{data.streetAddress}</div>
								<div className="text-muted-foreground">
									{data.suburb}, {data.state} {data.postcode}
								</div>
							</div>
						</div>
					</div>
				)}
				result={{ data: selected, isLoading: false, error: null }}
				title="Selected Address"
			/>
		</>
	);
}

function AddressFieldGroupDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [value, setValue] = useState<AddressFieldGroupValue>({
		street: "",
		suburb: "",
		state: "",
		postcode: "",
	});

	const hasValue = Boolean(
		value.street || value.suburb || value.state || value.postcode
	);

	return (
		<>
			<Card className="border-2 border-blue-200 dark:border-blue-900">
				<CardHeader className="bg-blue-50 dark:bg-blue-950/30">
					<CardTitle className="text-base">Live Demo</CardTitle>
					<CardDescription>
						Interactive component — queries live database
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-6">
					<div className="contents">
						<AddressFieldGroup
							client={client}
							onChange={setValue}
							value={value}
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						Search to auto-fill the fields, or edit any field directly — nothing
						locks while suggestions load.
					</p>
				</CardContent>
			</Card>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								Street
							</div>
							<div>{data.street || "—"}</div>
						</div>
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								Suburb
							</div>
							<div>{data.suburb || "—"}</div>
						</div>
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								State
							</div>
							<div>{data.state || "—"}</div>
						</div>
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								Postcode
							</div>
							<div>{data.postcode || "—"}</div>
						</div>
					</div>
				)}
				result={{
					data: hasValue ? value : null,
					isLoading: false,
					error: null,
				}}
				title="Parsed Address"
			/>
		</>
	);
}

interface ForwardCoords {
	formattedAddress: string | null;
	latitude: number | null;
	longitude: number | null;
}

function ForwardGeocodeDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [query, setQuery] = useState("1 Macquarie Street Sydney NSW 2000");
	const [coords, setCoords] = useState<ForwardCoords | null>(null);
	const hasCoords = coords?.latitude != null && coords?.longitude != null;

	return (
		<>
			<Card className="border-2 border-blue-200 dark:border-blue-900">
				<CardHeader className="bg-blue-50 dark:bg-blue-950/30">
					<CardTitle className="text-base">Live Demo</CardTitle>
					<CardDescription>
						Interactive component — queries live database
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 pt-6">
					<div className="space-y-1">
						<Label htmlFor="forward-geocode-query">Address</Label>
						<Input
							id="forward-geocode-query"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Enter an address to geocode"
							value={query}
						/>
						<p className="text-muted-foreground text-xs">
							Coordinates resolve as you type — the field never blocks input.
						</p>
					</div>
					<div className="contents">
						<ForwardGeocodeInput
							client={client}
							onResult={setCoords}
							placeholder="Coordinates appear here as you type"
							query={query.trim().length >= 3 ? query : null}
						/>
					</div>
				</CardContent>
			</Card>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="space-y-2 text-sm">
						<div>
							<span className="font-semibold">Latitude:</span>{" "}
							{data.latitude?.toFixed(6)}
						</div>
						<div>
							<span className="font-semibold">Longitude:</span>{" "}
							{data.longitude?.toFixed(6)}
						</div>
						{data.formattedAddress && (
							<div className="pt-2 text-muted-foreground text-xs">
								{data.formattedAddress}
							</div>
						)}
					</div>
				)}
				result={{
					data: hasCoords ? coords : null,
					isLoading: false,
					error: null,
				}}
				title="Coordinates"
			/>
		</>
	);
}

interface ReverseResult {
	address: string | null;
	distance: number | null;
}

const parseCoord = (raw: string): number | null => {
	if (raw.trim() === "") {
		return null;
	}
	const parsed = Number(raw);
	return Number.isNaN(parsed) ? null : parsed;
};

function ReverseGeocodeDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [lat, setLat] = useState("-33.9249");
	const [lng, setLng] = useState("151.1753");
	const [resolved, setResolved] = useState<ReverseResult | null>(null);

	const latitude = parseCoord(lat);
	const longitude = parseCoord(lng);

	return (
		<>
			<Card className="border-2 border-blue-200 dark:border-blue-900">
				<CardHeader className="bg-blue-50 dark:bg-blue-950/30">
					<CardTitle className="text-base">Live Demo</CardTitle>
					<CardDescription>
						Interactive component — queries live database
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 pt-6">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<Label htmlFor="reverse-lat">Latitude</Label>
							<Input
								id="reverse-lat"
								onChange={(event) => setLat(event.target.value)}
								placeholder="-33.9249"
								step="0.0001"
								type="number"
								value={lat}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="reverse-lng">Longitude</Label>
							<Input
								id="reverse-lng"
								onChange={(event) => setLng(event.target.value)}
								placeholder="151.1753"
								step="0.0001"
								type="number"
								value={lng}
							/>
						</div>
					</div>
					<div className="contents">
						<ReverseGeocodeInput
							client={client}
							latitude={latitude}
							longitude={longitude}
							onResult={setResolved}
							placeholder="Address appears here as you adjust the coordinates"
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						Edit either coordinate — the lookup runs in the background without
						locking the inputs.
					</p>
				</CardContent>
			</Card>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="space-y-2 text-sm">
						<div>
							<span className="font-semibold">Address:</span> {data.address}
						</div>
						{data.distance != null && (
							<div className="text-muted-foreground text-xs">
								~{data.distance.toFixed(1)} m from the point
							</div>
						)}
					</div>
				)}
				result={{
					data: resolved?.address ? resolved : null,
					isLoading: false,
					error: null,
				}}
				title="Address Result"
			/>
		</>
	);
}

// --- Live Vue demos (mounted into the React tree via VueIsland) ---

function VueLiveDemoCard({ children }: { children: React.ReactNode }) {
	return (
		<Card className="border-2 border-emerald-200 dark:border-emerald-900">
			<CardHeader className="bg-emerald-50 dark:bg-emerald-950/30">
				<CardTitle className="text-base">Live Demo (Vue)</CardTitle>
				<CardDescription>
					Real @locnative/vue-ui component — queries live database
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2 pt-6">{children}</CardContent>
		</Card>
	);
}

function VueAddressAutocompleteDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [selected, setSelected] = useState<AddressWithParsed | null>(null);

	return (
		<>
			<VueLiveDemoCard>
				<Label htmlFor="vue-autocomplete-demo">Address Search</Label>
				<VueIsland
					load={loadVueAutocomplete}
					props={{
						client,
						id: "vue-autocomplete-demo",
						minCharsToSearch: 3,
						placeholder: "e.g., 34 Boxgrove Avenue, Belmore NSW",
						onSelect: (address: AddressWithParsed) => setSelected(address),
					}}
				/>
				<p className="text-muted-foreground text-xs">
					Identical Vue 3 SFC of the React component — keyboard nav, streaming
					suggestions, and live results.
				</p>
			</VueLiveDemoCard>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="space-y-2 text-sm">
						<div>
							<span className="font-semibold">Street:</span>{" "}
							{data.streetAddress}
						</div>
						<div>
							<span className="font-semibold">Suburb:</span> {data.suburb}
						</div>
						<div>
							<span className="font-semibold">State:</span> {data.state}
						</div>
						<div>
							<span className="font-semibold">Postcode:</span> {data.postcode}
						</div>
					</div>
				)}
				result={{ data: selected, isLoading: false, error: null }}
				title="Address Result"
			/>
		</>
	);
}

function VueAddressFormFieldDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [selected, setSelected] = useState<AddressWithParsed | null>(null);

	return (
		<>
			<VueLiveDemoCard>
				<VueIsland
					load={loadVueFormField}
					props={{
						client,
						label: "Address",
						minCharsToSearch: 3,
						placeholder: "Enter your address",
						onSelect: (address: AddressWithParsed) => setSelected(address),
					}}
				/>
			</VueLiveDemoCard>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="flex items-start gap-2 text-sm">
						<MapPin className="mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
						<div>
							<div className="font-semibold">{data.streetAddress}</div>
							<div className="text-muted-foreground">
								{data.suburb}, {data.state} {data.postcode}
							</div>
						</div>
					</div>
				)}
				result={{ data: selected, isLoading: false, error: null }}
				title="Selected Address"
			/>
		</>
	);
}

function VueAddressFieldGroupDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [value, setValue] = useState<AddressFieldGroupValue>({
		street: "",
		suburb: "",
		state: "",
		postcode: "",
	});
	const hasValue = Boolean(
		value.street || value.suburb || value.state || value.postcode
	);

	return (
		<>
			<VueLiveDemoCard>
				<VueIsland
					load={loadVueFieldGroup}
					props={{
						client,
						value,
						onChange: (next: AddressFieldGroupValue) => setValue(next),
					}}
				/>
				<p className="text-muted-foreground text-xs">
					Search to auto-fill the fields, or edit any field directly.
				</p>
			</VueLiveDemoCard>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								Street
							</div>
							<div>{data.street || "—"}</div>
						</div>
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								Suburb
							</div>
							<div>{data.suburb || "—"}</div>
						</div>
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								State
							</div>
							<div>{data.state || "—"}</div>
						</div>
						<div>
							<div className="font-semibold text-muted-foreground text-xs">
								Postcode
							</div>
							<div>{data.postcode || "—"}</div>
						</div>
					</div>
				)}
				result={{
					data: hasValue ? value : null,
					isLoading: false,
					error: null,
				}}
				title="Parsed Address"
			/>
		</>
	);
}

function VueForwardGeocodeDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [query, setQuery] = useState("1 Macquarie Street Sydney NSW 2000");
	const [coords, setCoords] = useState<ForwardCoords | null>(null);
	const hasCoords = coords?.latitude != null && coords?.longitude != null;

	return (
		<>
			<VueLiveDemoCard>
				<Label htmlFor="vue-forward-geocode-query">Address</Label>
				<Input
					id="vue-forward-geocode-query"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Enter an address to geocode"
					value={query}
				/>
				<VueIsland
					load={loadVueForwardGeocode}
					props={{
						client,
						query: query.trim().length >= 3 ? query : null,
						placeholder: "Coordinates appear here as you type",
						onResult: (result: ForwardCoords) => setCoords(result),
					}}
				/>
			</VueLiveDemoCard>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="space-y-2 text-sm">
						<div>
							<span className="font-semibold">Latitude:</span>{" "}
							{data.latitude?.toFixed(6)}
						</div>
						<div>
							<span className="font-semibold">Longitude:</span>{" "}
							{data.longitude?.toFixed(6)}
						</div>
						{data.formattedAddress && (
							<div className="pt-2 text-muted-foreground text-xs">
								{data.formattedAddress}
							</div>
						)}
					</div>
				)}
				result={{
					data: hasCoords ? coords : null,
					isLoading: false,
					error: null,
				}}
				title="Coordinates"
			/>
		</>
	);
}

function VueReverseGeocodeDemo() {
	const client = useMemo(() => createDemoClient(), []);
	const [lat, setLat] = useState("-33.9249");
	const [lng, setLng] = useState("151.1753");
	const [resolved, setResolved] = useState<ReverseResult | null>(null);

	const latitude = parseCoord(lat);
	const longitude = parseCoord(lng);

	return (
		<>
			<VueLiveDemoCard>
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-1">
						<Label htmlFor="vue-reverse-lat">Latitude</Label>
						<Input
							id="vue-reverse-lat"
							onChange={(event) => setLat(event.target.value)}
							placeholder="-33.9249"
							step="0.0001"
							type="number"
							value={lat}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="vue-reverse-lng">Longitude</Label>
						<Input
							id="vue-reverse-lng"
							onChange={(event) => setLng(event.target.value)}
							placeholder="151.1753"
							step="0.0001"
							type="number"
							value={lng}
						/>
					</div>
				</div>
				<VueIsland
					load={loadVueReverseGeocode}
					props={{
						client,
						latitude,
						longitude,
						placeholder: "Address appears here as you adjust the coordinates",
						onResult: (result: ReverseResult) => setResolved(result),
					}}
				/>
			</VueLiveDemoCard>

			<ResultCard
				error={null}
				isLoading={false}
				renderData={(data) => (
					<div className="space-y-2 text-sm">
						<div>
							<span className="font-semibold">Address:</span> {data.address}
						</div>
						{data.distance != null && (
							<div className="text-muted-foreground text-xs">
								~{data.distance.toFixed(1)} m from the point
							</div>
						)}
					</div>
				)}
				result={{
					data: resolved?.address ? resolved : null,
					isLoading: false,
					error: null,
				}}
				title="Address Result"
			/>
		</>
	);
}

function RouteComponent() {
	const [activeTab, setActiveTab] = useState("react");

	return (
		<div className="flex flex-col gap-8 py-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">
					Component Library
				</h1>
				<p className="text-muted-foreground text-sm">
					Interactive components with live API demos and real-time validation
				</p>
			</div>

			<Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						Live API Integration
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<p>
						These demos make <strong>real API calls</strong> to the Locnative
						API using a test publishable key. Each form submission is validated
						with Zod schemas and displays results in styled cards with loading
						and error states.
					</p>
					<div className="mt-2 rounded border border-blue-100 bg-white p-3 dark:border-blue-900 dark:bg-black/30">
						<p className="mb-2 font-semibold text-xs">Demo Features:</p>
						<ul className="ml-4 list-disc space-y-1 text-xs">
							<li>✓ Real API calls to Locnative service</li>
							<li>✓ Zod schema validation on client side</li>
							<li>✓ Loading states with spinners</li>
							<li>✓ Error handling with detailed messages</li>
							<li>✓ Result previews in styled cards</li>
							<li>✓ shadcn/ui Form components</li>
						</ul>
					</div>
				</CardContent>
			</Card>

			<Tabs onValueChange={setActiveTab} value={activeTab}>
				<TabsList>
					<TabsTrigger value="react">
						React UI (v0.1.0) — 5 Components
					</TabsTrigger>
					<TabsTrigger value="vue">Vue UI (v0.3.0) — 5 Components</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-6 space-y-10" value="react">
					<div className="space-y-8">
						{demoKeyConfigured ? null : <DemoKeyNotice />}
						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <AddressAutocompleteDemo /> : null}
							<ComponentDocumentation
								description="Search and select addresses with autocomplete suggestions"
								features={[
									"Geolocation",
									"Custom rendering",
									"i18n support",
									"Async validation",
								]}
								name="AddressAutocomplete"
								props={`{
  client: LocnativeClient
  onSelect?: (address: AddressWithParsed) => void
  enableGeolocation?: boolean
  placeholder?: string
  debounceMs?: number
  sessionToken?: string
}`}
								usage={`import { AddressAutocomplete } from '@locnative/react-ui';
import { createLocnativeClient } from '@locnative/sdk';

const client = createLocnativeClient({
  apiKey: 'pk_...'
});

<AddressAutocomplete
  client={client}
  onSelect={(addr) => console.log(addr)}
/>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <AddressFormFieldDemo /> : null}
							<ComponentDocumentation
								description="Wrapped autocomplete for form integration with labels"
								features={[
									"Label support",
									"Error styling",
									"Required field",
									"Disabled state",
								]}
								name="AddressFormField"
								props={`{
  client: LocnativeClient
  onSelect?: (address: AddressWithParsed) => void
  placeholder?: string
  disabled?: boolean
}`}
								usage={`<AddressFormField
  client={client}
  placeholder="Enter your address"
  onSelect={handleAddressSelect}
/>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <AddressFieldGroupDemo /> : null}
							<ComponentDocumentation
								description="Multi-field form with parsed address components"
								features={[
									"Parsed fields",
									"Autocomplete integration",
									"Customizable labels",
									"Controlled",
								]}
								name="AddressFieldGroup"
								props={`{
  client: LocnativeClient
  value: { street, suburb, state, postcode }
  onChange: (value) => void
  disabled?: boolean
}`}
								usage={`const [value, setValue] = useState({
  street: '',
  suburb: '',
  state: '',
  postcode: ''
});

<AddressFieldGroup
  client={client}
  value={value}
  onChange={setValue}
/>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <ForwardGeocodeDemo /> : null}
							<ComponentDocumentation
								description="Search address to get coordinates (lat/lng)"
								features={[
									"Address search",
									"Coordinate output",
									"Error handling",
									"Loading state",
								]}
								name="ForwardGeocodeInput"
								props={`{
  client: LocnativeClient
  onSelect?: (coords: { lat, lng }) => void
  placeholder?: string
}`}
								usage={`<ForwardGeocodeInput
  client={client}
  onSelect={(coords) => setLocation(coords)}
/>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <ReverseGeocodeDemo /> : null}
							<ComponentDocumentation
								description="Search by coordinates to get address details"
								features={[
									"Coordinate input",
									"Address lookup",
									"Error handling",
									"Loading state",
								]}
								name="ReverseGeocodeInput"
								props={`{
  client: LocnativeClient
  onSelect?: (address: AddressWithParsed) => void
  placeholder?: string
}`}
								usage={`<ReverseGeocodeInput
  client={client}
  onSelect={(address) => setAddress(address)}
/>`}
							/>
						</div>
					</div>

					<Card className="mt-12 bg-muted/50">
						<CardHeader>
							<CardTitle className="text-base">Integration Guide</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div>
								<strong>1. Install</strong>
								<pre className="mt-1 overflow-x-auto rounded bg-black/20 p-2 text-xs">
									<code>pnpm add @locnative/react-ui @locnative/sdk</code>
								</pre>
							</div>
							<div>
								<strong>2. Import</strong>
								<pre className="mt-1 overflow-x-auto rounded bg-black/20 p-2 text-xs">
									<code>{`import { AddressAutocomplete } from '@locnative/react-ui';\nimport '@locnative/react-ui/styles.css';`}</code>
								</pre>
							</div>
							<div>
								<strong>3. Use with your API key</strong>
								<pre className="mt-1 overflow-x-auto rounded bg-black/20 p-2 text-xs">
									<code>{`const client = createLocnativeClient({
  apiKey: 'pk_live_...'  // Get from dashboard
});

<AddressAutocomplete client={client} />`}</code>
								</pre>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent className="mt-6 space-y-10" value="vue">
					<div className="space-y-8">
						<Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
									Live Vue 3 components
								</CardTitle>
								<CardDescription>
									These are real <strong>@locnative/vue-ui</strong> Vue 3 SFCs,
									mounted into this React dashboard via a small{" "}
									<code className="rounded bg-black/10 px-1">VueIsland</code>{" "}
									bridge (each Vue app is mounted into a DOM ref). Same SDK,
									same API, same accessible behavior as the React components.
								</CardDescription>
							</CardHeader>
						</Card>

						{demoKeyConfigured ? null : <DemoKeyNotice />}

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <VueAddressAutocompleteDemo /> : null}
							<ComponentDocumentation
								description="Search and select addresses with autocomplete suggestions"
								features={[
									"Geolocation",
									"Slots for custom rendering",
									"i18n support",
									"Keyboard nav",
								]}
								name="AddressAutocomplete"
								packageName="@locnative/vue-ui"
								props={`{
  client: LocnativeClient
  minCharsToSearch?: number
  enableGeolocation?: boolean
  placeholder?: string
  debounceMs?: number
}
emits: select, queryChange`}
								usage={`<script setup>
import { AddressAutocomplete } from '@locnative/vue-ui';
import { createLocnativeClient } from '@locnative/sdk';

const client = createLocnativeClient({ apiKey: 'pk_...' });
</script>

<template>
  <AddressAutocomplete
    :client="client"
    @select="(addr) => console.log(addr)"
  />
</template>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <VueAddressFormFieldDemo /> : null}
							<ComponentDocumentation
								description="Wrapped autocomplete for form integration with labels"
								features={[
									"Label support",
									"Error styling",
									"Required field",
									"Disabled state",
								]}
								name="AddressFormField"
								packageName="@locnative/vue-ui"
								props={`{
  client: LocnativeClient
  label: string
  error?: string
  required?: boolean
}
emits: select`}
								usage={`<AddressFormField
  :client="client"
  label="Address"
  @select="handleSelect"
/>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <VueAddressFieldGroupDemo /> : null}
							<ComponentDocumentation
								description="Multi-field form with parsed address components"
								features={[
									"Parsed fields",
									"Autocomplete integration",
									"Customizable labels",
									"Controlled",
								]}
								name="AddressFieldGroup"
								packageName="@locnative/vue-ui"
								props={`{
  client: LocnativeClient
  value: { street, suburb, state, postcode }
}
emits: change`}
								usage={`<AddressFieldGroup
  :client="client"
  :value="value"
  @change="value = $event"
/>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <VueForwardGeocodeDemo /> : null}
							<ComponentDocumentation
								description="Search address to get coordinates (lat/lng)"
								features={[
									"Address search",
									"Coordinate output",
									"Reactive query",
									"Read-only",
								]}
								name="ForwardGeocodeInput"
								packageName="@locnative/vue-ui"
								props={`{
  client: LocnativeClient
  query: string | null
}
emits: result`}
								usage={`<ForwardGeocodeInput
  :client="client"
  :query="query"
  @result="setCoords"
/>`}
							/>
						</div>

						<div className="grid items-start gap-6 lg:grid-cols-2">
							{demoKeyConfigured ? <VueReverseGeocodeDemo /> : null}
							<ComponentDocumentation
								description="Search by coordinates to get address details"
								features={[
									"Coordinate input",
									"Address lookup",
									"Reactive coords",
									"Read-only",
								]}
								name="ReverseGeocodeInput"
								packageName="@locnative/vue-ui"
								props={`{
  client: LocnativeClient
  latitude: number | null
  longitude: number | null
}
emits: result`}
								usage={`<ReverseGeocodeInput
  :client="client"
  :latitude="lat"
  :longitude="lng"
  @result="setAddress"
/>`}
							/>
						</div>
					</div>
				</TabsContent>
			</Tabs>

			<Card className="bg-muted/50">
				<CardHeader>
					<CardTitle className="text-base">Quality & Metrics</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4 text-sm">
					<div>
						<div className="font-semibold">Bundle</div>
						<div className="text-muted-foreground">
							86 KB (ESM) • TypeScript • Sourcemaps
						</div>
					</div>
					<div>
						<div className="font-semibold">Accessibility</div>
						<div className="text-muted-foreground">
							WCAG 2.1 AA • Base UI • Keyboard nav
						</div>
					</div>
					<div>
						<div className="font-semibold">Styling</div>
						<div className="text-muted-foreground">
							Tailwind v4 • Dark mode • Responsive
						</div>
					</div>
					<div>
						<div className="font-semibold">Validation</div>
						<div className="text-muted-foreground">
							Zod schemas • React Hook Form • Error states
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
