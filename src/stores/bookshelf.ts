// Bookshelf Store - Manages library state

import { defineStore } from "pinia";
import type { Book } from "../core/types";
import { dbGetAll, STORES } from "../storage/db";
import * as booksStore from "../storage/books";
import * as statsStore from "../storage/stats";
import { getResourceUrl } from "../storage/resources";
import { assertValidBookFile } from "../utils/validation";

export interface BookshelfState {
  books: Book[];
  isLoading: boolean;
  isUploading: boolean;
  searchQuery: string;
  coverUrls: Map<string, string>;
  summaryStats: {
    totalBooks: number;
    totalReadingTime: number;
    totalSessions: number;
    booksInProgress: number;
    completedBooks: number;
    thisWeekReadingTime: number;
  } | null;
}

export const useBookshelfStore = defineStore("bookshelf", {
  state: (): BookshelfState => ({
    books: [],
    isLoading: true,
    isUploading: false,
    searchQuery: "",
    coverUrls: new Map(),
    summaryStats: null,
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
    /**
     * Load all books from library
     */
    async loadBooks() {
      this.isLoading = true;
      try {
        this.books = await dbGetAll<Book>(STORES.BOOKS);
        this.summaryStats = await statsStore.getSummaryStats();

        // Resolve cover blob URLs for EPUB books that have a cover
        for (const book of this.books) {
          if (book.coverUrl && !this.coverUrls.has(book.id)) {
            const url = await getResourceUrl(book.id, book.coverUrl);
            if (url) {
              this.coverUrls.set(book.id, url);
            }
          }
        }
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * Add a book from file upload
     */
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

    /**
     * Delete a book
     */
    async deleteBook(bookId: string) {
      const { useReaderStore } = await import("./reader");
      const readerStore = useReaderStore();
      if (readerStore.currentBook?.id === bookId) {
        await readerStore.closeBook();
      }
      await booksStore.deleteBook(bookId);
      await statsStore.deleteStats(bookId);
      const coverUrl = this.coverUrls.get(bookId);
      if (coverUrl) {
        URL.revokeObjectURL(coverUrl);
        this.coverUrls.delete(bookId);
      }
      this.books = this.books.filter((b) => b.id !== bookId);
      this.summaryStats = await statsStore.getSummaryStats();
    },

    /**
     * Update search query
     */
    setSearchQuery(query: string) {
      this.searchQuery = query;
    },

    /**
     * Refresh summary statistics
     */
    async refreshStats() {
      this.summaryStats = await statsStore.getSummaryStats();
    },
  },
});
