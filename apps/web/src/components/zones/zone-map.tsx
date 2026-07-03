import type { GeoJsonPolygon } from "@locnative/api/routers/public/zones-schema";
import type { ZoneWithGeometryRow } from "@locnative/api/shared/zone-queries";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { MapCanvas } from "@/components/map/map-canvas";
import { type UseZoneDraw, useZoneDraw } from "./use-zone-draw.ts";

const EXISTING_SRC = "existing-zones";
const TEST_POINT_SRC = "test-point";
const HIGHLIGHT_LAYER = "existing-zones-highlight";
const MAP_HEIGHT_PX = 480;

const EMPTY_FC = {
	type: "FeatureCollection" as const,
	features: [] as unknown[],
};

export interface ZoneMapProps {
	highlightZoneIds?: number[];
	onDrawnPolygonChange?: (polygon: GeoJsonPolygon | null) => void;
	onPick?: (lat: number, lng: number) => void;
	onPolygonDrawn?: () => void;
	onReady?: (controls: UseZoneDraw) => void;
	picking?: boolean;
	testPoint?: { lat: number; lng: number } | null;
	zones: ZoneWithGeometryRow[];
}

export function ZoneMap({
	zones,
	onReady,
	onDrawnPolygonChange,
	onPolygonDrawn,
	testPoint = null,
	picking = false,
	onPick,
	highlightZoneIds = [],
}: ZoneMapProps) {
	const [map, setMap] = useState<MapLibreMap | null>(null);
	const draw = useZoneDraw(map, { onPolygonDrawn });

	const onReadyRef = useRef(onReady);
	onReadyRef.current = onReady;
	const readyFiredRef = useRef(false);

	const pickingRef = useRef(picking);
	pickingRef.current = picking;
	const onPickRef = useRef(onPick);
	onPickRef.current = onPick;

	// Reactive channel for the drawn polygon. `onReady` fires once (delivering
	// the stable control methods), so the polygon value — which updates on every
	// vertex edit — must propagate through its own effect instead. Without this,
	// the parent's snapshot of `drawnPolygon` stays null and the create dialog
	// never opens (regression from firing onReady a single time).
	const onDrawnChangeRef = useRef(onDrawnPolygonChange);
	onDrawnChangeRef.current = onDrawnPolygonChange;
	useEffect(() => {
		onDrawnChangeRef.current?.(draw.drawnPolygon);
	}, [draw.drawnPolygon]);

	useEffect(() => {
		if (map && !readyFiredRef.current) {
			readyFiredRef.current = true;
			onReadyRef.current?.(draw);
		}
	}, [map, draw]);

	useEffect(() => {
		if (!map) {
			return;
		}
		const fc = {
			type: "FeatureCollection" as const,
			features: zones.map((z) => ({
				type: "Feature" as const,
				properties: { id: z.id, name: z.name },
				geometry: z.geometry,
			})),
		};
		const existing = map.getSource(EXISTING_SRC);
		if (existing) {
			// biome-ignore lint/suspicious/noExplicitAny: GeoJSONSource setData
			(existing as any).setData(fc);
			return;
		}
		// biome-ignore lint/suspicious/noExplicitAny: maplibre source typing
		map.addSource(EXISTING_SRC, { type: "geojson", data: fc } as any);
		map.addLayer({
			id: "existing-zones-fill",
			type: "fill",
			source: EXISTING_SRC,
			paint: { "fill-color": "#6366f1", "fill-opacity": 0.15 },
		});
		map.addLayer({
			id: "existing-zones-line",
			type: "line",
			source: EXISTING_SRC,
			paint: { "line-color": "#6366f1", "line-width": 2 },
		});
		// Highlight layer for zones containing the tested point (filter set below).
		map.addLayer({
			id: HIGHLIGHT_LAYER,
			type: "fill",
			source: EXISTING_SRC,
			filter: ["in", ["get", "id"], ["literal", []]],
			paint: { "fill-color": "#22c55e", "fill-opacity": 0.35 },
		});
		// Test-point marker rendered as a circle from its own source.
		// biome-ignore lint/suspicious/noExplicitAny: maplibre source typing
		map.addSource(TEST_POINT_SRC, { type: "geojson", data: EMPTY_FC } as any);
		map.addLayer({
			id: "test-point",
			type: "circle",
			source: TEST_POINT_SRC,
			paint: {
				"circle-radius": 7,
				"circle-color": "#f59e0b",
				"circle-stroke-color": "#ffffff",
				"circle-stroke-width": 2,
			},
		});
	}, [map, zones]);

	// Update which saved zones are highlighted as containing the test point.
	useEffect(() => {
		if (!map?.getLayer(HIGHLIGHT_LAYER)) {
			return;
		}
		map.setFilter(HIGHLIGHT_LAYER, [
			"in",
			["get", "id"],
			["literal", highlightZoneIds],
		]);
	}, [map, highlightZoneIds]);

	// Move/clear the test-point marker.
	useEffect(() => {
		const src = map?.getSource(TEST_POINT_SRC);
		if (!src) {
			return;
		}
		const data = testPoint
			? {
					type: "FeatureCollection" as const,
					features: [
						{
							type: "Feature" as const,
							properties: {},
							geometry: {
								type: "Point" as const,
								coordinates: [testPoint.lng, testPoint.lat],
							},
						},
					],
				}
			: EMPTY_FC;
		// biome-ignore lint/suspicious/noExplicitAny: GeoJSONSource setData
		(src as any).setData(data);
	}, [map, testPoint]);

	// Report map clicks while in "pick" mode (refs keep the listener stable).
	useEffect(() => {
		if (!map) {
			return;
		}
		// biome-ignore lint/suspicious/noExplicitAny: maplibre MapMouseEvent
		const handler = (e: any) => {
			if (pickingRef.current) {
				onPickRef.current?.(e.lngLat.lat, e.lngLat.lng);
			}
		};
		map.on("click", handler);
		return () => {
			map.off("click", handler);
		};
	}, [map]);

	// Crosshair cursor while picking.
	useEffect(() => {
		if (!map) {
			return;
		}
		const canvas = map.getCanvas();
		canvas.style.cursor = picking ? "crosshair" : "";
		return () => {
			canvas.style.cursor = "";
		};
	}, [map, picking]);

	const fittedRef = useRef(false);
	useEffect(() => {
		if (!map || fittedRef.current) {
			return;
		}
		fittedRef.current = true;
		if (zones.length === 0) {
			map.jumpTo({ center: [151.2093, -33.8688], zoom: 12 });
			return;
		}
		let minLng = 180;
		let minLat = 90;
		let maxLng = -180;
		let maxLat = -90;
		for (const z of zones) {
			for (const ring of z.geometry.coordinates) {
				for (const [lng, lat] of ring) {
					minLng = Math.min(minLng, lng);
					minLat = Math.min(minLat, lat);
					maxLng = Math.max(maxLng, lng);
					maxLat = Math.max(maxLat, lat);
				}
			}
		}
		map.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat],
			],
			{ padding: 48, maxZoom: 16, duration: 0 }
		);
	}, [map, zones]);

	return (
		<div style={{ height: MAP_HEIGHT_PX }}>
			<MapCanvas onMapReady={setMap} />
		</div>
	);
}
