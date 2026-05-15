<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef } from "vue";
import FixedLayoutPage from "./reader/FixedLayoutPage.vue";
import { useNavigationStack } from "../composables/useNavigationStack";
import { FixedHost } from "@book/reader-host";
import type { FixedLayoutSurface, SelfContainedRenderer } from "@book/reader-host";
import { createInitialState } from "@book/reader-core";
import { registerReaderSession, unregisterReaderSession } from "@book/reader-host";
import type { Chapter, ReaderState } from "@book/reader-core";
import type { Book } from "../core/types";
import * as booksStore from "../storage/books";
import { navigate } from "../utils/router";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../utils/constants";
import { pluginEvents, pluginHooks } from "../plugins/context";
import type { InitConfig } from "../plugins/types";
import { PdfRenderer } from "@book/parser-core";

const props = defineProps<{ book: Book }>();

const navStack = useNavigationStack();

// ── Renderer selection (format → renderer factory) ──

const rendererFactories: Record<string, () => SelfContainedRenderer> = {
  pdf: () => new PdfRenderer(),
};
const renderer = rendererFactories[props.book.format]?.();

// ── Host & state ──

const cbzSurfaceRef = ref<InstanceType<typeof FixedLayoutPage> | null>(null);
const mountRef = ref<HTMLElement | null>(null);
const host = ref<FixedHost | null>(null);
const state = shallowRef<ReaderState>(createInitialState());
const isRestoring = ref(true);
const showControls = ref(true);

// ── Derived display state ──

const currentChapter = computed(() => state.value.chapters[state.value.currentChapterIndex]);

const totalPages = computed(() => {
  if (renderer) {
    return renderer.getPageCount();
  }
  return state.value.chapters.length;
});

const currentPageNum = computed(() => (state.value.currentChapterIndex ?? 0) + 1);

const displayPage = computed(() => currentPageNum.value);

const canPrev = computed(() => currentPageNum.value > 1);
const canNext = computed(() => currentPageNum.value < totalPages.value);
const isTransitioning = computed(() => state.value.status === "loading");

// ── Navigation ──

function handleClose() {
  navigate("/");
}

function nextPage() {
  if (canNext.value && host.value) host.value.nextPage();
}

function prevPage() {
  if (canPrev.value && host.value) host.value.prevPage();
}

function handleHistoryBack() {
  const entry = navStack.back();
  if (!entry) return;
  goToChapter(entry.chapterId, entry.page);
}

function handleHistoryForward() {
  const entry = navStack.forward();
  if (!entry) return;
  goToChapter(entry.chapterId, entry.page);
}

function goToChapter(chapterId: string, page?: number) {
  // Push current position to history
  const prevId = state.value.chapters[state.value.currentChapterIndex]?.id;
  if (prevId) {
    navStack.push({ chapterId: prevId, page: currentPageNum.value });
  }

  if (page !== undefined) {
    const target = state.value.chapters.find((c) => c.id === chapterId);
    if (target) host.value?.goToChapter(target.id, page);
  } else {
    host.value?.goToChapter(chapterId);
  }
}

// ── Gestures ──

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!(
    target.closest("button") ||
    target.closest("input") ||
    target.closest("textarea") ||
    target.closest("select") ||
    target.closest("a[href]")
  );
}

function handleClick(e: MouseEvent) {
  if (shouldIgnoreTarget(e.target)) return;

  const x = e.clientX;
  const width = window.innerWidth;
  if (x < width * TAP_ZONE_LEFT) {
    prevPage();
  } else if (x > width * TAP_ZONE_RIGHT) {
    nextPage();
  } else {
    showControls.value = !showControls.value;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowLeft") {
    prevPage();
    return;
  }
  if (e.key === "ArrowRight") {
    nextPage();
    return;
  }
  if (e.key === "Escape") {
    handleClose();
    return;
  }
}

// ── Lifecycle ──

