import type { GeoJsonPolygon } from "@locnative/api/routers/public/zones-schema";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type DrawFeature,
	featureToPolygon,
	polygonToFeature,
} from "./geometry.ts";

export interface UseZoneDraw {
	clear: () => void;
	drawnPolygon: GeoJsonPolygon | null;
	loadPolygon: (polygon: GeoJsonPolygon) => void;
	resetDrawn: () => void;
	startDrawing: () => void;
	stopDrawing: () => void;
}

export function useZoneDraw(
	map: MapLibreMap | null,
	options?: { onPolygonDrawn?: () => void }
): UseZoneDraw {
	// biome-ignore lint/suspicious/noExplicitAny: terra-draw instance type
	const drawRef = useRef<any>(null);
	const [drawnPolygon, setDrawnPolygon] = useState<GeoJsonPolygon | null>(null);
	// Ref so the terra-draw listener (registered once) always calls the latest callback.
	const onPolygonDrawnRef = useRef(options?.onPolygonDrawn);
	onPolygonDrawnRef.current = options?.onPolygonDrawn;

	useEffect(() => {
		if (!map) {
			return;
		}
		let disposed = false;
		Promise.all([
			import("terra-draw"),
			import("terra-draw-maplibre-gl-adapter"),
		]).then(([terra, adapterMod]) => {
			const { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } = terra;
			const { TerraDrawMapLibreGLAdapter } = adapterMod;
			const draw = new TerraDraw({
				adapter: new TerraDrawMapLibreGLAdapter({ map }),
				modes: [new TerraDrawPolygonMode(), new TerraDrawSelectMode()],
			});
			// C1: guard AFTER construction so we can stop the orphaned instance
			if (disposed) {
				draw.stop();
				return;
			}
			draw.start();

			const captureLatest = () => {
				const snapshot = draw.getSnapshot() as DrawFeature[];
				// Our flows clear() before drawing/loading, so the store holds a single
				// editable polygon at a time. Take the last Polygon feature (ignoring any
				// terra-draw guide/midpoint features which are non-Polygon).
				const polygons = snapshot.filter((f) => f.geometry.type === "Polygon");
				const last = polygons.at(-1);
				if (last) {
					const polygon = featureToPolygon(last);
					if (polygon) {
						setDrawnPolygon(polygon);
					}
				}
			};

			// "change" fires on every store edit, including each click while drawing
			// a polygon — so it keeps `drawnPolygon` live for edit-save and point
			// testing, but must NOT be used to detect "polygon finished".
			draw.on("change", captureLatest);
			// "finish" fires once an action completes. terra-draw reports the action
			// in the context: "draw" means a brand-new polygon was just completed —
			// that (and only that) is when we open the create dialog. Editing actions
			// (dragCoordinate, dragFeature, edit, …) must not trigger it.
			draw.on(
				"finish",
				// biome-ignore lint/suspicious/noExplicitAny: terra-draw OnFinishContext
				(_id: any, context: any) => {
					captureLatest();
					if (context?.action === "draw") {
						onPolygonDrawnRef.current?.();
					}
				}
			);
			drawRef.current = draw;
		});

		return () => {
			disposed = true;
			if (drawRef.current) {
				drawRef.current.stop();
				drawRef.current = null;
			}
		};
	}, [map]);

	const startDrawing = useCallback(() => {
		drawRef.current?.setMode("polygon");
	}, []);

	const stopDrawing = useCallback(() => {
		drawRef.current?.setMode("select");
	}, []);

	const clear = useCallback(() => {
		drawRef.current?.clear();
		setDrawnPolygon(null);
	}, []);

	const loadPolygon = useCallback((polygon: GeoJsonPolygon) => {
		if (!drawRef.current) {
			return;
		}
		drawRef.current.clear();
		// biome-ignore lint/suspicious/noExplicitAny: addFeatures expects GeoJSONStoreFeatures shape
		drawRef.current.addFeatures([polygonToFeature(polygon) as any]);
	}, []);

	const resetDrawn = useCallback(() => setDrawnPolygon(null), []);

	return useMemo(
		() => ({
			startDrawing,
			stopDrawing,
			clear,
			loadPolygon,
			drawnPolygon,
			resetDrawn,
		}),
		[startDrawing, stopDrawing, clear, loadPolygon, drawnPolygon, resetDrawn]
	);
}
