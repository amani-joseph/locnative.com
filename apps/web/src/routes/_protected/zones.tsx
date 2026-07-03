import type { GeoJsonPolygon } from "@locnative/api/routers/public/zones-schema";
import { Button } from "@locnative/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActiveProjectSelector } from "@/components/active-project-selector";
import {
	type PointTestResult,
	PointTestTool,
} from "@/components/zones/point-test-tool";
import type { UseZoneDraw } from "@/components/zones/use-zone-draw";
import {
	ZoneAddressesDrawer,
	type ZoneAddressItem,
} from "@/components/zones/zone-addresses-drawer";
import { ZoneCreateDialog } from "@/components/zones/zone-create-dialog";
import { ZoneList } from "@/components/zones/zone-list";
import { ZoneMap } from "@/components/zones/zone-map";
import { useActiveProject } from "@/lib/active-project";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/zones")({
	component: RouteComponent,
});

type ZoneListItem = Awaited<
	ReturnType<typeof orpcClient.zones.list>
>["zones"][number];

function RouteComponent() {
	const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
	const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
	const { activeId, select } = useActiveProject(projectIds);

	const [zones, setZones] = useState<ZoneListItem[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [controls, setControls] = useState<UseZoneDraw | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<PointTestResult | null>(null);
	const [testLat, setTestLat] = useState("-33.87");
	const [testLng, setTestLng] = useState("151.21");
	const [picking, setPicking] = useState(false);
	const [testPoint, setTestPoint] = useState<{
		lat: number;
		lng: number;
	} | null>(null);
	const [matchedZoneIds, setMatchedZoneIds] = useState<number[]>([]);

	const [editingId, setEditingId] = useState<number | null>(null);

	const [addrOpen, setAddrOpen] = useState(false);
	const [addrLoading, setAddrLoading] = useState(false);
	const [addrItems, setAddrItems] = useState<ZoneAddressItem[]>([]);
	const [addrTruncated, setAddrTruncated] = useState(false);
	const [addrZoneName, setAddrZoneName] = useState("");

	useEffect(() => {
		const preloadMapDependencies = async (): Promise<void> => {
			await Promise.all([
				import("maplibre-gl"),
				import("terra-draw"),
				import("terra-draw-maplibre-gl-adapter"),
			]);
		};
		preloadMapDependencies().catch(() => undefined);
	}, []);

	useEffect(() => {
		orpcClient.projects
			.list()
			.then((rows) =>
				setProjects(rows.map((r) => ({ id: r.id, name: r.name })))
			)
			.catch(() => toast.error("Failed to load projects."));
	}, []);

	const refreshZones = useCallback(async (projectId: string) => {
		try {
			const res = await orpcClient.zones.list({ projectId });
			setZones(res.zones);
		} catch {
			toast.error("Failed to load zones.");
		}
	}, []);

	useEffect(() => {
		if (activeId) {
			refreshZones(activeId);
		}
	}, [activeId, refreshZones]);

	// Clear any prior point-test state when switching projects.
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeId is the trigger, not a value read in the body
	useEffect(() => {
		setTestResult(null);
		setTestPoint(null);
		setMatchedZoneIds([]);
		setPicking(false);
	}, [activeId]);

	// Reactive drawn-polygon state, fed by ZoneMap's onDrawnPolygonChange. The
	// control methods (start/stop/clear/load) come from `controls`, but the
	// polygon VALUE must arrive through this channel — `controls` is a one-shot
	// snapshot whose drawnPolygon never updates.
	const [drawn, setDrawn] = useState<GeoJsonPolygon | null>(null);

	// Open the create dialog only when a brand-new polygon is fully drawn. This
	// is driven by terra-draw's draw-completion event (via ZoneMap.onPolygonDrawn),
	// NOT by `drawn` changing — `drawn` updates on every vertex while drawing, which
	// would pop the dialog open mid-draw. Editing an existing zone never triggers it.
	const handlePolygonDrawn = useCallback(() => {
		if (editingId === null) {
			setDialogOpen(true);
		}
	}, [editingId]);

	const handleSave = async (values: { name: string; description?: string }) => {
		if (!(activeId && drawn)) {
			return;
		}
		setSaving(true);
		try {
			await orpcClient.zones.create({
				projectId: activeId,
				name: values.name,
				description: values.description,
				geometry: drawn,
			});
			toast.success("Zone created.");
			setDialogOpen(false);
			controls?.clear();
			controls?.resetDrawn();
			await refreshZones(activeId);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create zone."
			);
		} finally {
			setSaving(false);
		}
	};

	const handleTest = useCallback(
		async (lat: number, lng: number) => {
			if (!activeId || Number.isNaN(lat) || Number.isNaN(lng)) {
				toast.error("Enter valid coordinates.");
				return;
			}
			setTesting(true);
			try {
				const res = await orpcClient.zones.contains({
					projectId: activeId,
					lat,
					lng,
				});
				setTestResult({
					zones: res.zones.map((z) => ({ id: z.id, name: z.name })),
				});
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Point test failed.");
			} finally {
				setTesting(false);
			}
		},
		[activeId]
	);

	const handlePick = useCallback(
		(lat: number, lng: number) => {
			setPicking(false);
			const roundedLat = Number(lat.toFixed(6));
			const roundedLng = Number(lng.toFixed(6));
			setTestLat(String(roundedLat));
			setTestLng(String(roundedLng));
			handleTest(roundedLat, roundedLng);
		},
		[handleTest]
	);

	const handleViewAddresses = async (id: number) => {
		if (!activeId) {
			return;
		}
		setAddrZoneName(zones.find((z) => z.id === id)?.name ?? "");
		setAddrOpen(true);
		setAddrLoading(true);
		try {
			const res = await orpcClient.zones.addresses({
				projectId: activeId,
				id,
				page: 1,
				limit: 100,
			});
			setAddrItems(
				res.results.map((r) => ({
					id: r.id,
					streetName: r.streetName,
					locality: r.locality,
					state: r.state,
					postcode: r.postcode,
				}))
			);
			setAddrTruncated(res.truncated);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to load addresses."
			);
		} finally {
			setAddrLoading(false);
		}
	};

	const handleEdit = (id: number) => {
		const zone = zones.find((z) => z.id === id);
		if (!(zone && controls)) {
			return;
		}
		setEditingId(id);
		controls.loadPolygon(zone.geometry);
		controls.stopDrawing(); // select mode → vertices are draggable
		toast.info("Drag the polygon's points, then click Save edit.");
	};

	const handleSaveEdit = async () => {
		if (!(activeId && editingId && drawn)) {
			toast.error("Move a point to change the shape before saving.");
			return;
		}
		try {
			await orpcClient.zones.update({
				projectId: activeId,
				id: editingId,
				geometry: drawn,
			});
			toast.success("Zone updated.");
			setEditingId(null);
			controls?.clear();
			controls?.resetDrawn();
			await refreshZones(activeId);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to update zone."
			);
		}
	};

	const handleCancelEdit = () => {
		setEditingId(null);
		controls?.clear();
		controls?.resetDrawn();
	};

	const handleDelete = async (id: number) => {
		if (!activeId) {
			return;
		}
		try {
			await orpcClient.zones.delete({ projectId: activeId, id });
			toast.success("Zone deleted.");
			await refreshZones(activeId);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete zone."
			);
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
				{editingId === null ? (
					<Button
						disabled={!(activeId && controls)}
						onClick={() => controls?.startDrawing()}
					>
						Draw zone
					</Button>
				) : (
					<div className="flex gap-2">
						<Button onClick={handleCancelEdit} variant="outline">
							Cancel
						</Button>
						<Button onClick={handleSaveEdit}>Save edit</Button>
					</div>
				)}
			</div>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
				<ZoneMap
					highlightZoneIds={matchedZoneIds}
					onDrawnPolygonChange={setDrawn}
					onPick={handlePick}
					onPolygonDrawn={handlePolygonDrawn}
					onReady={(c) => setControls(c)}
					picking={picking}
					testPoint={testPoint}
					zones={zones}
				/>
				<div className="space-y-4">
					<ZoneList
						onDelete={handleDelete}
						onEdit={handleEdit}
						onSelect={setSelectedId}
						onViewAddresses={handleViewAddresses}
						selectedId={selectedId}
						zones={zones}
					/>
					<PointTestTool
						lat={testLat}
						lng={testLng}
						onLatChange={setTestLat}
						onLngChange={setTestLng}
						onPick={() => setPicking((p) => !p)}
						onTest={() => handleTest(Number(testLat), Number(testLng))}
						picking={picking}
						result={testResult}
						testing={testing}
					/>
				</div>
			</div>
			<ZoneCreateDialog
				onCancel={() => {
					setDialogOpen(false);
					controls?.clear();
					controls?.resetDrawn();
				}}
				onSubmit={handleSave}
				open={dialogOpen}
				saving={saving}
			/>
			<ZoneAddressesDrawer
				addresses={addrItems}
				loading={addrLoading}
				onClose={() => setAddrOpen(false)}
				open={addrOpen}
				truncated={addrTruncated}
				zoneName={addrZoneName}
			/>
		</div>
	);
}
