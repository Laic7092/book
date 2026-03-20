// Reader Store - Manages book reading state and operations

import { defineStore } from "pinia";
import type { Book, Chapter, Bookmark, ReaderSettings } from "../core/types";
import { readerCore } from "../core/reader";

export interface ReaderState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];
  isLoading: boolean;
  error: string | null;
  resourceUrls: Map<string, string> | undefined;
  readingProgress: number;
  chapterProgress: number;
  bookmarks: Bookmark[];
  settings: ReaderSettings;
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
    bookmarks: [],
    settings: {
      fontSize: 18,
      fontFamily: "Literata, Georgia, serif",
      lineHeight: 1.6,
      theme: "light",
      margin: 24,
      columnWidth: 720,
      letterSpacing: 0,
      paragraphSpacing: 1.2,
      textAlign: "left",
      contrast: "normal",
      scrollMode: "vertical",
      paginationAnimation: "slide",
    },
  }),

  getters: {
    isBookOpen: (state) => {
      return state.currentBook !== null;
    },
  },

  actions: {
    /**
     * Load a book from file
     */
    async loadBook(file: File) {
      this.isLoading = true;
      this.error = null;

      try {
        const result = await readerCore.loadBook(file);
        this.currentBook = result.book;
        this.chapters = result.chapters;
        this.bookmarks = await readerCore.getBookmarks();
        return result;
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
    async openBook(bookId: string) {
      this.isLoading = true;
      this.error = null;

      try {
        const result = await readerCore.openBook(bookId);
        this.currentBook = result.book;
        this.chapters = result.chapters;
        // Sync currentChapter from readerCore state
        this.currentChapter = readerCore.getState().currentChapter;
        this.bookmarks = await readerCore.getBookmarks();

        // Load settings
        const settings = await readerCore.getSettings();
        this.settings = { ...this.settings, ...settings };

        return result;
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
    async goToChapter(chapterId: string) {
      const content = await readerCore.goToChapter(chapterId);
      const chapter = this.chapters.find((c) => c.id === chapterId);
      if (chapter) {
        this.currentChapter = chapter;
      }
      this.chapterProgress = 0;
      this.readingProgress = 0;
      return content;
    },

    /**
     * Go to next chapter
     */
    async nextChapter() {
      const currentIndex = this.chapters.findIndex((c) => c.id === this.currentChapter?.id);
      if (currentIndex < this.chapters.length - 1) {
        const nextChapter = this.chapters[currentIndex + 1];
        if (nextChapter) {
          return this.goToChapter(nextChapter.id);
        }
      }
      return null;
    },

    /**
     * Go to previous chapter
     */
    async prevChapter() {
      const currentIndex = this.chapters.findIndex((c) => c.id === this.currentChapter?.id);
      if (currentIndex > 0) {
        const prevChapter = this.chapters[currentIndex - 1];
        if (prevChapter) {
          return this.goToChapter(prevChapter.id);
        }
      }
      return null;
    },

    /**
     * Update reading progress
     */
    updateProgress(progress: number) {
      this.readingProgress = progress;
      this.chapterProgress = progress;
    },

    /**
     * Add a bookmark
     */
    async addBookmark(
      title: string,
      contentPreview: string,
      position: number,
      color?: string,
      note?: string,
    ) {
      const bookmark = await readerCore.addBookmark(title, contentPreview, position, color, note);
      this.bookmarks.push(bookmark);
      return bookmark;
    },

    /**
     * Remove a bookmark
     */
    async removeBookmark(bookmarkId: string) {
      await readerCore.removeBookmark(bookmarkId);
      this.bookmarks = this.bookmarks.filter((b) => b.id !== bookmarkId);
    },

    /**
     * Update a bookmark
     */
    async updateBookmark(bookmarkId: string, updates: Partial<Bookmark>) {
      await readerCore.updateBookmark(bookmarkId, updates);
      const index = this.bookmarks.findIndex((b) => b.id === bookmarkId);
      if (index !== -1) {
        this.bookmarks[index] = { ...this.bookmarks[index], ...updates };
      }
    },

    /**
     * Update settings
     */
    async updateSettings(updates: Partial<ReaderSettings>) {
      const newSettings = await readerCore.updateSettings(updates);
      this.settings = newSettings;
      return newSettings;
    },

    /**
     * Close current book
     */
    async closeBook() {
      await readerCore.closeBook();
      this.currentBook = null;
      this.currentChapter = null;
      this.chapters = [];
      this.resourceUrls = undefined;
      this.bookmarks = [];
      this.readingProgress = 0;
      this.chapterProgress = 0;
    },

    /**
     * Reset store to initial state
     */
    reset() {
      this.$reset();
    },

    /**
     * Get reading stats for a book
     */
    async getReadingStats(bookId: string) {
      return await readerCore.getReadingStats(bookId);
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
     */
    async getCurrentChapterContent() {
      return await readerCore.getCurrentChapterContent();
    },

    /**
     * Get library books
     */
    async getLibrary() {
      return await readerCore.getLibrary();
    },
  },
});
