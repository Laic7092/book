import { reactive, ref, computed, watch, nextTick } from "vue";
import { useChapterLoader } from "../useChapterLoader";
import { createBatchProcessor } from "./content-pipeline";
import { navigateToCfi, getSpineIndex } from "../../utils/epub-cfi";
import type { ReadingStrategy, StrategyContext, ChapterContent } from "./types";
import type { Chapter } from "../../core/types";

export function useScrollStrategy(ctx: StrategyContext): ReadingStrategy {
  const chapterLoaderState = reactive({ chapters: ctx.chapters.value });
  const chapterLoader = useChapterLoader(
    computed(() => ctx.bookId.value),
    chapterLoaderState,
    ctx.currentChapterIndex,
  );

  const batchProcessor = createBatchProcessor();
  const transformedLoadedContent = ref<ChapterContent[]>([]);

  // ── Content pipeline (reactive) ──

  watch(
    [chapterLoader.allLoadedContent, () => ctx.resourceUrls.value, () => ctx.bookId.value],
    async () => {
      const source = chapterLoader.allLoadedContent.value;
      const bid = ctx.bookId.value;
      if (!bid || source.length === 0) {
        transformedLoadedContent.value = [];
        return;
      }
      const results = await batchProcessor.processAll(source, bid, ctx.resourceUrls.value);
      if (results.length > 0) transformedLoadedContent.value = results;
    },
    { immediate: true },
  );

  // ── Progress computeds ──

  const chapterResources = ref<HTMLElement[]>([]);

  const displayContent = computed(() => "");

  const chapterProgress = ref(0);
  const readingProgress = ref(0);

  const chapterProgressComputed = computed(() => chapterProgress.value);
  const readingProgressComputed = computed(() => readingProgress.value);

  const totalBookProgress = computed(() => {
    const total = ctx.chapters.value.length;
    if (total <= 1) return Math.max(1, Math.round(chapterProgress.value));
    const current = ctx.currentChapterIndex.value;
    const portion = 100 / total;
    return Math.round(current * portion + (chapterProgress.value / 100) * portion);
  });

  const isLoading = computed(() => {
    if (ctx.callbacks.isRestoring()) return true;
    return false;
  });

  // ── Progress tracking (IntersectionObserver + scroll) ──

  let progressObserver: IntersectionObserver | null = null;
  let visibleChapterId: string | null = null;
  let lastProgressPercent = -1;
  let lastProgressChapterId: string | null = null;
  let lastChapterProgress = -1;
  let progressCleanup: (() => void) | null = null;

  function refreshProgressObserver(): void {
    if (!progressObserver) return;
    const doc = ctx.getDocument();
    if (!doc) return;
    progressObserver.disconnect();
    doc.querySelectorAll<HTMLElement>("[data-chapter-id]").forEach((el) => {
      progressObserver?.observe(el);
    });
    const win = doc.defaultView;
    if (win) {
      const scrollTop = win.scrollY || doc.documentElement.scrollTop || 0;
      const midpoint = scrollTop + win.innerHeight / 2;
      const containers = doc.querySelectorAll<HTMLElement>("[data-chapter-id]");
      for (const el of containers) {
        if (midpoint >= el.offsetTop && midpoint < el.offsetTop + el.offsetHeight) {
          visibleChapterId = el.getAttribute("data-chapter-id");
          break;
        }
      }
    }
  }

  function setupProgressTracking(doc: Document): void {
    if (progressObserver) return;

    progressObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleChapterId = (entry.target as HTMLElement).getAttribute("data-chapter-id");
          }
        }
      },
      { root: doc.documentElement, threshold: 0 },
    );

    doc.querySelectorAll<HTMLElement>("[data-chapter-id]").forEach((el) => {
      progressObserver?.observe(el);
    });

    let ticking = false;
    const handler = (): void => {
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

        let chapterProgressVal = 0;
        if (visibleChapterId) {
          const el = doc.querySelector<HTMLElement>(`[data-chapter-id="${visibleChapterId}"]`);
          if (el && el.offsetHeight > 0) {
            chapterProgressVal = Math.min(
              100,
              Math.max(0, Math.round(((scrollTop - el.offsetTop) / el.offsetHeight) * 100)),
            );
          }
        }

        if (
          percent === lastProgressPercent &&
          visibleChapterId === lastProgressChapterId &&
          chapterProgressVal === lastChapterProgress
        )
          return;

        lastProgressPercent = percent;
        lastProgressChapterId = visibleChapterId;
        lastChapterProgress = chapterProgressVal;

        if (ctx.callbacks.isRestoring()) return;

        readingProgress.value = percent;
        chapterProgress.value = chapterProgressVal;
        ctx.callbacks.onProgressUpdate(percent, chapterProgressVal);

        const prevChId = ctx.currentChapter.value?.id;
        if (visibleChapterId && visibleChapterId !== prevChId) {
          const chapter = ctx.chapters.value.find((c) => c.id === visibleChapterId);
          if (chapter) {
            ctx.currentChapter.value = chapter;
            ctx.callbacks.onChapterChanged(visibleChapterId, prevChId ?? undefined);
          }
        }
      });
    };

    doc.addEventListener("scroll", handler, { passive: true });
    progressCleanup = () => {
      doc.removeEventListener("scroll", handler);
      progressObserver?.disconnect();
      progressObserver = null;
    };
  }

  // ── Navigation ──

  async function navigateToChapter(
    chapterId: string,
    _targetPosition?: number,
    _autoClearTransition = true,
  ): Promise<void> {
    ctx.callbacks.setTransitioning(true);
    const previousChapterId = ctx.currentChapter.value?.id;

    try {
      await chapterLoader.loadCurrentAndAdjacent(2);
      await nextTick();

      const doc = ctx.getDocument();
      if (doc) {
        const el = doc.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "instant", block: "start" });
        }
      }

      ctx.callbacks.onChapterChanged(chapterId, previousChapterId ?? undefined);

      setTimeout(() => {
        ctx.callbacks.setTransitioning(false);
        ctx.callbacks.onContentLoaded(chapterId);
      }, 50);
    } catch {
      ctx.callbacks.setTransitioning(false);
    }
  }

  async function goForward(): Promise<void> {
    const idx = ctx.currentChapterIndex.value;
    if (idx < ctx.chapters.value.length - 1) {
      await navigateToChapter(ctx.chapters.value[idx + 1].id);
    }
  }

  async function goBackward(): Promise<void> {
    const idx = ctx.currentChapterIndex.value;
    if (idx > 0) {
      await navigateToChapter(ctx.chapters.value[idx - 1].id);
    }
  }

  // ── CFI navigation ──

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
        await navigateToChapter(targetChapter.id);
      }
      const article = ctx.getArticle();
      if (article) navigateToCfi(cfi, article);
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

  function scrollToAnchor(anchor: string): void {
    if (!anchor) return;
    const article = ctx.getArticle();
    if (!article) return;
    const target =
      article.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
      article.querySelector(`[name="${CSS.escape(anchor)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleInternalLinkClick(href: string): void {
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))
      return;

    const hashIndex = href.indexOf("#");
    const filePath = hashIndex > 0 ? href.substring(0, hashIndex) : href;
    const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : "";

    if (!filePath) {
      scrollToAnchor(anchor);
      return;
    }

    const targetChapter = ctx.chapters.value.find((c) => chapterMatchesHref(c, filePath));
    if (!targetChapter) return;

    if (targetChapter.id === ctx.currentChapter.value?.id) {
      scrollToAnchor(anchor);
      return;
    }

    void navigateToChapter(targetChapter.id).then(async () => {
      if (!anchor) return;
      await nextTick();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToAnchor(anchor));
      });
    });
  }

  // ── Iframe callbacks ──

  function onIframeReady(doc: Document): void {
    setupProgressTracking(doc);
    ctx.callbacks.onContentLoaded(ctx.currentChapter.value?.id ?? "");
  }

  function onChaptersChanged(): void {
    refreshProgressObserver();
  }

  // ── Gesture ──

  function setupGestureHandler(doc: Document): () => void {
    // Scroll mode: click anywhere toggles controls (center action handled by engine)
    // The engine handles the actual toggle; we just provide the gesture binding
    const handleClick = (): void => {
      // Gesture → toggle is handled at the engine level
    };
    // No mode-specific gesture needed for scroll; engine handles toggle
    doc.addEventListener("click", handleClick);
    return () => doc.removeEventListener("click", handleClick);
  }

  // ── Lifecycle ──

  async function activate(): Promise<void> {
    await chapterLoader.loadCurrentAndAdjacent(2);
    await nextTick();
    const doc = ctx.getDocument();
    if (doc) {
      const chId = ctx.currentChapter.value?.id;
      if (chId) {
        const el = doc.querySelector<HTMLElement>(`[data-chapter-id="${chId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "instant", block: "start" });
        }
      }
    }
  }

  function deactivate(): void {
    progressCleanup?.();
    progressCleanup = null;
    progressObserver?.disconnect();
    progressObserver = null;
    chapterLoader.reset();
    transformedLoadedContent.value = [];
  }

  return {
    mode: "scroll" as const,
    displayContent,
    loadedChapters: transformedLoadedContent,
    chapterResources,
    isLoading,
    chapterProgress: chapterProgressComputed,
    readingProgress: readingProgressComputed,
    totalBookProgress,
    navigateToChapter,
    goForward,
    goBackward,
    navigateToCfi: navigateToCfiLocation,
    handleInternalLinkClick,
    pagination: null,
    onIframeReady,
    onChaptersChanged,
    setupGestureHandler,
    activate,
    deactivate,
  };
}
