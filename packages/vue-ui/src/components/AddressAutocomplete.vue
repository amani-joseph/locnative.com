<script setup lang="ts">
import type { LocnativeClient } from "@locnative/sdk";
import { computed, onScopeDispose, ref, watch } from "vue";
import { useAddressGeolocation } from "../composables/use-address-geolocation";
import { useAutocomplete } from "../composables/use-autocomplete";
import { useCombobox } from "../composables/use-combobox";
import type { AddressI18nStrings, AddressWithParsed } from "../types";
import { cn } from "../utils/cn";
import { toAddressWithParsed } from "../utils/parse-address";

const props = withDefaults(
	defineProps<{
		/** Required. SDK client created with `createLocnativeClient`. */
		client: LocnativeClient;
		/** Class applied to the root container. */
		class?: string;
		/** Debounce in ms before querying the API. Default 300. */
		debounceMs?: number;
		/** Disable the input. */
		disabled?: boolean;
		/** Use the browser's geolocation to bias results by proximity. */
		enableGeolocation?: boolean;
		/** External error message to display. */
		error?: string;
		/** Override built-in UI strings. */
		i18nStrings?: Partial<AddressI18nStrings>;
		/** id forwarded to the input element. */
		id?: string;
		/** Maximum number of suggestions to show. Default 5. */
		maxSuggestions?: number;
		/** Minimum characters typed before searching. Default 2. */
		minCharsToSearch?: number;
		/** Input placeholder text. */
		placeholder?: string;
		/** Mark the input as required. */
		required?: boolean;
		/** Group a run of keystrokes into one billable search. */
		sessionToken?: string;
		/** Explicit latitude for proximity bias. */
		userLat?: number;
		/** Explicit longitude for proximity bias. */
		userLng?: number;
	}>(),
	{
		debounceMs: 300,
		minCharsToSearch: 2,
		maxSuggestions: 5,
	}
);

const emit = defineEmits<{
	(e: "select", address: AddressWithParsed): void;
	(e: "queryChange", query: string): void;
}>();

const DEFAULT_I18N: AddressI18nStrings = {
	noResults: "No addresses found",
	enterManually: "Enter address manually",
	errorRetry: "Try again",
	geolocationError: "Location access denied",
};

const i18n = computed(() => ({ ...DEFAULT_I18N, ...props.i18nStrings }));
const id = computed(() => props.id ?? "locnative-autocomplete");

const { lat: geoLat, lng: geoLng } = useAddressGeolocation(
	() => props.enableGeolocation ?? false
);

const {
	query,
	results,
	error: autocompleteError,
	status,
	setQuery,
} = useAutocomplete(props.client, {
	debounceMs: props.debounceMs,
	minLength: props.minCharsToSearch,
	limit: props.maxSuggestions,
	lat: props.userLat ?? geoLat.value,
	lng: props.userLng ?? geoLng.value,
	sessionToken: props.sessionToken,
	keepPreviousData: true,
});

const combobox = useCombobox({
	id: id.value,
	count: () => results.value.length,
	onSelect: (index) => {
		const item = results.value[index];
		if (item) {
			emit("select", toAddressWithParsed(item));
			setQuery("");
		}
	},
});

const error = computed(
	() =>
		props.error || (status.value === "error" ? autocompleteError.value : null)
);

const inputRef = ref<HTMLInputElement>();
const dropdownPosition = ref<{
	left: number;
	top: number;
	width: number;
} | null>(null);
// Gap (px) between the input and the dropdown.
const DROPDOWN_GAP_PX = 4;

const updatePosition = (): void => {
	const el = inputRef.value;
	if (el) {
		const rect = el.getBoundingClientRect();
		dropdownPosition.value = {
			top: rect.bottom + DROPDOWN_GAP_PX,
			left: rect.left,
			width: rect.width,
		};
	}
};

// Keep the teleported dropdown anchored to the input through scroll/resize.
watch(
	() => combobox.state.isOpen,
	(isOpen) => {
		if (isOpen) {
			updatePosition();
			window.addEventListener("scroll", updatePosition, true);
			window.addEventListener("resize", updatePosition);
		} else {
			window.removeEventListener("scroll", updatePosition, true);
			window.removeEventListener("resize", updatePosition);
		}
	}
);

