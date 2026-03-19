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
  } else if (isVerticalSwipe) {
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

function handleTocClick(chapterId: string) {
  console.log("[handleTocClick] Button clicked! chapterId:", chapterId);
  console.log("[handleTocClick] chapters array:", chapters.value);
  console.log("[handleTocClick] activeModal:", activeModal.value);
  selectChapter(chapterId);
}

function testClick() {
  console.log("[testClick] Test button clicked!");
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
      >
        <h2 class="chapter-heading">{{ currentChapterTitle }}</h2>
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

    <!-- Modal Overlay -->
    <Teleport to="body">
      <div v-if="activeModal" class="modal-overlay" @click.stop="closeModal">
        <div class="modal-content" :class="[`modal-${activeModal}`]" @click.stop>
          <!-- TOC Modal -->
          <div v-if="activeModal === 'toc'" class="modal-body">
            <div class="modal-header">
              <h3>Contents</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div v-if="chapters.length === 0" class="no-chapters">No chapters available</div>
            <ul v-else class="toc-list">
              <li v-for="(ch, index) in chapters" :key="ch.id">
                <button
                  :class="['toc-item', { active: ch.id === currentChapterId }]"
                  @click.stop="handleTocClick(ch.id)"
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
              <h3>Reading Settings</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="settings-content">
              <div class="setting-item">
                <div class="setting-label">
                  <span>Text Size</span>
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
                  <span>Line Height</span>
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
                <label class="setting-label">Theme</label>
                <div class="theme-options">
                  <button
                    :class="['theme-option', { active: settings.theme === 'light' }]"
                    @click="updateSettings({ theme: 'light' })"
                  >
                    <span class="theme-preview theme-preview-light"></span>
                    <span>Light</span>
                  </button>
                  <button
                    :class="['theme-option', { active: settings.theme === 'dark' }]"
                    @click="updateSettings({ theme: 'dark' })"
                  >
                    <span class="theme-preview theme-preview-dark"></span>
                    <span>Dark</span>
                  </button>
                  <button
                    :class="['theme-option', { active: settings.theme === 'sepia' }]"
                    @click="updateSettings({ theme: 'sepia' })"
                  >
                    <span class="theme-preview theme-preview-sepia"></span>
                    <span>Sepia</span>
                  </button>
                </div>
              </div>

              <div class="setting-item">
                <div class="setting-label">
                  <span>Column Width</span>
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
              <h3>Search</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
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
                placeholder="Search in book..."
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
              <span class="results-count"
                >{{ searchResults.length }} result{{ searchResults.length !== 1 ? "s" : "" }}</span
              >
              <button class="clear-highlights" @click="clearHighlights" v-if="hasHighlights">
                Clear highlights
              </button>
            </div>
            <ul class="search-results">
              <li
                v-for="(result, i) in searchResults"
                :key="i"
                class="search-result"
                @click.stop="goToSearchResult(result)"
              >
                <div class="result-header">
                  <span class="result-chapter">{{ result.chapterTitle }}</span>
                  <span class="result-index">{{ i + 1 }}</span>
                </div>
                <p class="result-context" v-html="highlightMatch(result.context)"></p>
              </li>
            </ul>
            <p v-if="searchResults.length === 0 && searchQuery" class="no-results">
              No results found
            </p>
          </div>

          <!-- Bookmarks Modal -->
          <div v-if="activeModal === 'bookmarks'" class="modal-body">
            <div class="modal-header">
              <h3>Bookmarks</h3>
              <button class="modal-close" @click="closeModal">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button class="add-bookmark-btn" @click="addBookmark">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Bookmark
            </button>
            <ul class="bookmarks-list">
              <li v-for="(bm, i) in bookmarks" :key="bm.id" class="bookmark-item">
                <div class="bookmark-content" @click.stop="selectChapter(bm.chapterId)">
                  <div class="bookmark-header">
                    <div class="bookmark-title">{{ bm.title }}</div>
                    <button
                      class="bookmark-delete-btn"
                      @click.stop="deleteBookmark(bm.id, $event)"
                      aria-label="Delete bookmark"
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
            <p v-if="bookmarks.length === 0" class="no-bookmarks">No bookmarks yet</p>
          </div>
        </div>
      </div>
    </Teleport>
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

/* Touch Zones */
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
  touch-action: none;
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
  background: rgba(128, 128, 128, 0.05);
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

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fadeIn 300ms ease;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding-bottom: env(safe-area-inset-bottom, 0);
  touch-action: none;
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
  border-radius: 18px 18px 0 0;
  max-height: 75vh;
  width: 100%;
  max-width: 560px;
  overflow: hidden;
  animation: slideUp 450ms cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.25);
  border-top: 1px solid var(--border-subtle);
  margin: 0 auto;
  max-width: calc(100% - 0px);
  border-radius: 16px 16px 0 0;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
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
  max-height: calc(75vh - 60px);
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--modal-text);
  -webkit-overflow-scrolling: touch;
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
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  background: var(--modal-bg);
  z-index: 1;
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.modal-close:hover {
  background: var(--hover-bg);
  color: var(--modal-text);
}

