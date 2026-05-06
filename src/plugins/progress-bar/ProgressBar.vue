<script setup lang="ts">
import { computed } from "vue";
import { getReaderHost } from "./index";
const host = getReaderHost();

const currentPage = computed(() => host?.getCurrentPage() || 0);
const totalPages = computed(() => host?.getTotalPages() || 0);

const progress = computed(() => {
  const total = totalPages.value;
  if (total <= 1) return 100;
  return ((currentPage.value + 1) / total) * 100;
});
</script>

<template>
  <div class="progress-bar-container">
    <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
  </div>
</template>

<style scoped>
.progress-bar-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--progress-track);
  z-index: 101;
  pointer-events: none;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 75%, white) 100%
  );
  transition: width 350ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0 1.5px 1.5px 0;
}
</style>
