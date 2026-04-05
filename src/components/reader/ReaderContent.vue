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
}>();

const emit = defineEmits<{
  (e: "resize"): void;
  (e: "gesture-tap", x: number, y: number): void;
  (e: "gesture-swipe-left"): void;
  (e: "gesture-swipe-right"): void;
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
  cleanup,
} = useIframeRenderer(iframeRef, rendererOptions, gestureHandlers);

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

// 监听内容变化
watch(
  () => props.content,
  (newContent) => {
    if (props.isPaginationMode && isReady.value) {
      updateContent(newContent);
    }
  },
);

// 监听章节变化
watch(
  () => props.loadedChapters,
  (newChapters) => {
    if (!props.isPaginationMode && newChapters && isReady.value) {
      const combinedContent = newChapters
        .map(
          (ch) =>
            `<div data-chapter-id="${ch.chapterId}" class="chapter-container">${ch.content}</div>`,
        )
        .join("");
      updateContent(combinedContent);
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

defineExpose({ iframeRef, getArticle });
</script>

<template>
  <main class="reader-view" :class="{ 'pagination-mode': isPaginationMode }" ref="containerRef">
    <!-- Iframe 渲染容器 -->
    <iframe
      ref="iframeRef"
      class="reader-iframe"
      :class="{ 'pagination-mode': isPaginationMode }"
      frameborder="0"
      scrolling="no"
    ></iframe>
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

.reader-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
