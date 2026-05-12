<script setup lang="ts">
// Thin iframe host component. Content rendering, mode switching, page
// transitions, and resource injection are all driven by the state machine
// bridge via effects. This component only:
//   1. Initializes the iframe skeleton
//   2. Measures CSS columns for pagination layout
//   3. Exposes getDocument() so the bridge can manipulate the iframe DOM

import { ref, onMounted, onUnmounted } from "vue";
import { useIframeRenderer } from "../../composables/useIframeRenderer";

const props = defineProps<{
  isPaginationMode: boolean;
  pageMargin?: number;
  chapterLoading?: boolean;
  onLinkClick?: (href: string) => void;
}>();

const emit = defineEmits<{
  (e: "columnLayout", data: { contentWidth: number; iframeWidth: number }): void;
  (e: "iframeReady"): void;
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);

const { isReady, initIframe, getDocument, getArticle, cleanup } = useIframeRenderer(
  iframeRef,
  props.onLinkClick,
);

// ── Column measurement (pagination mode only) ──

let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let columnMeasureTimer: ReturnType<typeof setTimeout> | null = null;

function measureColumns() {
  if (!props.isPaginationMode) return;
  if (columnMeasureTimer) clearTimeout(columnMeasureTimer);
  columnMeasureTimer = setTimeout(() => {
    const doc = getDocument();
    if (!doc?.body) return;
    requestAnimationFrame(() => {
      const iframe = iframeRef.value;
      if (!iframe) return;
      const contentWidth = doc.body.scrollWidth || 0;
      const iframeWidth = iframe.clientWidth || 0;
      if (iframeWidth > 0) {
        emit("columnLayout", { contentWidth, iframeWidth });
      }
    });
  }, 150);
}

function setupObservers() {
  if (!iframeRef.value) return;
  const doc = getDocument();
  if (!doc?.body) return;

  // ResizeObserver: viewport / iframe size changes
  resizeObserver = new ResizeObserver(() => {
    if (props.isPaginationMode) measureColumns();
  });
  resizeObserver.observe(doc.body);

  // MutationObserver: innerHTML replacement by the bridge on chapter switch.
  // ResizeObserver doesn't fire here because body's content-box is fixed
  // (100dvh × 100dvw) — only scrollWidth changes, which ResizeObserver
  // doesn't observe.
  mutationObserver = new MutationObserver(() => {
    if (props.isPaginationMode) measureColumns();
  });
  mutationObserver.observe(doc.body, { childList: true });
}

// ── Iframe lifecycle ──

function handleLoad() {
  if (!getDocument()) return;
  measureColumns();
  emit("iframeReady");
}

onMounted(() => {
  initIframe(props.isPaginationMode ? "paginated" : "scroll");

  const doc = getDocument();
  if (doc) {
    handleLoad();
  } else {
    iframeRef.value?.addEventListener("load", handleLoad, { once: true });
  }

  setupObservers();
});

onUnmounted(() => {
  cleanup();
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  if (columnMeasureTimer) clearTimeout(columnMeasureTimer);
});

defineExpose({ getDocument, getArticle });
</script>

<template>
  <div class="reader-content-wrapper">
    <div v-if="chapterLoading" class="chapter-loading-overlay" />
    <iframe ref="iframeRef" class="reader-iframe" title="Reader Content" @load="handleLoad" />
  </div>
</template>

<style scoped>
.reader-content-wrapper {
  position: relative;
  flex: 1;
  overflow: hidden;
  contain: strict;
}

.reader-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}

.chapter-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: var(--reader-bg, transparent);
  cursor: wait;
}
</style>
