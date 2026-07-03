import {
	Map as LocnativeMap,
	MapClusterLayer,
	MapControls,
	MapPopup,
	useMap,
} from "@locnative/ui/components/ui/map";
import { useEffect, useMemo, useState } from "react";
import {
	OPENFREEMAP_DARK,
	OPENFREEMAP_LIGHT,
} from "@/components/map/map-style";
import type { BatchResultRow } from "./results-table";

// Shared basemap (same one the zone maps use) — free, no key, CORS-open, and
// ships working glyphs, unlike the mapcn Carto default whose label fonts 404.
const BASEMAP = { dark: OPENFREEMAP_DARK, light: OPENFREEMAP_LIGHT };
const MAP_HEIGHT_PX = 480;
const CLUSTER_COLORS: [string, string, string] = [
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
];
const AU_CENTER: [number, number] = [134.0, -25.6];
const AU_ZOOM = 3.4;

interface PointProps {
	formattedAddress: string;
	input: string;
}
type Bounds = [[number, number], [number, number]];

function toGeoJSON(results: BatchResultRow[]) {
	const features = results.flatMap((r) => {
		if (!(r.matched && r.address)) {
			return [];
		}
		return {
			type: "Feature" as const,
			geometry: {
				type: "Point" as const,
				coordinates: [r.address.longitude, r.address.latitude] as [
					number,
					number,
				],
			},
			properties: {
				input: r.input,
				formattedAddress: r.address.formattedAddress,
			},
		};
	});
	return { type: "FeatureCollection" as const, features };
}

function boundsOf(
	features: ReturnType<typeof toGeoJSON>["features"]
): Bounds | null {
	if (features.length === 0) {
		return null;
	}
	let minLng = Number.POSITIVE_INFINITY;
	let minLat = Number.POSITIVE_INFINITY;
	let maxLng = Number.NEGATIVE_INFINITY;
	let maxLat = Number.NEGATIVE_INFINITY;
	for (const f of features) {
		const [lng, lat] = f.geometry.coordinates;
		minLng = Math.min(minLng, lng);
		minLat = Math.min(minLat, lat);
		maxLng = Math.max(maxLng, lng);
		maxLat = Math.max(maxLat, lat);
	}
	return [
		[minLng, minLat],
		[maxLng, maxLat],
	];
}

// Fit the viewport to the result extent once the map is ready.
function FitBounds({ bounds }: { bounds: Bounds | null }) {
	const { map, isLoaded } = useMap();
	useEffect(() => {
		if (!(map && isLoaded && bounds)) {
			return;
		}
		map.fitBounds(bounds, { padding: 48, animate: false, maxZoom: 15 });
	}, [map, isLoaded, bounds]);
	return null;
}

export interface ResultsMapProps {
	results: BatchResultRow[];
}

export function ResultsMap({ results }: ResultsMapProps) {
	const geo = useMemo(() => toGeoJSON(results), [results]);
	const bounds = useMemo(() => boundsOf(geo.features), [geo]);
	const [selected, setSelected] = useState<{
		coordinates: [number, number];
		properties: PointProps;
	} | null>(null);

	const matched = geo.features.length;
	if (matched === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				No matched coordinates to map.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-xs">
				{matched.toLocaleString()} of {results.length.toLocaleString()} geocoded
			</p>
			<div
				className="overflow-hidden rounded-md border"
				style={{ height: MAP_HEIGHT_PX }}
			>
				<LocnativeMap
					center={AU_CENTER}
					fadeDuration={0}
					styles={BASEMAP}
					zoom={AU_ZOOM}
				>
					<MapClusterLayer<PointProps>
						clusterColors={CLUSTER_COLORS}
						clusterMaxZoom={14}
						clusterRadius={50}
						data={geo}
						onPointClick={(feature, coordinates) =>
							setSelected({ coordinates, properties: feature.properties })
						}
						pointColor="#3b82f6"
					/>
					{selected && (
						<MapPopup
							className="w-52"
							closeButton
							closeOnClick={false}
							key={`${selected.coordinates[0]}-${selected.coordinates[1]}`}
							latitude={selected.coordinates[1]}
							longitude={selected.coordinates[0]}
							onClose={() => setSelected(null)}
						>
							<div className="space-y-0.5 text-[13px]">
								<p className="font-medium text-foreground">
									{selected.properties.formattedAddress}
								</p>
								<p className="text-muted-foreground text-xs">
									input: {selected.properties.input}
								</p>
								<p className="mt-1 font-mono text-[11px] text-muted-foreground">
									{selected.coordinates[1].toFixed(5)},{" "}
									{selected.coordinates[0].toFixed(5)}
								</p>
							</div>
						</MapPopup>
					)}
					<FitBounds bounds={bounds} />
					<MapControls />
				</LocnativeMap>
			</div>
		</div>
	);
}
