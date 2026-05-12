import { ref, computed, watch } from "vue";
import { useColumnPagination } from "../useColumnPagination";
import { processChapterHtml } from "./content-pipeline";
import { resolveCfi, getSpineIndex } from "../../utils/epub-cfi";
import { TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../../config/constants";
import type { ReadingStrategy, StrategyContext, ChapterContent } from "./types";
import type { Chapter } from "../../core/types";

export function usePaginationStrategy(ctx: StrategyContext): ReadingStrategy {
  const pagination = useColumnPagination();

  // ── State ──
  const chapterResources = ref<HTMLElement[]>([]);
  const loadedChapters = ref<ChapterContent[]>([]);

  // ── Progress computeds ──
  const chapterProgress = computed(() => {
    const total = pagination.totalPages.value;
    if (total <= 1) return 100;
    return ((pagination.currentPage.value + 1) / total) * 100;
  });

  const readingProgress = computed(() => {
    const total = ctx.chapters.value.length;
    if (total <= 1) return chapterProgress.value;
    const current = ctx.currentChapterIndex.value;
    const portion = 100 / total;
    return Math.round(current * portion + (chapterProgress.value / 100) * portion);
  });

  const totalBookProgress = computed(() => {
    const total = ctx.chapters.value.length;
    if (total <= 1) return Math.max(1, Math.round(chapterProgress.value));
    const current = ctx.currentChapterIndex.value;
    const portion = 100 / total;
    return Math.round(current * portion + (chapterProgress.value / 100) * portion);
  });

  // ── Loading state ──
  const isLoading = computed(() => {
    if (ctx.callbacks.isRestoring()) return true;
    if (!pagination.isReady.value) return true;
    return false;
  });

  const displayContent = computed(() => pagination.currentHtml.value);

  // ── Page change watcher ──
  watch(
    [() => pagination.currentPage.value, () => pagination.totalPages.value],
    ([page, total]) => {
      const chId = ctx.currentChapter.value?.id;
      const bId = ctx.bookId.value;
      if (chId && bId) {
        ctx.callbacks.onPageChanged(page, total);
      }
    },
  );

  // ── Navigation ──

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

  /** Load chapter content and paginate — no transitioning, no events. */
  async function loadChapter(chapterId: string, targetPage: number): Promise<void> {
    const content = await ctx.getChapterContent(chapterId);
    let html = content?.html || "";
    if (html && ctx.resourceUrls.value) {
      html = await processChapterHtml(html, ctx.bookId.value, chapterId, ctx.resourceUrls.value);
    }
    const resources = content?.resources || [];
    await pagination.paginate(chapterId, { html, targetPage, resources });
    chapterResources.value = resources;
    ctx.syncResources(resources);
  }

  async function navigateToChapter(
    chapterId: string,
    targetPage: number = 0,
    autoClearTransition = true,
  ): Promise<void> {
    ctx.callbacks.setTransitioning(true);
    const previousChapterId = ctx.currentChapter.value?.id;

    try {
      await loadChapter(chapterId, targetPage);
      ctx.callbacks.onChapterChanged(chapterId, previousChapterId);

      if (autoClearTransition) {
        const onReady = async () => {
          ctx.callbacks.setTransitioning(false);
          ctx.callbacks.onContentLoaded(chapterId);
        };
        if (pagination.isReady.value) {
          await onReady();
        } else {
          const stop = watch(
            () => pagination.isReady.value,
            (ready) => {
              if (ready) {
                stop();
                void onReady();
              }
            },
          );
        }
      }
    } catch {
      ctx.callbacks.setTransitioning(false);
    }
  }

  async function goForward(): Promise<void> {
    if (pagination.isPaginating.value) return;
    const moved = pagination.nextPage();
    if (!moved) {
      const idx = ctx.currentChapterIndex.value;
      if (idx < ctx.chapters.value.length - 1) {
        await navigateToChapter(ctx.chapters.value[idx + 1].id, 0);
      }
    }
  }

  async function goBackward(): Promise<void> {
    if (pagination.isPaginating.value) return;
    if (pagination.currentPage.value > 0) {
      pagination.prevPage();
    } else {
      const idx = ctx.currentChapterIndex.value;
      if (idx > 0) {
        await navigateToChapter(ctx.chapters.value[idx - 1].id, -1);
      }
    }
  }

  // ── CFI navigation ──

  function getPageForCfi(cfi: string): number | null {
    const doc = ctx.getDocument();
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

  async function navigateToCfiLocation(cfi: string, chapterId: string): Promise<void> {
    const spineIndex = getSpineIndex(cfi);
    if (spineIndex < 0) return;
    const targetChapter = ctx.chapters.value.find((c) => c.order === spineIndex);
    if (!targetChapter) {
      const fallback = ctx.chapters.value.find((c) => c.id === chapterId);
      if (!fallback) return;
      await navigateToChapter(fallback.id);
      return;
    }
    ctx.callbacks.setTransitioning(true);
    try {
      if (targetChapter.id !== ctx.currentChapter.value?.id) {
        await navigateToChapter(targetChapter.id, 0, false);
      }
      await waitForPaginationReady();
      const page = getPageForCfi(cfi);
      pagination.goToPage(page ?? 0);
    } finally {
      ctx.callbacks.setTransitioning(false);
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

  function findAnchor(article: HTMLElement, anchor: string): HTMLElement | null {
    return (
      article.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
      article.querySelector(`[name="${CSS.escape(anchor)}"]`)
    );
  }

  function paginateToAnchor(anchor: string): void {
    if (!anchor) return;
    const article = ctx.getArticle();
    if (!article) return;
    const target = findAnchor(article, anchor);
    if (!target) return;
    const articleRect = article.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    pagination.goToPage(pagination.getPageAtOffset(targetRect.left - articleRect.left));
  }

  function handleInternalLinkClick(href: string): void {
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))
      return;

    const hashIndex = href.indexOf("#");
    const filePath = hashIndex > 0 ? href.substring(0, hashIndex) : href;
    const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : "";

    const currentChId = ctx.currentChapter.value?.id;

    if (!filePath) {
      paginateToAnchor(anchor);
      return;
    }

    const targetChapter = ctx.chapters.value.find((c) => chapterMatchesHref(c, filePath));
    if (!targetChapter) return;

    if (targetChapter.id === currentChId) {
      void waitForPaginationReady().then(() => paginateToAnchor(anchor));
      return;
    }

    void navigateToChapter(targetChapter.id).then(async () => {
      if (!anchor) return;
      await waitForPaginationReady();
      paginateToAnchor(anchor);
    });
  }

  // ── Iframe callbacks ──

  function onIframeReady(_doc: Document): void {
    // Gesture handler is set up by the engine; nothing pagination-specific needed here
  }

  function onChaptersChanged(): void {
    // No-op in pagination mode (progress observer is scroll-only)
  }

  // ── Gesture ──

  function setupGestureHandler(doc: Document): () => void {
    const handleClick = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Element) {
        if (
          target.closest("button") ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest("select") ||
          target.closest("a[href]") ||
          target.closest("[contenteditable]")
        )
          return;
      }

      const w = window.innerWidth;
      const x = e.clientX;
      if (x < w * TAP_ZONE_LEFT) void goBackward();
      else if (x > w * TAP_ZONE_RIGHT) void goForward();
      // Center tap → toggle controls (handled by engine via the callback)
    };
    doc.addEventListener("click", handleClick);
    return () => doc.removeEventListener("click", handleClick);
  }

  // ── Lifecycle ──

  async function activate(): Promise<void> {
    const chId = ctx.currentChapter.value?.id;
    if (!chId) return;
    // Use loadChapter directly — no transitioning, no events.
    // reader:mounted fires immediately after, allowing plugins
    // (reading-progress) to restore saved position before render.
    await loadChapter(chId, 0);
  }

  function deactivate(): void {
    pagination.cleanup();
    chapterResources.value = [];
    loadedChapters.value = [];
  }

  return {
    mode: "pagination" as const,
    displayContent,
    loadedChapters,
    chapterResources,
    isLoading,
    chapterProgress,
    readingProgress,
    totalBookProgress,
    navigateToChapter,
    goForward,
    goBackward,
    navigateToCfi: navigateToCfiLocation,
    handleInternalLinkClick,
    pagination: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      goToPage: (page: number) => pagination.goToPage(page),
      updateColumnLayout: (cw: number, iw: number) => pagination.updateColumnLayout(cw, iw),
      isReady: pagination.isReady,
    },
    onIframeReady,
    onChaptersChanged,
    setupGestureHandler,
    activate,
    deactivate,
  };
}
