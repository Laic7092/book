<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useReaderStore } from "../stores/reader";
import FixedLayoutReader from "./reader/FixedLayoutReader.vue";
import { useNavigationStack } from "../composables";
import type { Book } from "../core/types";
import { navigate } from "../router";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../config/constants";

const props = defineProps<{ book: Book }>();

const readerStore = useReaderStore();
const navStack = useNavigationStack();

const fixedLayoutRef = ref<InstanceType<typeof FixedLayoutReader> | null>(null);
const isTransitioning = ref(false);
const showControls = ref(true);
const pdfPageCount = ref(0);
const showOutline = ref(false);

const chapters = computed(() => readerStore.chapters);
const isPdf = computed(() => props.book.format === "pdf");

// Source of truth: PDF uses href (page number), CBZ uses chapter index
const currentPageNum = computed(() => {
  if (isPdf.value) {
    const href = readerStore.currentChapter?.href;
    if (href) {
      const n = parseInt(href, 10);
      if (!isNaN(n)) return n;
    }
  }
  // CBZ or fallback: use chapter position in array
  const idx = chapters.value.findIndex((c) => c.id === readerStore.currentChapter?.id);
  return idx >= 0 ? idx + 1 : 1;
});

const displayPage = computed(() => currentPageNum.value);
const totalPages = computed(() => {
  if (isPdf.value) return pdfPageCount.value || chapters.value.length;
  return chapters.value.length;
});
const canPrev = computed(() => currentPageNum.value > 1);
const canNext = computed(() => currentPageNum.value < totalPages.value);

const outline = computed(() => fixedLayoutRef.value?.getOutline?.() ?? []);

function toggleOutline() {
  showOutline.value = !showOutline.value;
}

// ── Navigation ──

function handleClose() {
  navigate("/");
}

function goToPage(pageNum: number) {
  if (pageNum < 1 || pageNum > totalPages.value) return;
  if (pageNum === currentPageNum.value) return;

  const chapter = isPdf.value
    ? chapters.value.find((c) => c.href === String(pageNum))
    : chapters.value[pageNum - 1];
  const prevChapter = readerStore.currentChapter;
  if (prevChapter) navStack.push({ chapterId: prevChapter.id, page: currentPageNum.value });

  isTransitioning.value = true;

  if (chapter) {
    readerStore.currentChapter = chapter;
  } else {
    // Page without a dedicated chapter (outline-based PDF): create a synthetic one
    readerStore.currentChapter = {
      id: `page-${pageNum}`,
      bookId: props.book.id,
      title: `Page ${pageNum}`,
      href: String(pageNum),
      order: pageNum - 1,
    };
  }
  readerStore.chapterProgress = 0;
  readerStore.readingProgress = 0;

  requestAnimationFrame(() => {
    isTransitioning.value = false;
  });
}

function nextPage() {
  if (canNext.value) goToPage(currentPageNum.value + 1);
}

function prevPage() {
  if (canPrev.value) goToPage(currentPageNum.value - 1);
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
  const el = target as Element;
  return !!(
    el.closest("button") ||
    el.closest("input") ||
    el.closest("textarea") ||
    el.closest("select") ||
    el.closest("a[href]")
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
    return;
  }
}

function handleReady() {
  pdfPageCount.value = fixedLayoutRef.value?.getPageCount?.() ?? 0;
}

// ── Lifecycle ──

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  navStack.reset();
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
      <FixedLayoutReader
        ref="fixedLayoutRef"
        :book-id="book.id"
        :format="book.format as 'pdf' | 'cbz'"
        :chapter-href="readerStore.currentChapter?.href"
        :chapter-loading="isTransitioning"
        @ready="handleReady"
        @link-click="handleLinkClick"
      />
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
  z-index: 101;
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
  z-index: 200;
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
