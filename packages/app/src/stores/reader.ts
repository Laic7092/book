import { defineStore } from "pinia";
import type { Book, Chapter } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { loadPluginsFor } from "../plugins/loader";
import { getParserForFormat, loadParserForFormat } from "@book/parser-core";
import * as booksStore from "../storage/books";
import { parseAndSaveBook } from "../storage/parse-save";
import { pluginEvents } from "../plugins/context";
import { validateBookId } from "../utils/validation";

const REFLOWABLE_FORMATS = new Set(["epub", "txt", "fb2", "html", "docx", "mobi", "azw3", "azw"]);

export interface ReaderState {
  currentBook: Book | null;
}

export const useReaderStore = defineStore("reader", {
  state: (): ReaderState => ({
    currentBook: null,
  }),

  actions: {
    async loadBook(file: File): Promise<{ book: Book; chapters: Chapter[] }> {
      try {
        return await parseAndSaveBook(file);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Unsupported file format")) {
          throw createReaderError(e.message, ErrorCode.UNSUPPORTED_FORMAT);
        }
        throw e;
      }
    },

    async openBook(bookId: string): Promise<{ book: Book; chapters: Chapter[] }> {
      validateBookId(bookId);

      const book = await booksStore.getBook(bookId);
      if (!book) {
        throw createReaderError("Book not found", ErrorCode.BOOK_NOT_FOUND);
      }

      if (REFLOWABLE_FORMATS.has(book.format)) {
        await loadPluginsFor("reader");
      }
      await loadParserForFormat(book.format);

      const parser = getParserForFormat(book.format);
      if (!parser) {
        throw createReaderError(
          `No parser available for format "${book.format}".`,
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

      this.currentBook = book;

      await booksStore.updateLastRead(bookId);
      void pluginEvents.emit("book:opened", { bookId });

      return { book, chapters };
    },

    async closeBook(): Promise<void> {
      const bookId = this.currentBook?.id;

      this.currentBook = null;

      if (bookId) {
        void pluginEvents.emit("book:closed", { bookId });
      }
    },
  },
});
