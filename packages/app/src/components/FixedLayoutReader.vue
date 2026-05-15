<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef } from "vue";
import FixedLayoutPage from "./reader/FixedLayoutPage.vue";
import { useNavigationStack } from "../composables/useNavigationStack";
import { FixedHost } from "@book/reader-host";
import type { FixedLayoutSurface, SelfContainedRenderer } from "@book/reader-host";
import { createInitialState } from "@book/reader-core";
import { registerReaderSession, unregisterReaderSession } from "@book/reader-host";
import type { ReaderState } from "@book/reader-core";
import type { Book } from "../core/types";
import * as booksStore from "../storage/books";
import { navigate } from "../utils/router";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../utils/constants";
import { pluginEvents, pluginHooks } from "../plugins/context";
import type { InitConfig } from "../plugins/types";
import { PdfRenderer } from "@book/parser-core";
import type { PdfOutlineItem } from "@book/parser-core";

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
const host = shallowRef<FixedHost | null>(null);
const state = shallowRef<ReaderState>(createInitialState());
const isRestoring = ref(true);
const showControls = ref(true);

// ── PDF-specific state ──

const outlineItems = ref<PdfOutlineItem[]>([]);
const showToc = ref(false);
const zoomScale = ref(1);
const flatOutline = ref<Array<{ item: PdfOutlineItem; depth: number }>>([]);

// ── Derived display state ──

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

// ── Zoom ──

function updateZoomScale() {
  if (renderer) {
    zoomScale.value = renderer.getCurrentScale();
  }
}

function zoomIn() {
  host.value?.zoomIn();
  updateZoomScale();
}

function zoomOut() {
  host.value?.zoomOut();
  updateZoomScale();
}

function zoomFit() {
  host.value?.zoomFit();
  updateZoomScale();
}

function zoomWidth() {
  host.value?.zoomWidth();
  updateZoomScale();
}

// ── Outline / TOC ──

function toggleToc() {
  showToc.value = !showToc.value;
}

function closeToc() {
  showToc.value = false;
}

async function onOutlineItemClick(item: PdfOutlineItem) {
  closeToc();
  const pdfRenderer = renderer as PdfRenderer | undefined;
  if (item.dest || item.url) {
    await pdfRenderer?.goToOutlineItem(item);
  } else if (pdfRenderer) {
    // fallback: match by chapter title for page-based navigation
    for (const ch of state.value.chapters) {
      if (ch.title === item.title && ch.href) {
        const pageNum = parseInt(ch.href, 10);
        if (!isNaN(pageNum)) {
          pdfRenderer.goToPage(pageNum - 1);
        }
        break;
      }
    }
  }
}

function flattenOutlineTree(
  items: PdfOutlineItem[],
  depth = 0,
): Array<{ item: PdfOutlineItem; depth: number }> {
  const result: Array<{ item: PdfOutlineItem; depth: number }> = [];
  for (const item of items) {
    result.push({ item, depth });
    if (item.items?.length) {
      result.push(...flattenOutlineTree(item.items, depth + 1));
    }
  }
  return result;
}

