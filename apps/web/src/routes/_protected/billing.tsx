import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Progress } from "@locnative/ui/components/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCardIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { orpcClient } from "@/lib/orpc";

interface CheckoutSearch {
	checkout?: "success" | "cancel";
}

export const Route = createFileRoute("/_protected/billing")({
	validateSearch: (search: Record<string, unknown>): CheckoutSearch => {
		if (search.checkout === "success" || search.checkout === "cancel") {
			return { checkout: search.checkout };
		}
		return {};
	},
	component: RouteComponent,
});

type Account = Awaited<ReturnType<typeof orpcClient.billing.getAccount>>;
type Summary = Awaited<ReturnType<typeof orpcClient.billing.getUsageSummary>>;
type Contexts = Awaited<ReturnType<typeof orpcClient.billing.listContexts>>;

/** Sentinel <Select> value for personal (non-team) billing, which has teamId=null. */
const PERSONAL_VALUE = "personal";
/** Stripe webhook can lag the redirect back; re-fetch once to catch the flip. */
const WEBHOOK_SETTLE_MS = 2500;

function errorMessage(err: unknown): string {
	return err instanceof Error
		? err.message
		: "Something went wrong. Please try again.";
}

function RouteComponent() {
	const { checkout } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [teamId, setTeamId] = useState<string | null>(null);
	const [contexts, setContexts] = useState<Contexts | null>(null);
	const [account, setAccount] = useState<Account | null>(null);
	const [summary, setSummary] = useState<Summary | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [busy, setBusy] = useState(false);
	const [justPaid, setJustPaid] = useState(false);

	const load = useCallback(async () => {
		try {
			const [acc, sum] = await Promise.all([
				orpcClient.billing.getAccount({ teamId }),
				orpcClient.billing.getUsageSummary({ teamId }),
			]);
			setAccount(acc);
			setSummary(sum);
			setLoadError(false);
		} catch {
			setLoadError(true);
		}
	}, [teamId]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		orpcClient.billing
			.listContexts()
			.then(setContexts)
			.catch(() => undefined);
	}, []);

	// Surface the result of the Stripe-hosted checkout redirect, then clean the URL.
	useEffect(() => {
		if (checkout === "success") {
			setJustPaid(true);
			toast.success("Payment method added — API usage will be billed monthly.");
			navigate({ replace: true, search: {} });
		} else if (checkout === "cancel") {
			toast.info("Checkout canceled — no payment method was added.");
			navigate({ replace: true, search: {} });
		}
	}, [checkout, navigate]);

	// After a successful checkout the webhook flips hasPaymentMethod asynchronously,
	// so reload immediately and once more after it has had time to settle.
	useEffect(() => {
		if (!justPaid) {
			return;
		}
		load();
		const timer = setTimeout(() => {
			load();
		}, WEBHOOK_SETTLE_MS);
		return () => clearTimeout(timer);
	}, [justPaid, load]);

	const startCheckout = useCallback(async () => {
		setBusy(true);
		try {
			const { url } = await orpcClient.billing.createCheckoutSession({
				teamId,
			});
			window.location.href = url;
		} catch (err) {
			toast.error(errorMessage(err));
			setBusy(false);
		}
	}, [teamId]);

	const openPortal = useCallback(async () => {
		setBusy(true);
		try {
			const { url } = await orpcClient.billing.createPortalSession({ teamId });
			window.location.href = url;
		} catch (err) {
			toast.error(errorMessage(err));
			setBusy(false);
		}
	}, [teamId]);

	const usedPct = account
		? Math.min(
				100,
				Math.round(
					(account.currentPeriodRequests / account.freeAllotment) * 100
				)
			)
		: 0;
	const estimate = summary ? (summary.estimatedCents / 100).toFixed(2) : "0.00";
	const teams = contexts?.teams ?? [];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">Billing</h1>
					<p className="text-muted-foreground text-sm">
						Pay-as-you-go — 15,000 requests/month free, then $0.70 per 1,000
						requests.
					</p>
				</div>
				{teams.length > 0 ? (
					<Select
						onValueChange={(value) =>
							setTeamId(value === PERSONAL_VALUE ? null : value)
						}
						value={teamId ?? PERSONAL_VALUE}
					>
						<SelectTrigger className="w-56">
							<SelectValue>
								{(value: string | null) =>
									value === PERSONAL_VALUE || value === null
										? (contexts?.personal.label ?? "Personal")
										: (teams.find((t) => t.teamId === value)?.label ?? "Team")
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={PERSONAL_VALUE}>
								{contexts?.personal.label ?? "Personal"}
							</SelectItem>
							{teams.map((t) => (
								<SelectItem key={t.teamId} value={t.teamId as string}>
									{t.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>

			{loadError ? (
				<Card>
					<CardContent className="flex flex-col items-start gap-3 pt-6">
						<p className="text-destructive text-sm">
							Couldn't load billing details.
						</p>
						<Button onClick={() => load()} size="sm" variant="outline">
							Retry
						</Button>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Current usage</CardTitle>
							<CardDescription>
								{account?.hasPaymentMethod
									? "Card on file — usage billed monthly"
									: "Free tier"}
							</CardDescription>
						</div>
						<Badge className="gap-1">
							<SparklesIcon className="size-3" />
							{account?.status ?? "free"}
						</Badge>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Requests this month</span>
							<span className="font-medium">
								{account?.currentPeriodRequests ?? 0} /{" "}
								{account?.freeAllotment ?? 0} free
							</span>
						</div>
						<Progress className="h-2" value={usedPct} />
					</div>
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							Estimated cost this month
						</span>
						<span className="font-medium">${estimate}</span>
					</div>
					{account?.blocked ? (
						<p className="text-destructive text-sm">
							Free tier exhausted. Add a payment method to resume API access.
						</p>
					) : null}
					<div className="flex gap-2">
						{account?.hasPaymentMethod ? (
							<Button disabled={busy} onClick={openPortal} variant="outline">
								<CreditCardIcon className="size-4" /> Manage billing
							</Button>
						) : (
							<Button disabled={busy} onClick={startCheckout}>
								<CreditCardIcon className="size-4" /> Add payment method
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{summary && summary.byEndpoint.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Usage by endpoint</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{summary.byEndpoint.map((row) => (
							<div
								className="flex items-center justify-between text-sm"
								key={row.endpoint}
							>
								<span className="text-muted-foreground">{row.endpoint}</span>
								<span className="font-medium">{row.count}</span>
							</div>
						))}
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
