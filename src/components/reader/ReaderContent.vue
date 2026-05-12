<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useIframeRenderer } from "../../composables/useIframeRenderer";

const props = defineProps<{
  content: string;
  isPaginationMode: boolean;
  currentPage?: number;
  chapterLoading?: boolean;
  loadedChapters?: Array<{ chapterId: string; title: string; content: string }>;
  epubResources?: HTMLElement[];
  pageMargin?: number;
  onLinkClick?: (href: string) => void;
}>();

const emit = defineEmits<{
  (e: "columnLayout", data: { contentWidth: number; iframeWidth: number }): void;
  (e: "chaptersChanged"): void;
  (e: "iframeReady"): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const iframeRef = ref<HTMLIFrameElement | null>(null);

const rendererOptions = computed<{ initialMode: "scroll" | "paginated" }>(() => ({
  initialMode: props.isPaginationMode ? "paginated" : "scroll",
}));

const {
  isReady,
  initIframe,
  updateContent,
  syncResources,
  clearSyncedResources,
  getArticle,
  getDocument,
  paginateToChapter,
  restorePosition,
  setMode,
  setPage,
  setPageMargin,
  cleanup,
} = useIframeRenderer(
  iframeRef,
  rendererOptions,
  props.onLinkClick ? (msg) => props.onLinkClick!(msg.href) : undefined,
);

let resizeObserver: ResizeObserver | null = null;
let columnMeasureTimer: ReturnType<typeof setTimeout> | null = null;

function measureColumns() {
  if (columnMeasureTimer) clearTimeout(columnMeasureTimer);
  columnMeasureTimer = setTimeout(() => {
    const doc = getDocument();
    if (!doc?.body || !props.isPaginationMode) return;
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

function handleLoad() {
  const doc = getDocument();
  if (!doc) return;

  const mode = props.isPaginationMode ? "paginated" : "scroll";
  setMode(mode);
  setPageMargin(props.pageMargin ?? 24);
  if (props.currentPage !== undefined) {
    setPage(props.currentPage);
  }
  measureColumns();

  if (props.loadedChapters) {
    updateContent(props.loadedChapters.map((ch) => ch.content).join(""));
  }

  doc.querySelectorAll<HTMLElement>("[data-chapter-id]").forEach((el) => {
    el.style.display = "block";
  });

  emit("chaptersChanged");
  emit("iframeReady");
}

watch(
  () => props.loadedChapters,
  (chapters) => {
    if (chapters?.length) {
      updateContent(chapters.map((ch) => ch.content).join(""));
      nextTick(() => {
        measureColumns();
        emit("chaptersChanged");
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
        measureColumns();
        emit("chaptersChanged");
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
  if (ready) {
    setMode(mode ? "paginated" : "scroll");
    if (mode) {
      nextTick(measureColumns);
    }
  }
});

watch(
  () => props.pageMargin,
  (margin) => {
    if (!isReady.value) return;
    setPageMargin(margin ?? 24);
    if (props.isPaginationMode) {
      nextTick(measureColumns);
    }
  },
);

watch(
  () => props.currentPage,
  (page) => {
    if (!props.isPaginationMode || page === undefined) return;
    setPage(page);
  },
);

let resizeCleanup: (() => void) | null = null;

function setupResizeObserver() {
  if (!iframeRef.value) return;
  const doc = getDocument();
  if (!doc?.body) return;

  resizeObserver = new ResizeObserver(() => {
    if (props.isPaginationMode) {
      measureColumns();
    }
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
  paginateToChapter,
  restorePosition,
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
