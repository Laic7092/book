<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from "vue";
import type { ReaderSettings } from "../../core/types";
import { useIframeRenderer } from "../../composables/useIframeRenderer";
import { generatePaginationCSS } from "../../utils/reader-styles";

const props = defineProps<{
  content: string;
  settings: ReaderSettings;
  isPaginationMode: boolean;
  scrollOffset?: number;
  chapterLoading?: boolean;
  loadedChapters?: Array<{ chapterId: string; title: string; content: string }>;
  epubResources?: HTMLElement[];
  onLinkClick?: (href: string) => void;
}>();

const emit = defineEmits<{
  (e: "resize"): void;
  (e: "gesture-tap", x: number, y: number): void;
  (e: "gesture-swipe-left"): void;
  (e: "gesture-swipe-right"): void;
  (
    e: "scroll-update",
    data: {
      percent: number;
      chapterId: string | null;
      chapterProgress: number;
    },
  ): void;
  (
    e: "column-layout",
    data: {
      columnWidth: number;
      gap: number;
      scrollWidth: number;
    },
  ): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const iframeRef = ref<HTMLIFrameElement | null>(null);

// Iframe 渲染器（集成手势处理）
const rendererOptions = computed(() => ({
  settings: props.settings,
  isPaginationMode: props.isPaginationMode,
}));

// 手势处理回调
const gestureHandlers = {
  onTap: (x: number, y: number) => {
    emit("gesture-tap", x, y);
  },
  onSwipeLeft: () => {
    emit("gesture-swipe-left");
  },
  onSwipeRight: () => {
    emit("gesture-swipe-right");
  },
};

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
  scrollTo,
  refreshScrollObserver,
  cleanup,
} = useIframeRenderer(
  iframeRef,
  rendererOptions,
  gestureHandlers,
  props.onLinkClick ? (msg) => props.onLinkClick!(msg.href) : undefined,
  // 滚动模式：转发滚动数据
  (scrollData) => {
    emit("scroll-update", {
      percent: scrollData.percent,
      chapterId: scrollData.chapterId,
      chapterProgress: scrollData.chapterProgress,
    });
  },
);

let resizeObserver: ResizeObserver | null = null;
let columnMeasureTimer: ReturnType<typeof setTimeout> | null = null;

function emitResize() {
  emit("resize");
}

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
  const gap = margin;
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
      const cw = iframe.clientWidth - margin * 2;
      const gap = margin;
      const sw = doc.body.scrollWidth;
      emit("column-layout", { columnWidth: cw, gap, scrollWidth: sw || cw });
    });
  }, 50);
}

function paginationUpdateContent(html: string) {
  injectColumnCSS();
  updateContent(html);
  measureColumns();
}

// 初始化 iframe
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
      refreshScrollObserver();
    }

    if (containerRef.value) {
      let isFirst = true;
      resizeObserver = new ResizeObserver(() => {
        if (isFirst) {
          isFirst = false;
          return;
        }
        emitResize();
      });
      resizeObserver.observe(containerRef.value);
    }
  });
});

// 监听内容变化（分页模式）
watch(
  () => props.content,
  (newContent) => {
    if (props.isPaginationMode && isReady.value && newContent) {
      paginationUpdateContent(newContent);
    }
  },
);

// 监听 scrollOffset 变化（分页模式：transform 平移 body 切换列）
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

// 滚动模式：同步 LRU 缓存 ↔ DOM
watch(
  () => props.loadedChapters,
  (newChapters) => {
    if (props.isPaginationMode || !newChapters || !isReady.value) return;
    const doc = getDocument();
    if (!doc) return;

    const currentIds = new Map(newChapters.map((ch) => [ch.chapterId, ch]));

    // Phase 1: 移除已被 LRU 驱逐的章节 DOM
    const existing = doc.querySelectorAll("[data-chapter-id]");
    existing.forEach((el) => {
      const id = el.getAttribute("data-chapter-id");
      if (id && !currentIds.has(id)) {
        el.remove();
      }
    });

    // Phase 2: 按顺序插入新增章节
    for (const ch of newChapters) {
      if (doc.querySelector(`[data-chapter-id="${ch.chapterId}"]`)) continue;

      const html = `<div data-chapter-id="${ch.chapterId}" class="chapter-container">${ch.content}</div>`;

      // 找到下一个已在 DOM 中的章节 → 插入其前方（保持顺序）
      const next = newChapters
        .filter((c) => c.order > ch.order)
        .find((c) => doc.querySelector(`[data-chapter-id="${c.chapterId}"]`));

      if (next) {
        const ref = doc.querySelector(`[data-chapter-id="${next.chapterId}"]`);
        ref?.insertAdjacentHTML("beforebegin", html);
      } else {
        doc.body.insertAdjacentHTML("beforeend", html);
      }
    }

    // 刷新 IntersectionObserver 让新章节可被检测
    refreshScrollObserver();
  },
  { deep: true },
);

// 监听排版设置变化
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
    }
  },
);

// 监听主题变化
watch(
  () => [props.settings.theme, props.settings.contrast],
  () => {
    if (isReady.value) {
      updateStyles();
    }
  },
);

// 监听 EPUB 资源变化
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
  iframeRef,
  getArticle,
  scrollToChapter,
  restoreScrollPosition,
  scrollTo,
  refreshScrollObserver,
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
