// Composable for scroll management in vertical reading mode

import { ref, type Ref } from "vue";
import { throttle } from "../utils/debounce";
import type { Chapter } from "../core/types";

interface UseScrollManagerOptions {
  isPaginationMode: Ref<boolean>;
  readingProgress: Ref<number>;
  chapterProgress: Ref<number>;
  updateProgress: (scrollPosition: number, percentage: number) => void;
  onPreloadTrigger?: (chapterIndex: number) => void;
}

export function useScrollManager(options: UseScrollManagerOptions) {
  const { isPaginationMode, readingProgress, chapterProgress, updateProgress, onPreloadTrigger } =
    options;

  const saveProgressTimer = ref<number | null>(null);

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
    chapterProgress.value = scrollPercentage;

    // Debounced progress saving
    if (saveProgressTimer.value) clearTimeout(saveProgressTimer.value);
    saveProgressTimer.value = window.setTimeout(() => {
      updateProgress(scrollPercentage, scrollPercentage);
    }, 1000);
  }, 16);

  const handleScroll = (chapters: Chapter[], currentChapterIndex: number) => {
    throttledScrollHandler();
    if (currentChapterIndex >= 0) {
      checkPreloadThreshold(currentChapterIndex, chapters.length);
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

  const cleanup = () => {
    if (saveProgressTimer.value) clearTimeout(saveProgressTimer.value);
  };

  return {
    getScrollPercentage,
    getCurrentVisibleChapterIndex,
    handleScroll,
    scrollToChapter,
    cleanup,
  };
}
