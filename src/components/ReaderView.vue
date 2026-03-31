<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useReaderStore } from "../stores/reader";
import { useUIStore } from "../stores/ui";
import {
  useReaderGestures,
  usePagination,
  useScrollManager,
  useChapterLoader,
  useReaderSearch,
} from "../composables";
import {
  ReaderHeader,
  ReaderFooter,
  ReaderContent,
  ProgressBar,
  PageIndicator,
} from "../components/reader";
import { ModalWrapper } from "../components/modals";
import type { Bookmark, SearchResult, Chapter, Book, BookReadingStats } from "../core/types";
import type { ReaderSettings } from "../core/types";

const props = defineProps<{
  book: Book;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// Stores
const readerStore = useReaderStore();
const uiStore = useUIStore();

// Local state
const stats = ref<BookReadingStats | null>(null);
const isTransitioning = ref(false);
const editingBookmark = ref<Bookmark | null>(null);

// Store computed refs
const chapters = computed(() => readerStore.chapters);
const currentChapterId = computed(() => readerStore.currentChapter?.id || null);
const bookmarks = computed(() => readerStore.bookmarks);
const settings = computed(() => readerStore.settings);
const readingProgress = computed({
  get: () => readerStore.readingProgress,
  set: (val) => readerStore.updateProgress(val, val),
});
const chapterProgress = computed({
  get: () => readerStore.chapterProgress,
  set: (val) => {
    readerStore.chapterProgress = val;
  },
});
const currentChapterTitle = computed(() => readerStore.currentChapter?.title || "");
const showControls = computed({
  get: () => uiStore.showControls,
  set: (val) => uiStore.setControls(val),
});
const activeModal = computed({
  get: () => uiStore.activeModal,
  set: (val) => {
    if (val) uiStore.openModal(val as any);
    else uiStore.closeModal();
  },
});

const openModal = (modal: string) => {
  uiStore.openModal(modal as any);
};

const currentChapterIndex = computed(() => {
  return chapters.value.findIndex((c) => c.id === currentChapterId.value);
});

const isPaginationMode = computed(() => (settings.value.scrollMode || "vertical") === "pagination");

// 全书进度：结合章节位置和章节内进度
const totalBookProgress = computed(() => {
  const total = chapters.value.length;
  if (total <= 1) return Math.max(1, Math.round(chapterProgress.value));

  const current = currentChapterIndex.value;
  const chapterPortion = 100 / total;
  const chapterProgressValue = chapterProgress.value / 100;
  return Math.round(current * chapterPortion + chapterProgressValue * chapterPortion);
});

// Content state for pagination
const content = ref("");

// Initialize composables
const pagination = usePagination();
const chapterLoader = useChapterLoader(
  computed(() => props.book.id),
  chapters,
  currentChapterIndex,
);
const search = useReaderSearch({
  bookId: computed(() => props.book.id),
  chapters,
  isPaginationMode,
  loadedChapters: computed(
    () => new Set(chapterLoader.allLoadedContent.value.map((c) => c.chapterId)),
  ),
  chapterContents: chapterLoader.loadedContents,
});

const scrollManager = useScrollManager({
  isPaginationMode,
  readingProgress,
  chapterProgress,
  updateProgress: (scrollPos, percentage, chapterId) =>
    readerStore.updateProgress(scrollPos, percentage, chapterId),
  onChapterChange: async (chapterId) => {
    const chapter = chapters.value.find((c) => c.id === chapterId);
    if (chapter && chapter.id !== currentChapterId.value) {
      readerStore.currentChapter = chapter;
      readerStore.chapterProgress = 0;
    }
  },
});

// Toggle controls
const toggleControls = () => {
  uiStore.toggleControls();
};

const gestures = useReaderGestures({
  isPaginationMode,
  uiStore,
  handlers: {
    onSwipeLeft: nextPage,
    onSwipeRight: prevPage,
    onTapLeft: prevPage,
    onTapRight: nextPage,
    onTapCenter: toggleControls,
    onTap: toggleControls,
  },
});

// Chapter navigation
const handleSelectChapter = async (chapterId: string) => {
  isTransitioning.value = true;
  const wasShowingControls = showControls.value;
  try {
    await readerStore.goToChapter(chapterId);
    activeModal.value = null;

    if (isPaginationMode.value) {
      content.value = (await readerStore.getCurrentChapterContent()) || "";
      await nextTick();
      await pagination.reset();
    } else {
      await chapterLoader.loadCurrentAndAdjacent(2);
      scrollManager.scrollToChapter(chapterId);
    }

    setTimeout(() => {
      isTransitioning.value = false;
      showControls.value = wasShowingControls;
    }, 50);
  } catch {
    isTransitioning.value = false;
    showControls.value = wasShowingControls;
  }
};

// Pagination handlers
async function nextPage() {
  if (pagination.isPaginating.value) return;

  if (isPaginationMode.value) {
    const atEnd = pagination.nextPage();
    if (atEnd) {
      const currentIndex = currentChapterIndex.value;
      if (currentIndex < chapters.value.length - 1) {
        await handleSelectChapter(chapters.value[currentIndex + 1].id);
      }
    } else {
      readerStore.updateProgress(pagination.getPageProgress(), pagination.getPageProgress());
    }
  } else {
    const currentIndex = currentChapterIndex.value;
    if (currentIndex < chapters.value.length - 1) {
      await handleSelectChapter(chapters.value[currentIndex + 1].id);
    }
  }
}

async function prevPage() {
  if (pagination.isPaginating.value) return;

  if (isPaginationMode.value) {
    if (pagination.currentPage.value > 0) {
      pagination.prevPage();
      readerStore.updateProgress(pagination.getPageProgress(), pagination.getPageProgress());
    } else {
      const currentIndex = currentChapterIndex.value;
      if (currentIndex > 0) {
        await handleSelectChapter(chapters.value[currentIndex - 1].id);
        // Jump to last page of previous chapter
        await nextTick();
        pagination.currentPage.value = pagination.totalPages.value - 1;
      }
    }
  } else {
    const currentIndex = currentChapterIndex.value;
    if (currentIndex > 0) {
      await handleSelectChapter(chapters.value[currentIndex - 1].id);
    }
  }
}

// Search navigation
const navigateToSearchResult = async (result: SearchResult) => {
  if (!result) return;

  if (isPaginationMode.value) {
    await handleSelectChapter(result.chapterId);
  } else {
    await chapterLoader.loadChapter(result.chapterId);
    scrollManager.scrollToChapter(result.chapterId);
  }
};

const goToNextMatch = async () => {
  const index = search.goToNextMatch();
  if (index !== undefined) await navigateToSearchResult(index);
};

const goToPreviousMatch = async () => {
  const index = search.goToPreviousMatch();
  if (index !== undefined) await navigateToSearchResult(index);
};

// Bookmark handlers
const addBookmark = async () => {
  const chapter = readerStore.getCurrentChapter();
  if (!chapter) return;
  const article = document.querySelector("article");
  const preview = article?.textContent?.slice(0, 100).replace(/\s+/g, " ").trim() || "";
  await readerStore.addBookmark(
    `Reading position - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    preview,
    scrollManager.getScrollPercentage(),
  );
  closeModal();
};

const deleteBookmark = async (bookmarkId: string, e: MouseEvent) => {
  e.stopPropagation();
  await readerStore.removeBookmark(bookmarkId);
};

const openBookmarkEditor = (bookmark: Bookmark) => {
  editingBookmark.value = { ...bookmark };
  uiStore.openModal("bookmark-editor");
};

const saveBookmarkEdit = async (updatedBookmark: Bookmark) => {
  await readerStore.updateBookmark(updatedBookmark.id, updatedBookmark);
  uiStore.closeModal();
  editingBookmark.value = null;
};

const closeModal = () => {
  uiStore.closeModal();
};

const updateCSSVariables = () => {
  const contentEl = document.querySelector(".reader-content") as HTMLElement;
  if (contentEl) {
    contentEl.style.setProperty(
      "--paragraph-spacing",
      String(settings.value.paragraphSpacing || 1.2),
    );
  }
};

const updateThemeClass = () => {
  document.documentElement.classList.remove("theme-light", "theme-dark", "theme-sepia");
  document.documentElement.classList.add(`theme-${settings.value.theme}`);
};

// Load stats when stats modal opens
watch(
  () => activeModal.value,
  async (newVal) => {
    if (newVal === "stats") {
      stats.value = await readerStore.getReadingStats(props.book.id);
    }
  },
);

// Watch for scroll mode changes
watch(
  () => settings.value.scrollMode,
  async (newMode) => {
    if (newMode === "vertical" && chapters.value.length > 0) {
      await chapterLoader.loadCurrentAndAdjacent(2);
    } else if (newMode === "pagination" && readerStore.currentChapter) {
      content.value = (await readerStore.getCurrentChapterContent()) || "";
      await nextTick();
      await pagination.reset();
    }
  },
);

// Watch for theme changes
watch(
  () => settings.value.theme,
  () => {
    updateThemeClass();
  },
  { immediate: true },
);

// Watch for chapter changes (pagination mode)
watch(
  () => currentChapterId.value,
  async (newChapterId) => {
    if (!newChapterId || !isPaginationMode.value) return;
    if (readerStore.currentBook) {
      content.value = (await readerStore.getCurrentChapterContent()) || "";
      await nextTick();
      await pagination.reset();
    }
  },
);

// Watch for chapter changes (vertical scroll mode)
watch(
  () => currentChapterId.value,
  async (newChapterId) => {
    if (!newChapterId || isPaginationMode.value) return;
    await chapterLoader.loadCurrentAndAdjacent(2);
  },
);

// Watch for settings changes that affect pagination
watch(
  () => [settings.value.margin, settings.value.fontSize, settings.value.lineHeight],
  async () => {
    if (!isPaginationMode.value) return;
    await nextTick();
    pagination.updateTotalPages();
  },
);

// Display content for pagination mode (CSS column handles splitting)
const displayContent = computed(() => {
  return content.value;
});

// Lifecycle
onMounted(async () => {
  document.addEventListener("touchstart", gestures.handleTouchStart, { passive: true });
  document.addEventListener("touchend", gestures.handleTouchEnd, { passive: true });

  await readerStore.openBook(props.book.id);
  updateThemeClass();
  updateCSSVariables();

  uiStore.setControls(true);

  if (isPaginationMode.value && readerStore.currentChapter) {
    content.value = (await readerStore.getCurrentChapterContent()) || "";
    await nextTick();
    await pagination.reset();
  } else {
    await chapterLoader.loadCurrentAndAdjacent(2);
    // Restore scroll position
    setTimeout(() => {
      const progress = readerStore.readingProgress;
      const chapterId = readerStore.currentChapter?.id;
      if (progress > 0 && chapterId) {
        scrollManager.restoreScrollPosition(progress, chapterId);
      }
    }, 200);
  }
});

onUnmounted(() => {
  document.removeEventListener("touchstart", gestures.handleTouchStart);
  document.removeEventListener("touchend", gestures.handleTouchEnd);
  scrollManager.cleanup();
});
</script>

<template>
  <div class="reader-view-container" @click="gestures.handleTap">
    <!-- Header -->
    <ReaderHeader
      :book-title="book.title"
      :chapter-title="currentChapterTitle"
      :show-controls="showControls"
      @close="emit('close')"
      @open-settings="openModal('settings')"
    />

    <!-- Progress Bar -->
    <ProgressBar :progress="chapterProgress" />

    <!-- Main Content -->
    <ReaderContent
      :content="displayContent"
      :settings="settings"
      :is-pagination-mode="isPaginationMode"
      :current-page="pagination.currentPage.value"
      :loaded-chapters="chapterLoader.allLoadedContent.value"
      :transitioning="isTransitioning"
      @scroll="scrollManager.handleScroll()"
      @resize="pagination.updateTotalPages()"
    />

    <!-- Footer -->
    <ReaderFooter
      :show-controls="showControls"
      :has-highlights="search.hasHighlights.value"
      :search-results="search.searchResults.value"
      :current-result-index="search.currentResultIndex.value"
      :is-pagination-mode="isPaginationMode"
      :current-page="pagination.currentPage.value"
      :pages-count="pagination.totalPages.value"
      :reading-progress="readingProgress"
      :book-progress="totalBookProgress"
      :current-chapter-title="currentChapterTitle"
      :can-prev="
        isPaginationMode
          ? pagination.currentPage.value > 0 || currentChapterIndex > 0
          : currentChapterIndex > 0
      "
      :can-next="
        isPaginationMode
          ? pagination.currentPage.value < pagination.totalPages.value - 1 ||
            currentChapterIndex < chapters.length - 1
          : currentChapterIndex < chapters.length - 1
      "
      @prev-page="prevPage"
      @next-page="nextPage"
      @prev-chapter="handleSelectChapter(chapters[currentChapterIndex - 1]?.id)"
      @next-chapter="handleSelectChapter(chapters[currentChapterIndex + 1]?.id)"
      @open-modal="openModal"
      @go-to-next-match="goToNextMatch"
      @go-to-previous-match="goToPreviousMatch"
      @clear-highlights="search.clearHighlights"
    />

    <!-- Page Indicator -->
    <PageIndicator
      :current-page="pagination.currentPage.value"
      :total-pages="pagination.totalPages.value"
      :show="showControls && isPaginationMode"
    />

    <!-- Modal Wrapper -->
    <ModalWrapper
      :modal-type="activeModal"
      :chapters="chapters"
      :current-chapter-id="currentChapterId"
      :bookmarks="bookmarks"
      :search-results="search.searchResults.value"
      :search-query="search.searchQuery.value"
      :settings="settings"
      :has-highlights="search.hasHighlights.value"
      :stats="stats"
      :total-chapters="chapters.length"
      :editing-bookmark="editingBookmark"
      @close="closeModal"
      @select-chapter="handleSelectChapter"
      @update:search-query="
        (val) => {
          search.searchQuery.value = val;
        }
      "
      @search="search.doSearch"
      @go-to-search-result="navigateToSearchResult"
      @clear-highlights="search.clearHighlights"
      @add-bookmark="addBookmark"
      @delete-bookmark="deleteBookmark"
      @edit-bookmark="(_bookmark) => openBookmarkEditor(_bookmark)"
      @update:bookmark="
        (val) => {
          editingBookmark = val;
        }
      "
      @save-bookmark-edit="saveBookmarkEdit"
      @update-settings="readerStore.updateSettings"
    />
  </div>
</template>

<style scoped>
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

/* Responsive adjustments */
@media (max-width: 768px) {
  .reader-view-container {
    /* Mobile optimizations handled by sub-components */
  }
}

/* Safe area insets for notched devices */
@supports (padding: max(0px)) {
  .reader-view-container {
    padding-left: max(0px, env(safe-area-inset-left, 0));
    padding-right: max(0px, env(safe-area-inset-right, 0));
  }
}
</style>
