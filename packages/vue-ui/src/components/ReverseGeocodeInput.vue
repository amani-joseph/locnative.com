<script setup lang="ts">
import type { LocnativeClient } from "@locnative/sdk";
import { computed, watch } from "vue";
import { useReverseGeocode } from "../composables/use-reverse-geocode";
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
		/** Latitude to reverse-geocode. */
		latitude: number | null;
		/** Longitude to reverse-geocode. */
		longitude: number | null;
		/** Input placeholder text. */
		placeholder?: string;
	}>(),
	{
		placeholder: "Address will appear here",
	}
);

const emit =
	defineEmits<
		(
			e: "result",
			result: { address: string | null; distance: number | null }
		) => void
	>();

const coords = computed(() =>
	props.latitude != null && props.longitude != null
		? { lat: props.latitude, lng: props.longitude }
		: null
);

const { address, distance } = useReverseGeocode(props.client, coords);

watch(
	[address, distance],
	() => {
		emit("result", {
			address: address.value?.formattedAddress ?? null,
			distance: distance.value ?? null,
		});
	},
	{ immediate: true }
);

const displayText = computed(() => address.value?.formattedAddress ?? "");
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
