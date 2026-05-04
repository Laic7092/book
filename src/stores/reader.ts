// Reader Store - Manages book reading state and operations

import { defineStore } from "pinia";
import type { Book, Chapter, ParsedBook, BookParser } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { getParsers, getParserForFormat } from "../plugins/registry";
import { pluginEvents } from "../plugins/context";
import * as booksStore from "../storage/books";
import { assertValidBookFile, validateBookId } from "../utils/validation";

function getParserForFile(file: File): BookParser | null {
  const parsers = getParsers();

  for (const parser of parsers) {
    if (parser.supportsFormat(file.type)) return parser;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  for (const parser of parsers) {
    if (
      parser.supportsFormat(
        ext === "txt" ? "text/plain" : ext === "epub" ? "application/epub+zip" : "",
      )
    ) {
      return parser;
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

        const parser = getParserForFormat(book.format);
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

        // Plugins listen to this event (stats, bookmarks, annotations)
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

      const content = await booksStore.getChapterContent(
        this.currentBook.id,
        chapterId,
        this.currentParser ?? undefined,
      );

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
        this.currentParser ?? undefined,
      );
      if (!content) return null;

      const doc = new DOMParser().parseFromString(content, "text/html");

      // Collect resource paths and resolve via parser
      const resourcePaths = collectResourcePaths(doc);
      if (resourcePaths.length > 0 && this.currentParser?.resolveResourceUrl) {
        if (!this.resourceUrls) this.resourceUrls = new Map();
        await resolveMissingResources(
          this.currentBook.id,
          resourcePaths,
          this.resourceUrls,
          this.currentParser,
        );
      }

      if (this.resourceUrls && this.resourceUrls.size > 0) {
        const { rewriteResourcePaths } = await import("../utils/resource-urls");
        const rewrittenDoc = rewriteResourcePaths(content, this.resourceUrls);

        const resources: HTMLElement[] = [];
        const headElements = Array.from(rewrittenDoc.head.children);
        for (const element of headElements) {
          resources.push(element.cloneNode(true) as HTMLElement);
        }

        return { html: rewrittenDoc.body.innerHTML, resources };
      }

      return { html: doc.body.innerHTML, resources: [] };
    },
  },
});

// ── Resource resolution helpers ──

const CSS_URL_PATTERN = /url\(['"]?([^'")\s]+)['"]?\)/gi;

function collectResourcePaths(doc: Document): string[] {
  const paths = new Set<string>();

  doc.querySelectorAll("img[src]").forEach((el) => {
    const src = el.getAttribute("src");
    if (src) paths.add(src);
  });

  doc.querySelectorAll("image").forEach((el) => {
    const href = el.getAttribute("xlink:href");
    if (href) paths.add(href);
  });

  doc.querySelectorAll("link[rel='stylesheet'][href]").forEach((el) => {
    const href = el.getAttribute("href");
    if (href) paths.add(href);
  });

  doc.querySelectorAll("*[style]").forEach((el) => {
    const style = el.getAttribute("style");
    if (style) {
      for (const [, url] of style.matchAll(CSS_URL_PATTERN)) {
        paths.add(url);
      }
    }
  });

  doc.querySelectorAll("style").forEach((el) => {
    const css = el.textContent;
    if (css) {
      for (const [, url] of css.matchAll(CSS_URL_PATTERN)) {
        paths.add(url);
      }
    }
  });

  return Array.from(paths);
}

async function resolveMissingResources(
  bookId: string,
  paths: string[],
  resourceUrls: Map<string, string>,
  parser: BookParser,
): Promise<void> {
  const missingPaths = paths.filter((p) => !resourceUrls.has(p));
  if (missingPaths.length === 0) return;

  const results = await Promise.all(
    missingPaths.map(async (path) => ({
      path,
      url: await parser.resolveResourceUrl?.(bookId, path),
    })),
  );

  for (const { path, url } of results) {
    if (url) resourceUrls.set(path, url);
  }
}
