<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import type { ReaderSettings } from "../../core/types";

const props = defineProps<{
  content: string;
  settings: ReaderSettings;
  isPaginationMode: boolean;
  currentPage?: number;
  transitioning?: boolean;
  loadedChapters?: Array<{ chapterId: string; title: string; content: string }>;
}>();

const paginationRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const columnGap = ref(0);
let resizeObserver: ResizeObserver | null = null;

function updateWidth() {
  if (paginationRef.value) {
    const el = paginationRef.value;
    const style = getComputedStyle(el);
    containerWidth.value = el.clientWidth;
    columnGap.value = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }
}

onMounted(() => {
  updateWidth();
  resizeObserver = new ResizeObserver(updateWidth);
  if (paginationRef.value) {
    resizeObserver.observe(paginationRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

watch(
  () => props.isPaginationMode,
  () => {
    if (props.isPaginationMode) {
      updateWidth();
    }
  },
);

const paginationStyle = computed(() => {
  const baseStyle = {
    padding: `${props.settings.margin}px`,
    fontSize: `${props.settings.fontSize}px`,
    fontFamily: props.settings.fontFamily,
    lineHeight: String(props.settings.lineHeight),
    letterSpacing: `${props.settings.letterSpacing || 0}em`,
    textAlign: props.settings.textAlign || "left",
  };

  if (props.isPaginationMode) {
    return {
      ...baseStyle,
      columnWidth: `${containerWidth.value}px`,
      columnGap: `${columnGap.value}px`,
      transform: `translateX(-${(props.currentPage || 0) * containerWidth.value}px)`,
    };
  }

  return baseStyle;
});
</script>

<template>
  <main class="reader-view" :class="{ 'pagination-mode': isPaginationMode }">
    <!-- Pagination Mode: CSS column layout -->
    <article
      v-if="isPaginationMode"
      ref="paginationRef"
      class="reader-content pagination-content"
      :class="{ transitioning }"
      :style="paginationStyle"
      v-html="content"
    ></article>

    <!-- Vertical Scroll Mode -->
    <article
      v-else
      class="reader-content vertical-content"
      :class="{ transitioning }"
      :style="{
        maxWidth: `${settings.columnWidth}px`,
        margin: '0 auto',
        padding: `${settings.margin}px`,
        fontSize: `${settings.fontSize}px`,
        fontFamily: settings.fontFamily,
        lineHeight: String(settings.lineHeight),
        letterSpacing: `${settings.letterSpacing || 0}em`,
        textAlign: settings.textAlign || 'left',
      }"
    >
      <div
        v-for="chapter in loadedChapters"
        :key="chapter.chapterId"
        class="chapter-container"
        :data-chapter-id="chapter.chapterId"
      >
        <h2 class="chapter-heading">{{ chapter.title }}</h2>
        <div class="chapter-body" v-html="chapter.content"></div>
      </div>
    </article>
  </main>
</template>

<style scoped>
.reader-view {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--reader-bg);
  position: relative;
  -webkit-overflow-scrolling: touch;
}

.reader-view.pagination-mode {
  overflow: hidden;
}

.reader-content {
  min-height: 100%;
  transition:
    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  -webkit-hyphens: auto;
}

/* Vertical scrolling */
.vertical-content {
  padding-bottom: 40vh;
}

.chapter-container {
  margin-bottom: 3em;
  scroll-margin-top: 2em;
}

.chapter-container:not(:first-child) .chapter-heading {
  margin-top: 3em;
  padding-top: 2em;
  border-top: 1px solid var(--border-subtle);
}

.chapter-heading {
  font-family: var(--font-display);
  font-size: 1.8em;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--reader-text);
  text-align: center;
  padding-bottom: 1.5em;
  margin-bottom: 1em;
  border-bottom: 1px solid var(--border-subtle);
}

.chapter-body {
  padding-top: 0.5em;
  white-space: break-spaces;
}

.reader-content.transitioning {
  opacity: 0;
}

.reader-content :deep(p) {
  margin-bottom: calc(var(--paragraph-spacing, 1.2) * 1em);
  text-rendering: optimizeLegibility;
}

/* Pagination Mode: CSS Columns */
.pagination-content {
  column-fill: auto;
  column-gap: 0;
  height: calc(100vh - 120px);
  height: calc(100dvh - 120px);
  width: 100%;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.pagination-content :deep(p),
.pagination-content :deep(h1),
.pagination-content :deep(h2),
.pagination-content :deep(h3),
.pagination-content :deep(h4),
.pagination-content :deep(h5),
.pagination-content :deep(h6) {
  break-inside: avoid;
}

/* Scrollbar */
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
