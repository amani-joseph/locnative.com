import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActiveProjectSelector } from "@/components/active-project-selector";
import {
	type DeliveryAttemptItem,
	DeliveryTimelineDrawer,
} from "@/components/webhooks/delivery-timeline-drawer";
import {
	WebhookCreateDialog,
	type WebhookCreateValues,
	type WebhookZoneOption,
} from "@/components/webhooks/webhook-create-dialog";
import {
	WebhookList,
	type WebhookRow,
} from "@/components/webhooks/webhook-list";
import { WebhookSecretReveal } from "@/components/webhooks/webhook-secret-reveal";
import { useActiveProject } from "@/lib/active-project";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/webhooks")({
	component: RouteComponent,
});

function RouteComponent() {
	const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
	const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
	const { activeId, select } = useActiveProject(projectIds);

	const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
	const [zones, setZones] = useState<WebhookZoneOption[]>([]);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

	const [deliveriesOpen, setDeliveriesOpen] = useState(false);
	const [deliveriesLoading, setDeliveriesLoading] = useState(false);
	const [attempts, setAttempts] = useState<DeliveryAttemptItem[]>([]);

	// Load projects once
	useEffect(() => {
		orpcClient.projects
			.list({})
			.then((rows) =>
				setProjects(rows.map((r) => ({ id: r.id, name: r.name })))
			)
			.catch(() => {
				toast.error("Failed to load projects.");
			});
	}, []);

	const refresh = useCallback(async (projectId: string) => {
		const [whRes, zRes] = await Promise.all([
			orpcClient.webhooks.list({ projectId }),
			orpcClient.zones.list({ projectId }),
		]);
		setWebhooks(
			whRes.webhooks.map((w) => ({
				...w,
				createdAt:
					typeof w.createdAt === "string"
						? w.createdAt
						: new Date(w.createdAt).toISOString(),
			}))
		);
		setZones(zRes.zones.map((z) => ({ id: z.id, name: z.name })));
	}, []);

	useEffect(() => {
		if (activeId) {
			refresh(activeId).catch(() => {
				toast.error("Failed to load webhooks.");
			});
		} else {
			setWebhooks([]);
			setZones([]);
		}
	}, [activeId, refresh]);

	const handleCreate = async (values: WebhookCreateValues) => {
		if (!activeId) {
			return;
		}
		setSaving(true);
		try {
			const created = await orpcClient.webhooks.create({
				projectId: activeId,
				...values,
			});
			setDialogOpen(false);
			setRevealedSecret(created.secret);
			await refresh(activeId);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create webhook."
			);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: number) => {
		if (!activeId) {
			return;
		}
		try {
			await orpcClient.webhooks.delete({ projectId: activeId, id });
			toast.success("Webhook deleted.");
			await refresh(activeId);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete webhook."
			);
		}
	};

	const handleReactivate = async (id: number) => {
		if (!activeId) {
			return;
		}
		try {
			await orpcClient.webhooks.reactivate({ projectId: activeId, id });
			toast.success("Webhook reactivated.");
			await refresh(activeId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to reactivate.");
		}
	};

	const handleViewDeliveries = async (id: number) => {
		if (!activeId) {
			return;
		}
		setDeliveriesOpen(true);
		setDeliveriesLoading(true);
		try {
			const res = await orpcClient.webhooks.deliveries({
				projectId: activeId,
				id,
			});
			setAttempts(
				res.attempts.map((a) => ({
					id: a.id,
					event: a.event,
					statusCode: a.statusCode,
					ok: a.ok,
					attempt: a.attempt,
					error: a.error,
					createdAt:
						typeof a.createdAt === "string"
							? a.createdAt
							: new Date(a.createdAt).toISOString(),
				}))
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to load deliveries."
			);
		} finally {
			setDeliveriesLoading(false);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<ActiveProjectSelector
					activeId={activeId}
					onSelect={select}
					projects={projects}
				/>
				<Button disabled={!activeId} onClick={() => setDialogOpen(true)}>
					Create webhook
				</Button>
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">
						Webhooks ({webhooks.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					<WebhookList
						onDelete={handleDelete}
						onReactivate={handleReactivate}
						onViewDeliveries={handleViewDeliveries}
						webhooks={webhooks}
					/>
				</CardContent>
			</Card>
			<WebhookCreateDialog
				onCancel={() => setDialogOpen(false)}
				onSubmit={handleCreate}
				open={dialogOpen}
				saving={saving}
				zones={zones}
			/>
			<WebhookSecretReveal
				onClose={() => setRevealedSecret(null)}
				secret={revealedSecret}
			/>
			<DeliveryTimelineDrawer
				attempts={attempts}
				loading={deliveriesLoading}
				onClose={() => setDeliveriesOpen(false)}
				open={deliveriesOpen}
			/>
		</div>
	);
}
