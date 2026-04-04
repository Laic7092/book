// Reader Store - Manages book reading state and operations

import { defineStore } from "pinia";
import type { Book, Chapter, ParsedBook } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { TxtParser } from "../parsers/txt-parser";
import { EpubParser } from "../parsers/epub-parser";
import type { BookParser } from "../core/types";
import * as booksStore from "../storage/books";
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
  }),

  getters: {
    isBookOpen: (state) => {
      return state.currentBook !== null;
    },
  },

  actions: {
    /**
     * Load a book from file (parse and save to storage, but don't open)
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

        // Don't set currentBook here - just parse and save
        // The book will be opened when user clicks on it
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

      // Revoke previous blob URLs before loading new book
      if (this.resourceUrls) {
        resourcesStore.revokeResourceUrls(this.resourceUrls);
        this.resourceUrls = undefined;
      }

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

        this.currentChapter = chapters.length > 0 ? chapters[0] : null;

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
     * Update progress state (memory only)
     */
    updateProgress(reading: number, chapter: number): void {
      this.readingProgress = reading;
      this.chapterProgress = chapter;
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
      this.readingProgress = 0;
      this.chapterProgress = 0;
    },

    /**
     * Reset store to initial state
     */
    reset() {
      // Revoke blob URLs before resetting to prevent memory leak
      if (this.resourceUrls) {
        resourcesStore.revokeResourceUrls(this.resourceUrls);
      }
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
     * 返回 HTML 内容和解析后的资源元素列表
     */
    async getCurrentChapterContent(): Promise<{
      html: string;
      resources: HTMLElement[];
    } | null> {
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
        const doc = rewriteResourcePaths(content, this.resourceUrls);

        // 收集资源元素
        const resources: HTMLElement[] = [];
        const headElements = Array.from(doc.head.children);
        for (const element of headElements) {
          // 克隆元素
          const clonedElement = element.cloneNode(true) as HTMLElement;
          resources.push(clonedElement);
        }

        return {
          html: doc.body.innerHTML,
          resources,
        };
      }

      return {
        html: content,
        resources: [],
      };
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
