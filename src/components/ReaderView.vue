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
import { usePagination, useChapterLoader, useReaderSearch } from "../composables";
import {
  ReaderHeader,
  ReaderFooter,
  ReaderContent,
  ProgressBar,
  PageIndicator,
} from "../components/reader";
import { ModalWrapper } from "../components/modals";
import type { Bookmark, SearchResult, Chapter, Book, BookReadingStats } from "../core/types";
import * as statsStore from "../storage/stats";
import {
  generateCfiFromElement,
  generateCfiFromRange,
  generateCfiFromCharOffset,
  navigateToCfi,
  resolveCfi,
  parseCfi,
} from "../utils/epub-cfi";
import type { ParsedCfi, CfiStep } from "../utils/epub-cfi";
import { rewriteResourcePaths } from "../utils/resource-urls";
import { debounce } from "../utils/debounce";
import { SWIPE_THRESHOLD, TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../utils/constants";

const props = defineProps<{
  book: Book;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const readerStore = useReaderStore();
const bookmarksStore = useBookmarksStore();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();

const readerContentRef = ref<ComponentInstance<typeof ReaderContent> | null>(null);

const stats = ref<BookReadingStats | null>(null);
const isTransitioning = ref(false);
const isRestoring = ref(false);
const currentChapterResources = ref<HTMLElement[]>([]);

const chapterLoading = computed(() => {
  if (isRestoring.value) return true;
  if (isTransitioning.value) return true;
  if (isPaginationMode.value && !pagination.isReady.value) return true;
  return false;
});

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

const chapterProgress = computed(() => {
  if (isPaginationMode.value) {
    const total = pagination.totalPages.value;
    if (total <= 1) return 100;
    return ((pagination.currentPage.value + 1) / total) * 100;
  }
  return readerStore.chapterProgress;
});

const readingProgress = computed(() => {
  const total = readerStore.chapters.length;
  if (total <= 1) return chapterProgress.value;

  const current = currentChapterIndex.value;
  const chapterPortion = 100 / total;
  return Math.round(current * chapterPortion + (chapterProgress.value / 100) * chapterPortion);
});

const totalBookProgress = computed(() => {
  const total = readerStore.chapters.length;
  if (total <= 1) return Math.max(1, Math.round(chapterProgress.value));

  const current = currentChapterIndex.value;
  const chapterPortion = 100 / total;
  const chapterProgressValue = chapterProgress.value / 100;
  return Math.round(current * chapterPortion + chapterProgressValue * chapterPortion);
});

const pagination = usePagination(
  props.book.id,
  readerStore.$state.chapters,
  computed(() => settingsStore.settings),
);

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

const rewrittenLoadedContent = computed(() => {
  const chapters = chapterLoader.allLoadedContent.value;
  const resourceUrls = readerStore.resourceUrls;
  if (!resourceUrls || resourceUrls.size === 0) return chapters;
  return chapters.map((ch) => {
    const doc = rewriteResourcePaths(ch.content, resourceUrls);
    return { ...ch, content: doc.body.innerHTML };
  });
});

function saveReadingProgress(chapterProgress: number, readingProgress: number, pageIndex: number) {
  if (isRestoring.value) return;
  const chapterId = readerStore.currentChapter?.id;
  if (!chapterId) return;
  bookmarksStore.saveProgress(props.book.id, chapterId, "", {
    chapterProgress: Math.round(chapterProgress),
    readingProgress: Math.round(readingProgress),
    pageIndex,
  });
}

const debouncedSaveScroll = debounce(
  (chapterId: string, chapterProgress: number, readingProgress: number) => {
    if (isRestoring.value) return;
    saveReadingProgress(chapterProgress, readingProgress, 0);
  },
  1000,
);

// ── Inline gesture handling ──

let gestureStartX = 0;
let gestureStartY = 0;
let gestureStartTime = 0;
let gestureCleanup: (() => void) | null = null;

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const el = target as Element;
  return !!(
    el.closest("button") ||
    el.closest("input") ||
    el.closest("textarea") ||
    el.closest("select") ||
    el.closest("a[href]") ||
    el.closest("[contenteditable]")
  );
}

function toggleControls() {
  uiStore.toggleControls();
}

// ── Inline scroll handling ──

let scrollObserver: IntersectionObserver | null = null;
let scrollCurrentChapterId: string | null = null;
let scrollLastPercent = -1;
let scrollLastChapterId: string | null = null;
let scrollLastChapterProgress = -1;
let scrollCleanup: (() => void) | null = null;

function refreshScrollObserver() {
  if (!scrollObserver) return;
  const doc = readerContentRef.value?.getDocument?.();
  if (!doc) return;

  scrollObserver.disconnect();
  doc.querySelectorAll<HTMLElement>("[data-chapter-id]").forEach((el) => {
    scrollObserver?.observe(el);
  });

  const win = doc.defaultView;
  if (win) {
    const scrollTop = win.scrollY || doc.documentElement.scrollTop || 0;
    const midpoint = scrollTop + win.innerHeight / 2;
    const containers = doc.querySelectorAll<HTMLElement>("[data-chapter-id]");
    for (const el of containers) {
      if (midpoint >= el.offsetTop && midpoint < el.offsetTop + el.offsetHeight) {
        scrollCurrentChapterId = el.getAttribute("data-chapter-id");
        break;
      }
    }
  }
}

function setupScrollHandler(doc: Document) {
  scrollObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          scrollCurrentChapterId = (entry.target as HTMLElement).getAttribute("data-chapter-id");
        }
      }
    },
    { root: doc.documentElement, threshold: 0 },
  );

  doc.querySelectorAll<HTMLElement>("[data-chapter-id]").forEach((el) => {
    scrollObserver?.observe(el);
  });

  let ticking = false;
  const handler = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;

      const win = doc.defaultView;
      if (!win) return;

      const scrollTop = win.scrollY || doc.documentElement.scrollTop || 0;
      const scrollHeight = doc.documentElement.scrollHeight - doc.documentElement.clientHeight;
      if (scrollHeight <= 0) return;

      const percent = Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100)));

      let chapterProgress = 0;
      if (scrollCurrentChapterId) {
        const el = doc.querySelector<HTMLElement>(`[data-chapter-id="${scrollCurrentChapterId}"]`);
        if (el && el.offsetHeight > 0) {
          const scrolled = scrollTop - el.offsetTop;
          chapterProgress = Math.min(
            100,
            Math.max(0, Math.round((scrolled / el.offsetHeight) * 100)),
          );
        }
      }

      if (
        percent === scrollLastPercent &&
        scrollCurrentChapterId === scrollLastChapterId &&
        chapterProgress === scrollLastChapterProgress
      )
        return;
      scrollLastPercent = percent;
      scrollLastChapterId = scrollCurrentChapterId;
      scrollLastChapterProgress = chapterProgress;

      if (isRestoring.value) return;

      readerStore.updateProgress(percent, chapterProgress);

      if (scrollCurrentChapterId && scrollCurrentChapterId !== readerStore.currentChapter?.id) {
        const chapter = readerStore.chapters.find((c) => c.id === scrollCurrentChapterId);
        if (chapter) {
          readerStore.currentChapter = chapter;
        }
      }

      const curId = readerStore.currentChapter?.id;
      if (curId) {
        debouncedSaveScroll(curId, chapterProgress, percent);
      }
    });
  };

  doc.addEventListener("scroll", handler, { passive: true });

  scrollCleanup = () => {
    doc.removeEventListener("scroll", handler);
    scrollObserver?.disconnect();
    scrollObserver = null;
  };
}

