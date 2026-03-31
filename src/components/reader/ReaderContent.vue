<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from "vue";
import type { ReaderSettings } from "../../core/types";

const props = defineProps<{
  content: string;
  settings: ReaderSettings;
  isPaginationMode: boolean;
  currentPage?: number;
  transitioning?: boolean;
  loadedChapters?: Array<{ chapterId: string; title: string; content: string }>;
}>();

const emit = defineEmits<{
  (e: "resize"): void;
}>();

const paginationRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const columnGap = ref(0);
let resizeObserver: ResizeObserver | null = null;

function updateWidth() {
  if (props.transitioning) return;
  if (paginationRef.value) {
    const el = paginationRef.value;
    const style = getComputedStyle(el);
    containerWidth.value = el.clientWidth;
    columnGap.value = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    emit("resize");
  }
}

onMounted(() => {
  nextTick(() => {
    updateWidth();
    if (paginationRef.value) {
      resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(paginationRef.value);
    }
  });
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

watch(
  () => props.isPaginationMode,
  (newVal) => {
    if (newVal) {
      nextTick(() => {
        updateWidth();
      });
    }
  },
);

watch(
  () => props.transitioning,
  (newVal, oldVal) => {
    if (oldVal && !newVal) {
      updateWidth();
    }
  },
);

watch(
  () => props.settings.margin,
  () => {
    nextTick(() => {
      updateWidth();
    });
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

/* Vertical scrolling */
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

.pagination-content.transitioning {
  transition: none;
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
