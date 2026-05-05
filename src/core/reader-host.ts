import type { ComputedRef } from "vue";
import type { Chapter, ReaderSettings } from "./types";

/**
 * Host API that ReaderView exposes to plugins.
 * Merged from ReaderHost + ReaderNavigation (P0).
 */
export interface ReaderHost {
  // ── Document access ──
  getDocument(): Document | null;
  getArticle(): HTMLElement | null;

  // ── Navigation ──
  navigateToChapter(chapterId: string, targetPage?: number): Promise<void>;
  navigateToCfi(cfi: string, chapterId: string): Promise<void>;

  // ── State queries ──
  getCurrentChapter(): Chapter | null;
  getCurrentCfi(): string | null;
  getChapters(): Chapter[];
  getChapterTitle(chapterId: string): string;
  getCurrentBookId(): string | undefined;
  isPaginationMode: ComputedRef<boolean>;

  // ── Settings (delegates to settings store) ──
  getSettings(): ComputedRef<ReaderSettings>;
  updateSettings(partial: Partial<ReaderSettings>): void;

  // ── Actions ──
  openModal(name: string): void;

  // ── Pagination state (for plugins that compute CFI) ──
  getCurrentPage(): number;
  getTotalPages(): number;
  /** Jump to a page within the current chapter (pagination mode only). */
  goToPage(page: number): void;
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
