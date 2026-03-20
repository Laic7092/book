// Reader core logic

import type {
  Book,
  Chapter,
  ReadingProgress,
  Bookmark,
  ReaderSettings,
  BookReadingStats,
} from "./types";
import { TxtParser } from "../parsers/txt-parser";
import { EpubParser } from "../parsers/epub-parser";
import type { BookParser } from "./types";
import * as booksStore from "../storage/books";
import * as progressStore from "../storage/progress";
import * as bookmarksStore from "../storage/bookmarks";
import * as settingsStore from "../storage/settings";
import * as resourcesStore from "../storage/resources";
import * as statsStore from "../storage/stats";

/**
 * Parser registry
 */
const parsers: BookParser[] = [new TxtParser(), new EpubParser()];

/**
 * Get appropriate parser for a file
 */
function getParserForFile(file: File): BookParser | null {
  for (const parser of parsers) {
    if (parser.supportsFormat(file.type)) {
      return parser;
    }
  }

  // Fallback: try parsers based on file extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt") {
    return new TxtParser();
  }
  if (ext === "epub") {
    return new EpubParser();
  }

  return null;
}

/**
 * Current reader state
 */
interface ReaderState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];
  isLoading: boolean;
  error: string | null;
  resourceUrls: Map<string, string> | undefined; // Maps resource paths to blob URLs
}

const state: ReaderState = {
  currentBook: null,
  currentChapter: null,
  chapters: [],
  isLoading: false,
  error: null,
  resourceUrls: undefined,
};

/**
 * Reader Core API
 */
