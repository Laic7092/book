import { ref, computed, shallowRef, watch, onMounted, onUnmounted, type Ref } from "vue";
import { ReflowableHost } from "@book/reader-engine";
import type { ReaderState, ReaderAction, ReaderEffect } from "@book/reader-core";
import { createInitialState } from "@book/reader-core";
import { currentSession } from "../stores/reader-session";
import { useUIStore } from "../stores/ui";
import { NavigationStack } from "./useNavigationStack";
import {
  applyContentTransformers,
  getOverlayComponents,
  getHeaderActions,
  pluginStateVersion,
} from "../plugins/manager/registry";
import { pluginEvents, pluginHooks } from "../plugins/context";
import type { InitConfig } from "../plugins/types";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../utils/constants";
import { parseCfi, resolveCfiToElement } from "../utils/epub-cfi";
import * as booksStore from "../storage/books";
import type { Chapter } from "../core/types";

export type { ReaderState, ReaderAction, ReaderEffect };

export function translateEffect(effect: ReaderEffect, bookId: string): void {
  switch (effect.type) {
    case "CHAPTER_DID_CHANGE":
      void pluginEvents.emit("chapter:changed", {
        bookId,
        chapterId: effect.chapterId,
        previousChapterId: effect.previousChapterId ?? undefined,
      });
      break;
    case "PAGE_DID_CHANGE":
      void pluginEvents.emit("page:changed", {
        bookId,
        chapterId: effect.chapterId,
        page: effect.page,
        totalPages: effect.totalPages,
      });
      break;
    case "CONTENT_DID_LOAD":
      void pluginEvents.emit("content:loaded", {
        bookId,
        chapterId: effect.chapterId,
      });
      break;
    case "READER_UNMOUNTED":
      void pluginEvents.emit("reader:unmounted", {
        bookId: effect.bookId,
      });
      break;
  }
}

