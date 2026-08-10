<script setup lang="ts">
import { computed } from "vue";
import { ICONS, type IconName } from "./icons";

const props = withDefaults(
  defineProps<{
    /** Icon name from the shared registry (components/ui/icons.ts). */
    name: IconName;
    size?: number | string;
    /** Stroke width in px. Filled icons (play, pause, dots…) ignore this. */
    strokeWidth?: number;
  }>(),
  { size: 16, strokeWidth: 2 },
);

const markup = computed(() => ICONS[props.name]);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="markup"
  />
</template>
