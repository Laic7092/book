<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from "vue";
import type { ReaderSettings } from "../../core/types";

const props = defineProps<{
  content: string;
  settings: ReaderSettings;
  isPaginationMode: boolean;
  currentPage?: number;
  loadedChapters?: Array<{ chapterId: string; title: string; content: string }>;
}>();

const emit = defineEmits<{
  (e: "resize"): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const articleRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

function emitResize() {
  emit("resize");
}

onMounted(() => {
  nextTick(() => {
    if (containerRef.value) {
      resizeObserver = new ResizeObserver(emitResize);
      resizeObserver.observe(containerRef.value);
    }
  });
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

const contentStyle = computed(() => ({
  fontSize: `${props.settings.fontSize}px`,
  fontFamily: props.settings.fontFamily,
  lineHeight: String(props.settings.lineHeight),
  letterSpacing: `${props.settings.letterSpacing || 0}em`,
  textAlign: props.settings.textAlign || "left",
  height: props.isPaginationMode ? "100%" : "auto",
}));

defineExpose({ articleRef });
</script>

<template>
  <main
    class="reader-view"
    :class="{ 'pagination-mode': isPaginationMode }"
    ref="containerRef"
    :style="{
      padding: `${props.settings.margin}px`,
    }"
  >
    <!-- Pagination Mode: Pre-calculated single page -->
    <article
      v-if="isPaginationMode"
      ref="articleRef"
      class="reader-content"
      :style="contentStyle"
      v-html="content"
    ></article>

    <!-- Vertical Scroll Mode -->
    <article v-else class="reader-content vertical-content" :style="contentStyle">
      <div
        v-for="chapter in loadedChapters"
        :key="chapter.chapterId"
        :data-chapter-id="chapter.chapterId"
        class="chapter-container"
      >
        <div v-html="chapter.content"></div>
      </div>
    </article>
  </main>
</template>

<style scoped>
.reader-view {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--reader-bg);
  position: relative;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  max-width: 700px;
  margin: auto;
}

.reader-view.pagination-mode {
  overflow: hidden;
}

.reader-content {
  min-height: 100%;
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  -webkit-hyphens: auto;
}

.vertical-content {
  padding-bottom: 40vh;
}

:deep(.reader-content) .chapter-heading {
  margin-bottom: 1em;
  border-bottom: 1px solid var(--border-subtle);
}

.reader-content.transitioning {
  opacity: 0;
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.reader-content :deep(p) {
  margin-bottom: calc(var(--paragraph-spacing, 1.2) * 1em);
  text-rendering: optimizeLegibility;
}

.reader-content :deep(h1),
.reader-content :deep(h2),
.reader-content :deep(h3),
.reader-content :deep(h4),
.reader-content :deep(h5),
.reader-content :deep(h6) {
  break-inside: avoid;
}

/* ===== Responsive media elements - override inline styles ===== */

/* Images - force responsive with !important to override inline styles */
.reader-content :deep(img) {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  object-fit: contain;
  display: block;
  -webkit-user-drag: none;
  user-drag: none;
}

/* SVG elements - force responsive */
.reader-content :deep(svg) {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  display: block;
}

/* SVG internal image elements */
.reader-content :deep(svg image) {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  display: inline;
  margin: 0;
}

/* Figure container */
.reader-content :deep(figure) {
  max-width: 100% !important;
  margin: 1em auto;
  text-align: center;
}

/* Figure caption */
.reader-content :deep(figcaption) {
  font-size: 0.9em;
  color: var(--text-secondary);
  margin-top: 0.5em;
  text-align: center;
}

/* Video elements */
.reader-content :deep(video) {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  display: block;
}

/* Audio elements */
.reader-content :deep(audio) {
  max-width: 100% !important;
  display: block;
}

.reader-view::-webkit-scrollbar {
  width: 7px;
}

.reader-view::-webkit-scrollbar-track {
  background: transparent;
}

.reader-view::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.reader-view::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--border) 70%, var(--reader-text));
}
</style>

<style>
.reader-content p {
  margin-bottom: calc(var(--paragraph-spacing, 1.2) * 1em);
  text-rendering: optimizeLegibility;
}
</style>
