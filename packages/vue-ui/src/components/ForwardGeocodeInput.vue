<script setup lang="ts">
import type { LocnativeClient } from "@locnative/sdk";
import { computed, watch } from "vue";
import { useForwardGeocode } from "../composables/use-forward-geocode";
import { cn } from "../utils/cn";

const props = withDefaults(
	defineProps<{
		/** Required. SDK client created with `createLocnativeClient`. */
		client: LocnativeClient;
		/** Class applied to the input element. */
		class?: string;
		/** Disable the input. */
		disabled?: boolean;
		/** id forwarded to the input element. */
		id?: string;
		/** Input placeholder text. */
		placeholder?: string;
		/** Address text to geocode. */
		query: string | null;
	}>(),
	{
		placeholder: "Coordinates will appear here",
	}
);

const emit =
	defineEmits<
		(
			e: "result",
			result: {
				latitude: number | null;
				longitude: number | null;
				formattedAddress: string | null;
			}
		) => void
	>();

const { data } = useForwardGeocode(props.client, () => props.query);

watch(
	data,
	(value) => {
		emit("result", {
			latitude: value?.latitude ?? null,
			longitude: value?.longitude ?? null,
			formattedAddress: value?.formattedAddress ?? null,
		});
	},
	{ immediate: true }
);

const displayText = computed(() =>
	data.value
		? `${data.value.latitude.toFixed(4)}, ${data.value.longitude.toFixed(4)}`
		: ""
);
</script>

<template>
  <input
    :id="props.id"
    :class="cn(
      'block h-8 w-full cursor-default rounded-none border border-input bg-muted/40 px-2.5 py-1 text-foreground text-xs',
      props.class
    )"
    data-slot="geocode-input"
    :disabled="props.disabled"
    :placeholder="props.placeholder"
    readonly
    type="text"
    :value="displayText"
  />
</template>
