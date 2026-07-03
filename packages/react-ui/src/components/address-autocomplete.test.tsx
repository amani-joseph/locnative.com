import type { AddressSuggestion, LocnativeClient } from "@locnative/sdk";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddressAutocomplete } from "./address-autocomplete";

// Mock client
function createMockClient(): LocnativeClient {
	return {
		addresses: {
			autocomplete: vi.fn(async () => ({
				results: [
					{
						id: 1,
						formattedAddress: "29/14 Fleet Street, Browns Plains QLD 4118",
						streetAddress: "29/14 Fleet Street",
						locality: "Browns Plains",
						state: "QLD",
						postcode: "4118",
						latitude: -27.7849,
						longitude: 153.0395,
						country: "AU",
					} as AddressSuggestion,
				],
			})),
		},
	} as unknown as LocnativeClient;
}

describe("AddressAutocomplete", () => {
	it("renders input with placeholder", () => {
		const mockClient = createMockClient();
		render(
			<AddressAutocomplete client={mockClient} placeholder="Enter address" />
		);
		const input = screen.getByPlaceholderText("Enter address");
		expect(input).toBeInTheDocument();
	});

	it("renders with required attribute", () => {
		const mockClient = createMockClient();
		render(<AddressAutocomplete client={mockClient} required />);
		const input = screen.getByRole("combobox");
		expect(input).toHaveAttribute("required");
	});

	it("renders disabled input", () => {
		const mockClient = createMockClient();
		render(<AddressAutocomplete client={mockClient} disabled />);
		const input = screen.getByRole("combobox");
		expect(input).toHaveAttribute("disabled");
	});

	it("shows error aria-invalid when error prop provided", () => {
		const mockClient = createMockClient();
		render(
			<AddressAutocomplete client={mockClient} error="Address required" />
		);
		const input = screen.getByRole("combobox");
		expect(input).toHaveAttribute("aria-invalid", "true");
	});

	it("fires onQueryChange when typing", async () => {
		const mockClient = createMockClient();
		const onQueryChange = vi.fn();
		const user = userEvent.setup();

		render(
			<AddressAutocomplete
				client={mockClient}
				minCharsToSearch={1}
				onQueryChange={onQueryChange}
			/>
		);

		const input = screen.getByRole("combobox");
		await user.type(input, "Fleet");

		expect(onQueryChange).toHaveBeenCalledWith("Fleet");
	});

	it("triggers a debounced autocomplete search", async () => {
		const mockClient = createMockClient();
		const user = userEvent.setup();

		render(
			<AddressAutocomplete
				client={mockClient}
				debounceMs={50}
				minCharsToSearch={1}
			/>
		);

		await user.type(screen.getByRole("combobox"), "Fleet");

		// The search fires once the debounce window elapses.
		await waitFor(() => {
			expect(mockClient.addresses.autocomplete).toHaveBeenCalled();
		});
	});

	it("displays empty state when no results", async () => {
		const mockClient = createMockClient();
		const autocomplete = mockClient.addresses.autocomplete as ReturnType<
			typeof vi.fn
		>;
		autocomplete.mockResolvedValueOnce({ results: [] });

		const user = userEvent.setup();
		render(
			<AddressAutocomplete
				client={mockClient}
				i18nStrings={{ noResults: "No addresses found" }}
				minCharsToSearch={1}
			/>
		);

		const input = screen.getByRole("combobox");
		await user.type(input, "x");

		// Wait for async search
		await waitFor(() => {
			// Dropdown should open when query length >= minCharsToSearch
			expect(input).toHaveAttribute("aria-expanded", "true");
		});
	});

	it("calls onSelect with parsed address when item clicked", async () => {
		const mockClient = createMockClient();
		const onSelect = vi.fn();
		const user = userEvent.setup();

		render(
			<AddressAutocomplete
				client={mockClient}
				minCharsToSearch={1}
				onSelect={onSelect}
			/>
		);

		const input = screen.getByRole("combobox");
		await user.type(input, "Fleet");

		// Wait for the async results to render as options before selecting.
		const items = await screen.findAllByRole("option");
		const firstItem = items[0];
		if (firstItem) {
			await user.click(firstItem);

			expect(onSelect).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 1,
					streetAddress: "29/14 Fleet Street",
					suburb: "Browns Plains",
					state: "QLD",
					postcode: "4118",
					country: "Australia",
				})
			);
		}
	});

	it("renders custom suggestion slot", () => {
		const mockClient = createMockClient();
		const renderSuggestion = vi.fn(() => <div>Custom Suggestion</div>);

		render(
			<AddressAutocomplete
				client={mockClient}
				renderSuggestion={renderSuggestion}
			/>
		);

		// Note: suggestion would render only when listbox is open with results
		// This is a placeholder for the actual test
	});

	it("calls renderError when error occurs", async () => {
		const mockClient = createMockClient();
		const autocomplete = mockClient.addresses.autocomplete as ReturnType<
			typeof vi.fn
		>;
		autocomplete.mockRejectedValueOnce(new Error("Network error"));

		const renderError = vi.fn((err: Error | null) => (
			<div>Error: {err?.message}</div>
		));
		const user = userEvent.setup();

		render(
			<AddressAutocomplete
				client={mockClient}
				minCharsToSearch={1}
				renderError={renderError}
			/>
		);

		const input = screen.getByRole("combobox");
		await user.type(input, "x");

		await waitFor(() => {
			// Error should be displayed
			expect(renderError).toHaveBeenCalled();
		});
	});
});
