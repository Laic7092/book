<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from "vue";
import type { ReaderSettings } from "../../core/types";
import { useIframeRenderer } from "../../composables/useIframeRenderer";

const props = defineProps<{
  content: string;
  settings: ReaderSettings;
  isPaginationMode: boolean;
  currentPage?: number;
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

function emitResize() {
  emit("resize");
}

// 初始化 iframe
onMounted(() => {
  nextTick(() => {
    if (iframeRef.value) {
      initIframe();
      // 加载内容
      if (props.isPaginationMode) {
        updateContent(props.content);
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
    if (props.isPaginationMode && isReady.value) {
      updateContent(newContent);
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
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  clearEpubResources();
  cleanup();
});

defineExpose({ iframeRef, getArticle, scrollToChapter, restoreScrollPosition, scrollTo });
</script>

<template>
  <main class="reader-view" :class="{ 'pagination-mode': isPaginationMode }" ref="containerRef">
    <iframe
      ref="iframeRef"
      class="reader-iframe"
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
}
</style>