onScopeDispose(() => {
	window.removeEventListener("scroll", updatePosition, true);
	window.removeEventListener("resize", updatePosition);
});

const onInput = (event: Event): void => {
	const value = (event.target as HTMLInputElement).value;
	setQuery(value);
	emit("queryChange", value);
};

const onSuggestionClick = (index: number): void => {
	const item = results.value[index];
	if (item) {
		emit("select", toAddressWithParsed(item));
		setQuery("");
		combobox.close();
	}
};
</script>

<template>
  <div :class="cn('relative w-full', props.class)" data-slot="address-autocomplete">
    <input
      :id="id"
      ref="inputRef"
      v-bind="combobox.inputAria()"
      :aria-invalid="error ? 'true' : 'false'"
      class="block h-8 w-full rounded-none border border-input bg-transparent px-2.5 py-1 text-foreground text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30"
      data-slot="address-input"
      :disabled="props.disabled"
      :placeholder="props.placeholder ?? i18n.noResults"
      :required="props.required"
      type="text"
      :value="query"
      @input="onInput"
      @focus="combobox.onFocus"
      @blur="combobox.onBlur"
      @keydown="combobox.onKeyDown"
    />

    <Teleport v-if="combobox.state.isOpen && dropdownPosition" to="body">
      <div
        class="z-50 overflow-hidden rounded-none border border-border bg-popover text-popover-foreground shadow-md"
        data-slot="address-dropdown"
        :style="{
          position: 'fixed',
          top: `${dropdownPosition.top}px`,
          left: `${dropdownPosition.left}px`,
          width: `${dropdownPosition.width}px`,
        }"
      >
        <ul
          :id="combobox.listboxId"
          class="max-h-80 overflow-y-auto"
          data-slot="address-listbox"
          role="listbox"
        >
          <li
            v-if="status === 'loading'"
            class="flex items-center justify-center px-3 py-2 text-muted-foreground text-sm"
            data-slot="address-item"
            data-status="loading"
          >
            <slot name="loading">Loading...</slot>
          </li>

          <li
            v-else-if="status === 'error'"
            class="flex items-center justify-center px-3 py-2 text-destructive text-sm"
            data-slot="address-item"
            data-status="error"
          >
            <slot name="error" :error="error">{{ i18n.errorRetry }}</slot>
          </li>

          <li
            v-else-if="status === 'empty'"
            class="flex items-center justify-center px-3 py-2 text-muted-foreground text-sm"
            data-slot="address-item"
            data-status="empty"
          >
            <slot name="empty">{{ i18n.noResults }}</slot>
          </li>

          <template v-else-if="status === 'success'">
            <li
              v-for="(result, index) in results"
              :id="combobox.itemId(index)"
              :key="result.id"
              :aria-selected="combobox.isActive(index)"
              class="flex cursor-pointer items-center rounded-none px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
              data-slot="address-item"
              role="option"
              @mouseenter="combobox.onItemMouseEnter(index)"
              @mousedown="(e) => combobox.onItemMouseDown(e, index)"
              @click="onSuggestionClick(index)"
            >
              <slot
                name="suggestion"
                :address="toAddressWithParsed(result)"
                :is-active="combobox.isActive(index)"
              >
                <div class="flex-1">
                  <div class="font-medium text-foreground text-sm">
                    {{ toAddressWithParsed(result).streetAddress }}
                  </div>
                  <div class="text-muted-foreground text-xs">
                    {{ toAddressWithParsed(result).suburb }},
                    {{ toAddressWithParsed(result).state }}
                    {{ toAddressWithParsed(result).postcode }}
                  </div>
                </div>
              </slot>
            </li>
          </template>
        </ul>

        <div
          v-if="status === 'success' && results.length > 0"
          class="border-border border-t bg-muted/40 px-3 py-2"
          data-slot="address-powered-by"
        >
          <p class="text-muted-foreground text-xs">
            Suggestions powered by
            <a
              class="font-medium underline-offset-2 hover:underline"
              href="https://locnative.com"
              rel="noopener"
              target="_blank"
            >Locnative</a>
          </p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
