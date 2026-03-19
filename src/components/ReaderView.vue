<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { readerCore } from "../core/reader";
import { searchInBook } from "../search/engine";
import ReaderModal from "./ReaderModal.vue";
import type { Bookmark, SearchResult, ReaderSettings, Chapter, Book } from "../core/types";

// Touch gesture support
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50;

function handleTouchStart(e: TouchEvent) {
  // Ignore touch events inside modals
  const target = e.target as HTMLElement;
  if (target.closest(".modal-overlay") || target.closest(".modal-content")) {
    return;
  }
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e: TouchEvent) {
  // Ignore touch events inside modals
  const target = e.target as HTMLElement;
  if (target.closest(".modal-overlay") || target.closest(".modal-content")) {
    return;
  }

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;

  // Check if this is a significant swipe gesture
  const isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD;
  const isVerticalSwipe = Math.abs(diffY) > SWIPE_THRESHOLD;

  if (activeModal.value) {
    // Only close modal if there's a swipe gesture, not on simple tap
    if (isHorizontalSwipe || isVerticalSwipe) {
      closeModal();
    }
    return;
  }

  // Horizontal swipe takes priority for chapter navigation
  if (isHorizontalSwipe) {
    if (diffX > 0) {
      prevChapter();
    } else {
      nextChapter();
    }
  }
}

const props = defineProps<{
  book: Book;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const chapters = ref<Chapter[]>([]);
const currentChapterId = ref<string | null>(null);
const content = ref("");
const bookmarks = ref<Bookmark[]>([]);
const settings = reactive<ReaderSettings>({
  fontSize: 18,
  fontFamily: "Literata, Georgia, serif",
  lineHeight: 1.6,
  theme: "light",
  margin: 24,
  columnWidth: 720,
});
const searchResults = ref<SearchResult[]>([]);
const searchQuery = ref("");
const readingProgress = ref(0);
const isTransitioning = ref(false);
const currentChapterTitle = ref("");
const chapterProgress = ref(0);
const hasHighlights = ref(false);

const showControls = ref(false);
const activeModal = ref<"toc" | "search" | "bookmarks" | "settings" | null>(null);
let hideControlsTimer: number | null = null;

function resetHideTimer() {
  showControls.value = true;
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  hideControlsTimer = window.setTimeout(() => {
    if (!activeModal.value) {
      showControls.value = false;
    }
  }, 3000);
}

function toggleControls() {
  if (showControls.value && !activeModal.value) {
    // Hide controls if currently visible
    showControls.value = false;
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
  } else {
    // Show controls
    resetHideTimer();
  }
}

function handleTap(e: MouseEvent) {
  const target = e.target as HTMLElement;

  // Ignore clicks inside modals
  if (target.closest(".modal-overlay") || target.closest(".modal-content")) return;

  if (activeModal.value) {
    closeModal();
    return;
  }

  const x = e.clientX;
  const width = window.innerWidth;
  const leftZone = width * 0.2;
  const rightZone = width * 0.8;

  if (x < leftZone) {
    prevChapter();
  } else if (x > rightZone) {
    nextChapter();
  } else {
    toggleControls();
  }
}

function openModal(type: typeof activeModal.value) {
  activeModal.value = type;
  showControls.value = true;
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
}

function closeModal() {
  activeModal.value = null;
  resetHideTimer();
}

async function selectChapter(chapterId: string) {
  console.log("[selectChapter] Called with chapterId:", chapterId);
  isTransitioning.value = true;
  try {
    await readerCore.goToChapter(chapterId);
    console.log("[selectChapter] Chapter loaded successfully");
    closeModal();
    // Allow content to render before fading in
    requestAnimationFrame(() => {
      setTimeout(() => {
        isTransitioning.value = false;
      }, 50);
    });
  } catch (err) {
    console.error("[selectChapter] Error:", err);
  }
}

async function prevChapter() {
  const currentIndex = chapters.value.findIndex((c) => c.id === currentChapterId.value);
  if (currentIndex > 0) {
    await selectChapter(chapters.value[currentIndex - 1].id);
  }
}

async function nextChapter() {
  const currentIndex = chapters.value.findIndex((c) => c.id === currentChapterId.value);
  if (currentIndex < chapters.value.length - 1) {
    await selectChapter(chapters.value[currentIndex + 1].id);
  }
}

async function doSearch() {
  if (!searchQuery.value) return;
  searchResults.value = searchInBook(props.book.id, searchQuery.value, chapters.value);
}

async function goToSearchResult(result: SearchResult) {
  await selectChapter(result.chapterId);
  // Highlight will be applied when content loads
}

function clearHighlights() {
  const marks = document.querySelectorAll(".search-mark");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    while (mark.firstChild) {
      parent?.insertBefore(mark.firstChild, mark);
    }
    mark.remove();
  });
  hasHighlights.value = false;
}

