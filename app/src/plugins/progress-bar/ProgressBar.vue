<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { pluginEvents } from "../../core/plugin-runtime/context";
import { currentSession } from "../../stores/reader-session";

const width = ref("0%");

function update() {
  const s = currentSession.value?.getState();
  if (!s) return;
  const pct = s.page.total <= 1 ? 100 : ((s.page.current + 1) / s.page.total) * 100;
  width.value = `${pct}%`;
}

// Scroll mode has no page:changed; scroll:progress carries the current
// chapter's in-chapter fraction (0..1) directly.
function updateFromScroll(progress: number) {
  const s = currentSession.value?.getState();
  if (!s || s.mode !== "scroll") return;
  const clamped = Math.min(1, Math.max(0, progress));
  width.value = `${(clamped * 100).toFixed(1)}%`;
}

const unsubPage = pluginEvents.on("page:changed", update);
const unsubChapter = pluginEvents.on("chapter:changed", update);
const unsubScroll = pluginEvents.on("scroll:progress", ({ progress }) =>
  updateFromScroll(progress),
);

onMounted(update);

onUnmounted(() => {
  unsubPage();
  unsubChapter();
  unsubScroll();
});
</script>

<template>
  <div class="progress-bar-container">
    <div class="progress-bar" :style="{ width }"></div>
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
