<script setup lang="ts">
import { computed } from "vue";
import { getProgressBarSession } from "./index";
const session = getProgressBarSession();

const currentPage = computed(() => session?.getState().page.current ?? 0);
const totalPages = computed(() => session?.getState().page.total ?? 0);

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
  z-index: var(--z-chrome);
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
