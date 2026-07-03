import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	plugins: [
		vue(),
		dts({
			tsconfigPath: "./tsconfig.build.json",
			rollupTypes: true,
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		}),
	],
	build: {
		lib: {
			entry: resolve(import.meta.dirname, "src/index.ts"),
			name: "LocnativeVueUI",
			fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
		},
		rollupOptions: {
			external: ["vue", "@locnative/sdk"],
			output: {
				globals: {
					vue: "Vue",
					"@locnative/sdk": "LocnativeSDK",
				},
			},
		},
		target: "es2020",
		sourcemap: true,
	},
});
