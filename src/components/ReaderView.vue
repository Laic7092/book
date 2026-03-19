<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { readerCore } from "../core/reader";
import { searchInBook } from "../search/engine";
import type { Bookmark, SearchResult, ReaderSettings, Chapter, Book } from "../core/types";

// Touch gesture support
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50;

function handleTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e: TouchEvent) {
  if (activeModal.value) {
    closeModal();
    return;
  }

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;

  // Horizontal swipe takes priority
  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD) {
    if (diffX > 0) {
      prevChapter();
    } else {
      nextChapter();
    }
  } else if (Math.abs(diffY) > SWIPE_THRESHOLD) {
    resetHideTimer();
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

function handleTap(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (activeModal.value) {
    closeModal();
    return;
  }
  if (target.closest(".modal-overlay") || target.closest(".modal-content")) return;

  const x = e.clientX;
  const width = window.innerWidth;
  const leftZone = width * 0.2;
  const rightZone = width * 0.8;

  if (x < leftZone) {
    prevChapter();
  } else if (x > rightZone) {
    nextChapter();
  } else {
    resetHideTimer();
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
  isTransitioning.value = true;
  await readerCore.goToChapter(chapterId);
  closeModal();
  // Allow content to render before fading in
  requestAnimationFrame(() => {
    setTimeout(() => {
      isTransitioning.value = false;
    }, 50);
  });
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

function highlightMatch(context: string): string {
  if (!searchQuery.value) return context;
  const escaped = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return context.replace(regex, '<mark class="search-mark">$1</mark>');
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
    `阅读位置 - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
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

function getChapterTitle(chapterId: string): string {
  const chapter = chapters.value.find((c) => c.id === chapterId);
  return chapter?.title || "";
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

const modalIcons: Record<string, string> = {
  toc: "📑",
  search: "🔍",
  bookmarks: "📌",
  settings: "⚙️",
};

onMounted(async () => {
  document.addEventListener("click", handleTap);
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  readerCore.on("book:loaded", async ({ chapters: chs }) => {
    chapters.value = chs;
    if (chs.length > 0 && !currentChapterId.value) {
      await readerCore.goToChapter(chs[0].id);
    }
  });

  readerCore.on("chapter:changed", ({ chapterId, content: text }) => {
    currentChapterId.value = chapterId;
    content.value = text;
    const chapter = chapters.value.find((c) => c.id === chapterId);
    currentChapterTitle.value = chapter?.title || "";
    readingProgress.value = 0;
    chapterProgress.value = 0;
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
  document.removeEventListener("click", handleTap);
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
          stroke-width="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="header-center">
        <h1 class="book-title">{{ book.title }}</h1>
        <span v-if="currentChapterTitle" class="chapter-title">{{ currentChapterTitle }}</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" @click.stop="openModal('toc')" aria-label="Table of Contents">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="15" y2="12" />
            <line x1="3" y1="18" x2="18" y2="18" />
          </svg>
        </button>
        <button class="action-btn" @click.stop="openModal('settings')" aria-label="Settings">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Progress Bar (subtle) -->
    <div class="progress-bar-container">
      <div class="progress-bar" :style="{ width: `${readingProgress}%` }"></div>
    </div>

    <!-- Reader Content -->
    <main class="reader-view" @scroll="handleScroll">
      <!-- Touch zones overlay (visual feedback on hover) -->
      <div class="touch-zones" :class="{ visible: showControls }">
        <div class="touch-zone left" title="Previous chapter"></div>
        <div class="touch-zone center" title="Toggle controls"></div>
        <div class="touch-zone right" title="Next chapter"></div>
      </div>
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
        v-html="content"
      ></article>
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
        <span class="btn-text">Prev</span>
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
          stroke-width="2"
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
          stroke-width="2"
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
        <span class="btn-text">Next</span>
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

    <!-- Modal Overlay -->
    <Teleport to="body">
      <div v-if="activeModal" class="modal-overlay" @click.stop="closeModal">
        <div class="modal-content" :class="[`modal-${activeModal}`]" @click.stop>
          <!-- TOC Modal -->
          <div v-if="activeModal === 'toc'" class="modal-body">
            <div class="modal-header">
              <h3>目录</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul class="toc-list">
              <li v-for="(ch, index) in chapters" :key="ch.id">
                <button
                  :class="['toc-item', { active: ch.id === currentChapterId }]"
                  @click="selectChapter(ch.id)"
                >
                  <span class="toc-number">{{ index + 1 }}</span>
                  <span class="toc-title">{{ ch.title }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Settings Modal -->
          <div v-if="activeModal === 'settings'" class="modal-body">
            <div class="modal-header">
              <h3>阅读设置</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="settings-content">
              <div class="setting-item">
                <div class="setting-label">
                  <span>字体大小</span>
                  <span class="setting-value">{{ settings.fontSize }}px</span>
                </div>
                <div class="font-size-presets">
                  <button
                    v-for="size in [14, 16, 18, 20, 22, 24]"
                    :key="size"
                    :class="['font-preset', { active: settings.fontSize === size }]"
                    @click="updateSettings({ fontSize: size })"
                  >
                    A
                  </button>
                </div>
                <div class="font-size-preview">
                  <span class="font-a">A</span>
                  <span class="font-medium" :style="{ fontSize: `${settings.fontSize * 0.8}px` }"
                    >A</span
                  >
                  <span class="font-large" :style="{ fontSize: `${settings.fontSize * 1.2}px` }"
                    >A</span
                  >
                </div>
                <input
                  type="range"
                  min="14"
                  max="28"
                  :value="settings.fontSize"
                  @input="
                    updateSettings({ fontSize: Number(($event.target as HTMLInputElement).value) })
                  "
                  class="range-input"
                />
              </div>

              <div class="setting-item">
                <div class="setting-label">
                  <span>行高</span>
                  <span class="setting-value">{{ settings.lineHeight }}</span>
                </div>
                <input
                  type="range"
                  min="1.2"
                  max="2.2"
                  step="0.1"
                  :value="settings.lineHeight"
                  @input="
                    updateSettings({
                      lineHeight: Number(($event.target as HTMLInputElement).value),
                    })
                  "
                  class="range-input"
                />
              </div>

              <div class="setting-item">
                <label class="setting-label">主题</label>
                <div class="theme-options">
                  <button
                    :class="['theme-option', { active: settings.theme === 'light' }]"
                    @click="updateSettings({ theme: 'light' })"
                  >
                    <span class="theme-preview theme-preview-light"></span>
                    <span>白天</span>
                  </button>
                  <button
                    :class="['theme-option', { active: settings.theme === 'dark' }]"
                    @click="updateSettings({ theme: 'dark' })"
                  >
                    <span class="theme-preview theme-preview-dark"></span>
                    <span>夜间</span>
                  </button>
                  <button
                    :class="['theme-option', { active: settings.theme === 'sepia' }]"
                    @click="updateSettings({ theme: 'sepia' })"
                  >
                    <span class="theme-preview theme-preview-sepia"></span>
                    <span>护眼</span>
                  </button>
                </div>
              </div>

              <div class="setting-item">
                <div class="setting-label">
                  <span>阅读宽度</span>
                  <span class="setting-value">{{ settings.columnWidth }}px</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="900"
                  step="25"
                  :value="settings.columnWidth"
                  @input="
                    updateSettings({
                      columnWidth: Number(($event.target as HTMLInputElement).value),
                    })
                  "
                  class="range-input"
                />
              </div>
            </div>
          </div>

          <!-- Search Modal -->
          <div v-if="activeModal === 'search'" class="modal-body">
            <div class="modal-header">
              <h3>搜索</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="search-box">
              <input
                id="search-input"
                v-model="searchQuery"
                type="text"
                placeholder="搜索内容..."
                @keyup.enter="doSearch"
                class="search-input"
              />
              <button class="search-submit" @click="doSearch">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>
            </div>
            <div class="search-results-info" v-if="searchResults.length > 0">
              <span class="results-count">{{ searchResults.length }} 个结果</span>
              <button class="clear-highlights" @click="clearHighlights" v-if="hasHighlights">
                清除高亮
              </button>
            </div>
            <ul class="search-results">
              <li
                v-for="(result, i) in searchResults"
                :key="i"
                class="search-result"
                @click="goToSearchResult(result)"
              >
                <div class="result-header">
                  <span class="result-chapter">{{ result.chapterTitle }}</span>
                  <span class="result-index">{{ i + 1 }}</span>
                </div>
                <p class="result-context" v-html="highlightMatch(result.context)"></p>
              </li>
            </ul>
            <p v-if="searchResults.length === 0 && searchQuery" class="no-results">未找到结果</p>
          </div>

          <!-- Bookmarks Modal -->
          <div v-if="activeModal === 'bookmarks'" class="modal-body">
            <div class="modal-header">
              <h3>书签</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button class="add-bookmark-btn" @click="addBookmark"><span>+</span> 添加书签</button>
            <ul class="bookmarks-list">
              <li v-for="(bm, i) in bookmarks" :key="bm.id" class="bookmark-item">
                <div class="bookmark-content" @click="selectChapter(bm.chapterId)">
                  <div class="bookmark-header">
                    <div class="bookmark-title">{{ bm.title }}</div>
                    <button
                      class="bookmark-delete-btn"
                      @click="deleteBookmark(bm.id, $event)"
                      aria-label="删除书签"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div class="bookmark-preview">{{ bm.contentPreview }}</div>
                  <div class="bookmark-chapter">{{ getChapterTitle(bm.chapterId) }}</div>
                </div>
              </li>
            </ul>
            <p v-if="bookmarks.length === 0" class="no-bookmarks">暂无书签</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.theme-light {
  --reader-bg: #ffffff;
  --reader-text: #1d1d1f;
  --text-secondary: #6e6e73;
  --header-bg: #ffffff;
  --border: #d2d2d7;
  --hover-bg: #f5f5f7;
  --accent: #007aff;
  --modal-bg: #ffffff;
  --modal-text: #1d1d1f;
}

.theme-dark {
  --reader-bg: #000000;
  --reader-text: #f5f5f7;
  --text-secondary: #98989d;
  --header-bg: #1c1c1e;
  --border: #48484a;
  --hover-bg: #2c2c2e;
  --accent: #0a84ff;
  --modal-bg: #2c2c2e;
  --modal-text: #f5f5f7;
}

.theme-sepia {
  --reader-bg: #f8f4e9;
  --reader-text: #2d2920;
  --text-secondary: #5c5545;
  --header-bg: #f8f4e9;
  --border: #c9c0a8;
  --hover-bg: #efe9d5;
  --accent: #b86b00;
  --modal-bg: #f4ecd8;
  --modal-text: #2d2920;
}

.reader-view-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--reader-bg);
  color: var(--reader-text);
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
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
  padding: 12px 20px;
  background: var(--header-bg);
  border-bottom: 0.5px solid var(--border);
  z-index: 100;
  opacity: 0;
  transform: translateY(-100%);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px);
  background: color-mix(in srgb, var(--header-bg) 95%, transparent);
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
  gap: 1px;
}

.book-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.chapter-title {
  font-size: 12px;
  opacity: 0.55;
}

.back-btn,
.action-btn {
  padding: 10px;
  border-radius: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--accent);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.back-btn::before,
.action-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--hover-bg);
  opacity: 0;
  transform: scale(0.8);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 10px;
}

.back-btn:hover::before,
.action-btn:hover::before {
  opacity: 1;
  transform: scale(1);
}

.back-btn:active,
.action-btn:active {
  transform: scale(0.95);
}

.header-actions {
  display: flex;
  gap: 4px;
}

/* Progress Bar */
.progress-bar-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--border);
  z-index: 101;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 70%, white) 100%
  );
  transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0 2px 2px 0;
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 50%, transparent);
}

/* Reader View */
.reader-view {
  flex: 1;
  overflow: auto;
  background-color: var(--reader-bg);
  scroll-behavior: smooth;
  position: relative;
}

/* Touch Zones - Visual Feedback */
.touch-zones {
  position: absolute;
  inset: 0;
  display: flex;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 1;
}

.touch-zones.visible {
  opacity: 1;
}

.touch-zone {
  pointer-events: auto;
  transition: background-color 0.2s ease;
}

.touch-zone.left,
.touch-zone.right {
  flex: 1;
  max-width: 20%;
}

.touch-zone.center {
  flex: 2;
}

.touch-zone.left:hover,
.touch-zone.right:hover {
  background: rgba(128, 128, 128, 0.08);
}

@media (hover: none) {
  .touch-zones {
    display: none;
  }
}

.reader-content {
  min-height: 100%;
  transition:
    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
  transform: translateY(0);
}

.reader-content.transitioning {
  opacity: 0;
  transform: translateY(10px);
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
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--header-bg);
  border-top: 0.5px solid var(--border);
  z-index: 100;
  opacity: 0;
  transform: translateY(100%);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px);
  background: color-mix(in srgb, var(--header-bg) 95%, transparent);
}

.reader-footer.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.footer-btn.icon-btn {
  padding: 10px 12px;
}

.btn-text {
  font-weight: 600;
}

.footer-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--hover-bg);
  opacity: 0;
  transform: scale(0.9);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 14px;
}

.footer-btn:hover:not(:disabled)::before {
  opacity: 1;
  transform: scale(1);
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
  padding: 8px 16px;
  border-radius: 14px;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.progress-info::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--hover-bg);
  opacity: 0;
  transform: scale(0.9);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 14px;
}

.progress-info:hover::before {
  opacity: 1;
  transform: scale(1);
}

.progress-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--reader-text);
}

.chapter-info {
  font-size: 11px;
  color: var(--accent);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fadeIn 300ms ease;
  backdrop-filter: blur(8px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-content {
  background: var(--modal-bg);
  color: var(--modal-text);
  border-radius: 16px 16px 0 0;
  max-height: 75vh;
  width: 100%;
  max-width: 520px;
  overflow: hidden;
  animation: slideUp 400ms cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.3);
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.modal-body {
  padding: 0;
  max-height: 85vh;
  overflow-y: auto;
  color: var(--modal-text);
}

.modal-body h3,
.modal-body .setting-label,
.modal-body .setting-value,
.modal-body .result-chapter,
.modal-body .bookmark-title,
.modal-body .toc-title,
.modal-body .toc-number {
  color: var(--modal-text);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 0.5px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--modal-bg);
  z-index: 1;
}

.modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--accent);
  transition: all 150ms ease;
}

.modal-close:hover {
  background: var(--hover-bg);
}

/* TOC */
.toc-list {
  list-style: none;
  padding: 8px 12px;
  margin: 0;
}

.toc-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 15px;
  color: var(--modal-text);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.toc-item::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--hover-bg);
  opacity: 0;
  transform: scale(0.95);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 12px;
}

.toc-item:hover::before {
  opacity: 1;
  transform: scale(1);
}

.toc-item.active {
  background: var(--accent);
  color: #ffffff;
  font-weight: 500;
}

.toc-item.active::before {
  background: transparent;
}

.toc-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 24px;
}

.toc-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Settings */
.settings-content {
  padding: 16px 20px 32px;
}

.setting-item {
  margin-bottom: 24px;
}

.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
}

.setting-value {
  color: var(--text-secondary);
}

.font-size-presets {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.font-preset {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  font-weight: 700;
  color: var(--modal-text);
  transition: all 150ms ease;
}

.font-preset:hover {
  border-color: var(--accent);
  background: var(--hover-bg);
}

.font-preset.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.font-size-preview {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
  padding: 10px 12px;
  background: var(--hover-bg);
  border-radius: 8px;
}

.font-a {
  font-size: 14px;
  opacity: 0.4;
}
.font-medium {
  opacity: 0.6;
}
.font-large {
  opacity: 1;
}

.range-input {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  appearance: none;
  cursor: pointer;
}

.range-input::-webkit-slider-thumb {
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.theme-options {
  display: flex;
  gap: 10px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--modal-text);
  transition: all 150ms ease;
}

.theme-option:hover,
.theme-option.active {
  border-color: var(--accent);
}

.theme-option.active {
  background: var(--hover-bg);
}

.theme-preview {
  width: 32px;
  height: 32px;
  border-radius: 6px;
}

.theme-preview-light {
  background: #ffffff;
  border: 1px solid #e5e5e7;
}
.theme-preview-dark {
  background: #1c1c1e;
  border: 1px solid #38383a;
}
.theme-preview-sepia {
  background: #f8f4e9;
  border: 1px solid #e0d9c4;
}

.setting-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.action-btn-full {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent);
  transition: all 150ms ease;
}

.action-btn-full:hover {
  background: var(--hover-bg);
}

/* Search */
.search-box {
  display: flex;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 0.5px solid var(--border);
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  background: var(--modal-bg);
  color: var(--modal-text);
}

.search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-submit {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  transition: all 150ms ease;
}

.search-submit:hover {
  background: var(--accent-hover, color-mix(in srgb, var(--accent) 85%, black));
}

.search-results-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--border);
}

.results-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.clear-highlights {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  transition: all 150ms ease;
}

.clear-highlights:hover {
  background: var(--hover-bg);
}

.search-results {
  list-style: none;
  padding: 8px 12px;
  margin: 0;
  max-height: 50vh;
  overflow-y: auto;
}

.search-result {
  padding: 14px;
  cursor: pointer;
  border-radius: 10px;
  transition: all 150ms ease;
  margin-bottom: 6px;
}

.search-result:hover {
  background: var(--hover-bg);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.result-chapter {
  font-size: 13px;
  font-weight: 600;
  color: var(--reader-text);
}

.result-index {
  font-size: 11px;
  color: var(--modal-text);
  opacity: 0.6;
  background: var(--border);
  padding: 2px 8px;
  border-radius: 10px;
}

.search-result p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}

.search-mark {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

.no-results,
.no-bookmarks {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* Bookmarks */
.add-bookmark-btn {
  width: calc(100% - 32px);
  margin: 12px 16px;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--accent);
  transition: all 150ms ease;
}

.add-bookmark-btn:hover {
  background: var(--hover-bg);
}

.bookmarks-list {
  list-style: none;
  padding: 0 8px 8px;
  margin: 0;
}

.bookmark-item {
  margin-bottom: 6px;
}

.bookmark-content {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 150ms ease;
}

.bookmark-content:hover {
  background: var(--hover-bg);
}

.bookmark-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.bookmark-title {
  font-weight: 500;
  font-size: 14px;
}

.bookmark-delete-btn {
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  opacity: 0;
  transition: all 150ms ease;
}

.bookmark-content:hover .bookmark-delete-btn {
  opacity: 1;
}

.bookmark-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.bookmark-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bookmark-chapter {
  font-size: 11px;
  color: var(--accent);
  margin-top: 6px;
  font-weight: 500;
}

/* Scrollbar Styling */
.reader-view::-webkit-scrollbar {
  width: 8px;
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

/* Modal scrollbar */
.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

/* Responsive */
@media (max-width: 768px) {
  .reader-header {
    padding: 10px 14px;
  }

  .book-title {
    font-size: 14px;
  }

  .reader-footer {
    padding: 8px 14px;
  }

  .modal-content {
    border-radius: 12px 12px 0 0;
  }

  .touch-zones {
    display: none;
  }
}
</style>
