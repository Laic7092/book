import { ref, computed, onMounted, onUnmounted, watch, nextTick, type Ref } from "vue";
import { useReaderStore } from "../stores/reader";
import { useUIStore } from "../stores/ui";
import { useColumnPagination } from "./useColumnPagination";
import { useChapterLoader } from "./useChapterLoader";
import { useNavigationStack } from "./useNavigationStack";
import { rewriteResourcePaths } from "../reader-engine/resource-urls";
import { navigateToCfi, resolveCfi, getSpineIndex } from "../utils/epub-cfi";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../config/constants";
import { registerReaderHost, unregisterReaderHost } from "../core/reader-host";
import type { ReaderHost } from "../core/reader-host";
import {
  getOverlayComponents,
  getHeaderActions,
  pluginStateVersion,
  applyContentTransformers,
} from "../plugins/registry";
import { pluginEvents } from "../plugins/context";
import { getChapterContent as fetchChapterContent } from "../storage/books";
import type { Chapter } from "../core/types";

export interface ReaderContentAPI {
  getDocument?(): Document | null;
  getArticle?(): HTMLElement | null;
  scrollToChapter?(chapterId: string): void;
  syncEpubResources?(elements: HTMLElement[]): void;
}

export function useReaderEngine(
  bookId: Ref<string>,
  readerContentRef: Ref<ReaderContentAPI | null>,
) {
  const readerStore = useReaderStore();
  const uiStore = useUIStore();
  const pagination = useColumnPagination();
  const navStack = useNavigationStack();

  // ── Refs ──
  const scrollMode = ref<"vertical" | "pagination">("pagination");
  const pageMargin = ref(24);
  const isTransitioning = ref(false);
  const isRestoring = ref(false);
  const currentChapterResources = ref<HTMLElement[]>([]);

  // ── Cleanup registry ──
  const cleanupFns: (() => void)[] = [];
  let iframeReadyCallbacks: (() => void)[] = [];
  let chapterChangeCallbacks: ((chapterId: string) => void)[] = [];

  // ── Computeds ──
  const overlayComponents = computed(() => {
    void pluginStateVersion.value;
    return getOverlayComponents();
  });

  const headerActions = computed(() => {
    void pluginStateVersion.value;
    return getHeaderActions();
  });

  const currentChapterIndex = computed(() =>
    readerStore.chapters.findIndex((c) => c.id === readerStore.currentChapter?.id),
  );

  const isPaginationMode = computed(() => scrollMode.value === "pagination");

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
    const portion = 100 / total;
    return Math.round(current * portion + (chapterProgress.value / 100) * portion);
  });

  const totalBookProgress = computed(() => {
    const total = readerStore.chapters.length;
    if (total <= 1) return Math.max(1, Math.round(chapterProgress.value));
    const current = currentChapterIndex.value;
    const portion = 100 / total;
    return Math.round(current * portion + (chapterProgress.value / 100) * portion);
  });

  const displayContent = computed(() => {
    if (isPaginationMode.value) return pagination.currentHtml.value;
    return "";
  });

  const chapterLoading = computed(() => {
    if (isRestoring.value) return true;
    if (isTransitioning.value) return true;
    if (isPaginationMode.value && !pagination.isReady.value) return true;
    return false;
  });

  // ── Chapter loader ──
  const chapterLoader = useChapterLoader(
    computed(() => bookId.value),
    readerStore.$state,
    currentChapterIndex,
  );

  // ── Content pipeline ──
  const rewrittenLoadedContent = computed(() => {
    const chapters = chapterLoader.allLoadedContent.value;
    const urls = readerStore.resourceUrls;
    return chapters.map((ch) => {
      if (urls && urls.size > 0) {
        const doc = rewriteResourcePaths(ch.content, urls);
        return { ...ch, content: doc.body.innerHTML };
      }
      const parser = new DOMParser();
      const doc = parser.parseFromString(ch.content, "text/html");
      return { ...ch, content: doc.body.innerHTML };
    });
  });

  const transformedLoadedContent = ref<typeof rewrittenLoadedContent.value>([]);
  let transformSeq = 0;

  async function refreshTransformedContent() {
    const seq = ++transformSeq;
    const source = rewrittenLoadedContent.value;
    const bid = readerStore.currentBook?.id;
    if (!bid) {
      transformedLoadedContent.value = source;
      return;
    }
    const result = await Promise.all(
      source.map(async (ch) => {
        try {
          const html = await applyContentTransformers(ch.content, {
            bookId: bid,
            chapterId: ch.chapterId,
          });
          return { ...ch, content: html };
        } catch {
          return ch;
        }
      }),
    );
    if (seq === transformSeq) transformedLoadedContent.value = result;
  }

  watch(
    [rewrittenLoadedContent, pluginStateVersion, () => readerStore.currentBook?.id],
    () => {
      refreshTransformedContent();
    },
    { immediate: true },
  );

  // ── Page change watcher ──
  watch(
    [() => pagination.currentPage.value, () => pagination.totalPages.value],
    ([page, total]) => {
      if (!isPaginationMode.value) return;
      const chId = readerStore.currentChapter?.id;
      const bId = readerStore.currentBook?.id;
      if (chId && bId) {
        void pluginEvents.emit("page:changed", {
          bookId: bId,
          chapterId: chId,
          page,
          totalPages: total,
        });
      }
    },
  );

  // ── Chapter navigation ──
  async function handleSelectChapter(
    chapterId: string,
    targetPage: number = 0,
    autoClearTransition = true,
  ) {
    isTransitioning.value = true;
    const wasShowingControls = uiStore.showControls;
    const previousChapterId = readerStore.currentChapter?.id;
    try {
      await readerStore.goToChapter(chapterId);

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

      for (const cb of chapterChangeCallbacks) cb(chapterId);
      void pluginEvents.emit("chapter:changed", {
        bookId: readerStore.currentBook!.id,
        chapterId,
        previousChapterId,
      });

      if (isPaginationMode.value && autoClearTransition) {
        const onReady = async () => {
          isTransitioning.value = false;
          uiStore.showControls = wasShowingControls;
          void pluginEvents.emit("content:loaded", {
            bookId: readerStore.currentBook!.id,
            chapterId,
          });
        };
        if (pagination.isReady.value) {
          await onReady();
        } else {
          const stop = watch(
            () => pagination.isReady.value,
            (ready) => {
              if (ready) {
                stop();
                onReady();
              }
            },
          );
        }
      } else if (!isPaginationMode.value) {
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
  }

  async function nextPage() {
    if (pagination.isPaginating.value) return;
    if (isPaginationMode.value) {
      const moved = pagination.nextPage();
      if (!moved) {
        const idx = currentChapterIndex.value;
        if (idx < readerStore.chapters.length - 1) {
          await handleSelectChapter(readerStore.chapters[idx + 1].id, 0);
        }
      }
    } else {
      const idx = currentChapterIndex.value;
      if (idx < readerStore.chapters.length - 1) {
        await handleSelectChapter(readerStore.chapters[idx + 1].id);
      }
    }
  }

  async function prevPage() {
    if (pagination.isPaginating.value) return;
    if (isPaginationMode.value) {
      if (pagination.currentPage.value > 0) {
        pagination.prevPage();
      } else {
        const idx = currentChapterIndex.value;
        if (idx > 0) {
          await handleSelectChapter(readerStore.chapters[idx - 1].id, -1);
        }
      }
    } else {
      const idx = currentChapterIndex.value;
      if (idx > 0) {
        await handleSelectChapter(readerStore.chapters[idx - 1].id);
      }
    }
  }

  // ── Pagination helpers ──
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

  async function navigateToCfiLocation(cfi: string, chapterId: string) {
    const spineIndex = getSpineIndex(cfi);
    if (spineIndex < 0) return;
    const targetChapter = readerStore.chapters.find((c) => c.order === spineIndex);
    if (!targetChapter) {
      const fallback = readerStore.chapters.find((c) => c.id === chapterId);
      if (!fallback) return;
      await handleSelectChapter(fallback.id);
      return;
    }
    isTransitioning.value = true;
    try {
      if (targetChapter.id !== readerStore.currentChapter?.id) {
        await handleSelectChapter(targetChapter.id, 0, false);
      }
      if (isPaginationMode.value) {
        await waitForPaginationReady();
        const page = getPageForCfi(cfi);
        pagination.goToPage(page ?? 0);
      } else {
        const article = readerContentRef.value?.getArticle?.();
        if (article) navigateToCfi(cfi, article);
      }
      navStack.push({
        chapterId: targetChapter.id,
        page: isPaginationMode.value ? pagination.currentPage.value : 0,
      });
    } finally {
      isTransitioning.value = false;
    }
  }

  // ── Internal links ──
  function chapterMatchesHref(chapter: Chapter, filePath: string): boolean {
    if (!chapter.href) return false;
    return (
      chapter.href === filePath ||
      chapter.href.endsWith(filePath) ||
      chapter.href.endsWith("/" + filePath) ||
      chapter.href.includes(filePath)
    );
  }

  function handleInternalLinkClick(href: string) {
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))
      return;

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
        pagination.goToPage(pagination.getPageAtOffset(targetRect.left - articleRect.left));
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    const currentChId = readerStore.currentChapter?.id;

    if (!filePath) {
      scrollToAnchor();
      if (currentChId) {
        navStack.push({
          chapterId: currentChId,
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

  // ── Column layout ──
  function handleColumnLayout(data: {
    columnWidth: number;
    gap: number;
    scrollWidth: number;
    iframeWidth: number;
  }) {
    pagination.updateColumnLayout(data.columnWidth, data.gap, data.scrollWidth);
  }

  function handleChaptersChanged() {
    refreshScrollObserver();
  }

  // ── Scroll observer (vertical mode) ──
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
          const el = doc.querySelector<HTMLElement>(
            `[data-chapter-id="${scrollCurrentChapterId}"]`,
          );
          if (el && el.offsetHeight > 0) {
            chapterProgressVal = Math.min(
              100,
              Math.max(0, Math.round(((scrollTop - el.offsetTop) / el.offsetHeight) * 100)),
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
        const prevChId = readerStore.currentChapter?.id;
        if (scrollCurrentChapterId && scrollCurrentChapterId !== prevChId) {
          const chapter = readerStore.chapters.find((c) => c.id === scrollCurrentChapterId);
          if (chapter) {
            readerStore.currentChapter = chapter;
            for (const cb of chapterChangeCallbacks) cb(scrollCurrentChapterId);
            void pluginEvents.emit("chapter:changed", {
              bookId: readerStore.currentBook!.id,
              chapterId: scrollCurrentChapterId,
              previousChapterId: prevChId,
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

  // ── Gesture handling ──
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

  function setupDirectHandlers(doc: Document) {
    if (gestureCleanup) return;
    const handleClick = (e: MouseEvent) => {
      if (shouldIgnoreTarget(e.target)) return;
      if (uiStore.activeModal) {
        uiStore.closeModal();
        return;
      }
      if (isPaginationMode.value) {
        const w = window.innerWidth;
        const x = e.clientX;
        if (x < w * TAP_ZONE_LEFT) prevPage();
        else if (x > w * TAP_ZONE_RIGHT) nextPage();
        else uiStore.toggleControls();
      } else {
        uiStore.toggleControls();
      }
    };
    doc.addEventListener("click", handleClick);
    gestureCleanup = () => doc.removeEventListener("click", handleClick);
  }

  // ── Iframe ready ──
  function handleIframeReady() {
    const doc = readerContentRef.value?.getDocument?.();
    if (!doc) return;
    setupDirectHandlers(doc);
    setupScrollHandler(doc);
    for (const cb of iframeReadyCallbacks) cb();
    const chId = readerStore.currentChapter?.id;
    const bId = readerStore.currentBook?.id;
    if (chId && bId) {
      void pluginEvents.emit("content:loaded", { bookId: bId, chapterId: chId });
    }
  }

  // ── History ──
  function handleHistoryBack() {
    const entry = navStack.back();
    if (!entry) return;
    if (entry.chapterId === readerStore.currentChapter?.id) {
      if (isPaginationMode.value) pagination.goToPage(entry.page);
    } else {
      void handleSelectChapter(entry.chapterId, entry.page);
    }
  }

  function handleHistoryForward() {
    const entry = navStack.forward();
    if (!entry) return;
    if (entry.chapterId === readerStore.currentChapter?.id) {
      if (isPaginationMode.value) pagination.goToPage(entry.page);
    } else {
      void handleSelectChapter(entry.chapterId, entry.page);
    }
  }

  // ── Reload ──
  async function reloadForPagination() {
    const content = await readerStore.getCurrentChapterContent();
    let html = content?.html || "";
    if (html && readerStore.currentBook) {
      html = await applyContentTransformers(html, {
        bookId: readerStore.currentBook.id,
        chapterId: readerStore.currentChapter!.id,
      });
    }
    const resources = content?.resources || [];
    currentChapterResources.value = resources;
    readerContentRef.value?.syncEpubResources?.(resources);
    await pagination.paginate(readerStore.currentChapter!.id, { html, resources });
  }

  // ── ReaderHost ──
  const host: ReaderHost = {
    getDocument() {
      return readerContentRef.value?.getDocument?.() ?? null;
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
    getChapters() {
      return readerStore.chapters;
    },
    getCurrentBookId() {
      return readerStore.currentBook?.id;
    },
    isPaginationMode,
    setScrollMode(mode: "vertical" | "pagination") {
      if (scrollMode.value === mode) return;
      scrollMode.value = mode;
      if (mode === "vertical" && readerStore.chapters.length > 0) {
        void chapterLoader.loadCurrentAndAdjacent(2);
      } else if (mode === "pagination" && readerStore.currentChapter) {
        void reloadForPagination();
      }
    },
    setPageMargin(margin: number) {
      pageMargin.value = margin;
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
    async nextPage() {
      await nextPage();
      return true;
    },
    pushToHistory(chapterId: string, page: number) {
      navStack.push({ chapterId, page });
    },
    getCurrentChapterRawHtml() {
      return pagination.rawHtml.value;
    },
    async getChapterContent(chapterId: string) {
      return fetchChapterContent(bookId.value, chapterId);
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

  registerReaderHost(host);

  // ── Lifecycle ──
  onMounted(async () => {
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
    void pluginEvents.emit("reader:mounted", { bookId: bookId.value });
  });

  onUnmounted(() => {
    void pluginEvents.emit("reader:unmounted", { bookId: bookId.value });
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

  return {
    // State
    scrollMode,
    pageMargin,
    isTransitioning,
    isRestoring,
    currentChapterResources,
    // Computed
    currentChapterIndex,
    isPaginationMode,
    chapterProgress,
    readingProgress,
    totalBookProgress,
    displayContent,
    chapterLoading,
    overlayComponents,
    headerActions,
    // Content
    transformedLoadedContent,
    // Navigation
    handleSelectChapter,
    nextPage,
    prevPage,
    // History
    handleHistoryBack,
    handleHistoryForward,
    navStack,
    // Events
    handleInternalLinkClick,
    handleColumnLayout,
    handleChaptersChanged,
    handleIframeReady,
    // Pagination exposed
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    scrollOffset: pagination.scrollOffset,
    // Lifecycle helpers for ReaderHost consumers
    reloadForPagination,
    navigateToCfiLocation,
  };
}