// ── Direct gesture + scroll setup ──

function setupDirectHandlers(doc: Document) {
  if (gestureCleanup) return;

  const handlePointerDown = (e: PointerEvent) => {
    if (shouldIgnoreTarget(e.target)) return;
    gestureStartX = e.clientX;
    gestureStartY = e.clientY;
    gestureStartTime = Date.now();
  };

  const handlePointerUp = (e: PointerEvent) => {
    const deltaX = e.clientX - gestureStartX;
    const deltaY = e.clientY - gestureStartY;
    const deltaTime = Date.now() - gestureStartTime;

    const isTap = deltaTime < 300 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10;

    const isHorizontalSwipe =
      Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD;

    if (isTap) {
      if (uiStore.activeModal) {
        uiStore.closeModal();
        return;
      }
      if (isPaginationMode.value) {
        const width = window.innerWidth;
        const x = e.clientX;
        if (x < width * TAP_ZONE_LEFT) {
          prevPage();
        } else if (x > width * TAP_ZONE_RIGHT) {
          nextPage();
        } else {
          toggleControls();
        }
      } else {
        toggleControls();
      }
    } else if (isHorizontalSwipe) {
      if (uiStore.activeModal) {
        uiStore.closeModal();
        return;
      }
      if (isPaginationMode.value) {
        if (deltaX > 0) {
          prevPage();
        } else {
          nextPage();
        }
      }
    }
  };

  doc.addEventListener("pointerdown", handlePointerDown, { passive: true });
  doc.addEventListener("pointerup", handlePointerUp, { passive: true });

  gestureCleanup = () => {
    doc.removeEventListener("pointerdown", handlePointerDown);
    doc.removeEventListener("pointerup", handlePointerUp);
  };
}

