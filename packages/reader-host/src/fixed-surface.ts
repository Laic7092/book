export interface FixedLayoutSurface {
  /** Load and render a chapter's content. */
  loadChapter(href: string, rawData: ArrayBuffer): Promise<void>;

  /** Current sub-page index (0-based). */
  getCurrentPage(): number;

  /** Total sub-pages in the current chapter. */
  getPageCount(): number;

  /** Navigate to a specific sub-page (0-based). */
  goToPage(page: number): void;

  zoomIn(): void;
  zoomOut(): void;
  zoomFit(): void;
  zoomWidth(): void;
  rotate(degrees: number): void;
  destroy(): void;
}
