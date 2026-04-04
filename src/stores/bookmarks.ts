// Bookmarks Store - Manages bookmark state and operations

import { defineStore } from "pinia";
import type { Bookmark } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import * as bookmarksStore from "../storage/bookmarks";

export interface BookmarksState {
  currentBookId: string | null;
  bookmarks: Bookmark[];
}

export const useBookmarksStore = defineStore("bookmarks", {
  state: (): BookmarksState => ({
    currentBookId: null,
    bookmarks: [],
  }),

  getters: {},

  actions: {
    async loadBookmarks(bookId: string): Promise<Bookmark[]> {
      this.currentBookId = bookId;
      this.bookmarks = await bookmarksStore.getBookmarks(bookId);
      return this.bookmarks;
    },

    async addBookmark(
      bookId: string,
      chapterId: string,
      cfi: string,
      title: string,
      contentPreview: string,
      color?: string,
      note?: string,
    ): Promise<Bookmark> {
      const bookmark = bookmarksStore.createBookmark(
        bookId,
        chapterId,
        cfi,
        title,
        contentPreview,
        color,
        note,
      );

      await bookmarksStore.addBookmark(bookmark);

      if (this.currentBookId === bookId) {
        this.bookmarks.push(bookmark);
      }

      return bookmark;
    },

    async removeBookmark(bookmarkId: string): Promise<void> {
      await bookmarksStore.deleteBookmark(bookmarkId);
      this.bookmarks = this.bookmarks.filter((b) => b.id !== bookmarkId);
    },

    async updateBookmark(bookmarkId: string, updates: Partial<Bookmark>): Promise<void> {
      const bookmark = await bookmarksStore.getBookmark(bookmarkId);
      if (!bookmark) {
        throw createReaderError("Bookmark not found", ErrorCode.BOOKMARK_NOT_FOUND);
      }

      const updated = { ...bookmark, ...updates };
      await bookmarksStore.updateBookmark(updated);

      const index = this.bookmarks.findIndex((b) => b.id === bookmarkId);
      if (index !== -1) {
        this.bookmarks[index] = updated;
      }
    },

    clearBookmarks(): void {
      this.currentBookId = null;
      this.bookmarks = [];
    },
  },
});
