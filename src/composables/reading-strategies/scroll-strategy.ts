import { reactive, ref, computed, nextTick } from "vue";
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

  // ── Window state (contiguous range of rendered chapters) ──
  const chapterWindowStart = ref(0);
  const chapterWindowEnd = ref(0);
  const isLoadingMore = ref(false);

  // ── Processed content cache (chapterId → pipeline-processed ChapterContent) ──
  const processedChapters = new Map<string, ChapterContent>();

  // ── Output refs ──
  const transformedLoadedContent = ref<ChapterContent[]>([]);
  const chapterResources = ref<HTMLElement[]>([]);

  // ── Progress computeds ──
  const chapterProgress = ref(0);
  const readingProgress = ref(0);

  const chapterProgressComputed = computed(() => chapterProgress.value);
  const readingProgressComputed = computed(() => readingProgress.value);

  const displayContent = computed(() => "");

  const totalBookProgress = computed(() => {
    const total = ctx.chapters.value.length;
    if (total <= 1) return Math.max(1, Math.round(chapterProgress.value));
    const current = ctx.currentChapterIndex.value;
    const portion = 100 / total;
    return Math.round(current * portion + (chapterProgress.value / 100) * portion);
  });

  const isLoading = computed(() => {
    if (ctx.callbacks.isRestoring()) return true;
    if (isLoadingMore.value) return true;
    return false;
  });

  // ═══════════════════════════════════════════════════
  //  Content loading & processing (window-based)
  // ═══════════════════════════════════════════════════

  /**
   * Ensure all chapters in index range [from, to] are in the LRU cache.
   * Chapters already cached are skipped.
   */
  async function ensureChaptersLoaded(from: number, to: number): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = from; i <= to; i++) {
      const ch = ctx.chapters.value[i];
      if (ch && !chapterLoader.isLoaded(ch.id)) {
        promises.push(chapterLoader.loadChapter(ch.id));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  /**
   * Process raw chapter content through the content pipeline (resource
   * rewriting + plugin transformers). Already-processed chapters are skipped
   * via the processedChapters cache.
   */
  async function ensureChaptersProcessed(from: number, to: number): Promise<void> {
    const toProcess: Array<{
      chapterId: string;
      title: string;
      content: string;
      order: number;
    }> = [];
    for (let i = from; i <= to; i++) {
      const ch = ctx.chapters.value[i];
      if (!ch) continue;
      if (processedChapters.has(ch.id)) continue;
      const raw = chapterLoader.getContent(ch.id);
      if (raw !== undefined) {
        toProcess.push({
          chapterId: ch.id,
          title: ch.title,
          content: raw,
          order: ch.order,
        });
      }
    }
    if (toProcess.length === 0) return;
    const results = await batchProcessor.processAll(
      toProcess,
      ctx.bookId.value,
      ctx.resourceUrls.value,
    );
    for (const r of results) {
      processedChapters.set(r.chapterId, r);
    }
  }

  /**
   * Build the display content array from the current window.
   *
   * The array layout is:
   *   [top-sentinel?] + [windowed chapters] + [bottom-sentinel?]
   *
   * Sentinel <div> elements are only included when there are more chapters
   * available in that direction.  The sentinel observer (set up inside the
   * iframe) watches these <div>s and triggers window expansion.
   */
  /**
   * Full content rebuild — only used for initial activation and explicit
   * chapter navigation.  Incremental scroll expansion uses direct DOM
   * manipulation instead (see expandWindowUp / expandWindowDown).
   */
  async function fullRebuild(): Promise<void> {
    await ensureChaptersLoaded(chapterWindowStart.value, chapterWindowEnd.value);
    await ensureChaptersProcessed(chapterWindowStart.value, chapterWindowEnd.value);

    const result: ChapterContent[] = [];

    // ── Top sentinel ──
    if (chapterWindowStart.value > 0) {
      result.push({
        chapterId: "__sentinel_top__",
        title: "",
        content: '<div data-sentinel="top" style="height:1px;width:100%"></div>',
        order: -1,
      });
    }

    // ── Windowed chapters (in document order) ──
    // Each chapter's content is wrapped in <div data-chapter-id="…"> so that
    // the progress observer, scroll-position save/restore, and chapter
    // navigation can locate chapter boundaries in the iframe DOM.
    for (let i = chapterWindowStart.value; i <= chapterWindowEnd.value; i++) {
      const ch = ctx.chapters.value[i];
      if (!ch) continue;
      const cached = processedChapters.get(ch.id);
      if (cached) {
        result.push({
          ...cached,
          content: `<div data-chapter-id="${ch.id}" class="scroll-chapter">${cached.content}</div>`,
        });
      }
    }

    // ── Bottom sentinel ──
    if (chapterWindowEnd.value < ctx.chapters.value.length - 1) {
      result.push({
        chapterId: "__sentinel_bottom__",
        title: "",
        content: '<div data-sentinel="bottom" style="height:1px;width:100%"></div>',
        order: Number.MAX_SAFE_INTEGER,
      });
    }

    transformedLoadedContent.value = result;
  }

  // ═══════════════════════════════════════════════════
  //  Scroll position preservation
  // ═══════════════════════════════════════════════════

  let pendingScrollRestore: (() => void) | null = null;

  /**
   * Save the current scroll position relative to the visible chapter's
   * offset.  The saved offset survives content rebuilds (prepend/append)
   * because it's relative to a stable [data-chapter-id] element.
   */
  function saveScrollPosition(): void {
    pendingScrollRestore = null;
    const doc = ctx.getDocument();
    if (!doc) return;
    const win = doc.defaultView;
    if (!win) return;
    const scrollTop = win.scrollY || doc.documentElement.scrollTop || 0;

    const containers = doc.querySelectorAll<HTMLElement>("[data-chapter-id]");
    for (const el of containers) {
      if (scrollTop >= el.offsetTop && scrollTop < el.offsetTop + el.offsetHeight) {
        const chapterId = el.getAttribute("data-chapter-id");
        if (!chapterId) break;
        const offset = scrollTop - el.offsetTop;
        pendingScrollRestore = () => {
          requestAnimationFrame(() => {
            const doc2 = ctx.getDocument();
            if (!doc2) return;
            const restoredEl = doc2.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
            if (restoredEl) {
              doc2.defaultView?.scrollTo(0, restoredEl.offsetTop + offset);
            }
          });
        };
        return;
      }
    }
  }

  // ═══════════════════════════════════════════════════
  //  Window expansion (sentinel-driven infinite scroll)
  // ═══════════════════════════════════════════════════

  /** Expand the window upward by one chapter — direct DOM insertBefore. */
  async function expandWindowUp(): Promise<void> {
    if (isLoadingMore.value || chapterWindowStart.value <= 0) return;
    saveScrollPosition();
    isLoadingMore.value = true;
    try {
      const newIdx = chapterWindowStart.value - 1;
      const ch = ctx.chapters.value[newIdx];
      if (!ch) return;

      // Load & process the single new chapter
      if (!chapterLoader.isLoaded(ch.id)) {
        await chapterLoader.loadChapter(ch.id);
      }
      await ensureChaptersProcessed(newIdx, newIdx);
      const processed = processedChapters.get(ch.id);
      if (!processed) return;

      // Direct DOM: create <div data-chapter-id> and insert before first chapter
      const doc = ctx.getDocument();
      if (doc?.body) {
        const chapterEl = doc.createElement("div");
        chapterEl.setAttribute("data-chapter-id", ch.id);
        chapterEl.className = "scroll-chapter";
        chapterEl.innerHTML = processed.content;

        const firstChapter = doc.querySelector<HTMLElement>("[data-chapter-id]");
        if (firstChapter) {
          doc.body.insertBefore(chapterEl, firstChapter);
        } else {
          doc.body.appendChild(chapterEl);
        }
      }

      chapterWindowStart.value = newIdx;
      if (doc?.body) {
        syncSentinels(doc);
        setupSentinelObservers();
        refreshProgressObserver();
      }

      // Restore scroll after browser layout
      requestAnimationFrame(() => {
        if (pendingScrollRestore) {
          pendingScrollRestore();
          pendingScrollRestore = null;
        }
      });
    } finally {
      isLoadingMore.value = false;
    }
  }

  /** Expand the window downward by one chapter — direct DOM appendChild. */
  async function expandWindowDown(): Promise<void> {
    if (isLoadingMore.value || chapterWindowEnd.value >= ctx.chapters.value.length - 1) return;
    saveScrollPosition();
    isLoadingMore.value = true;
    try {
      const newIdx = chapterWindowEnd.value + 1;
      const ch = ctx.chapters.value[newIdx];
      if (!ch) return;

      // Load & process the single new chapter
      if (!chapterLoader.isLoaded(ch.id)) {
        await chapterLoader.loadChapter(ch.id);
      }
      await ensureChaptersProcessed(newIdx, newIdx);
      const processed = processedChapters.get(ch.id);
      if (!processed) return;

      // Direct DOM: create <div data-chapter-id> and append after last chapter
      const doc = ctx.getDocument();
      if (doc?.body) {
        const chapterEl = doc.createElement("div");
        chapterEl.setAttribute("data-chapter-id", ch.id);
        chapterEl.className = "scroll-chapter";
        chapterEl.innerHTML = processed.content;

        const lastChapter = doc.querySelector<HTMLElement>("[data-chapter-id]:last-of-type");
        if (lastChapter && lastChapter.nextSibling) {
          doc.body.insertBefore(chapterEl, lastChapter.nextSibling);
        } else {
          doc.body.appendChild(chapterEl);
        }
      }

      chapterWindowEnd.value = newIdx;
      if (doc?.body) {
        syncSentinels(doc);
        setupSentinelObservers();
        refreshProgressObserver();
      }

      // Restore scroll after browser layout
      requestAnimationFrame(() => {
        if (pendingScrollRestore) {
          pendingScrollRestore();
          pendingScrollRestore = null;
        }
      });
    } finally {
      isLoadingMore.value = false;
    }
  }

  /**
   * Sync sentinel <div> elements in the iframe DOM with the current window
   * position.  Removes stale sentinels and re-creates them at the correct
   * positions.  A sentinel is only present when there are more chapters
   * available in that direction.
   */
  function syncSentinels(doc: Document): void {
    // Remove all existing sentinel elements
    doc.querySelectorAll<HTMLElement>("[data-sentinel]").forEach((el) => el.remove());

    const firstChapter = doc.querySelector<HTMLElement>("[data-chapter-id]");
    const lastChapter = doc.querySelector<HTMLElement>("[data-chapter-id]:last-of-type");

    // Top sentinel
    if (chapterWindowStart.value > 0 && firstChapter) {
      const top = doc.createElement("div");
      top.setAttribute("data-sentinel", "top");
      top.style.cssText = "height:1px;width:100%";
      doc.body.insertBefore(top, firstChapter);
    }

    // Bottom sentinel
    if (chapterWindowEnd.value < ctx.chapters.value.length - 1) {
      const bottom = doc.createElement("div");
      bottom.setAttribute("data-sentinel", "bottom");
      bottom.style.cssText = "height:1px;width:100%";
      if (lastChapter && lastChapter.nextSibling) {
        doc.body.insertBefore(bottom, lastChapter.nextSibling);
      } else {
        doc.body.appendChild(bottom);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  //  Progress tracking (IntersectionObserver + scroll)
  // ═══════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════
  //  Sentinel observers
  // ═══════════════════════════════════════════════════

  let sentinelObserver: IntersectionObserver | null = null;

  /**
   * Set up IntersectionObserver on the top/bottom sentinel <div> elements
   * inside the iframe.  When a sentinel enters the viewport the corresponding
   * window-expansion function is called.  The sentinel is only present when
   * there are more chapters available in that direction.
   */
  function setupSentinelObservers(): void {
    const doc = ctx.getDocument();
    if (!doc) return;

    sentinelObserver?.disconnect();
    sentinelObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const type = (entry.target as HTMLElement).getAttribute("data-sentinel");
          if (type === "top") void expandWindowUp();
          else if (type === "bottom") void expandWindowDown();
        }
      },
      { root: doc.documentElement, threshold: 0 },
    );

    const topSentinel = doc.querySelector<HTMLElement>('[data-sentinel="top"]');
    const bottomSentinel = doc.querySelector<HTMLElement>('[data-sentinel="bottom"]');
    if (topSentinel) sentinelObserver.observe(topSentinel);
    if (bottomSentinel) sentinelObserver.observe(bottomSentinel);
  }

  // ═══════════════════════════════════════════════════
  //  Navigation
  // ═══════════════════════════════════════════════════

  async function navigateToChapter(
    chapterId: string,
    _targetPosition?: number,
    _autoClearTransition = true,
  ): Promise<void> {
    ctx.callbacks.setTransitioning(true);
    const previousChapterId = ctx.currentChapter.value?.id;

    try {
      const idx = ctx.chapters.value.findIndex((c) => c.id === chapterId);
      if (idx < 0) return;

      // Ensure target chapter is in the LRU cache
      if (!chapterLoader.isLoaded(chapterId)) {
        await chapterLoader.loadChapter(chapterId);
      }

      // Expand window so the target has a buffer of ±1 on each side
      const buffer = 1;
      if (idx < chapterWindowStart.value) {
        chapterWindowStart.value = Math.max(0, idx - buffer);
      }
      if (idx > chapterWindowEnd.value) {
        chapterWindowEnd.value = Math.min(ctx.chapters.value.length - 1, idx + buffer);
      }

      await fullRebuild();
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

  // ═══════════════════════════════════════════════════
  //  Internal links
  // ═══════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════
  //  Iframe / lifecycle callbacks
  // ═══════════════════════════════════════════════════

  function onIframeReady(doc: Document): void {
    setupProgressTracking(doc);
    setupSentinelObservers();
    ctx.callbacks.onContentLoaded(ctx.currentChapter.value?.id ?? "");
  }

  function onChaptersChanged(): void {
    refreshProgressObserver();
    setupSentinelObservers();
    // Execute pending scroll restoration (set by expandWindowUp/Down)
    // after the content update cycle has completed.
    if (pendingScrollRestore) {
      pendingScrollRestore();
      pendingScrollRestore = null;
    }
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

  // ═══════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════

  async function activate(): Promise<void> {
    const idx = ctx.currentChapterIndex.value;
    if (idx < 0) return;

    // Initial window: current chapter ±1 so the user has content to scroll
    // before hitting a sentinel.
    chapterWindowStart.value = Math.max(0, idx - 1);
    chapterWindowEnd.value = Math.min(ctx.chapters.value.length - 1, idx + 1);

    // Ensure current chapter is in the LRU cache
    if (!chapterLoader.isLoaded(ctx.chapters.value[idx].id)) {
      await chapterLoader.loadChapter(ctx.chapters.value[idx].id);
    }

    await fullRebuild();
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
    sentinelObserver?.disconnect();
    sentinelObserver = null;
    chapterLoader.reset();
    processedChapters.clear();
    transformedLoadedContent.value = [];
    chapterWindowStart.value = 0;
    chapterWindowEnd.value = 0;
    pendingScrollRestore = null;
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
