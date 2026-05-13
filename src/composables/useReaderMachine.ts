// Bridge composable: wires the pure-TS state machine to Vue reactivity and
// executes side effects against the "dirty world" (storage, DOM, events).

import { ref, computed, shallowRef, watch, onMounted, onUnmounted, type Ref } from "vue";
import {
  createReaderMachine,
  type ReaderState,
  type ReaderAction,
  type ReaderEffect,
} from "../reader-engine/reader-machine";
import { processChapterHtml, resolveChapterResources } from "../reader-engine/resource-resolver";
import { useUIStore } from "../stores/ui";
import { NavigationStack } from "./useNavigationStack";
import {
  getOverlayComponents,
  getHeaderActions,
  pluginStateVersion,
} from "../plugins/manager/registry";
import { pluginEvents } from "../plugins/context";
import { injectResources } from "../reader-engine/iframe-resources";
import { getParserForFormat } from "../parsers";
import {
  registerReaderSession,
  unregisterReaderSession,
  type ReaderSession,
} from "../reader-engine/session";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../utils/constants";
import { parseCfi, resolveCfiToElement } from "../utils/epub-cfi";
import * as booksStore from "../storage/books";
import type { Chapter } from "../core/types";

export interface ReaderContentAPI {
  getDocument?(): Document | null;
  getArticle?(): HTMLElement | null;
  paginateToChapter?(chapterId: string): void;
  syncResources?(elements: HTMLElement[]): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Machine
// ═══════════════════════════════════════════════════════════════════════════

export type { ReaderState, ReaderAction, ReaderEffect };

export function useReaderMachine(
  bookId: Ref<string>,
  bookFormat: Ref<string>,
  readerContentRef: Ref<ReaderContentAPI | null>,
  options: { chapters: Chapter[]; initialChapterId?: string | null },
) {
  const uiStore = useUIStore();
  const navStack = new NavigationStack();

  // ── Create machine + reactive state ──
  const machine = createReaderMachine();
  const state = shallowRef<ReaderState>(machine.getState());
  const unsubMachine = machine.subscribe((s) => {
    state.value = s;
  });

  // ── Nav snapshot (reactive wrapper around plain NavigationStack) ──
  const navSnapshot = shallowRef(navStack.getSnapshot());
  function syncNavSnapshot() {
    navSnapshot.value = navStack.getSnapshot();
  }

  // ── Per-render ephemeral state ──
  const pageMargin = ref(24);
  const isRestoring = ref(false);
  const isHistoryNav = ref(false);
  const resourceUrls = ref(new Map<string, string>());
  let gestureCleanup: (() => void) | null = null;

  // Cached resource elements from last FETCH_CHAPTER resolution (used by RENDER_HTML effect)
  let lastResolvedResources: HTMLElement[] = [];

  // ── Plugin UI computeds ──
  const overlayComponents = computed(() => {
    void pluginStateVersion.value;
    return getOverlayComponents();
  });
  const headerActions = computed(() => {
    void pluginStateVersion.value;
    return getHeaderActions();
  });

  // ── Derived computeds from machine state ──
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
  const isTransitioning = computed(() => state.value.status === "loading-chapter");

  const chapterLoading = computed(() => {
    if (isRestoring.value) return true;
    if (isTransitioning.value) return true;
    return false;
  });

  const canGoBack = computed(() => navSnapshot.value.canGoBack);
  const canGoForward = computed(() => navSnapshot.value.canGoForward);

  // ── Effect runner ──
  function getIframeDoc(): Document | null {
    return readerContentRef.value?.getDocument?.() ?? null;
  }

  async function runEffect(effect: ReaderEffect): Promise<void> {
    switch (effect.type) {
      case "FETCH_CHAPTER": {
        const rawHtml = await booksStore.getChapterContent(effect.bookId, effect.chapterId);
        if (rawHtml === undefined) {
          dispatch({
            type: "CHAPTER_FAILED",
            chapterId: effect.chapterId,
            error: "Content not found",
          });
          return;
        }

        // Resolve EPUB resources (mutates resourceUrls in-place)
        const parser = getParserForFormat(bookFormat.value);
        let html = rawHtml;
        let resources: HTMLElement[] = [];

        if (parser) {
          const resolved = await resolveChapterResources(
            rawHtml,
            effect.bookId,
            parser,
            resourceUrls.value,
          );
          html = resolved.html;
          resources = resolved.resources;
        }

        // Content pipeline (plugin transformers)
        try {
          html = await processChapterHtml(
            html,
            effect.bookId,
            effect.chapterId,
            resourceUrls.value,
          );
        } catch {
          // Use un-transformed content on error
        }

        lastResolvedResources = resources;
        dispatch({
          type: "CHAPTER_LOADED",
          chapterId: effect.chapterId,
          html,
        });
        break;
      }

      case "FETCH_CHAPTERS": {
        // Background prefetch — just load into storage cache, don't process pipeline
        effect.chapterIds.forEach((id) => {
          booksStore.getChapterContent(effect.bookId, id).catch(() => {});
        });
        break;
      }

      case "RENDER_HTML": {
        const doc = getIframeDoc();
        if (!doc?.body) return;
        doc.body.innerHTML = effect.html;

        // Sync resolved resources to iframe head
        if (lastResolvedResources.length > 0) {
          injectResources(
            doc,
            lastResolvedResources,
            new Map(),
            "resource-style",
            "data-resource-dynamic",
          );
        }
        break;
      }

      case "SET_PAGE_CSS": {
        const doc = getIframeDoc();
        if (!doc?.documentElement) return;
        doc.documentElement.style.setProperty("--current-page", String(effect.page));
        break;
      }

      case "SET_MODE_CSS": {
        const doc = getIframeDoc();
        if (!doc?.documentElement) return;
        doc.documentElement.dataset.mode = effect.mode;
        break;
      }

      case "SET_PAGE_MARGIN_CSS": {
        const doc = getIframeDoc();
        if (!doc?.documentElement) return;
        doc.documentElement.style.setProperty("--page-margin", `${effect.margin}px`);
        break;
      }

      case "EMIT": {
        void pluginEvents.emit(effect.event as any, effect.payload as any);
        break;
      }

      case "SCROLL_INTO_VIEW": {
        const doc = getIframeDoc();
        if (!doc) return;
        const el = doc.querySelector<HTMLElement>(`[data-chapter-id="${effect.chapterId}"]`);
        if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
        break;
      }

      case "MEASURE_LAYOUT": {
        const doc = getIframeDoc();
        if (doc?.body) {
          const contentWidth = doc.body.scrollWidth;
          const iframeWidth = doc.documentElement.clientWidth || state.value.page.iframeWidth;
          if (contentWidth > 0 && iframeWidth > 0) {
            dispatch({ type: "LAYOUT_MEASURED", contentWidth, iframeWidth });
            break;
          }
        }
        // Measurement not possible (iframe not ready), reset to first page
        if (doc?.documentElement) {
          doc.documentElement.style.setProperty("--current-page", "0");
        }
        break;
      }

      case "NOOP":
        break;
    }
  }

  function dispatch(action: ReaderAction): void {
    const snapshot = {
      chapterId: currentChapterId.value,
      page: currentPage.value,
    };
    const effects = machine.dispatch(action);
    // Auto-push navigation history when chapter changes (skip during history back/forward)
    if (
      !isHistoryNav.value &&
      snapshot.chapterId &&
      currentChapterId.value &&
      currentChapterId.value !== snapshot.chapterId
    ) {
      navStack.push({ chapterId: snapshot.chapterId, page: snapshot.page });
      syncNavSnapshot();
    }
    effects.forEach((e) => void runEffect(e));
  }

  // ── Actions (called by ReflowableReader template) ──
  function handleSelectChapter(chapterId: string, targetPage: number = 0) {
    dispatch({ type: "GO_TO_CHAPTER", chapterId, targetPage });
  }

  function nextPage() {
    dispatch({ type: "NEXT_PAGE" });
  }

  function prevPage() {
    dispatch({ type: "PREV_PAGE" });
  }

  function handleHistoryBack() {
    const entry = navStack.back();
    syncNavSnapshot();
    if (!entry) return;
    isHistoryNav.value = true;
    if (entry.chapterId === currentChapterId.value) {
      dispatch({ type: "GO_TO_PAGE", page: entry.page });
    } else {
      dispatch({ type: "GO_TO_CHAPTER", chapterId: entry.chapterId, targetPage: entry.page });
    }
    isHistoryNav.value = false;
  }

  function handleHistoryForward() {
    const entry = navStack.forward();
    syncNavSnapshot();
    if (!entry) return;
    isHistoryNav.value = true;
    if (entry.chapterId === currentChapterId.value) {
      dispatch({ type: "GO_TO_PAGE", page: entry.page });
    } else {
      dispatch({ type: "GO_TO_CHAPTER", chapterId: entry.chapterId, targetPage: entry.page });
    }
    isHistoryNav.value = false;
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
    const doc = getIframeDoc();
    if (!doc) return;

    gestureCleanup?.();
    gestureCleanup = null;

    // Gesture handler
    const handleClick = (e: MouseEvent) => {
      if (shouldIgnoreTarget(e.target)) return;
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
    };
    doc.addEventListener("click", handleClick);
    gestureCleanup = () => doc.removeEventListener("click", handleClick);

    const chId = currentChapterId.value;
    if (chId && state.value.bookId) {
      void pluginEvents.emit("content:loaded", { bookId: state.value.bookId, chapterId: chId });
    }
  }

  function handleColumnLayout(data: { contentWidth: number; iframeWidth: number }) {
    dispatch({
      type: "LAYOUT_MEASURED",
      contentWidth: data.contentWidth,
      iframeWidth: data.iframeWidth,
    });
  }

  // ── Internal links ──
  function handleInternalLinkClick(href: string) {
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))
      return;