onMounted(async () => {
  const fetched = await booksStore.getChapters(props.book.id);
  const hostChapters = fetched.map((ch) => ({
    id: ch.id,
    bookId: props.book.id,
    title: ch.title,
    order: ch.order,
    href: ch.href,
    inToc: ch.inToc,
  }));

  const h = new FixedHost({
    surface: renderer ? undefined : (cbzSurfaceRef.value as unknown as FixedLayoutSurface),
    renderer,
    fetchChapter: async (bookId, _chapterId) => {
      const { getZip } = await import("../storage/raw-data");
      const rawData = (await getZip(bookId)) ?? undefined;
      return { html: undefined, rawData };
    },
    onStateChange: (s) => {
      state.value = s;
    },
    onReady: () => {
      queueMicrotask(() => {
        isRestoring.value = false;
      });
    },
    onEffect: async (effect) => {
      switch (effect.type) {
        case "CHAPTER_DID_CHANGE":
          void pluginEvents.emit("chapter:changed", {
            bookId: props.book.id,
            chapterId: effect.chapterId,
            previousChapterId: effect.previousChapterId ?? undefined,
          });
          break;
        case "PAGE_DID_CHANGE":
          void pluginEvents.emit("page:changed", {
            bookId: props.book.id,
            chapterId: effect.chapterId,
            page: effect.page,
            totalPages: effect.totalPages,
          });
          break;
        case "CONTENT_DID_LOAD":
          void pluginEvents.emit("content:loaded", {
            bookId: props.book.id,
            chapterId: effect.chapterId,
          });
          break;
        case "READER_UNMOUNTED":
          void pluginEvents.emit("reader:unmounted", {
            bookId: effect.bookId,
          });
          break;
      }
    },
  });

  if (renderer && mountRef.value) {
    h.setRendererContainer(mountRef.value);
  }

  host.value = h;
  registerReaderSession(h.getSession());

  const baseConfig: InitConfig = {
    bookId: props.book.id,
    chapterIndex: 0,
    mode: "pagination",
  };
  void pluginHooks.run("reader:init-config", baseConfig).then((config) => {
    h.init(
      props.book.id,
      hostChapters,
      config.chapterIndex,
      config.mode,
      config.initialPage,
      config.initialScroll,
    );
  });

  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  host.value?.destroy();
  unregisterReaderSession();
  navStack.reset();
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="fl-view" @click="handleClick">
    <header v-show="showControls" class="fl-header">
      <button class="fl-btn fl-back" @click.stop="handleClose" aria-label="Back">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <span class="fl-title">{{ book.title }}</span>
      <span class="fl-page-indicator" v-if="totalPages > 0"
        >{{ displayPage }} / {{ totalPages }}</span
      >
    </header>

    <main class="fl-content">
      <div v-if="isTransitioning" class="fl-loading-overlay" />
      <div v-if="renderer" ref="mountRef" class="fl-surface-wrapper" />
      <div v-else class="fl-surface-wrapper">
        <FixedLayoutPage ref="cbzSurfaceRef" :book-id="book.id" />
      </div>
    </main>

    <footer v-show="showControls" class="fl-footer">
      <button class="fl-btn" :disabled="!canPrev" @click.stop="prevPage" aria-label="Previous page">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span class="fl-page-info" v-if="totalPages > 0">{{ displayPage }} / {{ totalPages }}</span>
      <button class="fl-btn" :disabled="!canNext" @click.stop="nextPage" aria-label="Next page">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </footer>

    <!-- History navigation -->
    <button
      v-show="showControls && navStack.canGoBack.value"
      class="fl-history-btn fl-history-back"
      @click.stop="handleHistoryBack"
      aria-label="Go back"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
    <button
      v-show="showControls && navStack.canGoForward.value"
      class="fl-history-btn fl-history-forward"
      @click.stop="handleHistoryForward"
      aria-label="Go forward"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.fl-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #1a1a1a;
  color: #e0e0e0;
  user-select: none;
  -webkit-user-select: none;
  position: relative;
}

.fl-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  padding-top: max(8px, env(safe-area-inset-top, 0));
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 10;
  min-height: 48px;
}

.fl-title {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-page-indicator {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
}

.fl-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  position: relative;
}

.fl-surface-wrapper {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.fl-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  cursor: wait;
}

.fl-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  padding-bottom: max(8px, env(safe-area-inset-bottom, 0));
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 10;
  min-height: 44px;
}

.fl-page-info {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
  min-width: 60px;
  text-align: center;
}

.fl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition:
    background 120ms ease,
    color 120ms ease;
}

.fl-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.fl-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.fl-btn.fl-back {
  width: 36px;
  height: 36px;
}

.fl-history-btn {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--z-chrome);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.7);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  transition: opacity 200ms ease;
  opacity: 0.5;
}

.fl-history-btn:hover {
  opacity: 1;
  border-color: rgba(255, 255, 255, 0.3);
}

.fl-history-back {
  left: max(12px, env(safe-area-inset-left, 0));
}

.fl-history-forward {
  right: max(12px, env(safe-area-inset-right, 0));
}
</style>
