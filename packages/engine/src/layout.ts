/**
 * Pure layout math shared between the reflowable host and the app's CFI
 * navigation. Every function is a pure mapping of numbers to numbers with no
 * DOM access, so the pagination/anchor math has one implementation and one
 * test suite instead of three hand-rolled copies.
 */

/**
 * Pagination page index for an element: how many full viewport-width steps
 * the element sits past the body's left edge.
 *
 * The caller guards `step > 0`; a negative offset (element left of the body
 * origin) floors toward 0, which is what page 0 means.
 */
export function computePageFromOffset(elLeft: number, bodyLeft: number, step: number): number {
  return Math.floor((elLeft - bodyLeft) / step);
}

/**
 * Absolute document scrollTop for an anchor element in scroll mode: viewport
 * top + scrollTop. Reading `rect.top` alone is only valid at scrollTop 0 —
 * after a previous restore the element can be far above the viewport and
 * `rect.top` negative, so the current scrollTop must be added back.
 */
export function computeAnchorScrollTop(elRectTop: number, docScrollTop: number): number {
  return elRectTop + docScrollTop;
}

/**
 * Number of pagination columns for a content width: ceil(content / step) with
 * a floor of 1 page. `viewportWidth <= 0` is guarded by clamping the step to
 * at least 1 so division never explodes.
 */
export function computePageCount(contentWidth: number, viewportWidth: number): number {
  const step = Math.max(viewportWidth, 1);
  return Math.max(1, Math.ceil(contentWidth / step));
}

/**
 * Invert `computeChapterScrollProgress`: given saved in-chapter progress
 * (0..1) and the chapter's scroll range, produce the document scrollTop.
 * `offset` is the wrapper's document-coordinate top (`rect.top + scrollTop`);
 * the caller computes it because it depends on live DOM reads.
 */
export function computeScrollTarget(progress: number, maxScroll: number, offset: number): number {
  return progress * maxScroll + offset;
}

/**
 * Whether the user has scrolled away from a restored position, within a
 * small pixel tolerance. Scroll calibration stops once this returns true.
 */
export function hasScrolledAway(actualTop: number, lastTop: number, tolerance = 1): boolean {
  return Math.abs(actualTop - lastTop) > tolerance;
}

/**
 * Keep the document scrollTop stable when a chapter is prepended above the
 * viewport: the content grows by the prepended height, so add the delta to
 * the current scrollTop. Returns the new scrollTop.
 */
export function computePrependCompensation(
  prevScrollHeight: number,
  newScrollHeight: number,
  scrollTop: number,
): number {
  return scrollTop + (newScrollHeight - prevScrollHeight);
}
