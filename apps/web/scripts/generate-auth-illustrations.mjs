// biome-ignore-all lint/suspicious/noBitwiseOperators: seeded PRNG (mulberry32) is bitwise by design
// biome-ignore-all lint/style/noParameterAssign: PRNG state lives in the closure parameter
// biome-ignore-all lint/style/useShorthandAssign: keep the reference mulberry32 form
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: offline art generator, scene builders are intentionally linear
/**
 * Generates the static illustrations shown beside the auth forms
 * (sign-in, sign-up, forgot/reset password) and writes them as WebP to
 * `public/illustrations/`. Output is deterministic (seeded RNG).
 *
 * Usage: pnpm -F web generate:auth-illustrations
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../public/illustrations"
);
const OUTPUT_WIDTH = 1800;
const WEBP_QUALITY = 82;
mkdirSync(OUT, { recursive: true });

/* ---------------- helpers ---------------- */
const mulberry32 = (a) => () => {
	a |= 0;
	a = (a + 0x6d_2b_79_f5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};
const hex = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const mix = (c1, c2, t) => {
	const a = hex(c1);
	const b = hex(c2);
	return `#${a
		.map((v, i) =>
			Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t)))
				.toString(16)
				.padStart(2, "0")
		)
		.join("")}`;
};
const ramp = (stops, t) => {
	const n = stops.length - 1;
	const tt = Math.min(1, Math.max(0, t));
	const i = Math.min(n - 1, Math.floor(tt * n));
	return mix(stops[i], stops[i + 1], tt * n - i);
};
const f1 = (n) => Math.round(n * 10) / 10;
const pts = (arr) => arr.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

const grain = (id, freq, slope) =>
	`<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="${slope}"/></feComponentTransfer></filter>`;

const HUES = ["#2fe0a8", "#22c3d6", "#5b7cfa", "#a35bf0", "#f05ba8"];

/* ================================================================
   Suburb at dusk — perspective suburb grid + topo contours + route
   ================================================================ */
function suburb() {
	const W = 1200;
	const H = 860;
	const rnd = mulberry32(7);
	const HORIZON = 168;
	const CAM_H = 150;
	const FOCAL = 760;
	const NEAR = 60;
	const CX = W * 0.5;
	const THETA = (-24 * Math.PI) / 180;
	const ORIGIN_Y = -140;
	const cos = Math.cos(THETA);
	const sin = Math.sin(THETA);
	const MAX_DEPTH = 3200;
	const DETAIL_DEPTH = 1050;

	// world (x, y on ground, z up) -> rotated camera frame
	const rot = (x, y) => [x * cos - y * sin, x * sin + y * cos - ORIGIN_Y];
	const proj = (x, y, z = 0) => {
		const [X, Y] = rot(x, y);
		const d = Math.max(Y, 1);
		return [CX + (X * FOCAL) / d, HORIZON + ((CAM_H - z) * FOCAL) / d, Y];
	};
	const depthT = (y) =>
		Math.min(1, Math.max(0, (y - NEAR) / (MAX_DEPTH - NEAR)));
	const visible = (p) =>
		p[2] > NEAR &&
		p[2] < MAX_DEPTH &&
		p[0] > -200 &&
		p[0] < W + 200 &&
		p[1] < H + 200;

	/* street network: continuous verticals, horizontals */
	const xs = [];
	let x = -3400;
	let k = 0;
	while (x < 3400) {
		const arterial = k % 5 === 2;
		xs.push({ pos: x, w: arterial ? 18 : 10, arterial });
		x += 120 + Math.floor(rnd() * 70);
		k++;
	}
	const ys = [];
	let y = -400;
	k = 0;
	while (y < 3600) {
		const arterial = k % 6 === 3;
		ys.push({ pos: y, w: arterial ? 18 : 10, arterial });
		y += 64 + Math.floor(rnd() * 10);
		k++;
	}

	const ground = [];
	const objects = []; // depth-sorted (houses + trees)
	const farLights = [];

	for (let i = 0; i < xs.length - 1; i++) {
		for (let j = 0; j < ys.length - 1; j++) {
			const x0 = xs[i].pos + xs[i].w / 2;
			const x1 = xs[i + 1].pos - xs[i + 1].w / 2;
			const y0 = ys[j].pos + ys[j].w / 2;
			const y1 = ys[j + 1].pos - ys[j + 1].w / 2;
			const corners = [proj(x0, y0), proj(x1, y0), proj(x1, y1), proj(x0, y1)];
			if (!corners.some(visible)) {
				continue;
			}
			const dmid = (corners[0][2] + corners[2][2]) / 2;
			const t = depthT(dmid);
			const isPark = rnd() < 0.06;
			if (isPark && dmid < DETAIL_DEPTH) {
				ground.push(
					`<polygon points="${pts(corners)}" fill="${mix("#123a2e", "#2a1f44", t)}"/>`
				);
				// park trees
				const n = Math.floor((x1 - x0) / 9);
				for (let q = 0; q < n * 3; q++) {
					const tx = x0 + 5 + rnd() * (x1 - x0 - 10);
					const ty = y0 + 5 + rnd() * (y1 - y0 - 10);
					objects.push({ kind: "tree", x: tx, y: ty, r: 3 + rnd() * 2.5 });
				}
				continue;
			}
			ground.push(
				`<polygon points="${pts(corners)}" fill="${mix("#1a1d26", "#22183a", t)}"/>`
			);
			if (dmid > DETAIL_DEPTH) {
				const nl = Math.floor((x1 - x0) / 16);
				for (let q = 0; q < nl; q++) {
					if (rnd() < 0.5) {
						continue;
					}
					const lp = proj(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 3);
					if (visible(lp)) {
						farLights.push(lp);
					}
				}
				continue;
			}
			// two rows of lots back-to-back
			const mid = (y0 + y1) / 2;
			for (const [ly0, ly1, front] of [
				[y0, mid, "low"],
				[mid, y1, "high"],
			]) {
				let lx = x0;
				while (lx < x1 - 8) {
					const lw = Math.min(13 + rnd() * 6, x1 - lx);
					const lot = [
						proj(lx + 0.5, ly0 + 0.5),
						proj(lx + lw - 0.5, ly0 + 0.5),
						proj(lx + lw - 0.5, ly1 - 0.5),
						proj(lx + 0.5, ly1 - 0.5),
					];
					if (lot.some(visible)) {
						const lt = depthT(lot[0][2]);
						const shade = rnd() * 0.25;
						ground.push(
							`<polygon points="${pts(lot)}" fill="${mix(mix("#20242f", "#2b2142", lt), "#151820", shade)}"/>`
						);
						// house footprint near street side
						const hw = lw * (0.55 + rnd() * 0.2);
						const hd = (ly1 - ly0) * (0.38 + rnd() * 0.14);
						const hx = lx + (lw - hw) / 2;
						const setback = 4 + rnd() * 2;
						const hy = front === "low" ? ly0 + setback : ly1 - setback - hd;
						objects.push({
							kind: "house",
							x0: hx,
							y0: hy,
							x1: hx + hw,
							y1: hy + hd,
							h: 4.2 + rnd() * 3.5,
							roofHue: rnd(),
							lit: rnd(),
						});
						// backyard tree
						if (rnd() < 0.55) {
							const ty =
								front === "low" ? ly1 - 3 - rnd() * 4 : ly0 + 3 + rnd() * 4;
							objects.push({
								kind: "tree",
								x: lx + 3 + rnd() * (lw - 6),
								y: ty,
								r: 2.6 + rnd() * 2.4,
							});
						}
						// pool
						if (rnd() < 0.12) {
							const py = front === "low" ? ly1 - 9 : ly0 + 3;
							const px = lx + 2 + rnd() * (lw - 8);
							const pool = [
								proj(px, py),
								proj(px + 5, py),
								proj(px + 5, py + 4),
								proj(px, py + 4),
							];
							ground.push(
								`<polygon points="${pts(pool)}" fill="#22c3d6" fill-opacity="${0.55 - lt * 0.35}"/>`
							);
						}
					}
					lx += lw;
				}
			}
		}
	}

	/* streets: dark asphalt drawn as wide lines on the ground plane, plus lamp dots on arterials */
	const streets = [];
	const lamps = [];
	const streetLine = (ax, ay, bx, by, w, arterial) => {
		// sample to clip behind-camera parts
		const segs = 90;
		const P = [];
		for (let s = 0; s <= segs; s++) {
			const t = s / segs;
			P.push(proj(ax + (bx - ax) * t, ay + (by - ay) * t));
		}
		const vis = P.filter((p) => p[2] > NEAR * 0.7 && p[2] < MAX_DEPTH);
		if (vis.length < 2) {
			return;
		}
		// street drawn as polygon with width computed per-point
		const nx = ay === by ? 0 : 1;
		const ny = ay === by ? 1 : 0;
		const left = [];
		const right = [];
		for (let s = 0; s <= segs; s++) {
			const t = s / segs;
			const wx = ax + (bx - ax) * t;
			const wy = ay + (by - ay) * t;
			const a = proj(wx - (nx * w) / 2, wy - (ny * w) / 2);
			const b = proj(wx + (nx * w) / 2, wy + (ny * w) / 2);
			if (a[2] > NEAR * 0.7 && b[2] > NEAR * 0.7 && a[2] < MAX_DEPTH) {
				left.push(a);
				right.push(b);
			}
		}
		if (left.length < 2) {
			return;
		}
		streets.push(
			`<polygon points="${pts([...left, ...right.reverse()])}" fill="${arterial ? "#0b0c10" : "#0e1015"}"/>`
		);
		if (arterial) {
			const center = [];
			for (let s = 0; s <= segs; s++) {
				const t = s / segs;
				const p = proj(ax + (bx - ax) * t, ay + (by - ay) * t, 0.05);
				if (p[2] > NEAR * 0.7 && p[2] < MAX_DEPTH) {
					center.push(p);
				}
			}
			streets.push(
				`<polyline points="${pts(center)}" fill="none" stroke="#f5a524" stroke-opacity=".22" stroke-width=".8" stroke-dasharray="6 7"/>`
			);
			const len = Math.hypot(bx - ax, by - ay);
			for (let d = 0; d < len; d += 34) {
				const t = d / len;
				const wx = ax + (bx - ax) * t + nx * (w / 2 + 1);
				const wy = ay + (by - ay) * t + ny * (w / 2 + 1);
				const p = proj(wx, wy, 6);
				if (visible(p)) {
					lamps.push(p);
				}
			}
		}
	};
	for (const s of xs) {
		streetLine(s.pos, -400, s.pos, 3600, s.w, s.arterial);
	}
	for (const s of ys) {
		streetLine(-3400, s.pos, 3400, s.pos, s.w, s.arterial);
	}

	/* route along street centerlines: staircase between two screen-picked intersections */
	const nearestIx = (sx, sy) => {
		let best = [0, 0];
		let bd = Number.POSITIVE_INFINITY;
		for (let a = 0; a < xs.length; a++) {
			for (let c = 0; c < ys.length; c++) {
				const p = proj(xs[a].pos, ys[c].pos);
				if (p[2] < NEAR) {
					continue;
				}
				const dd = Math.hypot(p[0] - sx, p[1] - sy);
				if (dd < bd) {
					bd = dd;
					best = [a, c];
				}
			}
		}
		return best;
	};
	const [sa, sc] = nearestIx(W * 0.4, H * 0.9);
	const steps = [[sa, sc]];
	for (const [da, dc] of [
		[0, 2],
		[-1, 0],
		[0, 2],
		[-1, 0],
		[0, 2],
	]) {
		const [pa, pc] = steps.at(-1);
		steps.push([pa + da, pc + dc]);
	}
	const routeWorld = steps.map(([a, b]) => [xs[a].pos, ys[b].pos]);
	const routePts = [];
	for (let s = 0; s < routeWorld.length - 1; s++) {
		const [ax, ay] = routeWorld[s];
		const [bx, by] = routeWorld[s + 1];
		for (let q = 0; q <= 30; q++) {
			const t = q / 30;
			const p = proj(ax + (bx - ax) * t, ay + (by - ay) * t, 0.4);
			if (p[2] > NEAR * 0.7) {
				routePts.push(p);
			}
		}
	}
	const [destX, destY] = routeWorld.at(-1);
	const [startX, startY] = routeWorld[0];

	/* topo contours draped on the ground (from option A) */
	const contours = [];
	const peaks = [
		{ x: destX, y: destY, n: 18, s: 0.4, step: 24 },
		{ x: destX - 900, y: destY + 350, n: 14, s: 2.3, step: 34 },
		{ x: destX + 700, y: destY + 600, n: 12, s: 4.1, step: 40 },
	];
	for (const p of peaks) {
		for (let k2 = 1; k2 <= p.n; k2++) {
			const r = k2 * p.step;
			const line = [];
			let started = false;
			let seg = [];
			for (let a = 0; a <= 160; a++) {
				const t = (a / 160) * Math.PI * 2;
				const rr =
					r *
					(1 +
						0.14 * Math.sin(3 * t + k2 * 0.35 + p.s) +
						0.07 * Math.sin(5 * t - k2 * 0.2 + p.s) +
						0.04 * Math.sin(9 * t + p.s));
				const q = proj(p.x + rr * Math.cos(t), p.y + rr * Math.sin(t), 0.1);
				if (q[2] > NEAR && q[2] < MAX_DEPTH) {
					seg.push(q);
					started = true;
				} else if (started && seg.length) {
					line.push(seg);
					seg = [];
				}
			}
			if (seg.length) {
				line.push(seg);
			}
			const col = ramp(HUES, (k2 - 1) / (p.n - 1));
			const major = k2 % 4 === 0;
			for (const sgm of line) {
				if (sgm.length < 2) {
					continue;
				}
				contours.push(
					`<polyline points="${pts(sgm)}" fill="none" stroke="${col}" stroke-width="${major ? 1.4 : 0.7}" stroke-opacity="${major ? 0.75 : 0.42}"/>`
				);
			}
		}
	}

	/* geofence: circle around destination */
	const fence = [];
	for (let a = 0; a <= 120; a++) {
		const t = (a / 120) * Math.PI * 2;
		fence.push(proj(destX + 150 * Math.cos(t), destY + 150 * Math.sin(t), 0.3));
	}

	/* objects sorted far -> near */
	const objSvg = [];
	const withDepth = objects
		.map((o) => {
			const cx2 = o.kind === "house" ? (o.x0 + o.x1) / 2 : o.x;
			const cy2 = o.kind === "house" ? (o.y0 + o.y1) / 2 : o.y;
			return { o, d: rot(cx2, cy2)[1] };
		})
		.filter(({ d }) => d > NEAR && d < MAX_DEPTH)
		.sort((a, b) => b.d - a.d);

	for (const { o, d } of withDepth) {
		const t = depthT(d);
		if (o.kind === "tree") {
			const p = proj(o.x, o.y, 5);
			if (!visible(p)) {
				continue;
			}
			const r = (o.r * FOCAL) / d;
			if (r < 0.4) {
				continue;
			}
			const trunk = proj(o.x, o.y, 0);
			const base = mix("#0f3b2c", "#2a2048", t);
			objSvg.push(
				`<line x1="${f1(trunk[0])}" y1="${f1(trunk[1])}" x2="${f1(p[0])}" y2="${f1(p[1])}" stroke="#0a0b0e" stroke-width="${f1(Math.max(0.4, r * 0.25))}"/><circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(r)}" fill="${base}"/><circle cx="${f1(p[0] - r * 0.3)}" cy="${f1(p[1] - r * 0.35)}" r="${f1(r * 0.55)}" fill="${mix("#2fe0a8", "#a35bf0", t)}" fill-opacity="${0.22 - t * 0.12}"/>`
			);
			continue;
		}
		const { x0, y0, x1, y1, h } = o;
		const base = [
			[x0, y0],
			[x1, y0],
			[x1, y1],
			[x0, y1],
		];
		const b = base.map(([a, c]) => proj(a, c, 0));
		const top = base.map(([a, c]) => proj(a, c, h));
		if (!b.some(visible)) {
			continue;
		}
		// visible walls: outward normal faces the camera, which sits at the rotated-frame origin
		const walls = [];
		for (let w2 = 0; w2 < 4; w2++) {
			const [ax, ay] = base[w2];
			const [bx, by] = base[(w2 + 1) % 4];
			const mx = (ax + bx) / 2;
			const my = (ay + by) / 2;
			const nx = by - ay;
			const ny = -(bx - ax);
			const [MX, MY] = rot(mx, my);
			const [NX, NY] = [nx * cos - ny * sin, nx * sin + ny * cos];
			const facing = NX * (0 - MX) + NY * (0 - MY) > 0;
			if (!facing) {
				continue;
			}
			// lighting: key light from upper-left (rotated frame -X, +Y)
			const lightDot = (NX * -0.7 + NY * -0.3) / Math.hypot(NX, NY);
			walls.push({ w2, lightDot });
		}
		const wallBase = mix("#2b3242", "#2a2140", t);
		for (const { w2, lightDot } of walls) {
			const q = [b[w2], b[(w2 + 1) % 4], top[(w2 + 1) % 4], top[w2]];
			const lum = 0.15 + Math.max(0, lightDot) * 0.35;
			objSvg.push(
				`<polygon points="${pts(q)}" fill="${mix("#0c0d12", wallBase, lum + 0.35)}"/>`
			);
			// lit windows
			if (o.lit < 0.42 && d < 900) {
				const [ax, ay] = base[w2];
				const [bx, by] = base[(w2 + 1) % 4];
				const wl = Math.hypot(bx - ax, by - ay);
				const nwin = wl > 9 ? 2 : 1;
				for (let n = 0; n < nwin; n++) {
					const t0 = (n + 0.3) / nwin;
					const t1 = t0 + 0.35 / nwin;
					const wq = [
						proj(ax + (bx - ax) * t0, ay + (by - ay) * t0, h * 0.35),
						proj(ax + (bx - ax) * t1, ay + (by - ay) * t1, h * 0.35),
						proj(ax + (bx - ax) * t1, ay + (by - ay) * t1, h * 0.68),
						proj(ax + (bx - ax) * t0, ay + (by - ay) * t0, h * 0.68),
					];
					objSvg.push(
						`<polygon points="${pts(wq)}" fill="${o.lit < 0.12 ? "#ffd27a" : "#f5a524"}" fill-opacity="${0.85 - t * 0.4}"/>`
					);
				}
			}
		}
		// pitched-roof read: roof quad + ridge highlight
		const roofCol = mix(
			mix("#3a4458", "#4a3566", t),
			ramp(HUES, o.roofHue),
			0.12
		);
		objSvg.push(`<polygon points="${pts(top)}" fill="${roofCol}"/>`);
		const longX = x1 - x0 > y1 - y0;
		const ridge = longX
			? [
					proj(x0 + 0.6, (y0 + y1) / 2, h + 0.01),
					proj(x1 - 0.6, (y0 + y1) / 2, h + 0.01),
				]
			: [
					proj((x0 + x1) / 2, y0 + 0.6, h + 0.01),
					proj((x0 + x1) / 2, y1 - 0.6, h + 0.01),
				];
		objSvg.push(
			`<line x1="${f1(ridge[0][0])}" y1="${f1(ridge[0][1])}" x2="${f1(ridge[1][0])}" y2="${f1(ridge[1][1])}" stroke="#c9d4ff" stroke-opacity="${0.28 - t * 0.15}" stroke-width=".7"/>`
		);
	}

	const dest = proj(destX, destY, 0);
	const GROUND_TOP = HORIZON + (CAM_H * FOCAL) / MAX_DEPTH;
	const destTop = proj(destX, destY, 26);
	const start = proj(startX, startY, 0);
	const pinR = (9 * FOCAL) / dest[2];

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
${grain("g", 0.9, 0.17)}
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07070d"/><stop offset=".55" stop-color="#1c1240"/><stop offset=".8" stop-color="#5a1f5c"/><stop offset=".96" stop-color="#e0705e"/><stop offset="1" stop-color="#f5a56b"/></linearGradient>
<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b85a6a" stop-opacity=".9"/><stop offset=".04" stop-color="#6a2a62" stop-opacity=".85"/><stop offset=".1" stop-color="#3a1d52" stop-opacity=".75"/><stop offset=".45" stop-color="#1a1030" stop-opacity=".25"/><stop offset="1" stop-color="#160f2b" stop-opacity="0"/></linearGradient>
<linearGradient id="route" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f5a524"/><stop offset=".55" stop-color="#f05ba8"/><stop offset="1" stop-color="#2fe0a8"/></linearGradient>
<radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
<radialGradient id="destGlow"><stop offset="0" stop-color="#2fe0a8" stop-opacity=".55"/><stop offset="1" stop-color="#2fe0a8" stop-opacity="0"/></radialGradient>
<radialGradient id="lamp"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".9"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
<filter id="blur6" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#0b0b10"/>
<rect width="${W}" height="${GROUND_TOP + 6}" fill="url(#sky)"/>
<g>${ground.join("")}</g>
<g>${streets.join("")}</g>
<g style="mix-blend-mode:screen">${contours.join("")}</g>
<polygon points="${pts(fence)}" fill="#2fe0a8" fill-opacity=".08" stroke="#2fe0a8" stroke-opacity=".85" stroke-width="1.4" stroke-dasharray="7 6"/>
<polyline points="${pts(routePts)}" fill="none" stroke="url(#route)" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" filter="url(#blur6)" opacity=".75"/>
<polyline points="${pts(routePts)}" fill="none" stroke="url(#route)" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>
<g>${objSvg.join("")}</g>
<g style="mix-blend-mode:screen" opacity=".22">${contours.join("")}</g>
<polyline points="${pts(routePts)}" fill="none" stroke="url(#route)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>
<polygon points="${pts(fence)}" fill="none" stroke="#2fe0a8" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="7 6"/>
<g>${farLights.map((p) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r=".9" fill="#ffc46b" fill-opacity="${f1(0.9 - depthT(p[2]) * 0.6)}"/>`).join("")}</g>
<g>${lamps.map((p) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(Math.max(1.2, 2400 / p[2] / 4))}" fill="url(#lamp)"/>`).join("")}</g>
<circle cx="${f1(dest[0])}" cy="${f1(dest[1])}" r="${f1(pinR * 5)}" fill="url(#destGlow)"/>
<line x1="${f1(dest[0])}" y1="${f1(dest[1])}" x2="${f1(destTop[0])}" y2="${f1(destTop[1])}" stroke="#2fe0a8" stroke-width="1.2"/>
<g transform="translate(${f1(destTop[0])} ${f1(destTop[1])})"><path d="M0 0c-8-9-13-15-13-21a13 13 0 0 1 26 0c0 6-5 12-13 21z" fill="#fafafa"/><circle cy="-21" r="4.6" fill="#0a0a0a"/></g>
<circle cx="${f1(start[0])}" cy="${f1(start[1])}" r="9" fill="#0a0a0a" stroke="#f5a524" stroke-width="3.5"/>
<rect y="${f1(GROUND_TOP - 20)}" width="${W}" height="420" fill="url(#fog)"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect width="${W}" height="${H}" filter="url(#g)" style="mix-blend-mode:overlay"/>
</svg>`;
}

/* ================================================================
   Topographic — refined option A
   ================================================================ */
function topographic() {
	const W = 1200;
	const H = 860;
	const peaks = [
		{ x: 470, y: 440, n: 26, s: 0, step: 19 },
		{ x: 930, y: 190, n: 13, s: 2.1, step: 20 },
		{ x: 140, y: 790, n: 11, s: 4.2, step: 22 },
		{ x: 1120, y: 760, n: 9, s: 5.3, step: 21 },
	];
	const rings = [];
	for (const p of peaks) {
		for (let k = 1; k <= p.n; k++) {
			const r = k * p.step;
			let d = "";
			for (let a = 0; a <= 180; a++) {
				const t = (a / 180) * Math.PI * 2;
				const rr =
					r *
					(1 +
						0.14 * Math.sin(3 * t + k * 0.35 + p.s) +
						0.07 * Math.sin(5 * t - k * 0.2 + p.s) +
						0.04 * Math.sin(9 * t + p.s));
				d += `${a ? "L" : "M"}${f1(p.x + rr * Math.cos(t))} ${f1(p.y + rr * Math.sin(t) * 0.8)}`;
			}
			const col = ramp(HUES, (k - 1) / (p.n - 1));
			const major = k % 5 === 0;
			rings.push(
				`<path d="${d}Z" fill="none" stroke="${col}" stroke-width="${major ? 1.8 : 0.9}" stroke-opacity="${major ? 0.9 : 0.5}"/>`
			);
		}
	}
	// faint survey grid
	const grid = [];
	for (let gx = 0; gx <= W; gx += 60) {
		grid.push(`<line x1="${gx}" y1="0" x2="${gx}" y2="${H}"/>`);
	}
	for (let gy = 0; gy <= H; gy += 60) {
		grid.push(`<line x1="0" y1="${gy}" x2="${W}" y2="${gy}"/>`);
	}
	const ticks = [];
	for (let gx = 60; gx < W; gx += 60) {
		for (let gy = 60; gy < H; gy += 60) {
			ticks.push(`<path d="M${gx - 3} ${gy}h6M${gx} ${gy - 3}v6"/>`);
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
${grain("g", 0.85, 0.18)}
<radialGradient id="bg" cx="40%" cy="50%" r="80%"><stop offset="0" stop-color="#0f241f"/><stop offset=".5" stop-color="#0d0f1f"/><stop offset="1" stop-color="#060608"/></radialGradient>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter>
<radialGradient id="glow"><stop offset="0" stop-color="#2fe0a8" stop-opacity=".6"/><stop offset="1" stop-color="#2fe0a8" stop-opacity="0"/></radialGradient>
<radialGradient id="vig" cx="45%" cy="50%" r="75%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g filter="url(#soft)" opacity=".5"><circle cx="980" cy="160" r="200" fill="#a35bf0"/><circle cx="120" cy="820" r="220" fill="#f05ba8" opacity=".55"/><circle cx="470" cy="440" r="200" fill="#0fb39a" opacity=".6"/></g>
<g stroke="#ffffff" stroke-opacity=".04">${grid.join("")}</g>
<g stroke="#ffffff" stroke-opacity=".14">${ticks.join("")}</g>
<g>${rings.join("")}</g>
<circle cx="470" cy="440" r="110" fill="url(#glow)"/>
<circle cx="470" cy="440" r="34" fill="none" stroke="#2fe0a8" stroke-opacity=".6"/>
<circle cx="470" cy="440" r="64" fill="none" stroke="#2fe0a8" stroke-opacity=".25" stroke-dasharray="3 6"/>
<g transform="translate(470 440)"><path d="M0 0c-10-11-17-19-17-27a17 17 0 0 1 34 0c0 8-7 16-17 27z" fill="#fafafa"/><circle cy="-27" r="6" fill="#0a0a0a"/></g>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect width="${W}" height="${H}" filter="url(#g)" style="mix-blend-mode:overlay"/>
</svg>`;
}

const render = async (name, svg) => {
	const info = await sharp(Buffer.from(svg), { density: 144 })
		.resize(OUTPUT_WIDTH)
		.webp({ quality: WEBP_QUALITY })
		.toFile(join(OUT, `${name}.webp`));
	console.log(
		`${name}.webp ${info.width}x${info.height} ${Math.round(info.size / 1024)}KB`
	);
};

await render("auth-suburb", suburb());
await render("auth-topographic", topographic());
