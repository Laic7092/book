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
  getCurrentScale(): number;
  destroy(): void;
}

/**
 * A renderer that manages its own DOM and lifecycle inside a container.
 * Used by formats whose rendering engine is self-driving (e.g. PDF).
 */
export interface SelfContainedRenderer {
  /** Mount the renderer into a container and render the given chapter. */
  mount(container: HTMLElement, href: string, rawData: ArrayBuffer): Promise<void>;

  /** Unmount the renderer from its container. */
  unmount(): void;

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
  getCurrentScale(): number;

  /** Host sets this — renderer calls when its current page changes autonomously. */
  onPageChange?: (page: number, total: number) => void;

  destroy(): void;
}
