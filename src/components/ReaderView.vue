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
import { useAnnotationsStore } from "../stores/annotations";
import { useUIStore } from "../stores/ui";
import { useSettingsStore } from "../stores/settings";
import {
  usePagination,
  useChapterLoader,
  useReaderSearch,
  useAnnotationRenderer,
} from "../composables";
import type { SelectionInfo } from "../composables/useAnnotationRenderer";
import {
  ReaderHeader,
  ReaderFooter,
  ReaderContent,
  ProgressBar,
  PageIndicator,
} from "../components/reader";
import SelectionToolbar from "../components/reader/SelectionToolbar.vue";
import AnnotationPopover from "../components/reader/AnnotationPopover.vue";
import { ModalWrapper } from "../components/modals";
import type {
  Bookmark,
  SearchResult,
  Chapter,
  Book,
  BookReadingStats,
  Annotation,
} from "../core/types";
import * as statsStore from "../storage/stats";
import * as annotationsStorage from "../storage/annotations";
import {
  generateCfiFromElement,
  generateCfiFromCharOffset,
  generateCfiFromRange,
  navigateToCfi,
  resolveCfiToElement,
  resolveCfiRange,
  getSpineIndex,
} from "../utils/epub-cfi";
import { rewriteResourcePaths } from "../utils/resource-urls";
import { stripHtml } from "../search/engine";
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
const annotationsStore = useAnnotationsStore();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();

const readerContentRef = ref<ComponentInstance<typeof ReaderContent> | null>(null);

const stats = ref<BookReadingStats | null>(null);
const isTransitioning = ref(false);
const isRestoring = ref(false);
const currentChapterResources = ref<HTMLElement[]>([]);

// Search jump state — saved before first search navigation for "go back"
interface SearchJumpState {
  previousChapterId: string;
  previousPage: number;
}
const searchJumpState = ref<SearchJumpState | null>(null);

// Annotation state
const showSelectionToolbar = ref(false);
const selectionToolbarPos = ref({ top: 0, left: 0 });
const showNoteInput = ref(false);
const pendingSelection = ref<{
  startCfi: string;
  endCfi: string;
  text: string;
} | null>(null);
const showAnnotationPopover = ref(false);
const popoverAnnotation = ref<Annotation | null>(null);
const popoverPosition = ref<{ top: number; left: number; height: number }>({
  top: 0,
  left: 0,
  height: 0,
});

const annotationRenderer = useAnnotationRenderer(
  () => readerContentRef.value?.getDocument?.() ?? null,
);

const chapterLoading = computed(() => {
  if (isRestoring.value) return true;
  if (isTransitioning.value) return true;
  if (isPaginationMode.value && !pagination.isReady.value) return true;
  return false;
});

