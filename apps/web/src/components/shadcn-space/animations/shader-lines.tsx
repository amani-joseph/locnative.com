"use client";
import { useEffect, useRef } from "react";

export function ShaderAnimation() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const gl = canvas.getContext("webgl");
		if (!gl) {
			return;
		}

		let animationFrameId: number;

		/* ------------------ Shaders ------------------ */

		const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

		const fragmentShaderSource = `
      precision highp float;

uniform vec2 resolution;
uniform float time;

float random (in float x) {
    return fract(sin(x) * 1e4);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy)
              / min(resolution.x, resolution.y);

    vec2 fMosaicScal = vec2(4.0, 2.0);
    vec2 vScreenSize = vec2(256.0, 256.0);

    uv.x = floor(uv.x * vScreenSize.x / fMosaicScal.x)
           / (vScreenSize.x / fMosaicScal.x);

    uv.y = floor(uv.y * vScreenSize.y / fMosaicScal.y)
           / (vScreenSize.y / fMosaicScal.y);

    float t = time * 0.06 + random(uv.x) * 0.4;

    float lineWidth = 0.0008;

    vec3 color = vec3(0.0);

    for(int j = 0; j < 3; j++){
        for(int i = 0; i < 5; i++){
            color[j] += lineWidth * float(i * i) /
                abs(fract(t - 0.01 * float(j)
                + float(i) * 0.01) - length(uv));
        }
    }

    gl_FragColor = vec4(color.b, color.g, color.r, 1.0);
}
    `;

		/* ------------------ Helpers ------------------ */
		const compileShader = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) {
				throw new Error("Failed to create WebGL shader.");
			}
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			return shader;
		};

		const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
		const fragmentShader = compileShader(
			gl.FRAGMENT_SHADER,
			fragmentShaderSource
		);

		const program = gl.createProgram();
		if (!program) {
			throw new Error("Failed to create WebGL program.");
		}
		const activateProgram = gl.useProgram.bind(gl);
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		activateProgram(program);

		/* ------------------ Geometry ------------------ */

		const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

		const positionLocation = gl.getAttribLocation(program, "position");
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

		/* ------------------ Uniforms ------------------ */

		const resolutionLocation = gl.getUniformLocation(program, "resolution");
		const timeLocation = gl.getUniformLocation(program, "time");

		/* ------------------ Resize ------------------ */

		const resize = () => {
			const dpr = window.devicePixelRatio || 1;
			const width = canvas.clientWidth * dpr;
			const height = canvas.clientHeight * dpr;

			canvas.width = width;
			canvas.height = height;

			gl.viewport(0, 0, width, height);
			gl.uniform2f(resolutionLocation, width, height);
		};

		resize();
		window.addEventListener("resize", resize);

		/* ------------------ Animation ------------------ */

		const start = performance.now();

		const render = (now: number) => {
			const elapsed = (now - start) * 0.001;
			gl.uniform1f(timeLocation, elapsed * 5);

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			animationFrameId = requestAnimationFrame(render);
		};

		animationFrameId = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationFrameId);
			window.removeEventListener("resize", resize);
		};
	}, []);

	return <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />;
}
