<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** Progress 0–100. */
    value: number;
    /** Track height: sm=2px, md=6px, lg=8px. */
    size?: "sm" | "md" | "lg";
  }>(),
  { size: "md" },
);

const clamped = computed(() => Math.min(100, Math.max(0, props.value)));
</script>

<template>
  <div class="progress-track" :class="size">
    <div class="progress-fill" :style="{ width: clamped + '%' }" />
  </div>
</template>

<style scoped>
.progress-track {
  width: 100%;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-track.sm {
  height: 2px;
  border-radius: 2px;
}

.progress-track.lg {
  height: 8px;
  border-radius: 4px;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.3s ease;
}
</style>