// ── Chapter navigation ──

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

const handleSelectChapter = async (
  chapterId: string,
  targetPage: number = 0,
  autoClearTransition = true,
) => {
  isTransitioning.value = true;
  const wasShowingControls = uiStore.showControls;
  try {
    await readerStore.goToChapter(chapterId);
    closeModal();

    if (isPaginationMode.value) {
      const content = await readerStore.getCurrentChapterContent();
      const html = content?.html || "";
      const resources = content?.resources || [];
      await pagination.paginate(chapterId, { html, targetPage, resources });
      currentChapterResources.value = resources;
    } else {
      await chapterLoader.loadCurrentAndAdjacent(2);
      await nextTick();
      readerContentRef.value?.scrollToChapter?.(chapterId);
    }

    if (isPaginationMode.value) {
      if (autoClearTransition) {
        const stopWatch = watch(
          () => pagination.isReady.value,
          (ready) => {
            if (ready) {
              isTransitioning.value = false;
              uiStore.showControls = wasShowingControls;
              stopWatch();
            }
          },
        );
      }
    } else {
      setTimeout(() => {
        isTransitioning.value = false;
        uiStore.showControls = wasShowingControls;
      }, 50);
    }
  } catch {
    isTransitioning.value = false;
    uiStore.showControls = wasShowingControls;
  }
};

