// Simplified scroll manager for vertical reading mode
// Core responsibilities: track scroll position, detect current chapter

import { ref, type Ref } from "vue";
import { throttle, debounce } from "../utils/debounce";
import { SCROLL_SAVE_DELAY } from "../utils/constants";

interface UseScrollManagerOptions {
  isPaginationMode: Ref<boolean>;
  onProgressUpdate: (reading: number, chapter: number, chapterId?: string) => void;
  onChapterChange?: (chapterId: string) => void;
  onAutoSave?: (data: {
    chapterId: string;
    chapterProgress: number;
    readingProgress: number;
  }) => void;
}

export function useScrollManager(options: UseScrollManagerOptions) {
  const { isPaginationMode, onProgressUpdate, onChapterChange, onAutoSave } = options;

  const lastChapterId = ref<string | null>(null);

  // Get the main scroll container
  function getContainer(): HTMLElement | null {
    return document.querySelector(".reader-view") as HTMLElement;
  }

  // Calculate scroll percentage (0-100)
  function getScrollPercentage(): number {
    const el = getContainer();
    if (!el) return 0;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) return 0;
    return Math.min(100, Math.max(0, (scrollTop / (scrollHeight - clientHeight)) * 100));
  }

  // Find which chapter is currently visible (by viewport midpoint)
  function getCurrentChapterId(): string | null {
    const el = getContainer();
    if (!el) return null;

    const midpoint = el.scrollTop + el.clientHeight / 2;
    const containers = el.querySelectorAll(".chapter-container");

    for (const container of containers) {
      const el = container as HTMLElement;
      if (midpoint >= el.offsetTop && midpoint < el.offsetTop + el.offsetHeight) {
        return el.getAttribute("data-chapter-id");
      }
    }
    return null;
  }

  // Calculate progress within current chapter (0-100)
  function getChapterProgress(chapterId: string): number {
    const container = getContainer();
    if (!container) return 0;

    const chapterEl = document.querySelector(`[data-chapter-id="${chapterId}"]`) as HTMLElement;
    if (!chapterEl) return 0;

    const scrolled = container.scrollTop - chapterEl.offsetTop;
    const height = chapterEl.offsetHeight;
    if (height <= 0) return 0;

    return Math.min(100, Math.max(0, (scrolled / height) * 100));
  }

  // Debounced auto-save
  const debouncedSave = onAutoSave
    ? debounce((chapterId: string, chapterProgress: number, readingProgress: number) => {
        onAutoSave({ chapterId, chapterProgress, readingProgress });
      }, SCROLL_SAVE_DELAY)
    : null;

  // Throttled scroll handler
  const handleScroll = throttle(() => {
    if (isPaginationMode.value) return;

    const reading = getScrollPercentage();
    const currentId = getCurrentChapterId();

    if (currentId && currentId !== lastChapterId.value) {
      lastChapterId.value = currentId;
      onChapterChange?.(currentId);
    }

    const chapterId = currentId || lastChapterId.value || undefined;
    const chapter = chapterId ? getChapterProgress(chapterId) : 0;

    onProgressUpdate(reading, chapter, chapterId);
    debouncedSave?.(chapterId || "", chapter, reading);
  }, 16);

  // Jump to chapter instantly (no animation)
  function scrollToChapter(chapterId: string): void {
    const chapterEl = document.querySelector(`[data-chapter-id="${chapterId}"]`) as HTMLElement;
    const container = getContainer();
    if (chapterEl && container) {
      container.scrollTop = chapterEl.offsetTop;
    }
  }

  // Restore scroll position (used on page load)
  function restoreScrollPosition(scrollPosition: number, chapterId?: string): void {
    const container = getContainer();
    if (!container) return;

    if (chapterId) {
      const chapterEl = document.querySelector(`[data-chapter-id="${chapterId}"]`) as HTMLElement;
      if (chapterEl) {
        container.scrollTop = chapterEl.offsetTop + (scrollPosition / 100) * chapterEl.offsetHeight;
        return;
      }
    }
    container.scrollTop = scrollPosition;
  }

  return {
    handleScroll,
    scrollToChapter,
    restoreScrollPosition,
  };
}
