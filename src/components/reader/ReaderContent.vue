<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from "vue";
import { useIframeRenderer } from "../../composables/useIframeRenderer";
import { generatePaginationCSS } from "../../reader-engine/reader-styles";

const props = defineProps<{
  content: string;
  isPaginationMode: boolean;
  scrollOffset?: number;
  chapterLoading?: boolean;
  loadedChapters?: Array<{ chapterId: string; title: string; content: string }>;
  epubResources?: HTMLElement[];
  pageMargin?: number;
  onLinkClick?: (href: string) => void;
  onColumnLayout?: (data: {
    columnWidth: number;
    gap: number;
    scrollWidth: number;
    iframeWidth: number;
  }) => void;
  onChaptersChanged?: () => void;
  onIframeReady?: () => void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const iframeRef = ref<HTMLIFrameElement | null>(null);

const rendererOptions = computed(() => ({
  isPaginationMode: props.isPaginationMode,
}));

const {
  isReady,
  initIframe,
  updateContent,
  syncResources,
  clearSyncedResources,
  getArticle,
  getDocument,
  scrollToChapter,
  restoreScrollPosition,
  cleanup,
} = useIframeRenderer(
  iframeRef,
  rendererOptions,
  props.onLinkClick ? (msg) => props.onLinkClick!(msg.href) : undefined,
);

let resizeObserver: ResizeObserver | null = null;
let columnMeasureTimer: ReturnType<typeof setTimeout> | null = null;

function getPaginationStyleEl(): HTMLStyleElement | null {
  const doc = getDocument();
  return doc?.getElementById("pagination-style") as HTMLStyleElement | null;
}

function injectColumnCSS() {
  const styleEl = getPaginationStyleEl();
  if (!styleEl) return;
  const iframe = iframeRef.value;
  if (!iframe) return;
  const m = props.pageMargin ?? 24;
  const cw = iframe.clientWidth - m * 2;
  const ch = iframe.clientHeight - m * 2;
  const gap = m * 2;
  styleEl.textContent = generatePaginationCSS(cw, ch, gap);
}

function measureColumns() {
  if (columnMeasureTimer) clearTimeout(columnMeasureTimer);
  columnMeasureTimer = setTimeout(() => {
    const doc = getDocument();
    if (!doc?.body || !props.isPaginationMode) return;
    requestAnimationFrame(() => {
      const iframe = iframeRef.value;
      if (!iframe) return;
      const m = props.pageMargin ?? 24;
      const cw = iframe.clientWidth - m * 2;
      const gap = m * 2;
      const scrollWidth = doc.body.scrollWidth || 0;
      const iframeWidth = iframe.clientWidth || 0;
      if (cw > 0) {
        props.onColumnLayout?.({ columnWidth: cw, gap, scrollWidth, iframeWidth });
      }
    });
  }, 150);
}

function handleLoad() {
  const doc = getDocument();
  if (!doc) return;

  injectColumnCSS();
  measureColumns();

  if (props.loadedChapters) {
    updateContent(props.loadedChapters.map((ch) => ch.content).join(""));
  }

  doc.querySelectorAll<HTMLElement>("[data-chapter-id]").forEach((el) => {
    el.style.display = "block";
  });

  props.onChaptersChanged?.();
  props.onIframeReady?.();
}

watch(
  () => props.loadedChapters,
  (chapters) => {
    if (chapters?.length) {
      updateContent(chapters.map((ch) => ch.content).join(""));
      nextTick(() => {
        injectColumnCSS();
        measureColumns();
        props.onChaptersChanged?.();
      });
    }
  },
);

watch(
  () => props.content,
  (html) => {
    if (html) {
      updateContent(html);
      nextTick(() => {
        injectColumnCSS();
        measureColumns();
        props.onChaptersChanged?.();
      });
    }
  },
);

watch(
  () => props.epubResources,
  (resources) => {
    if (resources) {
      syncResources(resources);
    }
  },
);

watch([() => props.isPaginationMode, isReady], ([mode, ready]) => {
  if (ready && mode) {
    nextTick(injectColumnCSS);
  }
});

watch(
  () => props.pageMargin,
  () => {
    if (props.isPaginationMode && isReady.value) {
      nextTick(() => {
        injectColumnCSS();
        measureColumns();
      });
    }
  },
);

watch(
  () => props.scrollOffset,
  (offset) => {
    if (!props.isPaginationMode || offset === undefined) return;
    const article = getArticle();
    if (article) {
      article.style.transform = `translateX(-${offset}px)`;
    }
  },
);

let resizeCleanup: (() => void) | null = null;

function setupResizeObserver() {
  if (!iframeRef.value) return;
  const doc = getDocument();
  if (!doc?.body) return;

  resizeObserver = new ResizeObserver(() => {
    injectColumnCSS();
    measureColumns();
  });
  resizeObserver.observe(doc.body);

  resizeCleanup = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  };
}

onMounted(() => {
  initIframe();

  const doc = getDocument();
  if (doc) {
    handleLoad();
  } else {
    const iframe = iframeRef.value;
    if (iframe) {
      iframe.addEventListener("load", handleLoad, { once: true });
    }
  }

  setupResizeObserver();
});

onUnmounted(() => {
  cleanup();
  clearSyncedResources();
  resizeCleanup?.();
  if (columnMeasureTimer) clearTimeout(columnMeasureTimer);
});

defineExpose({
  getDocument,
  getArticle,
  scrollToChapter,
  restoreScrollPosition,
  syncResources,
});
</script>

<template>
  <div ref="containerRef" class="reader-content-wrapper">
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
