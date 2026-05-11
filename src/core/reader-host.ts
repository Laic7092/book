import type { ComputedRef } from "vue";
import type { Chapter } from "./types";

/**
 * Host API that ReaderView exposes to plugins.
 */
export interface ReaderHost {
  // ── Document access ──
  getDocument(): Document | null;

  // ── Navigation ──
  navigateToChapter(chapterId: string, targetPage?: number): Promise<void>;
  navigateToCfi(cfi: string, chapterId: string): Promise<void>;

  // ── State queries ──
  getCurrentChapter(): Chapter | null;
  getChapters(): Chapter[];
  getCurrentBookId(): string | undefined;
  isPaginationMode: ComputedRef<boolean>;

  // ── Render mode control ──
  setReadingMode(mode: "vertical" | "pagination"): void;
  setPageMargin(margin: number): void;

  // ── Actions ──
  openModal(name: string): void;
  closeModal(): void;

  // ── Pagination state (for plugins that compute CFI) ──
  getCurrentPage(): number;
  getTotalPages(): number;
  /** Jump to a page within the current chapter (pagination mode only). */
  goToPage(page: number): void;
  /** Go to next page, or next chapter if at end of current chapter. Returns true if moved, false if at end of book. */
  nextPage(): Promise<boolean>;
  /** Push a position to the navigation history stack. Call after non-linear navigation. */
  pushToHistory(chapterId: string, page: number): void;
  getCurrentChapterRawHtml(): string;

  // ── Content pipeline ──
  getChapterContent(chapterId: string): Promise<string | undefined>;

  // ── Events ──
  onReady(cb: () => void): () => void;
  onChapterChange(handler: (chapterId: string) => void): () => void;
  registerCleanup(fn: () => void): void;
}

let hostInstance: ReaderHost | null = null;

export function registerReaderHost(host: ReaderHost): void {
  hostInstance = host;
}

export function getReaderHost(): ReaderHost | null {
  return hostInstance;
}

export function unregisterReaderHost(): void {
  hostInstance = null;
}
