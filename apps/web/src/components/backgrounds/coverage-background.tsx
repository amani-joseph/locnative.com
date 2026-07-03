import {
	arcPath,
	COVERAGE_ARCS,
	COVERAGE_REGIONS,
	MAP_HEIGHT,
	MAP_WIDTH,
	project,
	type Region,
} from "./coverage-geo";
import { RouteBackground } from "./route-background";

// Brand green for live coverage; warm amber for beta (matches the demo-key
// notice convention used elsewhere in the app).
const LIVE = "var(--primary)";
const BETA = "oklch(0.78 0.16 75)";
const regionById = new Map(COVERAGE_REGIONS.map((r) => [r.id, r]));

// Meridians / parallels every 30° for the cartographic graticule.
const MERIDIANS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
const PARALLELS = [-60, -30, 0, 30, 60];

function RegionMarker({ region, index }: { region: Region; index: number }) {
	const { x, y } = project(region);
	const color = region.status === "live" ? LIVE : BETA;
	return (
		<g style={{ ["--mk" as string]: color }}>
			{/* Expanding halo — animated only when motion is allowed. */}
			<circle
				className="motion-safe:animate-[coverage-ping_3.4s_ease-out_infinite]"
				cx={x}
				cy={y}
				fill="none"
				r={3}
				stroke={color}
				strokeWidth={1.2}
				style={{
					animationDelay: `${index * 0.5}s`,
					transformOrigin: `${x}px ${y}px`,
				}}
			/>
			{/* Solid core dot — always visible (static fallback). */}
			<circle cx={x} cy={y} fill={color} r={2.6} />
		</g>
	);
}

/**
 * Coverage — "the world layer". An equirectangular dotted field with a faint
 * graticule, brand-green signal arcs travelling between the regions Locnative
 * actually serves, and pulsing region markers (green = live, amber = beta).
 *
 * Pure SVG + CSS: SSR-safe, no canvas/WebGL, cheap on mobile. Arcs render as a
 * static base line plus a `motion-safe:` travelling pulse, so reduced-motion and
 * no-JS both fall back to clean static lines (never blank).
 */
export function CoverageBackground() {
	return (
		<RouteBackground>
			{/* z-0 — space-graphite wash with a faint green nebula up top. */}
			<div className="absolute inset-0 bg-[radial-gradient(110%_70%_at_50%_-10%,color-mix(in_oklab,var(--primary)_10%,var(--background))_0%,var(--background)_60%)]" />

			{/* z-10 — dotted data field, masked to fade toward the content below. */}
			<div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(color-mix(in_oklab,var(--primary)_60%,transparent)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,#000_0%,#000_45%,transparent_85%)]" />

			{/* z-20 — the map: graticule, arcs, region markers. */}
			<svg
				className="absolute inset-x-0 top-0 h-[min(78vh,720px)] w-full opacity-90 [mask-image:linear-gradient(to_bottom,#000_55%,transparent_100%)]"
				preserveAspectRatio="xMidYMid slice"
				viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
			>
				<title>Global coverage map</title>
				<defs>
					<linearGradient id="coverage-arc" x1="0" x2="1" y1="0" y2="0">
						<stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
						<stop offset="50%" stopColor="var(--primary)" stopOpacity="1" />
						<stop
							offset="100%"
							stopColor="oklch(0.8 0.13 195)"
							stopOpacity="0"
						/>
					</linearGradient>
				</defs>

				{/* Graticule */}
				<g opacity="0.12" stroke="var(--primary)" strokeWidth="0.5">
					{MERIDIANS.map((lng) => {
						const { x } = project({ lat: 0, lng });
						return (
							<line key={`m${lng}`} x1={x} x2={x} y1={0} y2={MAP_HEIGHT} />
						);
					})}
					{PARALLELS.map((lat) => {
						const { y } = project({ lat, lng: 0 });
						return <line key={`p${lat}`} x1={0} x2={MAP_WIDTH} y1={y} y2={y} />;
					})}
				</g>

				{/* A couple of coordinate tick labels for the cartographic touch. */}
				<g
					fill="var(--primary)"
					fillOpacity="0.35"
					fontFamily="ui-monospace, monospace"
					fontSize="11"
				>
					<text
						x={project({ lat: 30, lng: 0 }).x + 4}
						y={project({ lat: 30, lng: 0 }).y - 4}
					>
						30°N
					</text>
					<text
						x={project({ lat: 0, lng: 60 }).x + 4}
						y={project({ lat: 0, lng: 60 }).y - 4}
					>
						60°E
					</text>
				</g>

				{/* Signal arcs between real coverage regions. */}
				<g fill="none" strokeLinecap="round">
					{COVERAGE_ARCS.map(([fromId, toId], i) => {
						const from = regionById.get(fromId);
						const to = regionById.get(toId);
						if (!(from && to)) {
							return null;
						}
						const d = arcPath(from, to);
						const key = `${fromId}-${toId}`;
						return (
							<g key={key}>
								{/* Static base line — always visible. */}
								<path
									d={d}
									stroke="var(--primary)"
									strokeOpacity="0.18"
									strokeWidth="1"
								/>
								{/* Travelling pulse — motion only. */}
								<path
									className="motion-safe:animate-[coverage-travel_4.5s_linear_infinite]"
									d={d}
									stroke="url(#coverage-arc)"
									strokeDasharray="14 620"
									strokeWidth="1.6"
									style={{ animationDelay: `${i * 0.9}s` }}
								/>
							</g>
						);
					})}
				</g>

				{COVERAGE_REGIONS.map((region, i) => (
					<RegionMarker index={i} key={region.id} region={region} />
				))}
			</svg>

			{/* z-30 — scrim so the coverage table below sits on calm ground. */}
			<div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_30%,transparent_0%,color-mix(in_oklab,var(--background)_70%,transparent)_65%,var(--background)_100%)]" />

			<style>{`
				@keyframes coverage-travel { to { stroke-dashoffset: -634; } }
				@keyframes coverage-ping {
					0%   { transform: scale(1);   opacity: .9; }
					70%  { transform: scale(4.5); opacity: 0; }
					100% { transform: scale(4.5); opacity: 0; }
				}
			`}</style>
		</RouteBackground>
	);
}
