import { ref, computed, onMounted, onUnmounted, watch, type Ref } from "vue";
import { useReaderStore } from "../stores/reader";
import { useUIStore } from "../stores/ui";
import { useNavigationStack } from "./useNavigationStack";
import { registerReaderHost, unregisterReaderHost } from "../core/reader-host";
import type { ReaderHost } from "../core/reader-host";
import {
  getOverlayComponents,
  getHeaderActions,
  pluginStateVersion,
} from "../plugins/manager/registry";
import { pluginEvents } from "../plugins/context";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../config/constants";
import { getChapterContent as fetchChapterContent } from "../storage/books";
import type { Chapter } from "../core/types";
import { usePaginationStrategy } from "./reading-strategies/pagination-strategy";
import { useScrollStrategy } from "./reading-strategies/scroll-strategy";
import type {
  ReadingStrategy,
  StrategyContext,
  StrategyCallbacks,
} from "./reading-strategies/types";

export interface ReaderContentAPI {
  getDocument?(): Document | null;
  getArticle?(): HTMLElement | null;
  paginateToChapter?(chapterId: string): void;
  syncResources?(elements: HTMLElement[]): void;
}

export function useReaderEngine(
  bookId: Ref<string>,
  readerContentRef: Ref<ReaderContentAPI | null>,
) {
  const readerStore = useReaderStore();
  const uiStore = useUIStore();
  const navStack = useNavigationStack();

  // ── Shared state ──
  const readingMode = ref<"vertical" | "pagination">("pagination");
  const pageMargin = ref(24);
  const isTransitioning = ref(false);
  const isRestoring = ref(false);
  const currentChapterIndex = computed(() =>
    readerStore.chapters.findIndex((c) => c.id === readerStore.currentChapter?.id),
  );

  // ── Cleanup registry ──
  const cleanupFns: (() => void)[] = [];
  let iframeReadyCallbacks: (() => void)[] = [];
  let chapterChangeCallbacks: ((chapterId: string) => void)[] = [];
  let gestureCleanup: (() => void) | null = null;

  // ── Plugin UI computeds ──
  const overlayComponents = computed(() => {
    void pluginStateVersion.value;
    return getOverlayComponents();
  });

  const headerActions = computed(() => {
    void pluginStateVersion.value;
    return getHeaderActions();
  });

  // ── Strategy callbacks (engine → strategy communication) ──

  const callbacks: StrategyCallbacks = {
    onChapterChanged(chapterId: string, previousChapterId?: string) {
      for (const cb of chapterChangeCallbacks) cb(chapterId);
      const bid = readerStore.currentBook?.id;
      if (bid) {
        void pluginEvents.emit("chapter:changed", { bookId: bid, chapterId, previousChapterId });
      }
    },

    onPageChanged(page: number, totalPages: number) {
      const chId = readerStore.currentChapter?.id;
      const bId = readerStore.currentBook?.id;
      if (chId && bId) {
        void pluginEvents.emit("page:changed", { bookId: bId, chapterId: chId, page, totalPages });
      }
    },

    onContentLoaded(chapterId: string) {
      const bId = readerStore.currentBook?.id;
      if (bId) {
        void pluginEvents.emit("content:loaded", { bookId: bId, chapterId });
      }
    },

    onProgressUpdate(bookPercent: number, chapterPercent: number) {
      if (isRestoring.value) return;
      readerStore.updateProgress(bookPercent, chapterPercent);
    },

    setTransitioning(value: boolean) {
      isTransitioning.value = value;
    },

    isRestoring() {
      return isRestoring.value;
    },
  };

  // ── Strategy context (engine → strategy dependency injection) ──

  const strategyContext: StrategyContext = {
    bookId,
    chapters: computed(() => readerStore.chapters),
    currentChapter: computed({
      get: () => readerStore.currentChapter,
      set: (ch: Chapter | null) => {
        readerStore.currentChapter = ch;
      },
    }) as unknown as Ref<Chapter | null>,
    currentChapterIndex,
    resourceUrls: computed(() => readerStore.resourceUrls) as unknown as Ref<
      Map<string, string> | undefined
    >,
    callbacks,

    async getChapterContent(chapterId: string) {
      // Navigate to chapter (fetches content, sets currentChapter)
      await readerStore.goToChapter(chapterId);
      // Resolve resources
      return readerStore.getCurrentChapterContent();
    },

    getDocument() {
      return readerContentRef.value?.getDocument?.() ?? null;
    },

    getArticle() {
      return readerContentRef.value?.getArticle?.() ?? null;
    },

    syncResources(elements: HTMLElement[]) {
      readerContentRef.value?.syncResources?.(elements);
    },
  };

  // ── Strategies (both created, one active) ──

  const paginationStrategy = usePaginationStrategy(strategyContext);
  const scrollStrategy = useScrollStrategy(strategyContext);

  const activeStrategy = computed<ReadingStrategy>(() =>
    readingMode.value === "pagination" ? paginationStrategy : scrollStrategy,
  );

  // Proxy refs that delegate to the active strategy
  const currentChapterResources = computed(() => activeStrategy.value.chapterResources.value);
  const transformedLoadedContent = computed(() => activeStrategy.value.loadedChapters.value);

  // ── Mode switching ──

  watch(readingMode, (mode, prevMode) => {
    if (mode === prevMode) return;
    if (prevMode === "pagination") paginationStrategy.deactivate();
    else scrollStrategy.deactivate();

    if (mode === "pagination") void paginationStrategy.activate();
    else void scrollStrategy.activate();
  });

  // ── Navigation (delegated) ──

  async function handleSelectChapter(
    chapterId: string,
    targetPage: number = 0,
    autoClearTransition = true,
  ) {
    const wasShowingControls = uiStore.showControls;
    try {
      await activeStrategy.value.navigateToChapter(chapterId, targetPage, autoClearTransition);
    } finally {
      uiStore.showControls = wasShowingControls;
    }
  }

  async function nextPage() {
    await activeStrategy.value.goForward();
  }

  async function prevPage() {
    await activeStrategy.value.goBackward();
  }

  // ── History ──

  function pushHistoryEntry() {
    const chId = readerStore.currentChapter?.id;
    if (!chId) return;
    const page = activeStrategy.value.pagination?.currentPage.value ?? 0;
    navStack.push({ chapterId: chId, page });
  }

  function handleHistoryBack() {
    const entry = navStack.back();
    if (!entry) return;
    if (entry.chapterId === readerStore.currentChapter?.id) {
      if (activeStrategy.value.pagination) {
        activeStrategy.value.pagination.goToPage(entry.page);
      }
    } else {
      void handleSelectChapter(entry.chapterId, entry.page);
    }
  }

  function handleHistoryForward() {
    const entry = navStack.forward();
    if (!entry) return;
    if (entry.chapterId === readerStore.currentChapter?.id) {
      if (activeStrategy.value.pagination) {
        activeStrategy.value.pagination.goToPage(entry.page);
      }
    } else {
      void handleSelectChapter(entry.chapterId, entry.page);
    }
  }

  // ── Internal links ──

  function handleInternalLinkClick(href: string) {
    const currentChId = readerStore.currentChapter?.id;
    activeStrategy.value.handleInternalLinkClick(href);
    // Push history if chapter changed or anchor was navigated
    const newChId = readerStore.currentChapter?.id;
    if (newChId && newChId !== currentChId) {
      pushHistoryEntry();
    }
  }

  // ── Column layout (pagination only) ──

  function handleColumnLayout(data: { contentWidth: number; iframeWidth: number }) {
    activeStrategy.value.pagination?.updateColumnLayout(data.contentWidth, data.iframeWidth);
  }

  // ── Chapters changed ──

  function handleChaptersChanged() {
    activeStrategy.value.onChaptersChanged();
  }

  // ── Iframe ready ──

  function shouldIgnoreTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    return !!(
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("select") ||
      target.closest("a[href]") ||
      target.closest("[contenteditable]")
    );
  }

  function handleIframeReady() {
    const doc = readerContentRef.value?.getDocument?.();
    if (!doc) return;

    // Set up mode-specific gesture handler (left/right tap zones for pagination)
    gestureCleanup?.();
    gestureCleanup = null;
    gestureCleanup = activeStrategy.value.setupGestureHandler(doc);

    // Notify strategy
    activeStrategy.value.onIframeReady(doc);

    // Fire engine-level iframe-ready callbacks
    for (const cb of iframeReadyCallbacks) cb();

    // Emit content:loaded
    const chId = readerStore.currentChapter?.id;
    const bId = readerStore.currentBook?.id;
    if (chId && bId) {
      void pluginEvents.emit("content:loaded", { bookId: bId, chapterId: chId });
    }

    // Engine-level gesture: modal dismiss + controls toggle
    const strategyCleanup = gestureCleanup;
    const engineClickHandler = (e: MouseEvent) => {
      if (shouldIgnoreTarget(e.target)) return;
      if (uiStore.activeModal) {
        uiStore.closeModal();
        return;
      }
      if (readingMode.value === "pagination") {
        // Pagination: only center zone toggles controls (strategy handles left/right)
        const x = e.clientX;
        const w = window.innerWidth;
        if (x >= w * TAP_ZONE_LEFT && x <= w * TAP_ZONE_RIGHT) {
          uiStore.toggleControls();
        }
      } else {
        // Scroll: tap anywhere toggles controls
        uiStore.toggleControls();
      }
    };
    doc.addEventListener("click", engineClickHandler);
    gestureCleanup = () => {
      strategyCleanup?.();
      doc.removeEventListener("click", engineClickHandler);
    };
  }

  // ── Reload ──

  async function reloadForPagination() {
    const chId = readerStore.currentChapter?.id;
    if (!chId) return;
    paginationStrategy.deactivate();
    await paginationStrategy.activate();
  }

  async function navigateToCfiLocation(cfi: string, chapterId: string) {
    await activeStrategy.value.navigateToCfi(cfi, chapterId);
    pushHistoryEntry();
  }

  async function switchReadingMode(mode: "vertical" | "pagination") {
    if (readingMode.value === mode) return;
    readingMode.value = mode;
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
    isPaginationMode: computed(() => readingMode.value === "pagination"),
    setReadingMode(mode: "vertical" | "pagination") {
      void switchReadingMode(mode);
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
      return activeStrategy.value.pagination?.currentPage.value ?? 0;
    },
    getTotalPages() {
      return activeStrategy.value.pagination?.totalPages.value ?? 0;
    },
    goToPage(page: number) {
      activeStrategy.value.pagination?.goToPage(page);
    },
    async nextPage() {
      await nextPage();
      return true;
    },
    pushToHistory(chapterId: string, page: number) {
      navStack.push({ chapterId, page });
    },
    getCurrentChapterRawHtml() {
      return "";
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
      await activeStrategy.value.activate();
    } finally {
      isRestoring.value = false;
    }
    void pluginEvents.emit("reader:mounted", { bookId: bookId.value });
  });

  onUnmounted(() => {
    void pluginEvents.emit("reader:unmounted", { bookId: bookId.value });
    gestureCleanup?.();
    gestureCleanup = null;
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
    iframeReadyCallbacks = [];
    chapterChangeCallbacks = [];
    unregisterReaderHost();
    paginationStrategy.deactivate();
    scrollStrategy.deactivate();
    navStack.reset();
  });

  // ── Public interface (same shape as before for ReaderView compatibility) ──

  return {
    // State
    readingMode,
    pageMargin,
    isTransitioning,
    isRestoring,
    currentChapterResources,
    // Computed
    currentChapterIndex,
    isPaginationMode: computed(() => readingMode.value === "pagination"),
    chapterProgress: computed(() => activeStrategy.value.chapterProgress.value),
    readingProgress: computed(() => activeStrategy.value.readingProgress.value),
    totalBookProgress: computed(() => activeStrategy.value.totalBookProgress.value),
    displayContent: computed(() => activeStrategy.value.displayContent.value),
    chapterLoading: computed(() => {
      if (isRestoring.value) return true;
      if (isTransitioning.value) return true;
      return activeStrategy.value.isLoading.value;
    }),
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
    currentPage: computed(() => activeStrategy.value.pagination?.currentPage.value ?? 0),
    totalPages: computed(() => activeStrategy.value.pagination?.totalPages.value ?? 1),
    // Lifecycle helpers for ReaderHost consumers
    reloadForPagination,
    navigateToCfiLocation,
  };
}
