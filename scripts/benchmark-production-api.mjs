// End-to-end production latency benchmark.
// Usage: VITE_DEMO_API_KEY=... node scripts/benchmark-production-api.mjs

import "dotenv/config";

const BASE_URL = "https://api.locnative.com";
const SAMPLE_COUNT = 20;
const WARMUP_COUNT = 1;
const apiKey = process.env.VITE_DEMO_API_KEY;

if (!apiKey) {
	throw new Error("VITE_DEMO_API_KEY is required");
}

const percentile = (sorted, fraction) => {
	const index = Math.ceil(sorted.length * fraction) - 1;
	return sorted[Math.max(0, index)];
};

const summarize = (samples) => {
	const sorted = samples
		.map(({ durationMs }) => durationMs)
		.sort((a, b) => a - b);
	const total = sorted.reduce((sum, durationMs) => sum + durationMs, 0);
	return {
		averageMs: total / sorted.length,
		medianMs: percentile(sorted, 0.5),
		p95Ms: percentile(sorted, 0.95),
		minimumMs: sorted[0],
		maximumMs: sorted.at(-1),
	};
};

const request = async ({ path, method = "GET", body }) => {
	const startedAt = performance.now();
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": apiKey,
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	await response.arrayBuffer();
	return {
		durationMs: performance.now() - startedAt,
		status: response.status,
	};
};

const scenarios = [
	{
		name: "Autocomplete — postcode",
		method: "GET",
		path: "/api/v1/addresses/autocomplete?country=AU&limit=20&q=2000",
		expectedStatus: 200,
	},
	{
		name: "Autocomplete — locality",
		method: "GET",
		path: "/api/v1/addresses/autocomplete?country=AU&limit=20&q=bondi",
		expectedStatus: 200,
	},
	{
		name: "Autocomplete — typo",
		method: "GET",
		path: "/api/v1/addresses/autocomplete?country=AU&limit=20&q=sydeny",
		expectedStatus: 200,
	},
	{
		name: "Autocomplete — zero match",
		method: "GET",
		path: "/api/v1/addresses/autocomplete?country=AU&limit=20&q=zzzzzz",
		expectedStatus: 200,
	},
	{
		name: "Forward geocode — freeform",
		method: "GET",
		path: "/api/v1/addresses/geocode?country=AU&q=1%20Macquarie%20St%20Sydney%20NSW%202000",
		expectedStatus: 200,
	},
	{
		name: "Forward geocode — structured",
		method: "GET",
		path: "/api/v1/addresses/geocode?structured=true&street=1%20Macquarie%20St&locality=Sydney&state=NSW&country=AU",
		expectedStatus: 200,
	},
	{
		name: "Nearby addresses",
		method: "GET",
		path: "/api/v1/addresses/nearby?lat=-33.8688&lng=151.2093&radius=500&limit=10&country=AU",
		expectedStatus: 200,
	},
	{
		name: "Reverse geocode",
		method: "GET",
		path: "/api/v1/addresses/reverse?lat=-33.8688&lng=151.2093",
		expectedStatus: 200,
	},
	{
		name: "Address by ID",
		method: "GET",
		path: "/api/v1/addresses/4544247",
		expectedStatus: 200,
	},
	{
		name: "Region classification",
		method: "GET",
		path: "/api/v1/regions?lat=-33.8688&lng=151.2093",
		expectedStatus: 200,
	},
	{
		name: "List zones",
		method: "GET",
		path: "/api/v1/zones?page=1&limit=20",
		expectedStatus: 200,
	},
	{
		name: "Zones containing point",
		method: "GET",
		path: "/api/v1/zones/contains?lat=-33.8688&lng=151.2093",
		expectedStatus: 200,
	},
	{
		name: "List webhooks",
		method: "GET",
		path: "/api/v1/webhooks",
		expectedStatus: 200,
	},
	{
		name: "Routing — directions (paused)",
		method: "GET",
		path: "/api/v1/routing/directions?from=-33.8688%2C151.2093&to=-33.8731%2C151.2065",
		expectedStatus: 503,
	},
	{
		name: "Routing — matrix (paused)",
		method: "GET",
		path: "/api/v1/routing/matrix?sources=-33.8688%2C151.2093&destinations=-33.8731%2C151.2065",
		expectedStatus: 503,
	},
	{
		name: "Routing — isochrone (paused)",
		method: "GET",
		path: "/api/v1/routing/isochrone?origin=-33.8688%2C151.2093&durationSeconds=600",
		expectedStatus: 503,
	},
];

const results = [];
for (const scenario of scenarios) {
	for (let index = 0; index < WARMUP_COUNT; index += 1) {
		await request(scenario);
	}

	const samples = [];
	for (let index = 0; index < SAMPLE_COUNT; index += 1) {
		samples.push(await request(scenario));
	}

	const statusCounts = {};
	for (const { status } of samples) {
		statusCounts[status] = (statusCounts[status] ?? 0) + 1;
	}
	const result = {
		name: scenario.name,
		method: scenario.method,
		path: scenario.path.split("?")[0],
		expectedStatus: scenario.expectedStatus,
		samples: SAMPLE_COUNT,
		statuses: statusCounts,
		...summarize(samples),
	};
	results.push(result);
	console.log(JSON.stringify(result));
}

console.log(`RESULTS_JSON=${JSON.stringify(results)}`);