/* TOC */
.toc-list {
  list-style: none;
  padding: 12px 14px;
  margin: 0;
}

.toc-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  color: var(--modal-text);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
  touch-action: manipulation;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.toc-item:hover {
  background: var(--hover-bg);
}

.toc-item.active {
  background: var(--accent);
  color: #ffffff;
  font-weight: 500;
}

.toc-item.active .toc-number {
  color: rgba(255, 255, 255, 0.7);
}

.toc-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 28px;
  font-feature-settings: "tnum";
}

.toc-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Settings */
.settings-content {
  padding: 18px 22px 32px;
}

.setting-item {
  margin-bottom: 26px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
}

.setting-value {
  color: var(--text-secondary);
  font-feature-settings: "tnum";
}

.font-size-presets {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.font-preset {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-weight: 700;
  color: var(--modal-text);
  transition: all 150ms ease;
  font-family: var(--font-display);
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
  margin-bottom: 12px;
  padding: 12px 14px;
  background: var(--hover-bg);
  border-radius: 8px;
}

.font-a {
  font-size: 13px;
  opacity: 0.4;
  font-family: var(--font-display);
}

.font-medium {
  opacity: 0.65;
  font-family: var(--font-display);
}

.font-large {
  opacity: 1;
  font-family: var(--font-display);
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
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--modal-bg);
  border: 2px solid var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all var(--transition-fast);
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
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
  gap: 8px;
  padding: 14px 10px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--modal-text);
  transition: all 150ms ease;
  font-weight: 500;
}

.theme-option:hover {
  border-color: var(--accent);
}

.theme-option.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.theme-preview {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.theme-preview-light {
  background: linear-gradient(135deg, #fdfcfb 0%, #f5f3ef 100%);
  border: 1px solid #e6e2d8;
}

.theme-preview-dark {
  background: linear-gradient(135deg, #1a1816 0%, #2a2622 100%);
  border: 1px solid #3d3630;
}

.theme-preview-sepia {
  background: linear-gradient(135deg, #f5f0e6 0%, #ebe5d5 100%);
  border: 1px solid #c9bfa8;
}

/* Search */
.search-box {
  display: flex;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  background: var(--hover-bg);
  color: var(--modal-text);
  font-family: var(--font-ui);
}

.search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--modal-bg);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search-submit {
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  transition: all 150ms ease;
}

.search-submit:hover {
  background: color-mix(in srgb, var(--accent) 85%, black);
}

.search-results-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.results-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.clear-highlights {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  font-family: var(--font-ui);
}

.clear-highlights:hover {
  background: var(--hover-bg);
}

.search-results {
  list-style: none;
  padding: 12px 14px;
  margin: 0;
  max-height: 45vh;
  overflow-y: auto;
}

.search-result {
  padding: 14px;
  cursor: pointer;
  border-radius: 10px;
  transition: all 150ms ease;
  margin-bottom: 6px;
  border: 1px solid var(--border-subtle);
}

.search-result:hover {
  background: var(--hover-bg);
  border-color: var(--border);
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
  color: var(--text-secondary);
  background: var(--hover-bg);
  padding: 3px 9px;
  border-radius: 10px;
  font-weight: 600;
}

.search-result p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}

.search-mark {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}

.no-results,
.no-bookmarks {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* Bookmarks */
.add-bookmark-btn {
  width: calc(100% - 40px);
  margin: 16px 20px;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--accent);
  transition: all 150ms ease;
  font-family: var(--font-ui);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.add-bookmark-btn:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.bookmarks-list {
  list-style: none;
  padding: 0 12px 12px;
  margin: 0;
}

.bookmark-item {
  margin-bottom: 8px;
}

.bookmark-content {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 150ms ease;
  background: var(--hover-bg);
}

.bookmark-content:hover {
  background: var(--bg-elevated, var(--modal-bg));
  border-color: var(--border);
}

.bookmark-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.bookmark-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--modal-text);
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
  background: #fef2f2;
  color: #dc2626;
}

.bookmark-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bookmark-chapter {
  font-size: 11px;
  color: var(--accent);
  margin-top: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
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

/* Modal scrollbar */
.modal-body::-webkit-scrollbar {
  width: 5px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
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

  .modal-content {
    border-radius: 14px 14px 0 0;
    max-height: 80vh;
  }

  .modal-header {
    padding: 16px 18px;
  }

  .modal-header h3 {
    font-size: 17px;
  }

  .touch-zones {
    display: none;
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
  .toc-item {
    padding: 16px 18px;
    min-height: 52px;
  }

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

  .modal-header h3 {
    font-size: 16px;
  }

  .setting-item {
    margin-bottom: 20px;
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

  .modal-content {
    max-height: 90vh;
  }

  .modal-body {
    max-height: calc(90vh - 50px);
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
