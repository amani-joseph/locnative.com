<script setup lang="ts">
import type { LocnativeClient } from "@locnative/sdk";
import { computed } from "vue";
import type { AddressFieldGroupValue, AddressWithParsed } from "../types";
import { cn } from "../utils/cn";

const props = withDefaults(
	defineProps<{
		/** Required. SDK client created with `createLocnativeClient`. */
		client: LocnativeClient;
		/** Class applied to the root container. */
		class?: string;
		/** Disable all fields. */
		disabled?: boolean;
		/** Class merged into every structured sub-field input. */
		inputClass?: string;
		/** Class merged into every sub-field label. */
		labelClass?: string;
		/** Override the postcode field label. */
		postcodeLabel?: string;
		/** Override the state field label. */
		stateLabel?: string;
		/** Override the street address field label. */
		streetLabel?: string;
		/** Override the suburb field label. */
		suburbLabel?: string;
		/** Required. Controlled value for the field group. */
		value: AddressFieldGroupValue;
	}>(),
	{
		streetLabel: "Street Address",
		suburbLabel: "Suburb",
		stateLabel: "State",
		postcodeLabel: "Postcode",
	}
);

const emit =
	defineEmits<(e: "change", value: AddressFieldGroupValue) => void>();

const baseInputClass =
	"block h-8 w-full rounded-none border border-input bg-transparent px-2.5 py-1 text-foreground text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";
const baseLabelClass = "mb-1 block font-medium text-foreground text-sm";

const inputClass = computed(() => cn(baseInputClass, props.inputClass));
const labelClass = computed(() => cn(baseLabelClass, props.labelClass));

const onAutocompleteSelect = (address: AddressWithParsed): void => {
	emit("change", {
		street: address.streetAddress,
		suburb: address.suburb,
		state: address.state,
		postcode: address.postcode,
	});
};

const onFieldInput = (
	field: keyof AddressFieldGroupValue,
	event: Event
): void => {
	emit("change", {
		...props.value,
		[field]: (event.target as HTMLInputElement).value,
	});
};
</script>

<template>
  <div
    :class="cn('flex flex-col gap-4', props.class)"
    data-slot="address-field-group"
  >
    <AddressAutocomplete
      :client="props.client"
      :disabled="props.disabled"
      placeholder="Search for an address..."
      @select="onAutocompleteSelect"
    />

    <div class="grid grid-cols-2 gap-4" data-slot="address-field-group-inputs">
      <div class="col-span-2">
        <label :class="labelClass" for="field-street">{{ props.streetLabel }}</label>
        <input
          id="field-street"
          :class="inputClass"
          :disabled="props.disabled"
          placeholder="Street address"
          type="text"
          :value="props.value.street"
          @input="(e) => onFieldInput('street', e)"
        />
      </div>

      <div>
        <label :class="labelClass" for="field-suburb">{{ props.suburbLabel }}</label>
        <input
          id="field-suburb"
          :class="inputClass"
          :disabled="props.disabled"
          placeholder="Suburb"
          type="text"
          :value="props.value.suburb"
          @input="(e) => onFieldInput('suburb', e)"
        />
      </div>

      <div>
        <label :class="labelClass" for="field-state">{{ props.stateLabel }}</label>
        <input
          id="field-state"
          :class="inputClass"
          :disabled="props.disabled"
          placeholder="State"
          type="text"
          :value="props.value.state"
          @input="(e) => onFieldInput('state', e)"
        />
      </div>

      <div>
        <label :class="labelClass" for="field-postcode">{{ props.postcodeLabel }}</label>
        <input
          id="field-postcode"
          :class="inputClass"
          :disabled="props.disabled"
          placeholder="Postcode"
          type="text"
          :value="props.value.postcode"
          @input="(e) => onFieldInput('postcode', e)"
        />
      </div>
    </div>
  </div>
</template>
