// Composable for scroll management in vertical reading mode

import { ref, type Ref } from "vue";
import { throttle } from "../utils/debounce";
import type { Chapter } from "../core/types";

interface UseScrollManagerOptions {
  isPaginationMode: Ref<boolean>;
  readingProgress: Ref<number>;
  chapterProgress: Ref<number>;
  chapters: Ref<Chapter[]>;
  updateProgress: (scrollPosition: number, percentage: number, chapterId?: string) => void;
  onPreloadTrigger?: (chapterIndex: number) => void;
  onChapterChange?: (chapterId: string) => void;
  onVisibleRangeChange?: (start: number, end: number) => void;
}

export function useScrollManager(options: UseScrollManagerOptions) {
  const {
    isPaginationMode,
    readingProgress,
    chapterProgress,
    chapters,
    updateProgress,
    onPreloadTrigger,
    onChapterChange,
    onVisibleRangeChange,
  } = options;

  const lastVisibleRange = ref<{ start: number; end: number } | null>(null);

  const saveProgressTimer = ref<number | null>(null);
  const lastVisibleChapterId = ref<string | null>(null);

  const getScrollPercentage = (): number => {
    const main = document.querySelector(".reader-view") as HTMLElement;
    if (!main) return 0;
    const { scrollTop, scrollHeight, clientHeight } = main;

    if (scrollHeight <= clientHeight) return 0;

    const percentage = (scrollTop / (scrollHeight - clientHeight)) * 100;
    return Math.max(0, Math.min(100, percentage));
  };

  const getCurrentVisibleChapterIndex = (chapters: Chapter[]): number => {
    const main = document.querySelector(".reader-view") as HTMLElement;
    if (!main) return -1;

    const { scrollTop, clientHeight } = main;
    const midpoint = scrollTop + clientHeight / 2;

    const chapterContainers = main.querySelectorAll(".chapter-container");
    for (let i = 0; i < chapterContainers.length; i++) {
      const container = chapterContainers[i] as HTMLElement;
      const top = container.offsetTop;
      const bottom = top + container.offsetHeight;

      if (midpoint >= top && midpoint < bottom) {
        const chapterId = container.getAttribute("data-chapter-id");
        if (chapterId) {
          return chapters.findIndex((c) => c.id === chapterId);
        }
      }
    }

    return -1;
  };

  const getVisibleChapterRange = (chapters: Chapter[]): { start: number; end: number } => {
    const main = document.querySelector(".reader-view") as HTMLElement;
    if (!main || chapters.length === 0) {
      return { start: 0, end: 0 };
    }

    const { scrollTop, clientHeight } = main;
    const viewportTop = scrollTop;
    const viewportBottom = scrollTop + clientHeight;

    let visibleStart = chapters.length - 1;
    let visibleEnd = 0;

    const chapterContainers = main.querySelectorAll(".chapter-container");
    chapterContainers.forEach((container) => {
      const containerEl = container as HTMLElement;
      const top = containerEl.offsetTop;
      const bottom = top + containerEl.offsetHeight;

      // Check if chapter intersects with viewport
      if (bottom > viewportTop && top < viewportBottom) {
        const chapterId = containerEl.getAttribute("data-chapter-id");
        if (chapterId) {
          const index = chapters.findIndex((c) => c.id === chapterId);
          if (index >= 0) {
            visibleStart = Math.min(visibleStart, index);
            visibleEnd = Math.max(visibleEnd, index);
          }
        }
      }
    });

    // If no chapters visible (e.g., scrolled past last chapter), use closest chapter
    if (visibleStart > visibleEnd) {
      const totalHeight = main.scrollHeight;
      if (scrollTop + clientHeight >= totalHeight - 10) {
        // At bottom
        visibleStart = chapters.length - 1;
        visibleEnd = chapters.length - 1;
      } else {
        // At top or between chapters
        const firstContainer = chapterContainers[0] as HTMLElement;
        if (firstContainer && firstContainer.offsetTop > scrollTop) {
          visibleStart = 0;
          visibleEnd = 0;
        }
      }
    }

    return { start: visibleStart, end: visibleEnd };
  };

  const getCurrentVisibleChapterId = (): string | null => {
    const main = document.querySelector(".reader-view") as HTMLElement;
    if (!main) return null;

    const { scrollTop, clientHeight } = main;
    const midpoint = scrollTop + clientHeight / 2;

    const chapterContainers = main.querySelectorAll(".chapter-container");
    for (let i = 0; i < chapterContainers.length; i++) {
      const container = chapterContainers[i] as HTMLElement;
      const top = container.offsetTop;
      const bottom = top + container.offsetHeight;

      if (midpoint >= top && midpoint < bottom) {
        return container.getAttribute("data-chapter-id");
      }
    }

    return null;
  };

  // Calculate chapter progress based on current visible chapter
  const getChapterProgress = (chapterId: string | null): number => {
    if (!chapterId) return 0;

    const main = document.querySelector(".reader-view") as HTMLElement;
    if (!main) return 0;

    const chapterEl = document.querySelector(`[data-chapter-id="${chapterId}"]`) as HTMLElement;
    if (!chapterEl) return 0;

    const { scrollTop } = main;
    const chapterTop = chapterEl.offsetTop;
    const chapterHeight = chapterEl.offsetHeight;

    // Calculate how much of the chapter has been scrolled past
    const scrolledPastTop = scrollTop - chapterTop;

    if (scrolledPastTop <= 0) {
      return 0;
    }

    if (scrolledPastTop >= chapterHeight) {
      return 100;
    }

    // Progress within the chapter
    const progress = (scrolledPastTop / chapterHeight) * 100;
    return Math.max(0, Math.min(100, progress));
  };

  const checkPreloadThreshold = (currentChapterIndex: number, totalChapters: number) => {
    const main = document.querySelector(".reader-view") as HTMLElement;
    if (!main) return;

    const { scrollTop, scrollHeight, clientHeight } = main;

    if (scrollHeight <= clientHeight) return;

    const scrollProgress = scrollTop / (scrollHeight - clientHeight);

    // Preload next chapter when approaching end (70% scrolled)
    if (scrollProgress > 0.7 && currentChapterIndex < totalChapters - 1) {
      onPreloadTrigger?.(currentChapterIndex + 1);
    }
    // Preload previous chapter when near beginning (30% scrolled)
    else if (scrollProgress < 0.3 && currentChapterIndex > 0) {
      onPreloadTrigger?.(currentChapterIndex - 1);
    }
  };

  const throttledScrollHandler = throttle(() => {
    if (isPaginationMode.value) return;

    const scrollPercentage = getScrollPercentage();
    readingProgress.value = scrollPercentage;

    // Check if visible chapter changed
    const currentChapterId = getCurrentVisibleChapterId();
    if (currentChapterId && currentChapterId !== lastVisibleChapterId.value) {
      lastVisibleChapterId.value = currentChapterId;
      onChapterChange?.(currentChapterId);
    }

    // Update chapter progress (progress within current chapter)
    if (currentChapterId) {
      const progressInChapter = getChapterProgress(currentChapterId);
      chapterProgress.value = progressInChapter;
    }

    // Check visible range change for lazy loading
    if (onVisibleRangeChange) {
      const { start, end } = getVisibleChapterRange(chapters.value);
      if (
        !lastVisibleRange.value ||
        lastVisibleRange.value.start !== start ||
        lastVisibleRange.value.end !== end
      ) {
        lastVisibleRange.value = { start, end };
        onVisibleRangeChange(start, end);
      }
    }

    // Debounced progress saving
    if (saveProgressTimer.value) clearTimeout(saveProgressTimer.value);
    saveProgressTimer.value = window.setTimeout(() => {
      updateProgress(scrollPercentage, scrollPercentage, currentChapterId || undefined);
    }, 1000);
  }, 16);

  const handleScroll = (_chapters: Chapter[], currentChapterIndex: number) => {
    throttledScrollHandler();
    if (currentChapterIndex >= 0) {
      checkPreloadThreshold(currentChapterIndex, _chapters.length);
    }
  };

  const forceScrollUpdate = (_chapters: Chapter[]) => {
    if (isPaginationMode.value) return;
    const { start, end } = getVisibleChapterRange(_chapters);
    if (onVisibleRangeChange) {
      onVisibleRangeChange(start, end);
    }
  };

  const scrollToChapter = (chapterId: string) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const chapterEl = document.querySelector(`[data-chapter-id="${chapterId}"]`) as HTMLElement;
        if (chapterEl) {
          const main = document.querySelector(".reader-view") as HTMLElement;
          if (main) {
            main.scrollTo({ top: chapterEl.offsetTop - 20, behavior: "smooth" });
          }
        }
      }, 50);
    });
  };

  const restoreScrollPosition = (scrollPosition: number, chapterId?: string) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const main = document.querySelector(".reader-view") as HTMLElement;
        if (main && scrollPosition > 0) {
          // If chapterId is provided, scroll to that chapter first
          if (chapterId) {
            const chapterEl = document.querySelector(
              `[data-chapter-id="${chapterId}"]`,
            ) as HTMLElement;
            if (chapterEl) {
              main.scrollTop =
                chapterEl.offsetTop - 20 + (scrollPosition / 100) * chapterEl.offsetHeight;
              return;
            }
          }
          // Otherwise just restore scroll position
          main.scrollTop = scrollPosition;
        }
      }, 100);
    });
  };

  const cleanup = () => {
    if (saveProgressTimer.value) clearTimeout(saveProgressTimer.value);
  };

  return {
    getScrollPercentage,
    getChapterProgress,
    getCurrentVisibleChapterIndex,
    getCurrentVisibleChapterId,
    getVisibleChapterRange,
    handleScroll,
    forceScrollUpdate,
    scrollToChapter,
    restoreScrollPosition,
    cleanup,
  };
}
