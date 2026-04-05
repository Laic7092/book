<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
  type ComponentInstance,
} from "vue";
import { useReaderStore } from "../stores/reader";
import { useBookmarksStore } from "../stores/bookmarks";
import { useUIStore } from "../stores/ui";
import { useSettingsStore } from "../stores/settings";
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
import {
  generateCfiFromElement,
  generateCfiFromRange,
  generateCfiFromCharOffset,
  navigateToCfi,
  resolveCfi,
  parseCfi,
} from "../utils/epub-cfi";
import type { ParsedCfi, CfiStep } from "../utils/epub-cfi";

const props = defineProps<{
  book: Book;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// Stores
const readerStore = useReaderStore();
const bookmarksStore = useBookmarksStore();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();

// Template refs
const readerContentRef = ref<ComponentInstance<typeof ReaderContent> | null>(null);
// 从 iframe 获取容器引用（用于分页测量的容器）
const articleEl = computed(() => {
  // 对于 iframe 模式，我们使用容器 ref（main 元素）
  // usePagination 会自己创建隐藏的测量 iframe
  return readerContentRef.value?.$el ?? null;
});

// Local state
const stats = ref<BookReadingStats | null>(null);
const isTransitioning = ref(false);
const currentChapterResources = ref<HTMLElement[]>([]);

const openModal = (modal: string) => {
  uiStore.openModal(modal as any);
};

const closeModal = () => {
  uiStore.closeModal();
};

const currentChapterIndex = computed(() => {
  return readerStore.chapters.findIndex((c) => c.id === readerStore.currentChapter?.id);
});

const isPaginationMode = computed(
  () => (settingsStore.settings.scrollMode || "vertical") === "pagination",
);

// 章节进度：分页模式自动计算，滚动模式从 store 读取
const chapterProgress = computed(() => {
  if (isPaginationMode.value) {
    const total = pagination.totalPages.value;
    if (total <= 1) return 100;
    return ((pagination.currentPage.value + 1) / total) * 100;
  }
  return readerStore.chapterProgress;
});

// 阅读进度：自动计算
const readingProgress = computed(() => {
  const total = readerStore.chapters.length;
  if (total <= 1) return chapterProgress.value;

  const current = currentChapterIndex.value;
  const chapterPortion = 100 / total;
  return Math.round(current * chapterPortion + (chapterProgress.value / 100) * chapterPortion);
});

// 全书进度：结合章节位置和章节内进度
const totalBookProgress = computed(() => {
  const total = readerStore.chapters.length;
  if (total <= 1) return Math.max(1, Math.round(chapterProgress.value));

  const current = currentChapterIndex.value;
  const chapterPortion = 100 / total;
  const chapterProgressValue = chapterProgress.value / 100;
  return Math.round(current * chapterPortion + chapterProgressValue * chapterPortion);
});

// Initialize composables
const pagination = usePagination(
  articleEl,
  props.book.id,
  readerStore.$state.chapters,
  computed(() => settingsStore.settings),
);

// Display content for pagination mode
const displayContent = computed(() => {
  if (isPaginationMode.value) {
    return pagination.currentHtml.value;
  }
  return "";
});
const chapterLoader = useChapterLoader(
  computed(() => props.book.id),
  readerStore.$state,
  currentChapterIndex,
);
const search = useReaderSearch({
  bookId: computed(() => props.book.id),
  chapters: computed(() => readerStore.chapters),
  isPaginationMode,
  loadedChapters: computed(
    () => new Set(chapterLoader.allLoadedContent.value.map((c) => c.chapterId)),
  ),
  chapterContents: chapterLoader.loadedContents,
});

const scrollManager = useScrollManager({
  isPaginationMode,
  onProgressUpdate: (reading, chapter) => readerStore.updateProgress(reading, chapter),
  onChapterChange: async (chapterId) => {
    const chapter = readerStore.chapters.find((c) => c.id === chapterId);
    if (chapter && chapter.id !== readerStore.currentChapter?.id) {
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
    onTap: () => toggleControls(),
  },
});

// Chapter navigation
const handleSelectChapter = async (chapterId: string, targetPage: number = 0) => {
  isTransitioning.value = true;
  const wasShowingControls = uiStore.showControls;
  try {
    await readerStore.goToChapter(chapterId);
    closeModal();

    if (isPaginationMode.value) {
      const content = await readerStore.getCurrentChapterContent();
      const html = content?.html || "";
      const resources = content?.resources || [];
      await pagination.paginate(chapterId, { html, targetPage });
      // 将资源传递给 ReaderContent
      currentChapterResources.value = resources;
    } else {
      await chapterLoader.loadCurrentAndAdjacent(2);
      scrollManager.scrollToChapter(chapterId);
    }

    setTimeout(() => {
      isTransitioning.value = false;
      uiStore.showControls = wasShowingControls;
    }, 50);
  } catch {
    isTransitioning.value = false;
    uiStore.showControls = wasShowingControls;
  }
};

async function handleResize() {
  await reRenderContent();
}

// Pagination handlers
async function nextPage() {
  if (pagination.isPaginating.value) return;

  if (isPaginationMode.value) {
    const movedToNext = pagination.nextPage();
    if (!movedToNext) {
      const currentIndex = currentChapterIndex.value;
      if (currentIndex < readerStore.chapters.length - 1) {
        await handleSelectChapter(readerStore.chapters[currentIndex + 1].id, 0);
      }
    }
  } else {
    const currentIndex = currentChapterIndex.value;
    if (currentIndex < readerStore.chapters.length - 1) {
      await handleSelectChapter(readerStore.chapters[currentIndex + 1].id);
    }
  }
}

async function prevPage() {
  if (pagination.isPaginating.value) return;

  if (isPaginationMode.value) {
    if (pagination.currentPage.value > 0) {
      pagination.prevPage();
    } else {
      const currentIndex = currentChapterIndex.value;
      if (currentIndex > 0) {
        await handleSelectChapter(readerStore.chapters[currentIndex - 1].id, -1);
      }
    }
  } else {
    const currentIndex = currentChapterIndex.value;
    if (currentIndex > 0) {
      await handleSelectChapter(readerStore.chapters[currentIndex - 1].id);
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
  const article = articleEl.value;
  if (!article) return;

  let cfi: string;
  let preview: string;

  if (isPaginationMode.value) {
    const fullHtml = pagination.rawHtml.value;
    if (!fullHtml) return;

    const currentPage = pagination.currentPage.value;
    const pages = pagination.pages.value;
    let charOffset = 0;
    for (let i = 0; i < currentPage; i++) {
      const pageText = pages[i]?.html.replace(/<[^>]*>/g, "") || "";
      charOffset += pageText.length;
    }
    // 预留给下一页
    charOffset += 1;

    cfi = generateCfiFromCharOffset(
      readerStore.currentChapter?.order ?? 0,
      createTempContainer(fullHtml),
      charOffset,
    );

    const plainText = fullHtml
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    preview = extractPreviewAround(plainText, charOffset);
  } else {
    const viewportCenter = article.getBoundingClientRect().top + article.clientHeight * 0.2;
    const elementAtPoint = document.elementFromPoint(
      article.getBoundingClientRect().left + 20,
      viewportCenter,
    );

    let targetEl: Element;
    if (elementAtPoint && article.contains(elementAtPoint)) {
      targetEl = elementAtPoint.closest("p, h1, h2, h3, h4, h5, h6, li, div, section") || article;
    } else {
      targetEl = article;
    }

    cfi = generateCfiFromElement(readerStore.currentChapter?.order ?? 0, targetEl, article);

    const plainText = article.textContent?.replace(/\s+/g, " ").trim() || "";
    const targetText = targetEl.textContent?.replace(/\s+/g, " ").trim() || "";
    const offsetInArticle = plainText.indexOf(targetText.slice(0, 30));
    preview = extractPreviewAround(plainText, Math.max(0, offsetInArticle));
  }

  await bookmarksStore.addBookmark(props.book.id, chapter.id, cfi, chapter.title, preview);
  closeModal();
};

function extractPreviewAround(text: string, offset: number): string {
  return text.slice(Math.max(offset - 1, 0), offset + 50);
}

function createTempContainer(html: string): Element {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

const deleteBookmark = async (bookmarkId: string, e: MouseEvent) => {
  e.stopPropagation();
  await bookmarksStore.removeBookmark(bookmarkId);
};

const navigateToBookmark = async (bookmark: Bookmark) => {
  const parsed = parseCfi(bookmark.cfi);
  if (!parsed) return;

  const targetChapter = readerStore.chapters.find((c) => c.order === parsed.spineIndex);
  if (!targetChapter) {
    const fallbackChapter = readerStore.chapters.find((c) => c.id === bookmark.chapterId);
    if (!fallbackChapter) return;
    await handleSelectChapter(fallbackChapter.id);
    return;
  }

  if (targetChapter.id !== readerStore.currentChapter?.id) {
    await handleSelectChapter(targetChapter.id);
    await nextTick();
  }

  if (isPaginationMode.value) {
    const fullHtml = pagination.rawHtml.value;
    if (!fullHtml) return;

    // Calculate absolute character offset from the CFI
    const tempContainer = createTempContainer(fullHtml);
    const target = resolveCfi(bookmark.cfi, tempContainer);
    tempContainer.remove();

    if (!target) {
      pagination.goToPage(0);
      closeModal();
      return;
    }

    // Use the textOffset from the parsed CFI directly
    // Calculate absolute char offset by walking text nodes up to the target
    const charOffset = calculateAbsoluteCharOffset(fullHtml, parsed);

    if (charOffset !== null) {
      let textAccum = 0;
      for (const page of pagination.pages.value) {
        const pageText = page.html.replace(/<[^>]*>/g, "");
        const pageEnd = textAccum + pageText.length;
        if (charOffset >= textAccum && charOffset < pageEnd) {
          pagination.goToPage(page.index);
          closeModal();
          return;
        }
        textAccum += pageText.length;
      }
    }

    pagination.goToPage(0);
    closeModal();
  } else {
    if (!articleEl.value) return;
    const success = navigateToCfi(bookmark.cfi, articleEl.value);
    if (success) {
      closeModal();
    }
  }
};

function calculateAbsoluteCharOffset(fullHtml: string, parsed: ParsedCfi): number | null {
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = fullHtml;

  const target = resolveCfi(`epubcfi(/6/1${buildPathFromSteps(parsed.steps)})`, tempContainer);
  if (!target) return null;

  // Walk all text nodes and sum up to the target
  const walker = document.createTreeWalker(tempContainer, NodeFilter.SHOW_TEXT, null);
  let charOffset = 0;

  if (target.node.nodeType === Node.TEXT_NODE) {
    let node: Node | null = walker.nextNode();
    while (node) {
      if (node === target.node) {
        charOffset += target.offset;
        tempContainer.remove();
        return charOffset;
      }
      charOffset += (node.textContent || "").length;
      node = walker.nextNode();
    }
  }

  tempContainer.remove();
  return null;
}

function buildPathFromSteps(steps: CfiStep[]): string {
  return steps.length > 0 ? `/${steps.map((s) => s.index).join("/")}` : "";
}

const updateThemeClass = () => {
  const container = document.querySelector(".reader-view-container");
  if (!container) return;
  container.classList.remove("theme-light", "theme-dark", "theme-sepia");
  container.classList.add(`theme-${settingsStore.settings.theme}`);
};

// Load stats when stats modal opens
watch(
  () => uiStore.activeModal,
  async (newVal) => {
    if (newVal === "stats") {
      stats.value = await readerStore.getReadingStats(props.book.id);
    }
  },
);

// Watch for scroll mode changes
watch(
  () => settingsStore.settings.scrollMode,
  async (newMode) => {
    if (newMode === "vertical" && readerStore.chapters.length > 0) {
      await chapterLoader.loadCurrentAndAdjacent(2);
    } else if (newMode === "pagination" && readerStore.currentChapter) {
      const content = await readerStore.getCurrentChapterContent();
      const html = content?.html || "";
      currentChapterResources.value = content?.resources || [];
      await pagination.paginate(readerStore.currentChapter.id, { html });
    }
  },
);

// Watch for theme changes
watch(
  () => settingsStore.settings.theme,
  () => {
    updateThemeClass();
  },
);

const reRenderContent = async () => {
  if (!isPaginationMode.value) return;
  if (readerStore.currentChapter) {
    const content = await readerStore.getCurrentChapterContent();
    const html = content?.html || "";
    currentChapterResources.value = content?.resources || [];
    pagination.clearCache();
    await pagination.paginate(readerStore.currentChapter.id, { html });
  }
};

// Watch for settings changes that affect pagination
watch(
  () => [
    settingsStore.settings.margin,
    settingsStore.settings.fontSize,
    settingsStore.settings.lineHeight,
  ],
  reRenderContent,
);

// Lifecycle
onMounted(async () => {
  await bookmarksStore.loadBookmarks(props.book.id);
  updateThemeClass();

  uiStore.showControls = true;

  if (isPaginationMode.value && readerStore.currentChapter) {
    const content = await readerStore.getCurrentChapterContent();
    const html = content?.html || "";
    currentChapterResources.value = content?.resources || [];
    await pagination.paginate(readerStore.currentChapter.id, { html });
  } else {
    await chapterLoader.loadCurrentAndAdjacent(2);
    // Restore scroll position
    setTimeout(() => {
      const progress = readerStore.chapterProgress;
      const chapterId = readerStore.currentChapter?.id;
      if (progress > 0 && chapterId) {
        scrollManager.restoreScrollPosition(progress, chapterId);
      }
    }, 200);
  }
});

onUnmounted(() => {
  // scrollManager.cleanup();
  pagination.cleanup();
});
</script>

<template>
  <div class="reader-view-container">
    <!-- Header -->
    <ReaderHeader
      :book-title="book.title"
      :chapter-title="readerStore.currentChapter?.title"
      :show-controls="uiStore.showControls"
      @close="emit('close')"
      @open-settings="openModal('settings')"
    />

    <!-- Progress Bar -->
    <ProgressBar :progress="chapterProgress" />

    <!-- Main Content -->
    <ReaderContent
      ref="readerContentRef"
      :content="displayContent"
      :settings="settingsStore.settings"
      :is-pagination-mode="isPaginationMode"
      :current-page="pagination.currentPage.value"
      :loaded-chapters="chapterLoader.allLoadedContent.value"
      :epub-resources="currentChapterResources"
      :transitioning="isTransitioning"
      @scroll="scrollManager.handleScroll()"
      @resize="handleResize"
      @gesture-tap="gestures.handleIframeTap"
      @gesture-swipe-left="
        () => {
          gestures.handleIframeSwipe('left');
        }
      "
      @gesture-swipe-right="
        () => {
          gestures.handleIframeSwipe('right');
        }
      "
    />

    <!-- Footer -->
    <ReaderFooter
      :show-controls="uiStore.showControls"
      :has-highlights="search.hasHighlights.value"
      :search-results="search.searchResults.value"
      :current-result-index="search.currentResultIndex.value"
      :is-pagination-mode="isPaginationMode"
      :current-page="pagination.currentPage.value"
      :pages-count="pagination.totalPages.value"
      :reading-progress="readingProgress"
      :book-progress="totalBookProgress"
      :current-chapter-title="readerStore.currentChapter?.title || ''"
      :can-prev="currentChapterIndex > 0"
      :can-next="currentChapterIndex < readerStore.chapters.length - 1"
      @prev-page="prevPage"
      @next-page="nextPage"
      @prev-chapter="handleSelectChapter(readerStore.chapters[currentChapterIndex - 1]?.id)"
      @next-chapter="handleSelectChapter(readerStore.chapters[currentChapterIndex + 1]?.id)"
      @open-modal="openModal"
      @go-to-next-match="goToNextMatch"
      @go-to-previous-match="goToPreviousMatch"
      @clear-highlights="search.clearHighlights"
    />

    <!-- Page Indicator -->
    <PageIndicator
      :current-page="pagination.currentPage.value"
      :total-pages="pagination.totalPages.value"
      :show="uiStore.showControls && isPaginationMode"
    />

    <!-- Modal Wrapper -->
    <ModalWrapper
      :modal-type="uiStore.activeModal"
      :chapters="readerStore.chapters"
      :current-chapter-id="readerStore.currentChapter?.id ?? null"
      :bookmarks="bookmarksStore.bookmarks"
      :search-results="search.searchResults.value"
      :search-query="search.searchQuery.value"
      :settings="settingsStore.settings"
      :has-highlights="search.hasHighlights.value"
      :stats="stats"
      :total-chapters="readerStore.chapters.length"
      @close="closeModal"
      @select-chapter="handleSelectChapter"
      @navigate-bookmark="navigateToBookmark"
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
      @update-settings="settingsStore.updateSettings"
      @open-typography-settings="openModal('typographySettings')"
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
