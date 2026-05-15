<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef } from "vue";
import FixedLayoutPage from "./reader/FixedLayoutPage.vue";
import { useNavigationStack } from "../composables/useNavigationStack";
import { FixedHost } from "@book/reader-host";
import type { FixedLayoutSurface } from "@book/reader-host";
import { createInitialState } from "@book/reader-core";
import { registerReaderSession, unregisterReaderSession } from "@book/reader-host";
import type { Chapter, ReaderState } from "@book/reader-core";
import type { Book } from "../core/types";
import * as booksStore from "../storage/books";
import { navigate } from "../utils/router";
import { openPdf } from "../utils/pdf-renderer";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../utils/constants";
import { pluginEvents, pluginHooks } from "../plugins/context";
import type { InitConfig } from "../plugins/types";

const props = defineProps<{ book: Book }>();

const navStack = useNavigationStack();

// ── Host & state ──

const fixedLayoutRef = ref<InstanceType<typeof FixedLayoutPage> | null>(null);
const host = ref<FixedHost | null>(null);
const state = shallowRef<ReaderState>(createInitialState());
const isRestoring = ref(true);
const showControls = ref(true);
const showOutline = ref(false);

// Cache raw data across chapter fetches (same file for all chapters)
let cachedRawData: ArrayBuffer | null = null;

// Original outline chapters for TOC display (PDF outline)
const outlineChapters = ref<Array<{ id: string; title: string; pageNumber: number }>>([]);

// ── Derived display state ──

const isPdf = computed(() => props.book.format === "pdf");

const currentChapter = computed(() => state.value.chapters[state.value.currentChapterIndex]);

const currentPageNum = computed(() => {
  if (isPdf.value) {
    const href = currentChapter.value?.href;
    if (href) {
      const n = parseInt(href, 10);
      if (!isNaN(n)) return n;
    }
  }
  return (state.value.currentChapterIndex ?? 0) + 1;
});

const totalPages = computed(() => {
  if (isPdf.value) {
    return host.value?.getSurface().getPageCount() ?? state.value.chapters.length;
  }
  return state.value.chapters.length;
});

const displayPage = computed(() => currentPageNum.value);

const canPrev = computed(() => currentPageNum.value > 1);
const canNext = computed(() => currentPageNum.value < totalPages.value);
const isTransitioning = computed(() => state.value.status === "loading");

const outline = computed(() => {
  if (isPdf.value) return outlineChapters.value;
  return [];
});

// ── Navigation ──

function handleClose() {
  navigate("/");
}

function goToPage(pageNum: number) {
  if (pageNum < 1 || pageNum > totalPages.value) return;
  if (pageNum === currentPageNum.value) return;

  const targetChapter = state.value.chapters.find((c) => c.href === String(pageNum));
  if (!targetChapter) return;

  // Push current position to history
  const prevId = state.value.chapters[state.value.currentChapterIndex]?.id;
  if (prevId) {
    navStack.push({ chapterId: prevId, page: currentPageNum.value });
  }

  host.value?.goToChapter(targetChapter.id);
}

function nextPage() {
  if (canNext.value && host.value) host.value.nextPage();
}

function prevPage() {
  if (canPrev.value && host.value) host.value.prevPage();
}

function toggleOutline() {
  showOutline.value = !showOutline.value;
}

function handleHistoryBack() {
  const entry = navStack.back();
  if (entry) goToPage(entry.page);
}

function handleHistoryForward() {
  const entry = navStack.forward();
  if (entry) goToPage(entry.page);
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

  // Zoom shortcuts (PDF only)
  if (!isPdf.value) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
    e.preventDefault();
    fixedLayoutRef.value?.zoomIn?.();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
    e.preventDefault();
    fixedLayoutRef.value?.zoomOut?.();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
    e.preventDefault();
    fixedLayoutRef.value?.zoomFit?.();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "9") {
    e.preventDefault();
    fixedLayoutRef.value?.zoomWidth?.();
  } else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
    fixedLayoutRef.value?.rotate?.(90);
  }
}

// ── Internal link clicks (PDF cross-references) ──

function handleLinkClick(href: string) {
  const pageNum = parseInt(href, 10);
  if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages.value) {
    goToPage(pageNum);
  }
}

// ── PDF chapter expansion (one chapter per PDF page) ──

function expandPdfChapters(
  fetched: Array<{
    id: string;
    title: string;
    order: number;
    href?: string;
    inToc?: boolean;
  }>,
  totalPdfPages: number,
  bookId: string,
): Chapter[] {
  const result: Chapter[] = [];
  for (let i = 1; i <= totalPdfPages; i++) {
    const outline = fetched.find((ch) => ch.href === String(i));
    result.push({
      id: outline?.id ?? `page-${i}`,
      bookId,
      title: outline?.title ?? `Page ${i}`,
      href: String(i),
      order: result.length,
      inToc: outline?.inToc ?? false,
    });
  }
  return result;
}

// ── Lifecycle ──

