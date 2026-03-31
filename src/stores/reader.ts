// Reader Store - Manages book reading state and operations

import { defineStore } from "pinia";
import type { Book, Chapter, Bookmark, ReaderSettings, ParsedBook } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { TxtParser } from "../parsers/txt-parser";
import { EpubParser } from "../parsers/epub-parser";
import type { BookParser } from "../core/types";
import * as booksStore from "../storage/books";
import * as progressStore from "../storage/progress";
import * as bookmarksStore from "../storage/bookmarks";
import * as settingsStore from "../storage/settings";
import * as resourcesStore from "../storage/resources";
import * as statsStore from "../storage/stats";
import { assertValidBookFile, validateBookId } from "../utils/validation";

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

export interface ReaderState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];
  isLoading: boolean;
  error: string | null;
  resourceUrls: Map<string, string> | undefined;
  readingProgress: number;
  chapterProgress: number;
  bookmarks: Bookmark[];
  settings: ReaderSettings;
}

export const useReaderStore = defineStore("reader", {
  state: (): ReaderState => ({
    currentBook: null,
    currentChapter: null,
    chapters: [],
    isLoading: false,
    error: null,
    resourceUrls: undefined,
    readingProgress: 0,
    chapterProgress: 0,
    bookmarks: [],
    settings: {
      fontSize: 18,
      fontFamily: "Literata, Georgia, serif",
      lineHeight: 1.6,
      theme: "light",
      margin: 24,
      letterSpacing: 0,
      paragraphSpacing: 1.2,
      textAlign: "left",
      contrast: "normal",
      scrollMode: "vertical",
      paginationAnimation: "slide",
    },
  }),

  getters: {
    isBookOpen: (state) => {
      return state.currentBook !== null;
    },
  },

  actions: {
    /**
     * Load a book from file
     */
    async loadBook(file: File): Promise<{ book: Book; chapters: Chapter[] }> {
      assertValidBookFile(file);
      this.isLoading = true;
      this.error = null;

      try {
        const parser = getParserForFile(file);

        if (!parser) {
          throw createReaderError(
            `Unsupported file format: ${file.type || file.name}`,
            ErrorCode.UNSUPPORTED_FORMAT,
          );
        }

        const parsedBook: ParsedBook = await parser.parse(file);

        // Save to storage
        await booksStore.saveBook(parsedBook);

        this.currentBook = parsedBook.book;
        this.chapters = parsedBook.chapters;
        this.bookmarks = await bookmarksStore.getBookmarks(parsedBook.book.id);

        return {
          book: parsedBook.book,
          chapters: parsedBook.chapters,
        };
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load book";
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * Open a book from storage by ID
     */
    async openBook(bookId: string): Promise<{ book: Book; chapters: Chapter[] }> {
      validateBookId(bookId);
      this.isLoading = true;
      this.error = null;

      try {
        const book = await booksStore.getBook(bookId);
        if (!book) {
          throw createReaderError("Book not found", ErrorCode.BOOK_NOT_FOUND);
        }

        // Get chapters with titles from storage
        const chaptersData = await booksStore.getChapters(bookId);

        const chapters: Chapter[] = chaptersData.map((ch) => ({
          id: ch.id,
          bookId,
          title: ch.title,
          order: ch.order,
        }));

        this.currentBook = book;
        this.chapters = chapters;

        // Load resource URLs for this book
        this.resourceUrls = await resourcesStore.getResourceUrls(bookId);

        // Update last read timestamp
        await booksStore.updateLastRead(bookId);

        // Start reading session
        await statsStore.startSession(bookId);

        // Load bookmarks
        this.bookmarks = await bookmarksStore.getBookmarks(bookId);

        // Load settings
        const settings = await settingsStore.getSettings();
        this.settings = { ...this.settings, ...settings };

        // Load saved reading progress and set current chapter
        const savedProgress = await progressStore.getProgress(bookId);
        if (savedProgress?.chapterId) {
          const lastChapter = chapters.find((c) => c.id === savedProgress!.chapterId);
          if (lastChapter) {
            this.currentChapter = lastChapter;
            this.readingProgress = savedProgress.percentage || 0;
            this.chapterProgress = savedProgress.percentage || 0;
          } else {
            this.currentChapter = chapters.length > 0 ? chapters[0] : null;
          }
        } else {
          this.currentChapter = chapters.length > 0 ? chapters[0] : null;
        }

        return { book, chapters };
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to open book";
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * Navigate to a chapter
     */
    async goToChapter(chapterId: string): Promise<string> {
      if (!this.currentBook) {
        throw createReaderError("No book loaded", ErrorCode.NO_BOOK_LOADED);
      }

      const chapter = this.chapters.find((c) => c.id === chapterId);
      if (!chapter) {
        throw createReaderError("Chapter not found", ErrorCode.CHAPTER_NOT_FOUND);
      }

      const content = await booksStore.getChapterContent(this.currentBook.id, chapterId);

      if (content === undefined) {
        throw createReaderError("Chapter content not found", ErrorCode.CHAPTER_CONTENT_NOT_FOUND);
      }

      this.currentChapter = chapter;
      this.chapterProgress = 0;
      this.readingProgress = 0;

      return content;
    },

    /**
     * Go to next chapter
     */
    async nextChapter(): Promise<string | null> {
      if (!this.currentChapter || !this.currentBook) {
        return null;
      }

      const currentIndex = this.chapters.findIndex((c) => c.id === this.currentChapter!.id);
      const nextChapter = this.chapters[currentIndex + 1];

      if (nextChapter) {
        return this.goToChapter(nextChapter.id);
      }

      return null;
    },

    /**
     * Go to previous chapter
     */
    async prevChapter(): Promise<string | null> {
      if (!this.currentChapter || !this.currentBook) {
        return null;
      }

      const currentIndex = this.chapters.findIndex((c) => c.id === this.currentChapter!.id);
      const prevChapter = this.chapters[currentIndex - 1];

      if (prevChapter) {
        return this.goToChapter(prevChapter.id);
      }

      return null;
    },

    /**
     * Update reading progress
     */
    async updateProgress(
      scrollPosition: number,
      percentage: number,
      chapterId?: string,
    ): Promise<void> {
      if (!this.currentBook || !this.currentChapter) {
        return;
      }

      this.readingProgress = percentage;
      this.chapterProgress = percentage;

      await progressStore.updateProgress(
        this.currentBook.id,
        chapterId || this.currentChapter.id,
        scrollPosition,
        percentage,
      );
    },

    /**
     * Get current progress
     */
    async getCurrentProgress() {
      if (!this.currentBook) {
        return undefined;
      }
      return progressStore.getProgress(this.currentBook.id);
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
      if (!this.currentBook || !this.currentChapter) {
        throw createReaderError("No book/chapter loaded", ErrorCode.NO_BOOK_LOADED);
      }

      const bookmark = bookmarksStore.createBookmark(
        this.currentBook.id,
        this.currentChapter.id,
        title,
        contentPreview,
        position,
        color,
        note,
      );

      await bookmarksStore.addBookmark(bookmark);
      this.bookmarks.push(bookmark);

      return bookmark;
    },

    /**
     * Get all bookmarks for current book
     */
    async getBookmarks(): Promise<Bookmark[]> {
      if (!this.currentBook) {
        return [];
      }
      return bookmarksStore.getBookmarks(this.currentBook.id);
    },

    /**
     * Remove a bookmark
     */
    async removeBookmark(bookmarkId: string): Promise<void> {
      await bookmarksStore.deleteBookmark(bookmarkId);
      this.bookmarks = this.bookmarks.filter((b) => b.id !== bookmarkId);
    },

    /**
     * Update a bookmark
     */
    async updateBookmark(bookmarkId: string, updates: Partial<Bookmark>): Promise<void> {
      const bookmark = await bookmarksStore.getBookmark(bookmarkId);
      if (!bookmark) throw createReaderError("Bookmark not found", ErrorCode.BOOKMARK_NOT_FOUND);
      const updated = { ...bookmark, ...updates };
      await bookmarksStore.updateBookmark(updated);

      const index = this.bookmarks.findIndex((b) => b.id === bookmarkId);
      if (index !== -1) {
        this.bookmarks[index] = { ...this.bookmarks[index], ...updates };
      }
    },

    /**
     * Update settings
     */
    async updateSettings(updates: Partial<ReaderSettings>): Promise<ReaderSettings> {
      const current = await settingsStore.getSettings();
      const updated = { ...current, ...updates };
      await settingsStore.saveSettings(updated);
      this.settings = updated;
      return updated;
    },

    /**
     * Close current book
     */
    async closeBook(): Promise<void> {
      // End reading session if a book is open
      if (this.currentBook) {
        const chapterId = this.currentChapter?.id;
        await statsStore.endSession(this.currentBook.id, chapterId);
      }

      // Revoke blob URLs to free memory
      if (this.resourceUrls) {
        resourcesStore.revokeResourceUrls(this.resourceUrls);
      }

      this.currentBook = null;
      this.currentChapter = null;
      this.chapters = [];
      this.resourceUrls = undefined;
      this.bookmarks = [];
      this.readingProgress = 0;
      this.chapterProgress = 0;
    },

    /**
     * Reset store to initial state
     */
    reset() {
      this.$reset();
    },

    /**
     * Get current chapter
     */
    getCurrentChapter() {
      return this.currentChapter;
    },

    /**
     * Get current book
     */
    getCurrentBook() {
      return this.currentBook;
    },

    /**
     * Get current chapter content with resource URLs rewritten
     */
    async getCurrentChapterContent(): Promise<string | null> {
      if (!this.currentBook || !this.currentChapter) {
        return null;
      }

      const content = await booksStore.getChapterContent(
        this.currentBook.id,
        this.currentChapter.id,
      );
      if (!content) {
        return null;
      }

      // Rewrite resource URLs if available
      if (this.resourceUrls && this.resourceUrls.size > 0) {
        const { rewriteResourcePaths } = await import("../utils/resource-urls");
        return rewriteResourcePaths(content, this.resourceUrls);
      }

      return content;
    },

    /**
     * Get library books
     */
    async getLibrary(): Promise<Book[]> {
      return booksStore.getAllBooks();
    },

    /**
     * Get reading stats for a book
     */
    async getReadingStats(bookId: string) {
      return await statsStore.getStats(bookId);
    },

    /**
     * Get all reading stats
     */
    async getAllReadingStats() {
      return await statsStore.getAllStats();
    },

    /**
     * Get summary reading statistics
     */
    async getSummaryStats() {
      return await statsStore.getSummaryStats();
    },

    /**
     * Delete a book
     */
    async deleteBook(bookId: string): Promise<void> {
      if (this.currentBook?.id === bookId) {
        await this.closeBook();
      }
      await booksStore.deleteBook(bookId);
      await statsStore.deleteStats(bookId);
    },
  },
});

// Initialize default settings on load
settingsStore.getSettings().catch(() => {
  // Ignore errors during initialization
});
