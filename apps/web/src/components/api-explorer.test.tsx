// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());

const { sendRequest } = vi.hoisted(() => ({
	sendRequest: vi.fn(() =>
		Promise.resolve({
			body: { ok: true },
			durationMs: 1,
			ok: true,
			requestUrl: "/x",
			statusCode: 200,
		})
	),
}));

vi.mock("@/lib/orpc", () => ({
	orpcClient: {
		apiKeys: { list: () => Promise.resolve([]) },
		apiExplorer: { sendRequest },
	},
}));

import type { ApiEndpoint } from "@/lib/api-explorer-endpoints";
import { ApiEndpointCard } from "./api-explorer.tsx";

const zoneCreate: ApiEndpoint = {
	id: "zones.create",
	method: "POST",
	path: "/api/v1/zones",
	summary: "Create a zone",
	description: "",
	exampleBody: { name: "depot" },
	params: [],
};

const authState = {
	isReady: true,
	managedKeyId: "",
	mode: "raw" as const,
	rawApiKey: "wh_x_y",
};

const zoneDelete: ApiEndpoint = {
	id: "zones.delete",
	method: "DELETE",
	path: "/api/v1/zones/{id}",
	summary: "Delete a zone",
	description: "",
	params: [
		{
			name: "id",
			type: "number",
			required: true,
			description: "Zone id",
			example: "7",
		},
	],
};

const RE_CREATE_A_ZONE = /create a zone/i;
const RE_DELETE_A_ZONE = /delete a zone/i;
const RE_REQUEST_BODY = /request body/i;
const RE_SEND = /send test request/i;
const RE_RUN_DELETE = /run delete/i;

beforeEach(() => {
	sendRequest.mockClear();
});

describe("ApiEndpointCard", () => {
	it("renders the endpoint summary as an expandable control", () => {
		render(
			<ApiEndpointCard
				authState={authState}
				baseUrl="https://api.locnative.com"
				endpoint={zoneCreate}
			/>
		);
		expect(screen.getByRole("button", { name: RE_CREATE_A_ZONE })).toBeTruthy();
	});

	it("renders a JSON body editor for a non-GET endpoint seeded from exampleBody when card is open", () => {
		const { container } = render(
			<ApiEndpointCard
				authState={authState}
				baseUrl="https://api.locnative.com"
				endpoint={zoneCreate}
			/>
		);

		// The card starts collapsed — click the header button to expand it
		const card = within(container);
		const toggleButton = card.getByRole("button", { name: RE_CREATE_A_ZONE });
		fireEvent.click(toggleButton);

		const textarea = card.getByLabelText(
			RE_REQUEST_BODY
		) as HTMLTextAreaElement;
		expect(textarea.value).toContain('"name": "depot"');
	});

	it("gates a DELETE behind a confirm dialog and only sends after confirming", async () => {
		const { container } = render(
			<ApiEndpointCard
				authState={authState}
				baseUrl="https://api.locnative.com"
				endpoint={zoneDelete}
			/>
		);
		const card = within(container);
		fireEvent.click(card.getByRole("button", { name: RE_DELETE_A_ZONE }));

		// Fill the required `id` path param so the missing-param guard passes.
		fireEvent.change(card.getByPlaceholderText("7"), {
			target: { value: "7" },
		});

		// Clicking Send must NOT call the proxy — it opens the confirm dialog.
		fireEvent.click(card.getByRole("button", { name: RE_SEND }));
		expect(sendRequest).not.toHaveBeenCalled();

		// Confirm dialog renders in a portal — query the whole document.
		const confirmButton = await screen.findByRole("button", {
			name: RE_RUN_DELETE,
		});

		// Confirming runs the request exactly once.
		fireEvent.click(confirmButton);
		await waitFor(() => expect(sendRequest).toHaveBeenCalledTimes(1));
		expect(sendRequest).toHaveBeenCalledWith(
			expect.objectContaining({ endpointId: "zones.delete" })
		);
	});
});
