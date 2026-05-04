// Bookmarks Store - Manages bookmark state and operations

import { defineStore } from "pinia";
import type { Bookmark } from "../../core/types";
import * as bookmarksStore from "./storage";

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
      await bookmarksStore.updateBookmark({ id: bookmarkId, ...updates });
      const updated = await bookmarksStore.getBookmark(bookmarkId);
      const index = this.bookmarks.findIndex((b) => b.id === bookmarkId);
      if (index !== -1 && updated) {
        this.bookmarks[index] = updated;
      }
    },

    clearBookmarks(): void {
      this.currentBookId = null;
      this.bookmarks = [];
    },

    // Auto-save reading progress as a special bookmark (id = __progress__${bookId})
    async saveProgress(
      bookId: string,
      chapterId: string,
      cfi: string,
      progressData: { chapterProgress: number; readingProgress: number; pageIndex: number },
    ): Promise<void> {
      const id = `__progress__${bookId}`;
      const existing = await bookmarksStore.getBookmark(id);

      if (existing) {
        await bookmarksStore.updateBookmark({
          id,
          chapterId,
          cfi,
          note: JSON.stringify(progressData),
        });
      } else {
        const bookmark = bookmarksStore.createBookmark(
          bookId,
          chapterId,
          cfi,
          "",
          "",
          undefined,
          JSON.stringify(progressData),
        );
        bookmark.id = id;
        await bookmarksStore.addBookmark(bookmark);
      }
    },

    async loadProgress(bookId: string): Promise<{
      chapterId: string;
      cfi: string;
      chapterProgress: number;
      readingProgress: number;
      pageIndex: number;
    } | null> {
      const id = `__progress__${bookId}`;
      const bookmark = await bookmarksStore.getBookmark(id);
      if (!bookmark?.note) return null;

      try {
        const data = JSON.parse(bookmark.note);
        return {
          chapterId: bookmark.chapterId,
          cfi: bookmark.cfi,
          chapterProgress: data.chapterProgress || 0,
          readingProgress: data.readingProgress || 0,
          pageIndex: data.pageIndex || 0,
        };
      } catch {
        return null;
      }
    },
  },
});
