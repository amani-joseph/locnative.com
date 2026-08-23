import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoClient } from "../../.storybook/demo-client";
import { AddressAutocomplete } from "./address-autocomplete";

const client = createDemoClient();

const meta = {
	title: "Components/AddressAutocomplete",
	component: AddressAutocomplete,
	args: { client },
	parameters: {
		docs: {
			description: {
				// NOTE: keep identical to the Summary + guidance in docs/address-autocomplete.md
				component:
					"Accessible (WAI-ARIA combobox), debounced address search with keyboard navigation, proximity bias, session tokens, i18n strings, and customizable render slots. Provide a `client` created with `createLocnativeClient`.",
			},
		},
	},
} satisfies Meta<typeof AddressAutocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: { placeholder: "Start typing an address…" },
};

export const WithGeolocation: Story = {
	args: { enableGeolocation: true, placeholder: "Addresses near you…" },
};

export const TunedSearch: Story = {
	args: { minCharsToSearch: 4, debounceMs: 400, maxSuggestions: 5 },
};

export const DisabledAndError: Story = {
	args: { disabled: true, error: "Please enter a valid address" },
};

export const CustomSuggestionRenderer: Story = {
	args: {
		renderSuggestion: (address, isActive) => (
			<span style={{ fontWeight: isActive ? 700 : 400 }}>
				📍 {address.formattedAddress}
			</span>
		),
	},
};
