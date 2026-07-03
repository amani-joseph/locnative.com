<script setup lang="ts">
import type { LocnativeClient } from "@locnative/sdk";
import { computed } from "vue";
import { cn } from "../utils/cn";

// Extra attrs (disabled, placeholder, minCharsToSearch, @select, ...) pass
// straight through to the wrapped AddressAutocomplete via $attrs. `client` is
// declared explicitly so the required-prop contract is statically satisfied.
defineOptions({ inheritAttrs: false });

const props = defineProps<{
	/** Required. SDK client created with `createLocnativeClient`. */
	client: LocnativeClient;
	/** Class applied to the error text element. */
	errorClass?: string;
	/** External error message; renders below the field and reddens the label. */
	error?: string;
	/** id forwarded to the input element. */
	id?: string;
	/** Required. Field label rendered above the input. */
	label: string;
	/** Class applied to the label element. */
	labelClass?: string;
	/** Mark the input as required. */
	required?: boolean;
}>();

const fieldId = computed(() => props.id ?? "locnative-field");
</script>

<template>
  <div class="flex flex-col gap-2" data-slot="address-form-field">
    <label
      :class="cn('block font-medium text-gray-900 text-sm', props.labelClass)"
      :for="fieldId"
    >
      {{ props.label }}
      <span v-if="props.required" aria-hidden="true" class="ml-1 text-red-600">*</span>
    </label>

    <AddressAutocomplete
      v-bind="$attrs"
      :id="fieldId"
      :client="props.client"
      :error="props.error"
      :required="props.required"
    />

    <p
      v-if="props.error"
      aria-live="polite"
      :class="cn('text-red-600 text-sm', props.errorClass)"
      role="alert"
    >
      {{ props.error }}
    </p>
  </div>
</template>