async function addBookmark() {
  const chapter = readerCore.getCurrentChapter();
  if (!chapter) return;
  const article = document.querySelector("article");
  const preview = article?.textContent?.slice(0, 100).replace(/\s+/g, " ").trim() || "";
  await readerCore.addBookmark(
    `Reading position - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    preview,
    getScrollPercentage(),
  );
  closeModal();
}

async function deleteBookmark(bookmarkId: string, e: MouseEvent) {
  e.stopPropagation();
  await readerCore.removeBookmark(bookmarkId);
  bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId);
}

function getScrollPercentage(): number {
  const main = document.querySelector(".reader-view") as HTMLElement;
  if (!main) return 0;
  const { scrollTop, scrollHeight, clientHeight } = main;
  return scrollHeight > 0 ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
}

function handleScroll() {
  readingProgress.value = getScrollPercentage();
  chapterProgress.value = getScrollPercentage();
}

async function updateSettings(newSettings: Partial<ReaderSettings>) {
  Object.assign(settings, newSettings);
  await readerCore.updateSettings(settings);
}

const themeClass = computed(() => `theme-${settings.theme}`);

onMounted(async () => {
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  readerCore.on("book:loaded", async ({ chapters: chs }) => {
    chapters.value = chs;
    if (chs.length > 0 && !currentChapterId.value) {
      await readerCore.goToChapter(chs[0].id);
    }
  });

  // Note: Resources are already embedded as blob URLs in the HTML content
  // by the EPUB parser, so no additional resource loading is needed here

  readerCore.on("chapter:changed", ({ chapterId, content: text }) => {
    console.log("[chapter:changed] Received event, chapterId:", chapterId);
    console.log("[chapter:changed] Content length:", text?.length);
    currentChapterId.value = chapterId;
    content.value = text;
    const chapter = chapters.value.find((c) => c.id === chapterId);
    currentChapterTitle.value = chapter?.title || "";
    readingProgress.value = 0;
    chapterProgress.value = 0;
    // Reset scroll position to top
    const main = document.querySelector(".reader-view") as HTMLElement;
    if (main) {
      main.scrollTop = 0;
    }
    console.log("[chapter:changed] State updated, content.value length:", content.value?.length);
    // Note: Resource blob URLs are already embedded in the HTML content
    // Images and CSS will load automatically from the blob URLs
  });

  readerCore.on("bookmark:added", ({ bookmark }) => {
    bookmarks.value.push(bookmark);
  });

  readerCore.on("bookmark:removed", ({ bookmarkId }) => {
    bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId);
  });

  const result = await readerCore.loadBookById(props.book.id);
  readerCore.getSettings().then((s) => Object.assign(settings, s));

  resetHideTimer();
});

onUnmounted(() => {
  document.removeEventListener("touchstart", handleTouchStart);
  document.removeEventListener("touchend", handleTouchEnd);
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
});
</script>

<template>
  <div class="reader-view-container" :class="themeClass" @click="handleTap">
    <!-- Top Bar (floating) -->
    <header class="reader-header" :class="{ visible: showControls }">
      <button class="back-btn" @click.stop="emit('close')" aria-label="Back to library">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="header-center">
        <h1 class="book-title">{{ book.title }}</h1>
        <span v-if="currentChapterTitle" class="chapter-title">{{ currentChapterTitle }}</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" @click.stop="openModal('settings')" aria-label="Settings">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Progress Bar (refined) -->
    <div class="progress-bar-container">
      <div class="progress-bar" :style="{ width: `${readingProgress}%` }"></div>
    </div>

    <!-- Reader Content -->
    <main class="reader-view" @scroll="handleScroll">
      <article
        class="reader-content"
        :class="{ transitioning: isTransitioning }"
        :style="{
          maxWidth: `${settings.columnWidth}px`,
          margin: '0 auto',
          padding: `${settings.margin}px`,
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: String(settings.lineHeight),
        }"
      >
        <h2 v-if="book.format === 'txt'" class="chapter-heading">{{ currentChapterTitle }}</h2>
        <div class="chapter-body" v-html="content"></div>
      </article>
    </main>

    <!-- Bottom Bar (floating) -->
    <footer class="reader-footer" :class="{ visible: showControls }">
      <button
        class="footer-btn"
        @click.stop="prevChapter"
        :disabled="chapters.findIndex((c) => c.id === currentChapterId) === 0"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        class="footer-btn icon-btn"
        @click.stop="openModal('bookmarks')"
        aria-label="Bookmarks"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      </button>
      <div class="progress-info" @click.stop="openModal('toc')">
        <span class="progress-text">{{ Math.round(readingProgress) }}%</span>
        <span class="chapter-info">{{ currentChapterTitle || "Chapter 1" }}</span>
      </div>
      <button class="footer-btn icon-btn" @click.stop="openModal('search')" aria-label="Search">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </button>
      <button
        class="footer-btn"
        @click.stop="nextChapter"
        :disabled="chapters.findIndex((c) => c.id === currentChapterId) === chapters.length - 1"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </footer>

    <ReaderModal
      v-model="activeModal"
      :chapters="chapters"
      :current-chapter-id="currentChapterId"
      :bookmarks="bookmarks"
      :search-results="searchResults"
      :search-query="searchQuery"
      :settings="settings"
      :has-highlights="hasHighlights"
      @close="closeModal"
      @select-chapter="selectChapter"
      @update-settings="updateSettings"
      @search="doSearch"
      @go-to-search-result="goToSearchResult"
      @clear-highlights="clearHighlights"
      @add-bookmark="addBookmark"
      @delete-bookmark="deleteBookmark"
    />
  </div>
</template>

<style scoped>
.theme-light {
  --reader-bg: #fdfcfb;
  --reader-text: #1f1a17;
  --text-secondary: #6e6659;
  --header-bg: rgba(253, 252, 251, 0.9);
  --border: #e6e2d8;
  --border-subtle: rgba(90, 82, 72, 0.08);
  --hover-bg: #f5f3ef;
  --accent: #8b2e3a;
  --accent-soft: rgba(139, 46, 58, 0.08);
  --modal-bg: #fdfcfb;
  --modal-text: #1f1a17;
  --progress-track: #e6e2d8;
}

.theme-dark {
  --reader-bg: #1a1816;
  --reader-text: #e8e4de;
  --text-secondary: #a8a094;
  --header-bg: rgba(26, 24, 22, 0.9);
  --border: #3d3630;
  --border-subtle: rgba(232, 228, 222, 0.06);
  --hover-bg: #2a2622;
  --accent: #c45d6a;
  --accent-soft: rgba(196, 93, 106, 0.12);
  --modal-bg: #221f1c;
  --modal-text: #e8e4de;
  --progress-track: #3d3630;
}

.theme-sepia {
  --reader-bg: #f5f0e6;
  --reader-text: #3d352a;
  --text-secondary: #7a6f5a;
  --header-bg: rgba(245, 240, 230, 0.9);
  --border: #c9bfa8;
  --border-subtle: rgba(61, 53, 42, 0.08);
  --hover-bg: #ebe5d5;
  --accent: #8b5a3a;
  --accent-soft: rgba(139, 90, 58, 0.1);
  --modal-bg: #f5f0e6;
  --modal-text: #3d352a;
  --progress-track: #c9bfa8;
}

.reader-view-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--reader-bg);
  color: var(--reader-text);
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
  position: relative;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

/* Header */
.reader-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top, 12px));
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 100;
  opacity: 0;
  transform: translateY(-100%);
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  min-height: 52px;
}

.reader-header.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.header-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  max-width: calc(100% - 80px);
}

.book-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  margin: 0;
  letter-spacing: -0.01em;
  color: var(--reader-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.chapter-title {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.back-btn,
.action-btn {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated, var(--reader-bg));
  cursor: pointer;
  color: var(--reader-text);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 36px;
  min-height: 36px;
  -webkit-tap-highlight-color: transparent;
}

.back-btn:hover,
.action-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border);
}

.back-btn:active,
.action-btn:active {
  transform: scale(0.95);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Progress Bar */
.progress-bar-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--progress-track);
  z-index: 101;
  pointer-events: none;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 75%, white) 100%
  );
  transition: width 350ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0 1.5px 1.5px 0;
}

/* Reader View */
.reader-view {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--reader-bg);
  scroll-behavior: smooth;
  position: relative;
  -webkit-overflow-scrolling: touch;
}

.reader-content {
  min-height: 100%;
  transition:
    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
  transform: translateY(0);
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  -webkit-hyphens: auto;
}

.chapter-heading {
  font-family: var(--font-display);
  font-size: 1.8em;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--reader-text);
  text-align: center;
  padding-bottom: 1.5em;
  margin-bottom: 1em;
  border-bottom: 1px solid var(--border-subtle);
}

.chapter-body {
  padding-top: 0.5em;
  white-space: break-spaces;
}

.reader-content.transitioning {
  opacity: 0;
  transform: translateY(8px);
}

.reader-content :deep(p) {
  margin-bottom: 1.2em;
  text-rendering: optimizeLegibility;
}

.reader-content :deep(h1),
.reader-content :deep(h2),
.reader-content :deep(h3),
.reader-content :deep(h4),
.reader-content :deep(h5),
.reader-content :deep(h6) {
  margin-top: 1.8em;
  margin-bottom: 0.8em;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
  font-family: var(--font-display);
}

.reader-content :deep(h1) {
  font-size: 1.8em;
}

.reader-content :deep(h2) {
  font-size: 1.5em;
}

.reader-content :deep(h3) {
  font-size: 1.25em;
}

.reader-content :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  border-radius: 8px;
}

.reader-content :deep(blockquote) {
  margin: 1.5em 0;
  padding: 1em 1.5em;
  border-left: 3px solid var(--accent);
  background: var(--hover-bg);
  border-radius: 0 8px 8px 0;
  font-style: italic;
}

.reader-content :deep(code) {
  background: var(--hover-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.reader-content :deep(pre) {
  background: var(--hover-bg);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1.5em 0;
}

.reader-content :deep(ul),
.reader-content :deep(ol) {
  margin-bottom: 1.2em;
  padding-left: 1.5em;
}

.reader-content :deep(li) {
  margin-bottom: 0.5em;
}

/* Footer */
.reader-footer {
  position: fixed;
  bottom: 0;
  left: env(safe-area-inset-left, 0);
  right: env(safe-area-inset-right, 0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
  background: var(--header-bg);
  border-top: 1px solid var(--border-subtle);
  z-index: 100;
  opacity: 0;
  transform: translateY(100%);
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  min-height: 56px;
}

.reader-footer.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated, var(--reader-bg));
  color: var(--reader-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 40px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.footer-btn.icon-btn {
  padding: 10px 10px;
}

.footer-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--border);
}

.footer-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.footer-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.progress-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 44px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}

.progress-info:hover {
  background: var(--hover-bg);
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--reader-text);
  line-height: 1.2;
}

.chapter-info {
  font-size: 11px;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

/* Scrollbar Styling */
.reader-view::-webkit-scrollbar {
  width: 7px;
}

.reader-view::-webkit-scrollbar-track {
  background: transparent;
}

.reader-view::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.reader-view::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--border) 70%, var(--reader-text));
}

/* Responsive */
@media (max-width: 768px) {
  .reader-header {
    padding: 10px 12px;
    min-height: 48px;
  }

  .book-title {
    font-size: 14px;
  }

  .chapter-title {
    font-size: 11px;
  }

  .reader-footer {
    padding: 8px 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
    gap: 4px;
    min-height: 52px;
  }

  .footer-btn {
    padding: 8px 10px;
    min-width: 36px;
    min-height: 36px;
  }

  .footer-btn.icon-btn {
    padding: 8px 8px;
  }

  .progress-info {
    padding: 6px 8px;
    min-width: 36px;
  }

  .progress-text {
    font-size: 13px;
  }

  .chapter-info {
    font-size: 10px;
    max-width: 80px;
  }

  /* Optimize touch targets for mobile */
  .back-btn,
  .action-btn,
  .footer-btn,
  .progress-info {
    min-width: 44px;
    min-height: 44px;
  }

  /* TOC items need larger touch targets on mobile */
  /* Prevent text zoom on double tap */
  .reader-content {
    touch-action: pan-y;
  }

  /* Adjust reader content padding on mobile */
  .reader-content {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  /* Ensure modal body is scrollable on mobile */
  .modal-body {
    -webkit-overflow-scrolling: touch;
  }
}

/* Small phones */
@media (max-width: 380px) {
  .reader-header {
    padding: 8px 10px;
  }

  .book-title {
    font-size: 13px;
  }

  .reader-footer {
    padding: 6px 6px;
    gap: 2px;
  }

  .footer-btn {
    padding: 8px;
    min-width: 34px;
    min-height: 34px;
  }

  .progress-info {
    padding: 4px 6px;
  }

  .progress-text {
    font-size: 12px;
  }

  .chapter-info {
    font-size: 9px;
    max-width: 60px;
  }
}

/* Landscape orientation on mobile */
@media (max-height: 500px) and (orientation: landscape) {
  .reader-header {
    padding: 8px 16px;
    min-height: 44px;
  }

  .reader-footer {
    padding: 6px 12px;
    min-height: 44px;
  }

  .book-title,
  .chapter-title {
    font-size: 12px;
  }
}

/* Safe area insets for notched devices */
@supports (padding: max(0px)) {
  .reader-header {
    padding-left: max(16px, env(safe-area-inset-left, 0));
    padding-right: max(16px, env(safe-area-inset-right, 0));
    padding-top: max(12px, env(safe-area-inset-top, 0));
  }

  .reader-footer {
    padding-left: max(12px, env(safe-area-inset-left, 0));
    padding-right: max(12px, env(safe-area-inset-right, 0));
  }
}
</style>