async function loadOutline() {
  const pdfRenderer = renderer as PdfRenderer | undefined;
  if (!pdfRenderer?.getOutline) return;
  try {
    const items = await pdfRenderer.getOutline();
    if (items.length > 0) {
      outlineItems.value = items;
      flatOutline.value = flattenOutlineTree(items);
    } else {
      // fallback: use chapter titles from reader state
      const chapters = state.value.chapters;
      if (chapters.length > 0) {
        outlineItems.value = chapters.map((ch) => ({
          title: ch.title,
          items: [],
        }));
        flatOutline.value = outlineItems.value.map((item) => ({ item, depth: 0 }));
      }
    }
  } catch {
    // outline is best-effort
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
    if (showToc.value) {
      closeToc();
      return;
    }
    handleClose();
    return;
  }
  if (e.key === "t" || e.key === "T") {
    if (renderer) toggleToc();
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
      // 加载 PDF 目录
      void loadOutline();
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
          if (outlineItems.value.length === 0) {
            void loadOutline();
          }
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
      <button
        v-if="renderer && outlineItems.length"
        class="fl-btn fl-toc-toggle"
        :class="{ active: showToc }"
        @click.stop="toggleToc"
        aria-label="目录"
        title="目录"
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
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </button>
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

      <div v-show="showControls && !!renderer" class="fl-zoom-toolbar" @click.stop>
        <button class="fl-tool-btn" @click="zoomOut" title="缩小" aria-label="Zoom out">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span class="fl-zoom-label">{{ Math.round(zoomScale * 100) }}%</span>
        <button class="fl-tool-btn" @click="zoomIn" title="放大" aria-label="Zoom in">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <div class="fl-tool-divider" />
        <button class="fl-tool-btn" @click="zoomFit" title="适合页面" aria-label="Fit page">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
            />
          </svg>
        </button>
        <button class="fl-tool-btn" @click="zoomWidth" title="适合宽度" aria-label="Fit width">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12h18M8 8l-4 4 4 4M16 8l4 4-4 4" />
          </svg>
        </button>
      </div>
    </main>
    <!-- TOC overlay -->
    <Transition name="toc">
      <div v-if="showToc" class="fl-toc-overlay" @click.self="closeToc">
        <aside class="fl-toc-panel" @click.stop>
          <div class="fl-toc-header">
            <span class="fl-toc-title">目录</span>
            <button class="fl-btn fl-toc-close" @click="closeToc" aria-label="Close">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="fl-toc-body">
            <div v-if="!flatOutline.length" class="fl-toc-empty">暂无目录</div>
            <div
              v-for="entry in flatOutline"
              :key="entry.item.title"
              class="fl-toc-item"
              :class="{ 'fl-toc-item-active': false }"
              :style="{ paddingLeft: 16 + entry.depth * 18 + 'px' }"
              @click="onOutlineItemClick(entry.item)"
            >
              {{ entry.item.title }}
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fl-view {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: #1a1a1a;
  color: #e0e0e0;
  user-select: none;
  -webkit-user-select: none;
  position: relative;
}

.fl-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
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
  height: 100%;
  overflow: hidden;
  display: flex;
  position: relative;
}

.fl-surface-wrapper {
  position: absolute;
  overflow: auto;
  height: 100%;
  width: 100%;
}

.fl-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  cursor: wait;
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

.fl-toc-toggle.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

/* ── Zoom toolbar ── */

.fl-zoom-toolbar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(20, 20, 20, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  z-index: 20;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}

.fl-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition:
    background 100ms ease,
    color 100ms ease;
}

.fl-tool-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.fl-tool-btn:active {
  background: rgba(255, 255, 255, 0.18);
}

.fl-zoom-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}

.fl-tool-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 4px;
}

/* ── TOC (Outline) ── */

.fl-toc-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
}

.fl-toc-panel {
  width: 300px;
  max-width: 80vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 4px 0 32px rgba(0, 0, 0, 0.6);
}

.fl-toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 48px;
}

.fl-toc-title {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
}

.fl-toc-close {
  width: 32px;
  height: 32px;
  border-radius: 6px;
}

.fl-toc-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.fl-toc-empty {
  padding: 32px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 13px;
}

.fl-toc-item {
  padding: 8px 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition:
    background 100ms ease,
    color 100ms ease;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-toc-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.fl-toc-item:active {
  background: rgba(255, 255, 255, 0.12);
}

.fl-toc-item-active {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

/* ── TOC transitions ── */

.toc-enter-active,
.toc-leave-active {
  transition: opacity 200ms ease;
}

.toc-enter-from,
.toc-leave-to {
  opacity: 0;
}

.toc-enter-active .fl-toc-panel,
.toc-leave-active .fl-toc-panel {
  transition: transform 200ms ease;
}

.toc-enter-from .fl-toc-panel,
.toc-leave-to .fl-toc-panel {
  transform: translateX(-100%);
}
</style>