export function useReaderMachine(
  bookId: Ref<string>,
  bookFormat: Ref<string>,
  containerRef: Ref<HTMLElement | null>,
) {
  void pluginEvents.emit("reader:init", { bookId: bookId.value });

  const uiStore = useUIStore();
  const navStack = new NavigationStack();

  const state = shallowRef<ReaderState>(createInitialState());
  const navSnapshot = shallowRef(navStack.getSnapshot());

  function syncNavSnapshot() {
    navSnapshot.value = navStack.getSnapshot();
  }

  const isRestoring = ref(true);
  const isHistoryNav = ref(false);
  let host: ReflowableHost | null = null;

  const overlayComponents = computed(() => {
    void pluginStateVersion.value;
    return getOverlayComponents();
  });
  const headerActions = computed(() => {
    void pluginStateVersion.value;
    return getHeaderActions();
  });

  const readingMode = computed<"vertical" | "pagination">(() =>
    state.value.mode === "scroll" ? "vertical" : "pagination",
  );
  const isPaginationMode = computed(() => state.value.mode === "pagination");
  const currentChapterIndex = computed(() => state.value.currentChapterIndex);
  const currentChapterId = computed(
    () => state.value.chapters[state.value.currentChapterIndex]?.id ?? null,
  );
  const chapterProgress = computed(() => {
    const { page, chapters, currentChapterIndex } = state.value;
    if (currentChapterIndex < 0 || chapters.length === 0) return 0;
    if (page.total <= 1) return 100;
    return ((page.current + 1) / page.total) * 100;
  });
  const readingProgress = computed(() => {
    const { chapters, currentChapterIndex } = state.value;
    const cp = chapterProgress.value;
    if (chapters.length <= 1) return Math.max(1, Math.round(cp));
    const portion = 100 / chapters.length;
    return Math.round(currentChapterIndex * portion + (cp / 100) * portion);
  });
  const totalBookProgress = readingProgress;
  const currentPage = computed(() => state.value.page.current);
  const totalPages = computed(() => state.value.page.total);
  const isTransitioning = computed(() => state.value.status === "loading");
  const hasError = computed(() => state.value.status === "error");
  const errorMessage = computed(() => (hasError.value ? state.value.lastError : null));

  const chapterLoading = computed(() => {
    if (isRestoring.value) return true;
    if (isTransitioning.value) return true;
    if (hasError.value) return false;
    return false;
  });

  const canGoBack = computed(() => navSnapshot.value.canGoBack);
  const canGoForward = computed(() => navSnapshot.value.canGoForward);

  const chapters = computed(() => state.value.chapters);
  const isReady = computed(() => state.value.status === "ready");

  function getIframeDoc(): Document | null {
    return host?.getDocument() ?? null;
  }

  // ── Navigation (delegate to host) ──

  function handleSelectChapter(chapterId: string, targetPage: number = 0) {
    host?.dispatch({ type: "GO_TO_CHAPTER", chapterId, targetPage });
  }

  function nextPage() {
    host?.nextPage();
  }

  function prevPage() {
    host?.prevPage();
  }

  function handleHistoryBack() {
    const entry = navStack.back();
    syncNavSnapshot();
    if (!entry) return;
    isHistoryNav.value = true;
    if (entry.chapterId === currentChapterId.value) {
      host?.dispatch({ type: "GO_TO_PAGE", page: entry.page });
    } else {
      host?.dispatch({
        type: "GO_TO_CHAPTER",
        chapterId: entry.chapterId,
        targetPage: entry.page,
      });
    }
    isHistoryNav.value = false;
  }

  function retry() {
    host?.retry();
  }

  function handleHistoryForward() {
    const entry = navStack.forward();
    syncNavSnapshot();
    if (!entry) return;
    isHistoryNav.value = true;
    if (entry.chapterId === currentChapterId.value) {
      host?.dispatch({ type: "GO_TO_PAGE", page: entry.page });
    } else {
      host?.dispatch({
        type: "GO_TO_CHAPTER",
        chapterId: entry.chapterId,
        targetPage: entry.page,
      });
    }
    isHistoryNav.value = false;
  }

  function handleInternalLinkClick(href: string) {
    host?.handleInternalLink(href);
  }

  // ── Lifecycle ──

  async function initMachine() {
    const fetched = await booksStore.getChapters(bookId.value);
    const chapters = fetched.map((ch) => ({
      id: ch.id,
      bookId: bookId.value,
      title: ch.title,
      order: ch.order,
      href: ch.href,
      inToc: ch.inToc,
    }));

    const baseConfig: InitConfig = {
      bookId: bookId.value,
      chapterIndex: 0,
      mode: readingMode.value === "vertical" ? "scroll" : "pagination",
    };
    void pluginHooks.run("reader:init-config", baseConfig).then((config) => {
      host!.init(
        bookId.value,
        chapters,
        config.chapterIndex,
        config.mode,
        config.initialPage,
        config.initialScroll,
        bookFormat.value,
      );
    });
  }

  onMounted(() => {
    const container = containerRef.value;
    if (!container) return;

    host = new ReflowableHost({
      container,
      onEffect: async (effect) => {
        translateEffect(effect, bookId.value);
      },
      onStateChange: (s) => {
        state.value = s;
      },
      onReady: () => {
        queueMicrotask(() => {
          isRestoring.value = false;
        });
        void pluginEvents.emit("reader:mounted", { bookId: bookId.value });
      },
      onClick: (e) => {
        if (uiStore.activeModal) {
          uiStore.closeModal();
          return;
        }
        if (state.value.mode === "pagination") {
          const w = window.innerWidth;
          const x = e.clientX;
          if (x < w * TAP_ZONE_LEFT) prevPage();
          else if (x > w * TAP_ZONE_RIGHT) nextPage();
          else uiStore.toggleControls();
        } else {
          uiStore.toggleControls();
        }
      },
      navigateToCfi: (cfi, chapterId) => navigateToCfiLocation(cfi, chapterId),
      fetchChapter: async (bookId, chapterId, _signal) => {
        const html = await booksStore.getChapterContent(bookId, chapterId);
        const { getZip } = await import("../storage/raw-data");
        const rawData = await getZip(bookId);
        return { html, rawData };
      },
      transformContent: (html, bookId, chapterId) =>
        applyContentTransformers(html, { bookId, chapterId }),
    });

    currentSession.value = host!.getSession();
    isRestoring.value = true;
    void initMachine();
  });

  onUnmounted(() => {
    host?.destroy();
    currentSession.value = null;
    navStack.reset();
  });

  // ── CFI navigation ──

  async function navigateToCfiLocation(cfi: string, chapterId: string) {
    const parsed = parseCfi(cfi);

    let targetChapter: Chapter | undefined;
    if (parsed) {
      targetChapter = state.value.chapters.find((c) => c.order === parsed.spineIndex);
    }
    if (!targetChapter) {
      targetChapter = state.value.chapters.find((c) => c.id === chapterId);
    }
    if (!targetChapter) return;

    if (targetChapter.id !== currentChapterId.value) {
      host?.dispatch({
        type: "GO_TO_CHAPTER",
        chapterId: targetChapter.id,
      });
      await new Promise<void>((resolve) => {
        const stop = watch(
          () => state.value.status,
          (status) => {
            if (status === "ready") {
              stop();
              resolve();
            }
          },
        );
      });
    }

    if (!parsed) return;

    const doc = getIframeDoc();
    if (!doc?.body) return;

    if (state.value.mode === "pagination") {
      const element = resolveCfiToElement(cfi, doc.body);
      if (element) {
        const bodyRect = doc.body.getBoundingClientRect();
        const elRect = element.getBoundingClientRect();
        const offset = elRect.left - bodyRect.left;
        const step = doc.documentElement.clientWidth;
        if (step > 0) {
          host?.dispatch({
            type: "GO_TO_PAGE",
            page: Math.floor(offset / step),
          });
        }
      }
    } else {
      const element = resolveCfiToElement(cfi, doc.body);
      if (element) {
        const top = element.getBoundingClientRect().top + doc.documentElement.scrollTop;
        doc.documentElement.scrollTop = top;
      }
    }
  }

  return {
    readingMode,
    isTransitioning,
    isRestoring,
    currentChapterId,
    currentChapterIndex,
    isPaginationMode,
    chapterProgress,
    readingProgress,
    totalBookProgress,
    chapterLoading,
    chapters,
    isReady,
    overlayComponents,
    headerActions,
    canGoBack,
    canGoForward,
    hasError,
    errorMessage,
    retry,
    handleSelectChapter,
    nextPage,
    prevPage,
    handleHistoryBack,
    handleHistoryForward,
    handleInternalLinkClick,
    currentPage,
    totalPages,
    navigateToCfiLocation,
    getDocument: getIframeDoc,
    reloadForPagination: () => {
      const chId = currentChapterId.value;
      if (chId) host?.goToChapter(chId);
    },
  };
}
