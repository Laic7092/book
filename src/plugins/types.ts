import type { Component } from "vue";
import type { BookParser } from "../core/types";

/**
 * Footer toolbar action declared by a plugin.
 * ReaderFooter builds its buttons from these dynamically.
 */
export interface FooterAction {
  /** Unique ID (e.g. "search", "bookmarks") */
  id: string;
  /** "bar" = main toolbar, "menu" = overflow popover */
  position: "bar" | "menu";
  /** Display label */
  label: string;
  /** SVG inner content (paths, circles, etc. — the children of an <svg> element) */
  icon: string;
  /** If set, clicking this button opens the given modal via uiStore.openModal() */
  modal?: string;
  /** Sort order within the position group (lower = first) */
  order: number;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;

  /** Whether this plugin is enabled. Defaults to true. */
  enabled?: boolean;

  /** Format parsers provided by this plugin */
  parsers?: BookParser[];

  /** Modal components keyed by modalType */
  modalComponents?: Record<string, Component>;

  /** Overlay components rendered in ReaderView (e.g. annotation toolbar, popover) */
  overlayComponents?: Record<string, Component>;

  /** Footer toolbar actions */
  footerActions?: FooterAction[];

  /** Lazy extraction callbacks (EPUB plugin) */
  lazyExtractChapter?: (zipData: ArrayBuffer, href: string) => Promise<string>;
  lazyExtractResource?: (zipData: ArrayBuffer, resourceId: string) => Promise<ArrayBuffer>;

  /** Resource URL resolution + lifecycle (EPUB plugin) */
  resourceResolver?: {
    getResourceUrl(bookId: string, path: string): Promise<string | null>;
    revokeResourceUrls(urls: Map<string, string>): void;
  };

  /** Resource saving during book import (EPUB plugin) */
  resourceSaver?: {
    saveResource(
      bookId: string,
      resourceId: string,
      data: ArrayBuffer,
      mimeType: string,
    ): Promise<void>;
  };

  /** Zip data storage for lazy extraction (EPUB plugin) */
  zipStore?: {
    saveZip(bookId: string, data: ArrayBuffer, fileSize: number): Promise<void>;
    getZip(bookId: string): Promise<ArrayBuffer | undefined>;
  };

  /** Reading session tracking (stats plugin) */
  sessionTracker?: {
    startSession(bookId: string): Promise<void>;
    endSession(bookId: string, chapterId?: string): Promise<void>;
  };

  /** Stats queries + lifecycle (stats plugin) */
  statsProvider?: {
    getSummaryStats(): Promise<{
      totalBooks: number;
      totalReadingTime: number;
      totalSessions: number;
      booksInProgress: number;
      completedBooks: number;
      thisWeekReadingTime: number;
    }>;
    deleteStats(bookId: string): Promise<void>;
  };

  /** Called after all plugins are registered */
  onInit?: () => void | Promise<void>;

  /** Called when a book is opened */
  onBookOpen?: (bookId: string) => Promise<void>;

  /** Called when the current book is closed */
  onBookClose?: () => void;

  /** Called when a modal belonging to this plugin is opened */
  onModalOpen?: (modalName: string) => void;

  /** Called when a modal belonging to this plugin is closed */
  onModalClose?: (modalName: string) => void;
}