export const readerCore = {
  /**
   * Load a book from file
   */
  async loadBook(file: File): Promise<{ book: Book; chapters: Chapter[] }> {
    state.isLoading = true;
    state.error = null;

    try {
      const parser = getParserForFile(file);

      if (!parser) {
        throw new Error(`Unsupported file format: ${file.type || file.name}`);
      }

      const parsedBook = await parser.parse(file);

      // Save to storage
      await booksStore.saveBook(parsedBook);

      state.currentBook = parsedBook.book;
      state.chapters = parsedBook.chapters;

      return {
        book: parsedBook.book,
        chapters: parsedBook.chapters,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load book";
      state.error = errorMessage;
      throw error;
    } finally {
      state.isLoading = false;
    }
  },

  /**
   * Open a book from storage
   */
  async openBook(bookId: string): Promise<{ book: Book; chapters: Chapter[] }> {
    state.isLoading = true;
    state.error = null;

    try {
      console.log("[readerCore.openBook] Loading book:", bookId);

      const book = await booksStore.getBook(bookId);
      if (!book) {
        throw new Error("Book not found");
      }
      console.log("[readerCore.openBook] Book loaded:", book);

      // Get chapters with titles from storage
      const chaptersData = await booksStore.getChapters(bookId);
      console.log("[readerCore.openBook] Chapters data from DB:", chaptersData);

      const chapters: Chapter[] = chaptersData.map((ch) => ({
        id: ch.id,
        bookId,
        title: ch.title,
        order: ch.order,
      }));
      console.log("[readerCore.openBook] Chapters mapped:", chapters);

      state.currentBook = book;
      state.chapters = chapters;

      // Set current chapter to first chapter
      state.currentChapter = chapters.length > 0 ? chapters[0] : null;

      // Load resource URLs for this book
      state.resourceUrls = await resourcesStore.getResourceUrls(bookId);

      // Update last read timestamp
      await booksStore.updateLastRead(bookId);

      // Start reading session
      await statsStore.startSession(bookId);

      console.log("[readerCore.openBook] Book opened successfully");

      return { book, chapters };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to open book";
      state.error = errorMessage;
      throw error;
    } finally {
      state.isLoading = false;
    }
  },

  /**
   * Load a book by ID (alias for openBook, loads full chapter list)
   */
  async loadBookById(bookId: string): Promise<{ book: Book; chapters: Chapter[] }> {
    return this.openBook(bookId);
  },

  /**
   * Navigate to a chapter
   */
  async goToChapter(chapterId: string): Promise<string> {
    if (!state.currentBook) {
      throw new Error("No book loaded");
    }

    const chapter = state.chapters.find((c) => c.id === chapterId);
    if (!chapter) {
      throw new Error("Chapter not found");
    }

    const content = await booksStore.getChapterContent(state.currentBook.id, chapterId);

    if (content === undefined) {
      throw new Error("Chapter content not found");
    }

    state.currentChapter = chapter;

    return content;
  },

  /**
   * Go to next chapter
   */
  async nextChapter(): Promise<string | null> {
    if (!state.currentChapter || !state.currentBook) {
      return null;
    }

    const currentIndex = state.chapters.findIndex((c) => c.id === state.currentChapter!.id);
    const nextChapter = state.chapters[currentIndex + 1];

    if (nextChapter) {
      return this.goToChapter(nextChapter.id);
    }

    return null;
  },

  /**
   * Go to previous chapter
   */
  async previousChapter(): Promise<string | null> {
    if (!state.currentChapter || !state.currentBook) {
      return null;
    }

    const currentIndex = state.chapters.findIndex((c) => c.id === state.currentChapter!.id);
    const prevChapter = state.chapters[currentIndex - 1];

    if (prevChapter) {
      return this.goToChapter(prevChapter.id);
    }

    return null;
  },

  /**
   * Update reading progress
   */
  async updateProgress(scrollPosition: number, percentage: number): Promise<void> {
    if (!state.currentBook || !state.currentChapter) {
      return;
    }

    await progressStore.updateProgress(
      state.currentBook.id,
      state.currentChapter.id,
      scrollPosition,
      percentage,
    );
  },

  /**
   * Get current progress
   */
  async getCurrentProgress(): Promise<ReadingProgress | undefined> {
    if (!state.currentBook) {
      return undefined;
    }
    return progressStore.getProgress(state.currentBook.id);
  },

  /**
   * Add a bookmark
   */
  async addBookmark(
    title: string,
    contentPreview: string,
    position: number,
    color?: string,
    note?: string,
  ): Promise<Bookmark> {
    if (!state.currentBook || !state.currentChapter) {
      throw new Error("No book/chapter loaded");
    }

    const bookmark = bookmarksStore.createBookmark(
      state.currentBook.id,
      state.currentChapter.id,
      title,
      contentPreview,
      position,
      color,
      note,
    );

    await bookmarksStore.addBookmark(bookmark);

    return bookmark;
  },

  /**
   * Get all bookmarks for current book
   */
  async getBookmarks(): Promise<Bookmark[]> {
    if (!state.currentBook) {
      return [];
    }
    return bookmarksStore.getBookmarks(state.currentBook.id);
  },

  /**
   * Remove a bookmark
   */
  async removeBookmark(bookmarkId: string): Promise<void> {
    await bookmarksStore.deleteBookmark(bookmarkId);
  },

  /**
   * Update a bookmark
   */
  async updateBookmark(bookmarkId: string, updates: Partial<Bookmark>): Promise<void> {
    const bookmark = await bookmarksStore.getBookmark(bookmarkId);
    if (!bookmark) throw new Error("Bookmark not found");
    const updated = { ...bookmark, ...updates };
    await bookmarksStore.updateBookmark(updated);
  },

  /**
   * Get reader settings
   */
  async getSettings(): Promise<ReaderSettings> {
    return settingsStore.getSettings();
  },

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<ReaderSettings>): Promise<ReaderSettings> {
    const current = await settingsStore.getSettings();
    const updated = { ...current, ...settings };
    await settingsStore.saveSettings(updated);
    return updated;
  },

  /**
   * Close current book
   */
  async closeBook(): Promise<void> {
    // End reading session if a book is open
    if (state.currentBook) {
      const chapterId = state.currentChapter?.id;
      await statsStore.endSession(state.currentBook.id, chapterId);
    }

    // Revoke blob URLs to free memory
    if (state.resourceUrls) {
      resourcesStore.revokeResourceUrls(state.resourceUrls);
    }
    state.currentBook = null;
    state.currentChapter = null;
    state.chapters = [];
    state.resourceUrls = undefined;
  },

  /**
   * Get current state
   */
  getState(): ReaderState {
    return { ...state };
  },

  /**
   * Get current book
   */
  getCurrentBook(): Book | null {
    return state.currentBook;
  },

  /**
   * Get chapters
   */
  getChapters(): Chapter[] {
    return state.chapters;
  },

  /**
   * Get current chapter
   */
  getCurrentChapter(): Chapter | null {
    return state.currentChapter;
  },

  /**
   * Get current chapter content with resource URLs rewritten
   */
  async getCurrentChapterContent(): Promise<string | null> {
    if (!state.currentBook || !state.currentChapter) {
      return null;
    }

    const content = await booksStore.getChapterContent(
      state.currentBook.id,
      state.currentChapter.id,
    );
    if (!content) {
      return null;
    }

    // Rewrite resource URLs if available
    if (state.resourceUrls && state.resourceUrls.size > 0) {
      const { rewriteResourcePaths } = await import("../utils/resource-urls");
      return rewriteResourcePaths(content, state.resourceUrls);
    }

    return content;
  },

  /**
   * Get all books from library
   */
  async getLibrary(): Promise<Book[]> {
    return booksStore.getAllBooks();
  },

  /**
   * Delete a book from library
   */
  async deleteBook(bookId: string): Promise<void> {
    if (state.currentBook?.id === bookId) {
      await this.closeBook();
    }
    await booksStore.deleteBook(bookId);
    await statsStore.deleteStats(bookId);
  },

  /**
   * Get reading statistics for a book
   */
  async getReadingStats(bookId: string): Promise<BookReadingStats | undefined> {
    return statsStore.getStats(bookId);
  },

  /**
   * Get reading statistics for all books
   */
  async getAllReadingStats(): Promise<BookReadingStats[]> {
    return statsStore.getAllStats();
  },

  /**
   * Get summary reading statistics
   */
  async getSummaryStats(): Promise<{
    totalBooks: number;
    totalReadingTime: number;
    totalSessions: number;
    booksInProgress: number;
    completedBooks: number;
    thisWeekReadingTime: number;
  }> {
    return statsStore.getSummaryStats();
  },
};

// Initialize default settings on load
settingsStore.getSettings().catch(() => {
  // Ignore errors during initialization
});
