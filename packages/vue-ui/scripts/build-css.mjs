import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcCss = path.join(__dirname, "../src/styles/globals.css");
const distCss = path.join(__dirname, "../dist/styles.css");

fs.copyFileSync(srcCss, distCss);
console.log("✓ Copied styles.css to dist/");

// The rolled-up declaration file has no relative imports, so the same flat
// declaration serves the CommonJS `require` condition as index.d.cts.
const distDts = path.join(__dirname, "../dist/index.d.ts");
const distDcts = path.join(__dirname, "../dist/index.d.cts");
fs.copyFileSync(distDts, distDcts);
console.log("✓ Copied index.d.ts to index.d.cts");
