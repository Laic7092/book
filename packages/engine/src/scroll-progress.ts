/** Minimal structural contract of a chapter wrapper needed for progress computation. */
export interface ChapterWrapperLike {
  dataset: { chapterId?: string };
  getBoundingClientRect(): { top: number; bottom: number };
  scrollHeight: number;
}

export interface ChapterScrollResult {
  chapterId: string | undefined;
  progress: number;
  /**
   * Viewport-top-edge offset inside the chapter (0..1), `-rect.top` over the
   * chapter's own height. Unlike `progress` it never saturates: it pins the
   * exact scroll position, so re-entering restores the same viewport instead
   * of clamping to "chapter bottom aligned". Undefined when no chapter owns
   * the anchor (degenerate fallback).
   */
  anchor?: number;
}

/**
 * Compute the in-chapter scroll progress for the current chapter.
 *
 * The current chapter is the one the viewport's top edge falls inside: the
 * topmost wrapper whose content still intersects the viewport. A chapter keeps
 * the anchor until it has fully scrolled out (its bottom edge passes the
 * viewport top) — a trailing portion of the previous chapter sharing the
 * viewport with the next chapter's top never steals the anchor, so
 * `SET_CURRENT_CHAPTER` stays consistent with what the reader is actually
 * looking at.
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
 * - When no wrapper intersects the viewport (degenerate state), fall back to
 *   the legacy whole-document ratio and return `chapterId: undefined` so
 *   chapter switching is not triggered.
 */
export function computeChapterScrollProgress(
  wrappers: ArrayLike<ChapterWrapperLike>,
  scrollTop: number,
  clientHeight: number,
  docScrollHeight: number,
): ChapterScrollResult {
  let visible: ChapterWrapperLike | undefined;
  let bestTop = Infinity;
  for (let i = 0; i < wrappers.length; i++) {
    const rect = wrappers[i].getBoundingClientRect();
    // Wrapper intersects the viewport: its top line has not scrolled past the
    // bottom edge and its bottom has not passed the top edge.
    if (rect.top > clientHeight || rect.bottom <= 0) continue;
    // Topmost intersecting wrapper owns the viewport top edge.
    if (rect.top < bestTop) {
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
    anchor: Math.min(1, Math.max(0, -rect.top / visible.scrollHeight)),
  };
}
