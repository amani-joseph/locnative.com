import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { clivlyVite } from "clivly/vite";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(async ({ command, mode }) => {
	const clivlyPlugins: Plugin[] = [];
	if (command === "serve") {
		// Load server credentials before creating the SDK. Keep real environment
		// values authoritative, as the Clivly CLI does.
		for (const [key, value] of Object.entries(
			loadEnv(mode, process.cwd(), "")
		)) {
			process.env[key] ??= value;
		}
		const { default: clivly } = await import("./clivly.config");
		clivlyPlugins.push(clivlyVite(clivly));
	}

	return {
		plugins: [
			...clivlyPlugins,
			cloudflare({ viteEnvironment: { name: "ssr" } }),
			tsconfigPaths(),
			tailwindcss(),
			tanstackStart({
				router: {
					routeFileIgnorePattern: "\\.test\\.ts$",
				},
			}),
			viteReact(),
		],
		resolve: {
			// Linked workspace packages can otherwise resolve their own React copy in SSR.
			dedupe: ["react", "react-dom"],
		},
		server: {
			allowedHosts: [".trycloudflare.com"],
			host: "0.0.0.0",
			port: 3001,
		},
	};
});