const openModal = (modal: string) => {
  if (modal === "annotations") {
    annotationsStore.loadAnnotationsForBook(props.book.id);
  }
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

const pagination = usePagination();

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
  return chapters.map((ch) => {
    if (resourceUrls && resourceUrls.size > 0) {
      const doc = rewriteResourcePaths(ch.content, resourceUrls);
      return { ...ch, content: doc.body.innerHTML };
    }
    // Always extract body HTML to match search text extraction
    const parser = new DOMParser();
    const doc = parser.parseFromString(ch.content, "text/html");
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

const debouncedSaveScroll = debounce((chapterProgress: number, readingProgress: number) => {
  if (isRestoring.value) return;
  saveReadingProgress(chapterProgress, readingProgress, 0);
}, 1000);

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
  if (scrollObserver) return;

  scrollObserver = new IntersectionObserver(
    (entries) => {
      if (isPaginationMode.value) return;
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
    if (ticking || isPaginationMode.value) return;
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
        debouncedSaveScroll(chapterProgress, percent);
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

  const handleClick = (e: MouseEvent) => {
    if (shouldIgnoreTarget(e.target)) return;

    // 模态框优先关闭
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
  };

  doc.addEventListener("click", handleClick);
  gestureCleanup = () => {
    doc.removeEventListener("click", handleClick);
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
        const onReady = async () => {
          await annotationsStore.loadAnnotationsForChapter(props.book.id, chapterId);
          applyAnnotations();
          isTransitioning.value = false;
          uiStore.showControls = wasShowingControls;
        };
        if (pagination.isReady.value) {
          onReady();
        } else {
          const stopWatch = watch(
            () => pagination.isReady.value,
            (ready) => {
              if (ready) {
                stopWatch();
                onReady();
              }
            },
          );
        }
      }
    } else {
      setTimeout(async () => {
        await annotationsStore.loadAnnotationsForChapter(props.book.id, chapterId);
        applyAnnotations();
        isTransitioning.value = false;
        uiStore.showControls = wasShowingControls;
      }, 50);
    }
  } catch {
    isTransitioning.value = false;
    uiStore.showControls = wasShowingControls;
  }
};

function waitForPaginationReady(): Promise<void> {
  if (pagination.isReady.value) return Promise.resolve();
  return new Promise<void>((resolve) => {
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

/** Resolve a CFI in the iframe document and return the page it falls on. */
function getPageForCfi(cfi: string): number | null {
  const doc = readerContentRef.value?.getDocument?.();
  if (!doc?.body) return null;
  const element = resolveCfiToElement(cfi, doc.body);
  if (!element) return null;
  const bodyRect = doc.body.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  return pagination.getPageAtOffset(elRect.left - bodyRect.left);
}

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
    if (!article) return;
    const target =
      article.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
      article.querySelector(`[name="${CSS.escape(anchor)}"]`);
    if (!target) return;

    if (isPaginationMode.value) {
      const articleRect = article.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      // Both rects are shifted by the same translateX transform, so the
      // subtraction cancels it — offsetInBody is the element's position
      // relative to the body's left edge in the natural column layout.
      const offsetInBody = targetRect.left - articleRect.left;
      pagination.goToPage(pagination.getPageAtOffset(offsetInBody));
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!filePath) {
    scrollToAnchor();
    return;
  }

  const targetChapter = readerStore.chapters.find((c) => chapterMatchesHref(c, filePath));
  if (!targetChapter) return;

  // Same chapter: skip re-pagination, just scroll to anchor
  if (targetChapter.id === readerStore.currentChapter?.id) {
    if (isPaginationMode.value) {
      waitForPaginationReady().then(scrollToAnchor);
    } else {
      scrollToAnchor();
    }
    return;
  }

  // Different chapter: load it, then scroll to anchor
  handleSelectChapter(targetChapter.id).then(async () => {
    if (!anchor) return;

    if (isPaginationMode.value) {
      await waitForPaginationReady();
      scrollToAnchor();
    } else {
      await nextTick();
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToAnchor);
      });
    }
  });
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

function handleColumnLayout(data: {
  columnWidth: number;
  gap: number;
  scrollWidth: number;
  iframeWidth: number;
}) {
  pagination.updateColumnLayout(data.columnWidth, data.gap, data.scrollWidth);
}

async function handleChaptersChanged() {
  refreshScrollObserver();
  if (!isPaginationMode.value) {
    await syncScrollModeAnnotations();
  }
}

// ── Search navigation ──

async function handleSearchGoBack() {
  if (!searchJumpState.value) return;
  const { previousChapterId, previousPage } = searchJumpState.value;
  searchJumpState.value = null;
  if (previousChapterId !== readerStore.currentChapter?.id) {
    await handleSelectChapter(previousChapterId, previousPage);
  } else if (isPaginationMode.value) {
    pagination.goToPage(previousPage);
  }
}

let clearTempSearchHighlight: (() => void) | null = null;

function applySearchHighlight(
  doc: Document,
  container: Element,
  position: number,
  textLength: number,
  spineIndex: number,
) {
  // Clean up any previous temp highlight
  clearTempSearchHighlight?.();
  clearTempSearchHighlight = null;

  const startCfi = generateCfiFromCharOffset(spineIndex, container, position);
  const endCfi = generateCfiFromCharOffset(spineIndex, container, position + textLength);
  if (!startCfi || !endCfi) return;

  const range = resolveCfiRange(startCfi, endCfi, doc.body);
  if (!range || range.collapsed) return;

  const marks: HTMLElement[] = [];

  // Collect text nodes that intersect the range
  const textNodes: Text[] = [];
  if (
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    textNodes.push(range.startContainer as Text);
  } else {
    const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent && node.textContent.length > 0) {
        textNodes.push(node);
      }
    }
  }

  for (const textNode of textNodes) {
    let startOffset = 0;
    let endOffset = (textNode.textContent || "").length;

    if (textNode === range.startContainer) startOffset = range.startOffset;
    if (textNode === range.endContainer) endOffset = range.endOffset;
    if (startOffset >= endOffset) continue;

    textNode.splitText(endOffset);
    const selectedNode = startOffset > 0 ? textNode.splitText(startOffset) : textNode;

    if (selectedNode.textContent && selectedNode.textContent.length > 0) {
      const mark = doc.createElement("mark");
      mark.style.backgroundColor = "rgba(251, 191, 36, 0.45)";
      mark.style.borderRadius = "2px";
      mark.style.transition = "background-color 1.5s ease";
      selectedNode.parentNode!.insertBefore(mark, selectedNode);
      mark.appendChild(selectedNode);
      marks.push(mark);
    }
  }

  if (marks.length > 0) {
    clearTempSearchHighlight = () => {
      for (const mark of marks) {
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          mark.remove();
        }
      }
    };

    // Auto-fade after 3s
    setTimeout(() => {
      for (const mark of marks) {
        mark.style.backgroundColor = "transparent";
      }
    }, 1500);

    // Remove DOM nodes after fade
    setTimeout(() => {
      clearTempSearchHighlight?.();
      clearTempSearchHighlight = null;
    }, 3000);
  }
}

