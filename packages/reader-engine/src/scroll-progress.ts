/** Minimal structural contract of a chapter wrapper needed for progress computation. */
export interface ChapterWrapperLike {
  dataset: { chapterId?: string };
  getBoundingClientRect(): { top: number; bottom: number };
  scrollHeight: number;
}

export interface ChapterScrollResult {
  chapterId: string | undefined;
  progress: number;
}

/**
 * Compute the in-chapter scroll progress for the current chapter.
 *
 * The current chapter is the one whose top line is inside the viewport and
 * closest to the viewport top (largest `rect.top`). A chapter whose top has
 * entered the viewport stays current until it scrolls past the top edge —
 * a trailing sliver of the previous chapter at the top boundary (e.g. after
 * autoLoad prepends a chapter and compensates scrollTop) never steals the
 * anchor, so `SET_CURRENT_CHAPTER` stays consistent with what is on screen.
 *
 * - In-chapter scrollTop is the distance the wrapper's top has scrolled out of
 *   the viewport (`-rect.top`); it is stable across autoLoad append/prepend
 *   because wrapper position and document scrollTop shift by the same amount.
 * - The denominator is the chapter's own `scrollHeight - clientHeight`.
 *   `restoreScrollPosition` must invert this mapping in the same coordinate
 *   system (chapter wrapper height plus the wrapper's top offset in the
 *   document); using `documentElement.scrollHeight` directly would not round
 *   trip, because a collapsed top margin of the chapter's first block (e.g. an
 *   h1) is counted in `html.scrollHeight` but not in `wrapper.scrollHeight`.
 * - When no wrapper is visible (degenerate state), fall back to the legacy
 *   whole-document ratio and return `chapterId: undefined` so chapter
 *   switching is not triggered.
 */
export function computeChapterScrollProgress(
  wrappers: ArrayLike<ChapterWrapperLike>,
  scrollTop: number,
  clientHeight: number,
  docScrollHeight: number,
): ChapterScrollResult {
  let visible: ChapterWrapperLike | undefined;
  let bestTop = -Infinity;
  for (let i = 0; i < wrappers.length; i++) {
    const rect = wrappers[i].getBoundingClientRect();
    if (rect.top <= clientHeight && rect.top > bestTop) {
      visible = wrappers[i];
      bestTop = rect.top;
    }
  }

  if (!visible) {
    const max = Math.max(docScrollHeight - clientHeight, 1);
    return {
      chapterId: undefined,
      progress: Math.min(1, Math.max(0, scrollTop / max)),
    };
  }

  const rect = visible.getBoundingClientRect();
  const chapterScrollTop = Math.max(0, -rect.top);
  const max = Math.max(visible.scrollHeight - clientHeight, 1);
  return {
    chapterId: visible.dataset.chapterId,
    progress: Math.min(1, chapterScrollTop / max),
  };
}
