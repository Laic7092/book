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
import { useUIStore } from "../stores/ui";
import { useSettingsStore } from "../stores/settings";
import { usePagination, useChapterLoader, useNavigationStack } from "../composables";
import {
  ReaderHeader,
  ReaderFooter,
  ReaderContent,
  ProgressBar,
  PageIndicator,
} from "../components/reader";
import { ModalWrapper } from "../components/modals";
import type { SearchResult, Chapter, Book } from "../core/types";
import { navigateToCfi, resolveCfi, getSpineIndex } from "../utils/epub-cfi";
import { rewriteResourcePaths } from "../reader-engine/resource-urls";
import { debounce } from "../utils/debounce";
import { SWIPE_THRESHOLD, TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../config/constants";
import { registerReaderHost, unregisterReaderHost } from "../core/reader-host";
import type { ReaderHost } from "../core/reader-host";
import {
  getOverlayComponents,
  pluginStateVersion,
  applyContentTransformers,
} from "../plugins/registry";
import { pluginEvents } from "../plugins/context";
import { getChapterContent as fetchChapterContent } from "../storage/books";
import { navigate } from "../router";

const props = defineProps<{
  book: Book;
}>();

function handleClose() {
  uiStore.setTransitioning(true);
  navigate("/");
}

const readerStore = useReaderStore();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();

const readerContentRef = ref<ComponentInstance<typeof ReaderContent> | null>(null);

const isTransitioning = ref(false);
const isRestoring = ref(false);
const currentChapterResources = ref<HTMLElement[]>([]);

// Overlay components from enabled plugins
const overlayComponents = computed(() => {
  void pluginStateVersion.value;
  return getOverlayComponents();
});

// Cleanup registry
const cleanupFns: (() => void)[] = [];
let iframeReadyCallbacks: (() => void)[] = [];
let chapterChangeCallbacks: ((chapterId: string) => void)[] = [];

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

const pagination = usePagination();
const navStack = useNavigationStack();

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

const rewrittenLoadedContent = computed(() => {
  const chapters = chapterLoader.allLoadedContent.value;
  const resourceUrls = readerStore.resourceUrls;
  return chapters.map((ch) => {
    if (resourceUrls && resourceUrls.size > 0) {
      const doc = rewriteResourcePaths(ch.content, resourceUrls);
      return { ...ch, content: doc.body.innerHTML };
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(ch.content, "text/html");
    return { ...ch, content: doc.body.innerHTML };
  });
});

// Transformed content: rewrittenLoadedContent + plugin content transformers
const transformedLoadedContent = ref<typeof rewrittenLoadedContent.value>([]);
let transformSeq = 0;

async function refreshTransformedContent() {
  const seq = ++transformSeq;
  const source = rewrittenLoadedContent.value;
  const bookId = readerStore.currentBook?.id;
  if (!bookId) {
    transformedLoadedContent.value = source;
    return;
  }
  const result = await Promise.all(
    source.map(async (ch) => {
      try {
        const html = await applyContentTransformers(ch.content, {
          bookId,
          chapterId: ch.chapterId,
        });
        return { ...ch, content: html };
      } catch {
        return ch;
      }
    }),
  );
  if (seq === transformSeq) {
    transformedLoadedContent.value = result;
  }
}

watch(
  [rewrittenLoadedContent, pluginStateVersion, () => readerStore.currentBook?.id],
  () => {
    refreshTransformedContent();
  },
  { immediate: true },
);

// ── ReaderHost implementation ──

const host: ReaderHost = {
  getDocument() {
    return readerContentRef.value?.getDocument?.() ?? null;
  },
  getArticle() {
    return readerContentRef.value?.getArticle?.() ?? null;
  },
  async navigateToChapter(chapterId: string, targetPage?: number) {
    await handleSelectChapter(chapterId, targetPage ?? 0);
  },
  async navigateToCfi(cfi: string, chapterId: string) {
    await navigateToCfiLocation(cfi, chapterId);
  },
  getCurrentChapter() {
    return readerStore.currentChapter ?? null;
  },
  getCurrentCfi() {
    return null;
  },
  getChapters() {
    return readerStore.chapters;
  },
  getChapterTitle(chapterId: string) {
    return readerStore.chapters.find((c) => c.id === chapterId)?.title ?? "Unknown Chapter";
  },
  getCurrentBookId() {
    return readerStore.currentBook?.id;
  },
  isPaginationMode,
  getSettings() {
    return computed(() => settingsStore.settings);
  },
  updateSettings(partial) {
    settingsStore.updateSettings(partial);
  },
  openModal(name: string) {
    uiStore.openModal(name);
  },
  closeModal() {
    uiStore.closeModal();
  },
  getCurrentPage() {
    return pagination.currentPage.value;
  },
  getTotalPages() {
    return pagination.totalPages.value;
  },
  goToPage(page: number) {
    pagination.goToPage(page);
  },
  pushToHistory(chapterId: string, page: number) {
    navStack.push({ chapterId, page });
  },
  getCurrentChapterRawHtml() {
    return pagination.rawHtml.value;
  },
  async getChapterContent(chapterId: string) {
    return fetchChapterContent(props.book.id, chapterId);
  },
  onReady(cb: () => void) {
    iframeReadyCallbacks.push(cb);
    return () => {
      iframeReadyCallbacks = iframeReadyCallbacks.filter((c) => c !== cb);
    };
  },
  registerCleanup(fn: () => void) {
    cleanupFns.push(fn);
  },
  onChapterChange(handler: (chapterId: string) => void) {
    chapterChangeCallbacks.push(handler);
    return () => {
      chapterChangeCallbacks = chapterChangeCallbacks.filter((h) => h !== handler);
    };
  },
};

// Register immediately so plugin overlays (which mount before ReaderView's onMounted)
// can access the host during their own setup()
registerReaderHost(host);

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

      let chapterProgressVal = 0;
      if (scrollCurrentChapterId) {
        const el = doc.querySelector<HTMLElement>(`[data-chapter-id="${scrollCurrentChapterId}"]`);
        if (el && el.offsetHeight > 0) {
          const scrolled = scrollTop - el.offsetTop;
          chapterProgressVal = Math.min(
            100,
            Math.max(0, Math.round((scrolled / el.offsetHeight) * 100)),
          );
        }
      }

      if (
        percent === scrollLastPercent &&
        scrollCurrentChapterId === scrollLastChapterId &&
        chapterProgressVal === scrollLastChapterProgress
      )
        return;
      scrollLastPercent = percent;
      scrollLastChapterId = scrollCurrentChapterId;
      scrollLastChapterProgress = chapterProgressVal;

      if (isRestoring.value) return;

      readerStore.updateProgress(percent, chapterProgressVal);

      // Notify chapter change
      const prevChapterId = readerStore.currentChapter?.id;
      if (scrollCurrentChapterId && scrollCurrentChapterId !== prevChapterId) {
        const chapter = readerStore.chapters.find((c) => c.id === scrollCurrentChapterId);
        if (chapter) {
          readerStore.currentChapter = chapter;
          for (const cb of chapterChangeCallbacks) {
            cb(scrollCurrentChapterId);
          }
          void pluginEvents.emit("chapter:changed", {
            bookId: readerStore.currentBook!.id,
            chapterId: scrollCurrentChapterId,
            previousChapterId: prevChapterId,
          });
        }
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
  const previousChapterId = readerStore.currentChapter?.id;
  try {
    await readerStore.goToChapter(chapterId);
    closeModal();

    if (isPaginationMode.value) {
      const content = await readerStore.getCurrentChapterContent();
      let html = content?.html || "";
      if (html && readerStore.currentBook) {
        html = await applyContentTransformers(html, {
          bookId: readerStore.currentBook.id,
          chapterId,
        });
      }
      const resources = content?.resources || [];
      await pagination.paginate(chapterId, { html, targetPage, resources });
      currentChapterResources.value = resources;
      readerContentRef.value?.syncEpubResources?.(resources);
    } else {
      await chapterLoader.loadCurrentAndAdjacent(2);
      await nextTick();
      readerContentRef.value?.scrollToChapter?.(chapterId);
    }

    // Notify chapter change listeners (plugins)
    for (const cb of chapterChangeCallbacks) {
      cb(chapterId);
    }
    void pluginEvents.emit("chapter:changed", {
      bookId: readerStore.currentBook!.id,
      chapterId,
      previousChapterId,
    });

    if (isPaginationMode.value) {
      if (autoClearTransition) {
        const onReady = async () => {
          isTransitioning.value = false;
          uiStore.showControls = wasShowingControls;
          void pluginEvents.emit("content:loaded", {
            bookId: readerStore.currentBook!.id,
            chapterId,
          });
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
      setTimeout(() => {
        isTransitioning.value = false;
        uiStore.showControls = wasShowingControls;
        void pluginEvents.emit("content:loaded", {
          bookId: readerStore.currentBook!.id,
          chapterId,
        });
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

function getPageForCfi(cfi: string): number | null {
  const doc = readerContentRef.value?.getDocument?.();
  if (!doc?.body) return null;
  const target = resolveCfi(cfi, doc.body);
  if (!target || !doc.body.contains(target.node)) return null;
  const range = doc.createRange();
  if (target.node.nodeType === Node.TEXT_NODE) {
    range.setStart(target.node, Math.min(target.offset, (target.node.textContent || "").length));
  } else {
    range.setStart(target.node, 0);
  }
  range.collapse(true);
  const bodyRect = doc.body.getBoundingClientRect();
  const rangeRect = range.getBoundingClientRect();
  return pagination.getPageAtOffset(rangeRect.left - bodyRect.left);
}

function handleInternalLinkClick(href: string) {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
    return;
  }

  const hashIndex = href.indexOf("#");
  const filePath = hashIndex > 0 ? href.substring(0, hashIndex) : href;
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
      const offsetInBody = targetRect.left - articleRect.left;
      pagination.goToPage(pagination.getPageAtOffset(offsetInBody));
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const currentChapterId = readerStore.currentChapter?.id;

  if (!filePath) {
    scrollToAnchor();
    if (currentChapterId) {
      navStack.push({
        chapterId: currentChapterId,
        page: isPaginationMode.value ? pagination.currentPage.value : 0,
      });
    }
    return;
  }

  const targetChapter = readerStore.chapters.find((c) => chapterMatchesHref(c, filePath));
  if (!targetChapter) return;

  if (targetChapter.id === readerStore.currentChapter?.id) {
    if (isPaginationMode.value) {
      waitForPaginationReady().then(() => {
        scrollToAnchor();
        navStack.push({ chapterId: targetChapter.id, page: pagination.currentPage.value });
      });
    } else {
      scrollToAnchor();
      navStack.push({ chapterId: targetChapter.id, page: 0 });
    }
    return;
  }

  handleSelectChapter(targetChapter.id).then(async () => {
    if (!anchor) {
      navStack.push({
        chapterId: targetChapter.id,
        page: isPaginationMode.value ? pagination.currentPage.value : 0,
      });
      return;
    }

    if (isPaginationMode.value) {
      await waitForPaginationReady();
      scrollToAnchor();
      navStack.push({ chapterId: targetChapter.id, page: pagination.currentPage.value });
    } else {
      await nextTick();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToAnchor();
          navStack.push({ chapterId: targetChapter.id, page: 0 });
        });
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
}

// ── Navigation history ──

function handleHistoryBack() {
  const entry = navStack.back();
  if (!entry) return;
  if (entry.chapterId === readerStore.currentChapter?.id) {
    if (isPaginationMode.value) pagination.goToPage(entry.page);
  } else {
    handleSelectChapter(entry.chapterId, entry.page);
  }
}

function handleHistoryForward() {
  const entry = navStack.forward();
  if (!entry) return;
  if (entry.chapterId === readerStore.currentChapter?.id) {
    if (isPaginationMode.value) pagination.goToPage(entry.page);
  } else {
    handleSelectChapter(entry.chapterId, entry.page);
  }
}

// ── CFI navigation ──

async function navigateToCfiLocation(cfi: string, chapterId: string) {
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

      const page = getPageForCfi(cfi);
      if (page !== null) {
        pagination.goToPage(page);
      } else {
        pagination.goToPage(0);
      }
    } else {
      const article = readerContentRef.value?.getArticle?.();
      if (article) {
        navigateToCfi(cfi, article);
      }
    }

    closeModal();
    navStack.push({
      chapterId: targetChapter.id,
      page: isPaginationMode.value ? pagination.currentPage.value : 0,
    });
  } finally {
    isTransitioning.value = false;
  }
}

const updateThemeClass = () => {
  const container = document.querySelector(".reader-view-container");
  if (!container) return;
  container.classList.remove("theme-light", "theme-dark", "theme-sepia");
  container.classList.add(`theme-${settingsStore.settings.theme}`);
  document.body.classList.remove("theme-light", "theme-dark", "theme-sepia");
  document.body.classList.add(`theme-${settingsStore.settings.theme}`);
};

// Scroll mode: load surrounding chapters on chapter change
// Watch for scroll mode changes
watch(
  () => settingsStore.settings.scrollMode,
  async (newMode) => {
    if (newMode === "vertical" && readerStore.chapters.length > 0) {
      await chapterLoader.loadCurrentAndAdjacent(2);
    } else if (newMode === "pagination" && readerStore.currentChapter) {
      const content = await readerStore.getCurrentChapterContent();
      let html = content?.html || "";
      if (html && readerStore.currentBook) {
        html = await applyContentTransformers(html, {
          bookId: readerStore.currentBook.id,
          chapterId: readerStore.currentChapter.id,
        });
      }
      const resources = content?.resources || [];
      currentChapterResources.value = resources;
      readerContentRef.value?.syncEpubResources?.(resources);
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

// Watch for page changes in pagination mode to auto-save + emit event
watch([() => pagination.currentPage.value, () => pagination.totalPages.value], ([page, total]) => {
  if (!isPaginationMode.value) return;
  const chapterId = readerStore.currentChapter?.id;
  const bookId = readerStore.currentBook?.id;
  if (chapterId && bookId) {
    void pluginEvents.emit("page:changed", { bookId, chapterId, page, totalPages: total });
  }
});

function handleIframeReady() {
  const doc = readerContentRef.value?.getDocument?.();
  if (!doc) return;

  setupDirectHandlers(doc);
  setupScrollHandler(doc);

  for (const cb of iframeReadyCallbacks) {
    cb();
  }

  const chapterId = readerStore.currentChapter?.id;
  const bookId = readerStore.currentBook?.id;
  if (chapterId && bookId) {
    void pluginEvents.emit("content:loaded", { bookId, chapterId });
  }
}

// Lifecycle
onMounted(async () => {
  updateThemeClass();

  uiStore.showControls = true;

  isRestoring.value = true;
  try {
    if (isPaginationMode.value && readerStore.currentChapter) {
      const content = await readerStore.getCurrentChapterContent();
      let html = content?.html || "";
      if (html && readerStore.currentBook) {
        html = await applyContentTransformers(html, {
          bookId: readerStore.currentBook.id,
          chapterId: readerStore.currentChapter.id,
        });
      }
      const resources = content?.resources || [];
      currentChapterResources.value = resources;
      readerContentRef.value?.syncEpubResources?.(resources);
      await pagination.paginate(readerStore.currentChapter.id, { html, resources });
    } else {
      await chapterLoader.loadCurrentAndAdjacent(2);
    }
  } finally {
    isRestoring.value = false;
  }

  void pluginEvents.emit("reader:mounted", { bookId: props.book.id });
});

onUnmounted(() => {
  void pluginEvents.emit("reader:unmounted", { bookId: props.book.id });

  gestureCleanup?.();
  gestureCleanup = null;
  scrollCleanup?.();
  scrollCleanup = null;
  cleanupFns.forEach((fn) => fn());
  cleanupFns.length = 0;
  iframeReadyCallbacks = [];
  chapterChangeCallbacks = [];
  unregisterReaderHost();
  pagination.cleanup();
  navStack.reset();
});
</script>

<template>
  <div class="reader-view-container">
    <ReaderHeader
      :book-title="book.title"
      :chapter-title="readerStore.currentChapter?.title"
      :show-controls="uiStore.showControls"
      @close="handleClose"
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
      :loaded-chapters="transformedLoadedContent"
      :epub-resources="currentChapterResources"
      :on-link-click="handleInternalLinkClick"
      :on-column-layout="handleColumnLayout"
      :on-chapters-changed="handleChaptersChanged"
      :on-iframe-ready="handleIframeReady"
    />

    <ReaderFooter
      :show-controls="uiStore.showControls"
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
    />

    <PageIndicator
      :current-page="pagination.currentPage.value"
      :total-pages="pagination.totalPages.value"
      :show="uiStore.showControls && isPaginationMode && pagination.isReady.value"
    />

    <!-- Navigation history back/forward -->
    <button
      v-show="uiStore.showControls && navStack.canGoBack.value"
      class="history-btn history-back"
      @click.stop="handleHistoryBack"
      aria-label="Go back"
    >
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
    <button
      v-show="uiStore.showControls && navStack.canGoForward.value"
      class="history-btn history-forward"
      @click.stop="handleHistoryForward"
      aria-label="Go forward"
    >
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
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </button>

    <!-- Plugin overlay components (e.g. annotation toolbar + popover, search go-back) -->
    <component v-for="(comp, name) in overlayComponents" :key="name" :is="comp" />

    <ModalWrapper
      :modal-type="uiStore.activeModal"
      :chapters="readerStore.chapters"
      :current-chapter-id="readerStore.currentChapter?.id ?? null"
      @close="closeModal"
      @select-chapter="handleSelectChapter"
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

.history-btn {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 101;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-elevated, #fff);
  color: var(--reader-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  -webkit-tap-highlight-color: transparent;
  opacity: 0.5;
  transition: opacity 200ms ease;
}
.history-btn:hover {
  opacity: 1;
  border-color: var(--accent);
  color: var(--accent);
}
.history-back {
  left: max(12px, env(safe-area-inset-left, 0));
}
.history-forward {
  right: max(12px, env(safe-area-inset-right, 0));
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

.reader-view-container {
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
}
</style>
