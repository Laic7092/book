// Reader Store - Manages book reading state and operations

import { defineStore } from "pinia";
import type { Book, Chapter, ParsedBook, BookParser } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { getParsers, getParserForFormat } from "../plugins/registry";
import { loadPluginsFor } from "../plugins/loader";
import { pluginEvents } from "../plugins/context";
import * as booksStore from "../storage/books";
import { assertValidBookFile, validateBookId } from "../utils/validation";

const EXTENSION_MIME_MAP: Record<string, string> = {
  txt: "text/plain",
  epub: "application/epub+zip",
  pdf: "application/pdf",
  cbz: "application/vnd.comicbook+zip",
};

function getParserForFile(file: File): BookParser | null {
  const parsers = getParsers();

  for (const parser of parsers) {
    if (parser.supportsFormat(file.type)) return parser;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && EXTENSION_MIME_MAP[ext]) {
    for (const parser of parsers) {
      if (parser.supportsFormat(EXTENSION_MIME_MAP[ext])) {
        return parser;
      }
    }
  }

  return null;
}

export interface ReaderState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  currentParser: BookParser | null;
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
    currentParser: null,
    chapters: [],
    isLoading: false,
    error: null,
    resourceUrls: undefined,
    readingProgress: 0,
    chapterProgress: 0,
  }),

  getters: {
    isBookOpen: (state) => state.currentBook !== null,
  },

  actions: {
    async loadBook(file: File): Promise<{ book: Book; chapters: Chapter[] }> {
      assertValidBookFile(file);
      this.isLoading = true;
      this.error = null;

      try {
        await loadPluginsFor("book-import");
        const parser = getParserForFile(file);
        if (!parser) {
          throw createReaderError(
            `Unsupported file format: ${file.type || file.name}`,
            ErrorCode.UNSUPPORTED_FORMAT,
          );
        }

        const parsedBook: ParsedBook = await parser.parse(file);
        await booksStore.saveBook(parsedBook, parser);

        return { book: parsedBook.book, chapters: parsedBook.chapters };
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load book";
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async openBook(bookId: string): Promise<{ book: Book; chapters: Chapter[] }> {
      validateBookId(bookId);
      this.isLoading = true;
      this.error = null;

      if (this.resourceUrls) {
        this.currentParser?.revokeResourceUrls?.(this.resourceUrls);
        this.resourceUrls = undefined;
      }

      try {
        const book = await booksStore.getBook(bookId);
        if (!book) {
          throw createReaderError("Book not found", ErrorCode.BOOK_NOT_FOUND);
        }

        await loadPluginsFor("book-import");
        const parser = getParserForFormat(book.format);
        if (!parser) {
          throw createReaderError(
            `No parser available for format "${book.format}". The corresponding plugin may be disabled.`,
            ErrorCode.UNSUPPORTED_FORMAT,
          );
        }
        const chaptersData = await booksStore.getChapters(bookId);

        const chapters: Chapter[] = chaptersData.map((ch) => ({
          id: ch.id,
          bookId,
          title: ch.title,
          order: ch.order,
          href: ch.href,
          inToc: ch.inToc,
        }));

        this.currentParser = parser;
        this.chapters = chapters;
        this.resourceUrls = new Map();

        await booksStore.updateLastRead(bookId);
        this.currentChapter = chapters.length > 0 ? chapters[0] : null;

        this.currentBook = book;

        // Load reader plugins then emit so they can react
        await loadPluginsFor("reader");
        void pluginEvents.emit("book:opened", { bookId });

        return { book, chapters };
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to open book";
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

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

    async nextChapter(): Promise<string | null> {
      if (!this.currentChapter || !this.currentBook) return null;

      const currentIndex = this.chapters.findIndex((c) => c.id === this.currentChapter!.id);
      const nextChapter = this.chapters[currentIndex + 1];
      if (nextChapter) return this.goToChapter(nextChapter.id);
      return null;
    },

    async prevChapter(): Promise<string | null> {
      if (!this.currentChapter || !this.currentBook) return null;

      const currentIndex = this.chapters.findIndex((c) => c.id === this.currentChapter!.id);
      const prevChapter = this.chapters[currentIndex - 1];
      if (prevChapter) return this.goToChapter(prevChapter.id);
      return null;
    },

    updateProgress(reading: number, chapter: number): void {
      this.readingProgress = reading;
      this.chapterProgress = chapter;
    },

    async closeBook(): Promise<void> {
      const bookId = this.currentBook?.id;
      const chapterId = this.currentChapter?.id;
      const urls = this.resourceUrls;
      const parser = this.currentParser;

      // Reset UI immediately
      this.currentBook = null;
      this.currentChapter = null;
      this.currentParser = null;
      this.chapters = [];
      this.resourceUrls = undefined;
      this.readingProgress = 0;
      this.chapterProgress = 0;

      // Plugins listen to this event
      if (bookId) {
        void pluginEvents.emit("book:closed", { bookId, chapterId });
      }

      // Background cleanup
      if (urls) {
        parser?.revokeResourceUrls?.(urls);
      }
    },

    reset() {
      if (this.resourceUrls) {
        this.currentParser?.revokeResourceUrls?.(this.resourceUrls);
      }
      this.$reset();
    },

    getCurrentChapter() {
      return this.currentChapter;
    },

    getCurrentBook() {
      return this.currentBook;
    },

    async getCurrentChapterContent(): Promise<{
      html: string;
      resources: HTMLElement[];
    } | null> {
      if (!this.currentBook || !this.currentChapter) return null;

      const content = await booksStore.getChapterContent(
        this.currentBook.id,
        this.currentChapter.id,
      );
      if (!content) return null;

      const { resolveChapterResources } = await import("../reader-engine/resource-resolver");

      if (!this.resourceUrls) this.resourceUrls = new Map();

      return resolveChapterResources(
        content,
        this.currentBook.id,
        this.currentParser!,
        this.resourceUrls,
      );
    },
  },
});