function handleInternalLinkClick(href: string) {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
    return;
  }

  const hashIndex = href.indexOf("#");
  const filePath = hashIndex > 0 ? href.substring(0, hashIndex) : "";
  const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : "";

  const scrollToAnchor = () => {
    if (!anchor) return;
    const article = readerContentRef.value?.getArticle?.();
    if (article) {
      const target =
        article.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
        article.querySelector(`[name="${CSS.escape(anchor)}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  if (!filePath) {
    scrollToAnchor();
    return;
  }

  const targetChapter = readerStore.chapters.find((c) => chapterMatchesHref(c, filePath));

  if (targetChapter) {
    handleSelectChapter(targetChapter.id).then(async () => {
      if (anchor) {
        await nextTick();
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollToAnchor);
        });
      }
    });
  }
}

function chapterMatchesHref(chapter: Chapter, filePath: string): boolean {
  if (!chapter.href) return false;
  return (
    chapter.href === filePath ||
    chapter.href.endsWith(filePath) ||
    chapter.href.endsWith("/" + filePath) ||
    chapter.href.includes(filePath)
  );
}

async function handleResize() {
  await reRenderContent();
}

function handleColumnLayout(data: { columnWidth: number; gap: number; scrollWidth: number }) {
  pagination.updateColumnLayout(data.columnWidth, data.gap, data.scrollWidth);
}

function handleChaptersChanged() {
  refreshScrollObserver();
}

// ── Search navigation ──

const navigateToSearchResult = async (result: SearchResult) => {
  if (!result) return;

  if (isPaginationMode.value) {
    await handleSelectChapter(result.chapterId);
  } else {
    await chapterLoader.loadChapter(result.chapterId);
    await nextTick();
    readerContentRef.value?.scrollToChapter?.(result.chapterId);
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

// ── Bookmark handlers ──

const addBookmark = async () => {
  const chapter = readerStore.getCurrentChapter();
  if (!chapter) return;
  const article = readerContentRef.value?.getArticle?.() ?? null;
  if (!article) return;

  let cfi: string;
  let preview: string;

  if (isPaginationMode.value) {
    const fullHtml = pagination.rawHtml.value;
    if (!fullHtml) return;

    const totalPages = pagination.totalPages.value;
    const currentPage = pagination.currentPage.value;
    const fullText = fullHtml.replace(/<[^>]*>/g, "");
    const charOffset = Math.floor(((currentPage + 0.5) / totalPages) * fullText.length);

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

  isTransitioning.value = true;

  try {
    if (targetChapter.id !== readerStore.currentChapter?.id) {
      await handleSelectChapter(targetChapter.id, 0, false);
    } else {
      closeModal();
    }

    if (isPaginationMode.value) {
      if (!pagination.isReady.value) {
        await new Promise<void>((resolve) => {
          const stop = watch(
            () => pagination.isReady.value,
            (ready) => {
              if (ready) {
                stop();
                resolve();
              }
            },
          );
        });
      }

      const fullHtml = pagination.rawHtml.value;
      if (!fullHtml) return;

      const charOffset = calculateAbsoluteCharOffset(fullHtml, parsed);

      if (charOffset !== null) {
        const fullText = fullHtml.replace(/<[^>]*>/g, "");
        const estimatedPage = Math.min(
          pagination.totalPages.value - 1,
          Math.max(0, Math.floor((charOffset / fullText.length) * pagination.totalPages.value)),
        );
        pagination.goToPage(estimatedPage);
        closeModal();
        return;
      }

      pagination.goToPage(0);
      closeModal();
    } else {
      const article = readerContentRef.value?.getArticle?.();
      if (!article) return;
      const success = navigateToCfi(bookmark.cfi, article);
      if (success) {
        closeModal();
      }
    }
  } finally {
    isTransitioning.value = false;
  }
};

function calculateAbsoluteCharOffset(fullHtml: string, parsed: ParsedCfi): number | null {
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = fullHtml;

  const target = resolveCfi(`epubcfi(/6/1${buildPathFromSteps(parsed.steps)})`, tempContainer);
  if (!target) return null;

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
  document.body.classList.remove("theme-light", "theme-dark", "theme-sepia");
  document.body.classList.add(`theme-${settingsStore.settings.theme}`);
};

// Load stats when stats modal opens
watch(
  () => uiStore.activeModal,
  async (newVal) => {
    if (newVal === "stats") {
      stats.value = await statsStore.getStats(props.book.id);
    }
  },
);

// Scroll mode: load surrounding chapters on chapter change
watch(currentChapterIndex, (newIdx, oldIdx) => {
  if (isPaginationMode.value || newIdx === oldIdx || isRestoring.value) return;
  chapterLoader.loadCurrentAndAdjacent(2);
});

// Watch for scroll mode changes
watch(
  () => settingsStore.settings.scrollMode,
  async (newMode) => {
    if (newMode === "vertical" && readerStore.chapters.length > 0) {
      await chapterLoader.loadCurrentAndAdjacent(2);
    } else if (newMode === "pagination" && readerStore.currentChapter) {
      const content = await readerStore.getCurrentChapterContent();
      const html = content?.html || "";
      const resources = content?.resources || [];
      currentChapterResources.value = resources;
      await pagination.paginate(readerStore.currentChapter.id, { html, resources });
    }
  },
);

// Watch for theme changes
watch(
  () => settingsStore.settings.theme,
  () => {
    updateThemeClass();
  },
  { immediate: true },
);

const reRenderContent = async () => {
  if (!isPaginationMode.value) return;
  if (readerStore.currentChapter) {
    const content = await readerStore.getCurrentChapterContent();
    const html = content?.html || "";
    const resources = content?.resources || [];
    currentChapterResources.value = resources;
    await pagination.paginate(readerStore.currentChapter.id, { html, resources });
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

// Watch for page changes in pagination mode to auto-save
watch([() => pagination.currentPage.value, () => pagination.totalPages.value], ([page, total]) => {
  if (!isPaginationMode.value) return;
  const cp = total <= 1 ? 100 : ((page + 1) / total) * 100;
  saveReadingProgress(cp, readingProgress.value, page);
});

// Watch for iframe ready → set up direct gesture + scroll handlers
watch(
  () => readerContentRef.value?.isReady,
  (ready) => {
    if (!ready) return;
    const doc = readerContentRef.value?.getDocument?.();
    if (!doc) return;

    setupDirectHandlers(doc);

    if (!isPaginationMode.value) {
      setupScrollHandler(doc);
    }
  },
);

// Lifecycle
onMounted(async () => {
  await bookmarksStore.loadBookmarks(props.book.id);
  updateThemeClass();

  uiStore.showControls = true;

  // Restore reading progress
  isRestoring.value = true;
  try {
    const progress = await bookmarksStore.loadProgress(props.book.id);
    const restoreChapterId = progress?.chapterId || readerStore.currentChapter?.id;
    const restorePage = progress?.pageIndex || 0;

    if (isPaginationMode.value && restoreChapterId) {
      await handleSelectChapter(restoreChapterId, restorePage);
    } else {
      if (restoreChapterId && restoreChapterId !== readerStore.currentChapter?.id) {
        await handleSelectChapter(restoreChapterId);
      } else {
        await chapterLoader.loadCurrentAndAdjacent(2);
      }
      // Restore scroll position
      if (progress?.chapterProgress && restoreChapterId) {
        setTimeout(() => {
          readerContentRef.value?.restoreScrollPosition?.(
            restoreChapterId!,
            progress.chapterProgress,
          );
        }, 200);
      }
    }
  } finally {
    isRestoring.value = false;
  }
});

onUnmounted(() => {
  gestureCleanup?.();
  gestureCleanup = null;
  scrollCleanup?.();
  scrollCleanup = null;
  pagination.cleanup();
});
</script>

<template>
  <div class="reader-view-container">
    <ReaderHeader
      :book-title="book.title"
      :chapter-title="readerStore.currentChapter?.title"
      :show-controls="uiStore.showControls"
      @close="emit('close')"
      @open-settings="openModal('settings')"
    />

    <ProgressBar :progress="chapterProgress" />

    <ReaderContent
      ref="readerContentRef"
      :content="displayContent"
      :settings="settingsStore.settings"
      :is-pagination-mode="isPaginationMode"
      :scroll-offset="pagination.scrollOffset.value"
      :chapter-loading="chapterLoading"
      :loaded-chapters="rewrittenLoadedContent"
      :epub-resources="currentChapterResources"
      :on-link-click="handleInternalLinkClick"
      :on-resize="handleResize"
      :on-column-layout="handleColumnLayout"
      :on-chapters-changed="handleChaptersChanged"
    />

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

    <PageIndicator
      :current-page="pagination.currentPage.value"
      :total-pages="pagination.totalPages.value"
      :show="uiStore.showControls && isPaginationMode"
    />

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
  height: 100%;
  overflow: hidden;
  color: var(--reader-text);
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
  position: relative;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

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

@media (max-width: 768px) {
  .reader-view-container {
    /* Mobile optimizations handled by sub-components */
  }
}

@supports (padding: max(0px)) {
  .reader-view-container {
    padding-left: max(0px, env(safe-area-inset-left, 0));
    padding-right: max(0px, env(safe-area-inset-right, 0));
  }
}
</style>