onMounted(async () => {
  const fetched = await booksStore.getChapters(props.book.id);
  const surface = fixedLayoutRef.value!;

  let hostChapters: Chapter[];

  if (props.book.format === "pdf") {
    // Expand to one chapter per PDF page for seamless page-by-page navigation
    try {
      const { getZip } = await import("../storage/raw-data");
      const rawData = await getZip(props.book.id);
      if (rawData) {
        cachedRawData = rawData;
        const pdfDoc = await openPdf(rawData);
        const pdfPageCount = pdfDoc.numPages;
        await pdfDoc.destroy();

        // Store outline entries for TOC display
        outlineChapters.value = fetched
          .filter((ch) => ch.href)
          .map((ch) => ({
            id: ch.id,
            title: ch.title,
            pageNumber: parseInt(ch.href!, 10) || 0,
          }));

        hostChapters = expandPdfChapters(fetched, pdfPageCount, props.book.id);
      } else {
        hostChapters = fetched.map((ch) => ({
          id: ch.id,
          bookId: props.book.id,
          title: ch.title,
          order: ch.order,
          href: ch.href,
          inToc: ch.inToc,
        }));
      }
    } catch {
      // Fallback: use store chapters as-is
      hostChapters = fetched.map((ch) => ({
        id: ch.id,
        bookId: props.book.id,
        title: ch.title,
        order: ch.order,
        href: ch.href,
        inToc: ch.inToc,
      }));
    }
  } else {
    hostChapters = fetched.map((ch) => ({
      id: ch.id,
      bookId: props.book.id,
      title: ch.title,
      order: ch.order,
      href: ch.href,
      inToc: ch.inToc,
    }));
  }

  const h = new FixedHost({
    surface: surface as unknown as FixedLayoutSurface,
    fetchChapter: async (bookId, _chapterId) => {
      if (!cachedRawData) {
        const { getZip } = await import("../storage/raw-data");
        cachedRawData = (await getZip(bookId)) ?? null;
      }
      return { html: undefined, rawData: cachedRawData ?? undefined };
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
      <template v-if="isPdf">
        <button
          class="fl-btn fl-zoom-btn"
          @click.stop="fixedLayoutRef?.zoomOut?.()"
          aria-label="Zoom out"
          title="Zoom out (Ctrl+-)"
        >
          −
        </button>
        <button
          class="fl-btn fl-zoom-btn"
          @click.stop="fixedLayoutRef?.zoomFit?.()"
          aria-label="Fit page"
          title="Fit page (Ctrl+0)"
        >
          ⊡
        </button>
        <button
          class="fl-btn fl-zoom-btn"
          @click.stop="fixedLayoutRef?.zoomIn?.()"
          aria-label="Zoom in"
          title="Zoom in (Ctrl++)"
        >
          +
        </button>
        <button
          class="fl-btn fl-zoom-btn"
          @click.stop="toggleOutline"
          aria-label="Table of contents"
          title="Outline"
        >
          ☰
        </button>
      </template>
    </header>

    <main class="fl-content">
      <div class="fl-surface-wrapper">
        <div v-if="isTransitioning" class="fl-loading-overlay" />
        <FixedLayoutPage
          ref="fixedLayoutRef"
          :book-id="book.id"
          :format="book.format as 'pdf' | 'cbz'"
          @link-click="handleLinkClick"
        />
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

    <!-- Outline / TOC overlay -->
    <Transition name="outline">
      <aside v-if="showOutline" class="fl-outline-overlay" @click.self="showOutline = false">
        <div class="fl-outline-panel">
          <header class="fl-outline-header">
            <span>Outline</span>
            <button class="fl-btn" @click.stop="showOutline = false" aria-label="Close outline">
              ✕
            </button>
          </header>
          <nav class="fl-outline-list">
            <template v-if="outline.length">
              <button
                v-for="(item, i) in outline"
                :key="i"
                class="fl-outline-item"
                :class="{ active: item.pageNumber === currentPageNum }"
                @click.stop="
                  goToPage(item.pageNumber);
                  showOutline = false;
                "
              >
                <span class="fl-outline-title">{{ item.title }}</span>
                <span class="fl-outline-page">{{ item.pageNumber }}</span>
              </button>
            </template>
            <p v-else class="fl-outline-empty">No outline available</p>
          </nav>
        </div>
      </aside>
    </Transition>
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

.fl-zoom-btn {
  font-size: 16px;
  font-weight: 600;
  font-family: "SF Mono", "Cascadia Code", monospace;
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

/* ── Outline / TOC overlay ── */

.fl-outline-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-chrome);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: flex-end;
}

.fl-outline-panel {
  width: min(320px, 85vw);
  height: 100%;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
}

.fl-outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top, 0));
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 15px;
  font-weight: 600;
}

.fl-outline-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  overscroll-behavior: contain;
}

.fl-outline-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    color 120ms ease;
  gap: 12px;
}

.fl-outline-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.fl-outline-item.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.fl-outline-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-outline-page {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.fl-outline-empty {
  padding: 24px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

/* outline transition */
.outline-enter-active,
.outline-leave-active {
  transition: opacity 200ms ease;
}

.outline-enter-active .fl-outline-panel,
.outline-leave-active .fl-outline-panel {
  transition: transform 200ms ease;
}

.outline-enter-from,
.outline-leave-to {
  opacity: 0;
}

.outline-enter-from .fl-outline-panel {
  transform: translateX(100%);
}

.outline-leave-to .fl-outline-panel {
  transform: translateX(100%);
}
</style>
