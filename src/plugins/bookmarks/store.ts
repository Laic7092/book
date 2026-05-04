import { defineStore } from "pinia";
import type { Bookmark } from "../../core/types";
import { ErrorCode, createReaderError } from "../../core/errors";
import { compareCfi, LEGACY_FALLBACK_CFI } from "../../utils/epub-cfi";
import type { PluginStorageAdapter } from "../types";

let adapter: PluginStorageAdapter | null = null;

export function setBookmarksAdapter(a: PluginStorageAdapter) {
  adapter = a;
}

function useAdapter() {
  return adapter!;
}

interface LegacyBookmark {
  id: string;
  bookId: string;
  chapterId: string;
  title: string;
  contentPreview: string;
  position: number;
  createdAt: number;
  color?: string;
  note?: string;
}

function isLegacyBookmark(bm: LegacyBookmark | Bookmark): bm is LegacyBookmark {
  return typeof (bm as LegacyBookmark).position === "number" && !(bm as Bookmark).cfi;
}

function createBookmark(
  bookId: string,
  chapterId: string,
  cfi: string,
  title: string,
  contentPreview: string,
  color?: string,
  note?: string,
): Bookmark {
  return {
    id: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    bookId,
    chapterId,
    cfi,
    title,
    contentPreview,
    createdAt: Date.now(),
    color,
    note,
  };
}

export interface BookmarksState {
  currentBookId: string | null;
  bookmarks: Bookmark[];
}

export const useBookmarksStore = defineStore("bookmarks", {
  state: (): BookmarksState => ({
    currentBookId: null,
    bookmarks: [],
  }),

  actions: {
    async loadBookmarks(bookId: string): Promise<Bookmark[]> {
      this.currentBookId = bookId;
      const a = useAdapter();
      const all = await a.getAll<Bookmark | LegacyBookmark>();

      const migrated: Bookmark[] = [];
      for (const bm of all) {
        if (bm.bookId !== bookId) continue;
        if (isLegacyBookmark(bm)) {
          const { position: _, ...rest } = bm;
          const updated = { ...rest, cfi: LEGACY_FALLBACK_CFI };
          await a.put(updated.id, updated, updated.createdAt);
          migrated.push(updated);
        } else {
          migrated.push(bm);
        }
      }

      this.bookmarks = migrated.sort((a, b) => {
        if (a.cfi !== b.cfi) return compareCfi(a.cfi, b.cfi);
        return b.createdAt - a.createdAt;
      });
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
      const bookmark = createBookmark(bookId, chapterId, cfi, title, contentPreview, color, note);
      await useAdapter().put(bookmark.id, bookmark, bookmark.createdAt);
      if (this.currentBookId === bookId) {
        this.bookmarks.push(bookmark);
      }
      return bookmark;
    },

    async removeBookmark(bookmarkId: string): Promise<void> {
      await useAdapter().delete(bookmarkId);
      this.bookmarks = this.bookmarks.filter((b) => b.id !== bookmarkId);
    },

    async updateBookmark(bookmarkId: string, updates: Partial<Bookmark>): Promise<void> {
      const a = useAdapter();
      const existing = await a.get<Bookmark>(bookmarkId);
      if (!existing) {
        throw createReaderError(`Bookmark ${bookmarkId} not found`, ErrorCode.BOOKMARK_NOT_FOUND);
      }
      await a.put(bookmarkId, { ...existing, ...updates });
      const updated = await a.get<Bookmark>(bookmarkId);
      const index = this.bookmarks.findIndex((b) => b.id === bookmarkId);
      if (index !== -1 && updated) {
        this.bookmarks[index] = updated;
      }
    },

    clearBookmarks(): void {
      this.currentBookId = null;
      this.bookmarks = [];
    },

    async saveProgress(
      bookId: string,
      chapterId: string,
      cfi: string,
      progressData: {
        chapterProgress: number;
        readingProgress: number;
        pageIndex: number;
      },
    ): Promise<void> {
      const id = `__progress__${bookId}`;
      const a = useAdapter();
      const existing = await a.get<Bookmark>(id);
      if (existing) {
        await a.put(id, {
          ...existing,
          chapterId,
          cfi,
          note: JSON.stringify(progressData),
        });
      } else {
        const bookmark = createBookmark(
          bookId,
          chapterId,
          cfi,
          "",
          "",
          undefined,
          JSON.stringify(progressData),
        );
        bookmark.id = id;
        await a.put(bookmark.id, bookmark);
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
      const bookmark = await useAdapter().get<Bookmark & { note?: string }>(id);
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
