<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from "vue";
import type { ReaderSettings } from "../../core/types";
import { useIframeRenderer } from "../../composables/useIframeRenderer";
import { generatePaginationCSS } from "../../reader-engine/reader-styles";

const props = defineProps<{
  content: string;
  settings: ReaderSettings;
  isPaginationMode: boolean;
  scrollOffset?: number;
  chapterLoading?: boolean;
  loadedChapters?: Array<{ chapterId: string; title: string; content: string }>;
  epubResources?: HTMLElement[];
  onLinkClick?: (href: string) => void;
  onColumnLayout?: (data: {
    columnWidth: number;
    gap: number;
    scrollWidth: number;
    iframeWidth: number;
  }) => void;
  onChaptersChanged?: () => void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const iframeRef = ref<HTMLIFrameElement | null>(null);

const rendererOptions = computed(() => ({
  settings: props.settings,
  isPaginationMode: props.isPaginationMode,
}));

const {
  isReady,
  initIframe,
  updateContent,
  updateStyles,
  updateEpubResources,
  clearEpubResources,
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
  const margin = props.settings.margin || 24;
  const cw = iframe.clientWidth - margin * 2;
  const ch = iframe.clientHeight - margin * 2;
  const gap = margin * 2;
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
      const margin = props.settings.margin || 24;
      const cw = iframe.getBoundingClientRect().width - margin * 2;
      const gap = margin * 2;
      const sw = doc.body.scrollWidth;
      props.onColumnLayout?.({
        columnWidth: cw,
        gap,
        scrollWidth: sw || cw,
        iframeWidth: iframe.clientWidth,
      });
    });
  }, 50);
}

function paginationUpdateContent(html: string) {
  injectColumnCSS();
  updateContent(html);
  measureColumns();
}

onMounted(() => {
  nextTick(() => {
    if (iframeRef.value) {
      initIframe();
      if (props.isPaginationMode) {
        paginationUpdateContent(props.content);
      } else if (props.loadedChapters) {
        const combinedContent = props.loadedChapters
          .map(
            (ch) =>
              `<div data-chapter-id="${ch.chapterId}" class="chapter-container">${ch.content}</div>`,
          )
          .join("");
        updateContent(combinedContent);
      }
    }

    if (containerRef.value) {
      let isFirst = true;
      resizeObserver = new ResizeObserver(() => {
        if (isFirst) {
          isFirst = false;
          return;
        }
        if (props.isPaginationMode) {
          injectColumnCSS();
          measureColumns();
        }
      });
      resizeObserver.observe(containerRef.value);
    }
  });
});

watch(
  () => props.isPaginationMode,
  (isPagination) => {
    const doc = getDocument();
    if (!doc?.body) return;

    const body = doc.body;
    body.classList.toggle("vertical-content", !isPagination);

    const styleEl = doc.getElementById("pagination-style");
    if (!isPagination) {
      if (styleEl) styleEl.textContent = "";
      body.style.transform = "";
    }

    if (!isPagination && props.loadedChapters && props.loadedChapters.length > 0) {
      const combined = props.loadedChapters
        .map(
          (ch) =>
            `<div data-chapter-id="${ch.chapterId}" class="chapter-container">${ch.content}</div>`,
        )
        .join("");
      updateContent(combined);
      props.onChaptersChanged?.();
    }
  },
);

watch(
  () => props.content,
  (newContent) => {
    if (props.isPaginationMode && isReady.value && newContent) {
      paginationUpdateContent(newContent);
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

watch(
  () => props.loadedChapters,
  (newChapters) => {
    if (props.isPaginationMode || !newChapters || !isReady.value) return;
    const doc = getDocument();
    if (!doc?.body) return;

    const hasContainers = doc.querySelectorAll("[data-chapter-id]").length > 0;
    if (hasContainers) {
      const currentIds = new Map(newChapters.map((ch) => [ch.chapterId, ch]));

      const existing = doc.querySelectorAll("[data-chapter-id]");
      existing.forEach((el) => {
        const id = el.getAttribute("data-chapter-id");
        if (id && !currentIds.has(id)) {
          el.remove();
        }
      });

      for (const ch of newChapters) {
        if (doc.querySelector(`[data-chapter-id="${ch.chapterId}"]`)) continue;

        const html = `<div data-chapter-id="${ch.chapterId}" class="chapter-container">${ch.content}</div>`;

        const next = newChapters
          .filter((c) => (c as any).order > (ch as any).order)
          .find((c) => doc.querySelector(`[data-chapter-id="${c.chapterId}"]`));

        if (next) {
          const ref = doc.querySelector(`[data-chapter-id="${next.chapterId}"]`);
          ref?.insertAdjacentHTML("beforebegin", html);
        } else {
          doc.body.insertAdjacentHTML("beforeend", html);
        }
      }
    } else {
      const combined = newChapters
        .map(
          (ch) =>
            `<div data-chapter-id="${ch.chapterId}" class="chapter-container">${ch.content}</div>`,
        )
        .join("");
      updateContent(combined);
    }

    props.onChaptersChanged?.();
  },
  { deep: true },
);

watch(
  () => [
    props.settings.fontSize,
    props.settings.fontFamily,
    props.settings.lineHeight,
    props.settings.letterSpacing,
    props.settings.textAlign,
    props.settings.paragraphSpacing,
    props.settings.customTypography,
  ],
  () => {
    if (isReady.value) {
      updateStyles();
      if (props.isPaginationMode) {
        nextTick(() => {
          injectColumnCSS();
          measureColumns();
        });
      }
    }
  },
);

watch(
  () => [props.settings.theme, props.settings.contrast],
  () => {
    if (isReady.value) {
      updateStyles();
      if (props.isPaginationMode) {
        nextTick(() => {
          injectColumnCSS();
          measureColumns();
        });
      }
    }
  },
);

watch(
  () => props.epubResources,
  (newResources) => {
    if (isReady.value && newResources) {
      updateEpubResources(newResources);
    }
  },
  { deep: true },
);

onUnmounted(() => {
  if (columnMeasureTimer) {
    clearTimeout(columnMeasureTimer);
    columnMeasureTimer = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  clearEpubResources();
  cleanup();
});

defineExpose({
  isReady,
  getArticle,
  getDocument,
  scrollToChapter,
  restoreScrollPosition,
});
</script>

<template>
  <main class="reader-view" :class="{ 'pagination-mode': isPaginationMode }" ref="containerRef">
    <iframe
      ref="iframeRef"
      class="reader-iframe"
      :class="{ 'iframe-fade-out': chapterLoading }"
      :scrolling="isPaginationMode ? 'no' : undefined"
      frameborder="0"
    ></iframe>
  </main>
</template>

<style scoped>
.reader-view {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background-color: var(--reader-bg);
  position: relative;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  max-width: 700px;
  margin: auto;
}

.reader-iframe {
  width: 100%;
  height: 100%;
  border: none;
  transition: opacity 0.35s ease;
}

.reader-iframe.iframe-fade-out {
  opacity: 0;
  transition: none;
}
</style>
