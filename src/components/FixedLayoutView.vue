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

const chapters = computed(() => readerStore.chapters);
const currentIdx = computed(() =>
  chapters.value.findIndex((c) => c.id === readerStore.currentChapter?.id),
);
const totalPages = computed(() => chapters.value.length);
const displayPage = computed(() => currentIdx.value + 1);
const canPrev = computed(() => currentIdx.value > 0);
const canNext = computed(() => currentIdx.value < totalPages.value - 1);

// ── Navigation ──

function handleClose() {
  navigate("/");
}

function goToChapter(chapterId: string) {
  const chapter = chapters.value.find((c) => c.id === chapterId);
  if (!chapter) return;
  isTransitioning.value = true;
  readerStore.currentChapter = chapter;
  readerStore.chapterProgress = 0;
  readerStore.readingProgress = 0;
  requestAnimationFrame(() => {
    isTransitioning.value = false;
  });
}

function nextPage() {
  if (!canNext.value) return;
  const prev = readerStore.currentChapter;
  if (prev) navStack.push({ chapterId: prev.id, page: currentIdx.value });
  goToChapter(chapters.value[currentIdx.value + 1].id);
}

function prevPage() {
  if (!canPrev.value) return;
  const prev = readerStore.currentChapter;
  if (prev) navStack.push({ chapterId: prev.id, page: currentIdx.value });
  goToChapter(chapters.value[currentIdx.value - 1].id);
}

function handleHistoryBack() {
  const entry = navStack.back();
  if (entry) goToChapter(entry.chapterId);
}

function handleHistoryForward() {
  const entry = navStack.forward();
  if (entry) goToChapter(entry.chapterId);
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
  if (e.key === "ArrowLeft") prevPage();
  else if (e.key === "ArrowRight") nextPage();
  else if (e.key === "Escape") handleClose();
}

// ── Internal link clicks (PDF cross-references) ──

function handleLinkClick(href: string) {
  // Try to interpret as page number
  const pageNum = parseInt(href, 10);
  if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages.value) {
    const ch = chapters.value[pageNum - 1];
    if (ch) goToChapter(ch.id);
    return;
  }
  // Try JSON dest array [pageRef, ...]
  try {
    const arr = JSON.parse(href);
    if (Array.isArray(arr) && arr.length > 0) {
      // External dest — not handled yet
    }
  } catch {
    // Not JSON, ignore
  }
}

function handleReady() {
  // Renderer initialized
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
</style>
