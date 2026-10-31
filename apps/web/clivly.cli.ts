// Env files the `clivly` CLI loads (in Node) before reading clivly.config.ts.
// Later files win, so the web app's own files override the API server's.
export default {
	envFiles: ["../server/.dev.vars", "../server/.env", ".dev.vars", ".env"],
};
