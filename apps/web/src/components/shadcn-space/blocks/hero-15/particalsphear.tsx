"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

// Total number of particles to render in the sphere
const PARTICLE_COUNT = 9000;
// Physical radius of the sphere
const RADIUS = 324;

// Color palette for the particles - contains blues, oranges, greens, and highlights
const COLORS = [
	"#ea580c",
	"#d97706",
	"#84cc16",
	"#f1f5f9",
	"#94a3b8",
	"#2563eb",
	"#3b82f6",
	"#60a5fa",
	"#f97316",
];

interface SpherePoint {
	color: string;
	x: number;
	y: number;
	z: number;
}

/**
 * Generates a set of 3D points distributed on the surface of a sphere.
 * Uses Archimedes' theorem for uniform distribution across the sphere's surface.
 */
function generateSpherePoints(count: number): SpherePoint[] {
	const points: SpherePoint[] = [];

	for (let i = 0; i < count; i++) {
		// Archimedes' Theorem / Lambert's Cylindrical Projection:
		// Distributing points uniformly on the Z axis and then finding the corresponding circle radius at that height.
		const z = Math.random() * 2 - 1; // Range: -1 to 1
		const theta = Math.random() * 2 * Math.PI; // Full rotation in radians
		const r_at_z = Math.sqrt(1 - z * z); // Radius of the circle at this Z coordinate (Pythagorean)

		// Add 6% thickness/volume to the "shell" so it looks natural and not like a perfect math skin
		const r = RADIUS * (0.97 + Math.random() * 0.06);

		// Convert spherical/cylindrical orientation to Cartesian (X, Y, Z) coordinates
		const x = r * r_at_z * Math.cos(theta);
		const y = r * r_at_z * Math.sin(theta);
		const point_z = r * z;

		// Assign a color group based on the Y-position (Vertical distribution)
		let colorIndex: number;
		const yFactor = (y + RADIUS) / (2 * RADIUS); // Normalize Y position to 0.0 - 1.0 range

		if (Math.random() > 0.9) {
			// 10% chance to be a bright white "star" highlight
			colorIndex = 7;
		} else if (yFactor > 0.6) {
			// Top section of the sphere tends towards Blues
			colorIndex = Math.floor(Math.random() * 3);
		} else if (yFactor < 0.4) {
			// Bottom section tends towards Oranges/Warm tones
			colorIndex = 3 + Math.floor(Math.random() * 3);
		} else {
			// Middle section is a mix of all colors
			colorIndex = Math.floor(Math.random() * COLORS.length);
		}

		points.push({ x, y, z: point_z, color: COLORS[colorIndex] });
	}

	return points;
}

export default function ParticleSphereAnimation({
	className,
}: {
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const points = useMemo(() => generateSpherePoints(PARTICLE_COUNT), []);
	const rotationRef = useRef(0);
	const animationFrameRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const ctx = canvas.getContext("2d", {
			alpha: true,
			willReadFrequently: false,
		});
		if (!ctx) {
			return;
		}

		// Set canvas size
		const size = 678;
		canvas.width = size;
		canvas.height = size;

		// Enable image smoothing for better anti-aliasing
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";

		// Animation loop
		const animate = () => {
			// Clear the canvas for transparent background
			ctx.clearRect(0, 0, size, size);

			// Update rotation
			rotationRef.current += 0.003;

			// Translate to center
			ctx.save();
			ctx.translate(size / 2, size / 2);

			// Sort points by depth (z-order) for proper rendering
			const rotatedPoints = points.map((p) => {
				// Standard 3D Rotation Math around the Y-axis
				const cos = Math.cos(rotationRef.current);
				const sin = Math.sin(rotationRef.current);

				// Calculate new X and Z coordinates after rotation
				const x = p.x * cos - p.z * sin;
				const z = p.x * sin + p.z * cos;

				// Perspective/Depth calculations:
				// scale factor is 0 (back of sphere) to 1 (front of sphere)
				const scale = (z + RADIUS) / (2 * RADIUS);

				// Rim effect: Calculate 2D distance from the center to fade out the middle
				const distFromCenter = Math.sqrt(x * x + p.y * p.y);
				const rimFactor = Math.min(distFromCenter / RADIUS, 1);

				/**
				 * Rendering Rules:
				 * 1. Opacity: Particles near the edge (rim) are denser/more opaque. Particles in front are clearer.
				 * 2. Size: Particles in front (higher Z) appear larger to simulate perspective.
				 */
				const opacity =
					Math.max(0.1, rimFactor ** 3 * 0.8) * (0.4 + 0.6 * scale);
				const size = (0.4 + 0.8 * scale) * 1.5;

				return { x, y: p.y, z, color: p.color, opacity, size, scale };
			});

			// Sort by z-depth (back to front)
			rotatedPoints.sort((a, b) => a.z - b.z);

			// Draw particles
			for (const p of rotatedPoints) {
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fillStyle = p.color;
				ctx.globalAlpha = p.opacity;
				ctx.fill();
			}

			// Reset globalAlpha to prevent state leakage
			ctx.globalAlpha = 1.0;

			ctx.restore();

			animationFrameRef.current = requestAnimationFrame(animate);
		};

		animate();

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [points]);

	return (
		<div className={cn("mx-auto w-full", className)}>
			<canvas
				className="pointer-events-none mx-auto h-auto w-full max-w-[678px] select-none rounded-full"
				height={678}
				ref={canvasRef}
				width={678}
			/>
		</div>
	);
}
