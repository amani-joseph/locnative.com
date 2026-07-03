// Maps an api-explorer catalog endpoint id to the namespaced SDK call expression.
// Most ids match `client.<namespace>.<method>`; a few differ and are mapped here.
const SDK_CALL_OVERRIDES: Record<string, string> = {
	"addresses.byId": "client.addresses.getById",
	"devices.location.push": "client.devices.pushLocation",
};

export function sdkCallForEndpoint(endpointId: string): string {
	return SDK_CALL_OVERRIDES[endpointId] ?? `client.${endpointId}`;
}

// Render a string param value as a JS literal (number when numeric, else quoted).
function literal(value: string): string {
	if (value !== "" && !Number.isNaN(Number(value))) {
		return value;
	}
	return JSON.stringify(value);
}

function renderArg(
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined,
	comments: Record<string, string> | undefined
): string {
	if (body !== undefined) {
		const inner = Object.entries(body)
			.map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
			.join(",\n");
		return `{\n${inner}\n}`;
	}
	const entries = Object.entries(paramValues).filter(([, v]) => v !== "");
	if (entries.length === 0) {
		return "";
	}
	const inner = entries
		.map(([k, v]) => {
			const comment = comments?.[k];
			const line = `  ${k}: ${literal(v)}`;
			return comment ? `${line}, // ${comment}` : line;
		})
		.join(",\n");
	return `{\n${inner}\n}`;
}

export function buildSdkSnippet(
	endpointId: string,
	paramValues: Record<string, string>,
	body: Record<string, unknown> | undefined,
	comments?: Record<string, string>
): string {
	const call = sdkCallForEndpoint(endpointId);
	const arg = renderArg(paramValues, body, comments);
	return [
		'import { createLocnativeClient } from "@locnative/sdk";',
		"",
		"const client = createLocnativeClient({",
		"  apiKey: process.env.LOCNATIVE_API_KEY!,",
		"});",
		"",
		`const result = await ${call}(${arg});`,
		"console.log(result);",
	].join("\n");
}
