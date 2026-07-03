import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
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
		host: "0.0.0.0",
		port: 3001,
	},
});
