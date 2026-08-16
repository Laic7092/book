import { ref, computed, shallowRef, watch, onMounted, onUnmounted, type Ref } from "vue";
import { ReflowableHost, computePageFromOffset, computeAnchorScrollTop } from "@book/engine";
import type { ReaderState, ReaderAction, ReaderEffect } from "@book/engine";
import { createInitialState } from "@book/engine";
import { getParserForFormat } from "@book/parser";
import { currentSession } from "../core/reader-session";
import { useUIStore } from "../stores/ui";
import { fetchChapterContent } from "../services/chapter-content";
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
import type { ReaderMode } from "../utils/reader-mode";
import * as booksStore from "../storage/books";
import type { Chapter } from "../core/types";

export type { ReaderState, ReaderAction, ReaderEffect };

/**
 * Map unified machine effects to the plugin event bus. The machine speaks one
 * language (position + presentation); plugins keep their stable events
 * (chapter:changed / page:changed / scroll:progress / content:loaded /
 * mode:changed / reader:unmounted).
 */
export function translateEffect(effect: ReaderEffect, bookId: string): void {
  switch (effect.type) {
    case "POSITION_CHANGED": {
      const { chapterId, previousChapterId, position, presentation } = effect;
      if (chapterId && previousChapterId && previousChapterId !== chapterId) {
        void pluginEvents.emit("chapter:changed", {
          bookId,
          chapterId,
          previousChapterId,
        });
      }
      if (!chapterId) break;
      if (presentation.mode === "pagination") {
        void pluginEvents.emit("page:changed", {
          bookId,
          chapterId,
          page: presentation.page,
          totalPages: presentation.total,
        });
      } else {
        void pluginEvents.emit("scroll:progress", {
          bookId,
          progress: position.progress,
          anchor: position.anchor,
        });
      }
      break;
    }
    case "CONTENT_READY":
      void pluginEvents.emit("content:loaded", {
        bookId,
        chapterId: effect.chapterId,
      });
      break;
    case "MODE_CHANGED":
      void pluginEvents.emit("mode:changed", { bookId, mode: effect.mode });
      break;
    case "READER_UNMOUNTED":
      void pluginEvents.emit("reader:unmounted", {
        bookId: effect.bookId,
        chapterId: effect.chapterId ?? undefined,
        chapterIndex: effect.chapterIndex,
        mode: effect.mode,
        page: effect.page,
        progress: effect.progress,
        anchor: effect.anchor,
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
  /** Presentation mode — host-side fact, seeded from init-config, updated on
   * MODE_CHANGED. The machine reports it only after the first MEASURED. */
  const presentationMode = ref<"pagination" | "scroll">("pagination");
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

  const readingMode = computed<ReaderMode>(() => presentationMode.value);
  const isPaginationMode = computed(() => presentationMode.value === "pagination");
  const currentChapterIndex = computed(() => state.value.position.chapterIndex);
  const currentChapterId = computed(
    () => state.value.chapters[state.value.position.chapterIndex]?.id ?? null,
  );
  const chapterProgress = computed(() => {
    const { position, presentation, chapters } = state.value;
    if (position.chapterIndex < 0 || chapters.length === 0) return 0;
    if (presentation.mode === "scroll") return position.progress * 100;
    if (presentation.total <= 1) return 100;
    return ((presentation.page + 1) / presentation.total) * 100;
  });
  const readingProgress = computed(() => {
    const { chapters, position } = state.value;
    const cp = chapterProgress.value;
    if (chapters.length <= 1) return Math.max(1, Math.round(cp));
    const portion = 100 / chapters.length;
    return Math.round(position.chapterIndex * portion + (cp / 100) * portion);
  });
  const totalBookProgress = readingProgress;
  const currentPage = computed(() => state.value.presentation.page);
  const totalPages = computed(() => state.value.presentation.total);
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

  // ── Navigation (host compiles intents → SEEK) ──

  function handleSelectChapter(chapterId: string, targetPage: number = 0) {
    host?.goToChapter(chapterId, targetPage);
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
      mode: readingMode.value,
    };
    void pluginHooks.run("reader:init-config", baseConfig).then((config) => {
      presentationMode.value = config.mode;
      host!.init(
        bookId.value,
        chapters,
        config.chapterIndex,
        config.mode,
        config.initialPosition,
        config.initialPage,
      );
    });
  }

  onMounted(() => {
    const container = containerRef.value;
    if (!container) return;

    host = new ReflowableHost({
      container,
      onEffect: async (effect) => {
        if (effect.type === "MODE_CHANGED") presentationMode.value = effect.mode;
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
        if (presentationMode.value === "pagination") {
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
      const idx = state.value.chapters.findIndex((c) => c.id === targetChapter!.id);
      host?.seek({ chapterIndex: idx });
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

    if (presentationMode.value === "pagination") {
      const element = resolveCfiToElement(cfi, doc.body);
      if (element) {
        const step = doc.documentElement.clientWidth;
        if (step > 0) {
          host?.seek({
            chapterIndex: state.value.position.chapterIndex,
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
