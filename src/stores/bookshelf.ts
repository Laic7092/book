// Bookshelf Store - Manages library state

import { defineStore } from "pinia";
import type { Book } from "../core/types";
import { dbGetAll, STORES } from "../storage/db";
import { getParserForFormat } from "../plugins/registry";
import { pluginEvents } from "../plugins/context";
import * as booksStore from "../storage/books";
import { assertValidBookFile } from "../utils/validation";

export interface BookshelfState {
  books: Book[];
  isLoading: boolean;
  isUploading: boolean;
  searchQuery: string;
  coverUrls: Map<string, string>;
}

export const useBookshelfStore = defineStore("bookshelf", {
  state: (): BookshelfState => ({
    books: [],
    isLoading: true,
    isUploading: false,
    searchQuery: "",
    coverUrls: new Map(),
  }),

  getters: {
    filteredBooks: (state) => {
      if (!state.searchQuery.trim()) return state.books;
      const query = state.searchQuery.toLowerCase();
      return state.books.filter(
        (book) =>
          book.title.toLowerCase().includes(query) ||
          (book.author && book.author.toLowerCase().includes(query)),
      );
    },
  },

  actions: {
    async loadBooks() {
      this.isLoading = true;
      try {
        this.books = await dbGetAll<Book>(STORES.BOOKS);

        for (const book of this.books) {
          if (book.coverUrl && !this.coverUrls.has(book.id)) {
            const parser = getParserForFormat(book.format);
            const url = await parser?.resolveResourceUrl?.(book.id, book.coverUrl);
            if (url) {
              this.coverUrls.set(book.id, url);
            }
          }
        }
      } finally {
        this.isLoading = false;
      }
    },

    async addBookFromFile(file: File) {
      assertValidBookFile(file);
      this.isUploading = true;
      try {
        const { useReaderStore } = await import("./reader");
        const readerStore = useReaderStore();
        const result = await readerStore.loadBook(file);
        await this.loadBooks();
        return result;
      } finally {
        this.isUploading = false;
      }
    },

    async deleteBook(bookId: string) {
      const { useReaderStore } = await import("./reader");
      const readerStore = useReaderStore();
      if (readerStore.currentBook?.id === bookId) {
        await readerStore.closeBook();
      }
      await booksStore.deleteBook(bookId);
      void pluginEvents.emit("book:deleted", { bookId });

      const coverUrl = this.coverUrls.get(bookId);
      if (coverUrl) {
        URL.revokeObjectURL(coverUrl);
        this.coverUrls.delete(bookId);
      }
      this.books = this.books.filter((b) => b.id !== bookId);
    },

    setSearchQuery(query: string) {
      this.searchQuery = query;
    },
  },
});
