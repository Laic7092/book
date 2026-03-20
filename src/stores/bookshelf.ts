// Bookshelf Store - Manages library state

import { defineStore } from "pinia";
import type { Book } from "../core/types";
import { readerCore } from "../core/reader";
import { dbGetAll, STORES } from "../storage/db";

export interface BookshelfState {
  books: Book[];
  isLoading: boolean;
  isUploading: boolean;
  searchQuery: string;
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

    booksCount: (state) => {
      return state.books.length;
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
        this.summaryStats = await readerCore.getSummaryStats();
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * Add a book from file upload
     */
    async addBookFromFile(file: File) {
      this.isUploading = true;
      try {
        const result = await readerCore.loadBook(file);
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
      await readerCore.deleteBook(bookId);
      this.books = this.books.filter((b) => b.id !== bookId);
      this.summaryStats = await readerCore.getSummaryStats();
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
      this.summaryStats = await readerCore.getSummaryStats();
    },
  },
});
