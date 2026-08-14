import { ref, computed, shallowRef, watch, onMounted, onUnmounted, type Ref } from "vue";
import { ReflowableHost, computePageFromOffset, computeAnchorScrollTop } from "@book/engine";
import type { ReaderState, ReaderAction, ReaderEffect } from "@book/engine";
import { createInitialState } from "@book/engine";
import { getParserForFormat } from "@book/parser";
import { currentSession } from "../stores/reader-session";
import { useUIStore } from "../stores/ui";
import { fetchChapterContent } from "../storage/chapter-content";
import {
  applyContentTransformers,
  getOverlayComponents,
  getHeaderActions,
  pluginStateVersion,
} from "../core/plugin-runtime/registry";
import { pluginEvents, pluginHooks } from "../core/plugin-runtime/context";
import type { InitConfig } from "../core/plugin-runtime/types";
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
    case "MODE_CHANGED":
      void pluginEvents.emit("mode:changed", { bookId, mode: effect.mode });
      break;
    case "SCROLL_PROGRESS_UPDATED":
      void pluginEvents.emit("scroll:progress", {
        bookId,
        progress: effect.progress,
        anchor: effect.anchor,
      });
      break;
    case "READER_UNMOUNTED":
      void pluginEvents.emit("reader:unmounted", {
        bookId: effect.bookId,
        chapterId: effect.chapterId ?? undefined,
        chapterIndex: effect.chapterIndex,
        mode: effect.mode,
        page: effect.page,
        scrollProgress: effect.scrollProgress,
        scrollAnchor: effect.scrollAnchor,
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

  const state = shallowRef<ReaderState>(createInitialState());
  const isRestoring = ref(true);
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

  function retry() {
    host?.retry();
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
        const { html } = await fetchChapterContent(bookId, chapterId);
        const { getZip } = await import("../storage/raw-data");
        const rawData = await getZip(bookId);
        return { html, rawData };
      },
      extractResource: async (rawData, path) => {
        const parser = getParserForFormat(bookFormat.value);
        return parser?.extractResource?.(rawData, path);
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
    // host.destroy() emits READER_UNMOUNTED asynchronously (microtask); the
    // plugin's exit save reads the session. Drop the reference afterwards so
    // the final save is not silently skipped.
    queueMicrotask(() => {
      currentSession.value = null;
    });
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
        const step = doc.documentElement.clientWidth;
        if (step > 0) {
          host?.dispatch({
            type: "GO_TO_PAGE",
            page: computePageFromOffset(
              element.getBoundingClientRect().left,
              doc.body.getBoundingClientRect().left,
              step,
            ),
          });
        }
      }
    } else {
      const element = resolveCfiToElement(cfi, doc.body);
      if (element) {
        doc.documentElement.scrollTop = computeAnchorScrollTop(
          element.getBoundingClientRect().top,
          doc.documentElement.scrollTop,
        );
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
    hasError,
    errorMessage,
    retry,
    handleSelectChapter,
    nextPage,
    prevPage,
    handleInternalLinkClick,
    currentPage,
    totalPages,
    navigateToCfiLocation,
  };
}