async function navigateToSearchResult(result: SearchResult) {
  if (!result) return;

  const targetChapter = readerStore.chapters.find((c) => c.id === result.chapterId);
  if (!targetChapter) return;

  // Save current position for "go back" (only on first search jump)
  if (!searchJumpState.value && readerStore.currentChapter) {
    searchJumpState.value = {
      previousChapterId: readerStore.currentChapter.id,
      previousPage: isPaginationMode.value ? pagination.currentPage.value : 0,
    };
  }

  const sameChapter = targetChapter.id === readerStore.currentChapter?.id;

  isTransitioning.value = true;

  try {
    if (isPaginationMode.value) {
      if (!sameChapter) {
        await handleSelectChapter(targetChapter.id, 0, false);
      } else {
        closeModal();
      }

      await waitForPaginationReady();

      await annotationsStore.loadAnnotationsForChapter(props.book.id, targetChapter.id);
      applyAnnotations();

      const doc = readerContentRef.value?.getDocument?.();
      if (doc?.body) {
        applySearchHighlight(
          doc,
          doc.body,
          result.position,
          result.text.length,
          targetChapter.order,
        );
        const mark = doc.body.querySelector("mark");
        if (mark) {
          const bodyRect = doc.body.getBoundingClientRect();
          const markRect = mark.getBoundingClientRect();
          pagination.goToPage(pagination.getPageAtOffset(markRect.left - bodyRect.left));
        }
      }
    } else {
      // Scroll mode
      if (!sameChapter) {
        await chapterLoader.loadChapter(result.chapterId);
        await nextTick();
        await annotationsStore.loadAnnotationsForChapter(props.book.id, targetChapter.id);
        applyAnnotations();
      } else {
        closeModal();
      }

      const article = readerContentRef.value?.getArticle?.();
      if (article) {
        const root =
          (article.querySelector(
            `[data-chapter-id="${targetChapter.id}"]`,
          ) as HTMLElement | null) || article;
        applySearchHighlight(
          article.ownerDocument,
          root,
          result.position,
          result.text.length,
          targetChapter.order,
        );

        // Scroll to the highlighted text in scroll mode
        await nextTick();
        const mark = root.querySelector("mark");
        if (mark) {
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    // Enable search navigation footer (prev/next buttons)
    search.hasHighlights.value = true;

    closeModal();
  } finally {
    isTransitioning.value = false;
  }
}

const goToNextMatch = async () => {
  const index = search.goToNextMatch();
  if (index !== undefined) await navigateToSearchResult(search.searchResults.value[index]);
};

const goToPreviousMatch = async () => {
  const index = search.goToPreviousMatch();
  if (index !== undefined) await navigateToSearchResult(search.searchResults.value[index]);
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

    const plainText = stripHtml(fullHtml).replace(/\s+/g, " ").trim();
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

// ── Annotation handlers ──

async function syncScrollModeAnnotations() {
  const loaded = chapterLoader.allLoadedContent.value;
  if (!loaded.length) return;
  const all: Annotation[] = [];
  for (const ch of loaded) {
    const anns = await annotationsStorage.getAnnotationsByChapter(props.book.id, ch.chapterId);
    all.push(...anns);
  }
  const doc = readerContentRef.value?.getDocument?.();
  if (doc) {
    annotationRenderer.applyToContent(all);
  }
}

function applyAnnotations() {
  const doc = readerContentRef.value?.getDocument?.();
  if (!doc) return;
  annotationRenderer.applyToContent(annotationsStore.annotations);
}

function handleSelectionChange(info: SelectionInfo | null) {
  if (!info) {
    showSelectionToolbar.value = false;
    showNoteInput.value = false;
    return;
  }
  const doc = readerContentRef.value?.getDocument?.();
  if (!doc) return;
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const spineIndex = readerStore.currentChapter?.order ?? 0;

  // CFI generation skips [data-annotation-id] spans (see isIgnorableNode),
  // so the generated paths are independent of rendered annotation state.
  // No DOM modification needed here.
  const startCollapsed = doc.createRange();
  startCollapsed.setStart(range.startContainer, range.startOffset);
  startCollapsed.collapse(true);
  const startCfi = generateCfiFromRange(spineIndex, startCollapsed, doc.body);

  const endCollapsed = doc.createRange();
  endCollapsed.setStart(range.endContainer, range.endOffset);
  endCollapsed.collapse(true);
  const endCfi = generateCfiFromRange(spineIndex, endCollapsed, doc.body);

  pendingSelection.value = { startCfi, endCfi, text: info.text };
  selectionToolbarPos.value = {
    top: Math.max(8, info.rect.top - 56),
    left: info.rect.left,
  };
  showSelectionToolbar.value = true;
}

async function handleHighlight(color: string) {
  const sel = pendingSelection.value;
  if (!sel || !readerStore.currentChapter) return;
  showSelectionToolbar.value = false;
  showNoteInput.value = false;
  await annotationsStore.addAnnotation(
    props.book.id,
    readerStore.currentChapter.id,
    "highlight",
    sel.startCfi,
    sel.endCfi,
    color,
    sel.text,
  );
  applyAnnotations();
  pendingSelection.value = null;
}

async function handleUnderline() {
  const sel = pendingSelection.value;
  if (!sel || !readerStore.currentChapter) return;
  showSelectionToolbar.value = false;
  await annotationsStore.addAnnotation(
    props.book.id,
    readerStore.currentChapter.id,
    "underline",
    sel.startCfi,
    sel.endCfi,
    "#60a5fa",
    sel.text,
  );
  applyAnnotations();
  pendingSelection.value = null;
}

function handleAddNote() {
  showNoteInput.value = true;
}

async function handleSaveNote(noteText: string) {
  const sel = pendingSelection.value;
  if (!sel || !readerStore.currentChapter) return;
  showSelectionToolbar.value = false;
  showNoteInput.value = false;
  await annotationsStore.addAnnotation(
    props.book.id,
    readerStore.currentChapter.id,
    "highlight",
    sel.startCfi,
    sel.endCfi,
    "#fbbf24",
    sel.text,
    noteText,
  );
  applyAnnotations();
  pendingSelection.value = null;
}

function handleCancelNote() {
  showSelectionToolbar.value = false;
  showNoteInput.value = false;
}

function handleAnnotationClick(annotationId: string, rect: DOMRect) {
  const annotation = annotationsStore.annotations.find((a) => a.id === annotationId);
  if (!annotation) return;
  popoverAnnotation.value = annotation;
  popoverPosition.value = { top: rect.top, left: rect.left, height: rect.height };
  showAnnotationPopover.value = true;
}

async function handleUpdateAnnotationNote(id: string, note: string) {
  await annotationsStore.updateAnnotation(id, { note } as Partial<Annotation>);
  showAnnotationPopover.value = false;
}

async function handleUpdateAnnotationColor(id: string, color: string) {
  await annotationsStore.updateAnnotation(id, { color } as Partial<Annotation>);
  applyAnnotations();
}

async function handleDeleteAnnotation(id: string) {
  await annotationsStore.removeAnnotation(id);
  showAnnotationPopover.value = false;
  applyAnnotations();
}

async function navigateToCfiLocation(
  cfi: string,
  chapterId: string,
  opts?: { loadAnnotations?: boolean },
) {
  const spineIndex = getSpineIndex(cfi);
  if (spineIndex < 0) return;

  const targetChapter = readerStore.chapters.find((c) => c.order === spineIndex);
  if (!targetChapter) {
    const fallbackChapter = readerStore.chapters.find((c) => c.id === chapterId);
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
      await waitForPaginationReady();

      if (opts?.loadAnnotations) {
        await annotationsStore.loadAnnotationsForChapter(props.book.id, targetChapter.id);
        applyAnnotations();
      }

      const page = getPageForCfi(cfi);
      if (page !== null) {
        pagination.goToPage(page);
      } else {
        pagination.goToPage(0);
      }
    } else {
      if (opts?.loadAnnotations) {
        await annotationsStore.loadAnnotationsForChapter(props.book.id, targetChapter.id);
        await nextTick();
        applyAnnotations();
      }

      const article = readerContentRef.value?.getArticle?.();
      if (article) {
        navigateToCfi(cfi, article);
      }
    }

    closeModal();
  } finally {
    isTransitioning.value = false;
  }
}

async function handleNavigateAnnotation(annotation: Annotation) {
  await navigateToCfiLocation(annotation.startCfi, annotation.chapterId, {
    loadAnnotations: true,
  });
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
  await navigateToCfiLocation(bookmark.cfi, bookmark.chapterId);
};

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

// Watch for page changes in pagination mode to auto-save
watch([() => pagination.currentPage.value, () => pagination.totalPages.value], ([page, total]) => {
  if (!isPaginationMode.value) return;
  const cp = total <= 1 ? 100 : ((page + 1) / total) * 100;
  saveReadingProgress(cp, readingProgress.value, page);
});

// Watch for iframe ready → set up direct gesture + scroll + annotation handlers
let annotationListenerCleanup: (() => void) | null = null;

watch(
  () => readerContentRef.value?.isReady,
  (ready) => {
    if (!ready) return;
    const doc = readerContentRef.value?.getDocument?.();
    if (!doc) return;

    setupDirectHandlers(doc);
    setupScrollHandler(doc);

    // Set up annotation selection/click listeners
    annotationListenerCleanup?.();
    annotationListenerCleanup = annotationRenderer.setupListeners({
      onSelectionChange: handleSelectionChange,
      onAnnotationClick: handleAnnotationClick,
    });
  },
);

// Clear search jump state and temp highlight when highlights are dismissed
watch(
  () => search.hasHighlights.value,
  (active) => {
    if (!active) {
      searchJumpState.value = null;
      clearTempSearchHighlight?.();
      clearTempSearchHighlight = null;
    }
  },
);

// Lifecycle
onMounted(async () => {
  await bookmarksStore.loadBookmarks(props.book.id);
  if (readerStore.currentChapter) {
    await annotationsStore.loadAnnotationsForChapter(props.book.id, readerStore.currentChapter.id);
  }
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
  clearTempSearchHighlight?.();
  clearTempSearchHighlight = null;
  scrollCleanup?.();
  scrollCleanup = null;
  annotationListenerCleanup?.();
  annotationListenerCleanup = null;
  annotationRenderer.cleanup();
  annotationsStore.reset();
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
      :show="uiStore.showControls && isPaginationMode && pagination.isReady.value"
    />

    <!-- Search go-back button -->
    <Transition name="fade">
      <button
        v-if="searchJumpState"
        class="search-back-btn"
        @click.stop="handleSearchGoBack"
        aria-label="Go back to previous position"
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
    </Transition>

    <SelectionToolbar
      :visible="showSelectionToolbar"
      :position="selectionToolbarPos"
      :show-note-input="showNoteInput"
      @highlight="handleHighlight"
      @underline="handleUnderline"
      @add-note="handleAddNote"
      @save-note="handleSaveNote"
      @cancel-note="handleCancelNote"
    />

    <AnnotationPopover
      :visible="showAnnotationPopover"
      :annotation="popoverAnnotation"
      :position="popoverPosition"
      @update-note="handleUpdateAnnotationNote"
      @update-color="handleUpdateAnnotationColor"
      @delete="handleDeleteAnnotation"
      @close="showAnnotationPopover = false"
    />

    <ModalWrapper
      :modal-type="uiStore.activeModal"
      :chapters="readerStore.chapters"
      :current-chapter-id="readerStore.currentChapter?.id ?? null"
      :bookmarks="bookmarksStore.bookmarks"
      :annotations="annotationsStore.allAnnotations"
      :search-results="search.searchResults.value"
      :search-query="search.searchQuery.value"
      :settings="settingsStore.settings"
      :has-highlights="search.hasHighlights.value"
      :stats="stats"
      :total-chapters="readerStore.chapters.length"
      @close="closeModal"
      @select-chapter="handleSelectChapter"
      @navigate-bookmark="navigateToBookmark"
      @navigate-annotation="handleNavigateAnnotation"
      @delete-annotation="handleDeleteAnnotation"
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

.search-back-btn {
  position: fixed;
  bottom: max(100px, env(safe-area-inset-bottom, 0) + 80px);
  left: max(16px, env(safe-area-inset-left, 0));
  z-index: 102;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-elevated, #fff);
  color: var(--reader-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  transition:
    opacity 200ms ease,
    transform 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.search-back-btn:hover {
  background: var(--hover-bg);
  border-color: var(--accent);
  color: var(--accent);
}

.search-back-btn:active {
  transform: scale(0.92);
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