    const hashIndex = href.indexOf("#");
    const filePath = hashIndex > 0 ? href.substring(0, hashIndex) : href;
    const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : "";

    const chapters = state.value.chapters;
    const targetChapter = chapters.find(
      (c) =>
        c.href &&
        (c.href === filePath || c.href.endsWith(filePath) || c.href.endsWith("/" + filePath)),
    );

    if (!filePath) {
      // Anchor within current chapter
      const doc = getIframeDoc();
      if (doc && anchor) {
        const el =
          doc.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
          doc.querySelector(`[name="${CSS.escape(anchor)}"]`);
        if (el) {
          const bodyRect = doc.body!.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const offset = elRect.left - bodyRect.left;
          const step = state.value.page.iframeWidth || doc.documentElement.clientWidth;
          if (step > 0) {
            const page = Math.floor(offset / step);
            dispatch({ type: "GO_TO_PAGE", page });
          }
        }
      }
      return;
    }

    if (!targetChapter) return;

    if (targetChapter.id === currentChapterId.value) {
      // Same chapter — scroll to anchor
      const doc = getIframeDoc();
      if (doc && anchor) {
        const el =
          doc.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
          doc.querySelector(`[name="${CSS.escape(anchor)}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    // Different chapter
    dispatch({ type: "GO_TO_CHAPTER", chapterId: targetChapter.id });
  }

  // ── Lifecycle ──
  function initMachine() {
    const initialIdx = options.initialChapterId
      ? options.chapters.findIndex((c) => c.id === options.initialChapterId)
      : 0;
    dispatch({
      type: "INIT",
      bookId: bookId.value,
      chapters: options.chapters,
      chapterIndex: Math.max(0, initialIdx),
      mode: readingMode.value === "vertical" ? "scroll" : "pagination",
    });
  }

  onMounted(() => {
    registerReaderSession(session);
    uiStore.showControls = true;
    isRestoring.value = true;
    initMachine();

    // Wait for initial chapter to load before emitting reader:mounted.
    // Plugins (reading-progress, stats, etc.) depend on content being ready.
    const stopWatch = watch(
      () => state.value.status,
      (status) => {
        if (status === "ready") {
          stopWatch();
          isRestoring.value = false;
          void pluginEvents.emit("reader:mounted", { bookId: bookId.value });
        }
      },
    );
  });

  onUnmounted(() => {
    dispatch({ type: "CLEANUP" });
    unregisterReaderSession();
    gestureCleanup?.();
    gestureCleanup = null;
    unsubMachine();
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
      dispatch({ type: "GO_TO_CHAPTER", chapterId: targetChapter.id });
      // GO_TO_CHAPTER → RENDER_HTML → MEASURE_LAYOUT → LAYOUT_MEASURED
      // all run synchronously within dispatch(). When status === "ready",
      // both the DOM and page.total are correct.
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
        const step = state.value.page.iframeWidth || doc.documentElement.clientWidth;
        if (step > 0) {
          dispatch({ type: "GO_TO_PAGE", page: Math.floor(offset / step) });
        }
      }
    } else {
      const element = resolveCfiToElement(cfi, doc.body);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  // ── ReaderSession (registered globally for plugins) ──
  const session: ReaderSession = {
    getDocument: getIframeDoc,
    getState: () => state.value,
    dispatch: (action: ReaderAction) => dispatch(action),
    setPageMargin: (margin: number) => {
      pageMargin.value = margin;
      void runEffect({ type: "SET_PAGE_MARGIN_CSS", margin });
    },
    navigateToCfi: (cfi: string, chapterId: string) => navigateToCfiLocation(cfi, chapterId),
  };

  return {
    // Machine access (for plugins transitioning to direct dispatch)
    machine,
    dispatch,
    state,

    // Template bindings
    readingMode,
    pageMargin,
    isTransitioning,
    isRestoring,
    currentChapterId,
    currentChapterIndex,
    isPaginationMode,
    chapterProgress,
    readingProgress,
    totalBookProgress,
    chapterLoading,
    overlayComponents,
    headerActions,
    canGoBack,
    canGoForward,
    handleSelectChapter,
    nextPage,
    prevPage,
    handleHistoryBack,
    handleHistoryForward,
    handleInternalLinkClick,
    handleColumnLayout,
    handleIframeReady,
    currentPage,
    totalPages,
    navigateToCfiLocation,
    // For backward compat
    reloadForPagination: () => {
      const chId = currentChapterId.value;
      if (chId) dispatch({ type: "GO_TO_CHAPTER", chapterId: chId });
    },
  };
}
