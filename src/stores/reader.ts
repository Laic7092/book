// Reader Store - Manages book reading state and operations

import { defineStore } from "pinia";
import type { Book, Chapter, ParsedBook, BookParser } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { getParsers, getParserForFormat } from "../plugins/manager/registry";
import { loadPluginsFor, loadParserForFormat } from "../plugins/loader";
import { pluginEvents } from "../plugins/context";
import * as booksStore from "../storage/books";
import { setCurrentParser } from "../core/reader-context";
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
}

export const useReaderStore = defineStore("reader", {
  state: (): ReaderState => ({
    currentBook: null,
    currentChapter: null,
    currentParser: null,
    chapters: [],
  }),

  actions: {
    async loadBook(file: File): Promise<{ book: Book; chapters: Chapter[] }> {
      assertValidBookFile(file);

      const ext = file.name.split(".").pop()?.toLowerCase();
      const format = ext && ext in EXTENSION_MIME_MAP ? ext : null;
      if (format) {
        await loadParserForFormat(format);
      }
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
    },

    async openBook(bookId: string): Promise<{ book: Book; chapters: Chapter[] }> {
      validateBookId(bookId);

      const book = await booksStore.getBook(bookId);
      if (!book) {
        throw createReaderError("Book not found", ErrorCode.BOOK_NOT_FOUND);
      }

      await loadPluginsFor("reader");
      await loadParserForFormat(book.format);

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
      setCurrentParser(parser);
      this.chapters = chapters;

      await booksStore.updateLastRead(bookId);
      this.currentChapter = chapters.length > 0 ? chapters[0] : null;

      this.currentBook = book;

      void pluginEvents.emit("book:opened", { bookId });

      return { book, chapters };
    },

    async closeBook(): Promise<void> {
      const bookId = this.currentBook?.id;
      const chapterId = this.currentChapter?.id;

      this.currentBook = null;
      this.currentChapter = null;
      this.currentParser = null;
      setCurrentParser(null);
      this.chapters = [];

      if (bookId) {
        void pluginEvents.emit("book:closed", { bookId, chapterId });
      }
    },

    reset() {
      setCurrentParser(null);
      this.$reset();
    },
  },
});
