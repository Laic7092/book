// Bookmarks storage module

import type { Bookmark } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { compareCfi, LEGACY_FALLBACK_CFI } from "../utils/epub-cfi";
import { STORES, dbPut, dbGet, dbGetAll, dbDelete, dbGetAllFromIndex } from "./db";

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

function migrateLegacyBookmark(bm: LegacyBookmark): Bookmark {
  const { position: _position, ...rest } = bm;
  return {
    ...rest,
    cfi: LEGACY_FALLBACK_CFI,
  };
}

export async function addBookmark(bookmark: Bookmark): Promise<void> {
  await dbPut(STORES.BOOKMARKS, bookmark);
}

export async function getBookmark(bookmarkId: string): Promise<Bookmark | undefined> {
  return dbGet<Bookmark>(STORES.BOOKMARKS, bookmarkId);
}

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const rawBookmarks = await dbGetAllFromIndex<LegacyBookmark | Bookmark>(
    STORES.BOOKMARKS,
    "bookId",
    bookId,
  );
  const migrated: Bookmark[] = [];

  for (const bm of rawBookmarks) {
    if (isLegacyBookmark(bm)) {
      const updated = migrateLegacyBookmark(bm);
      await dbPut(STORES.BOOKMARKS, updated);
      migrated.push(updated);
    } else {
      migrated.push(bm);
    }
  }

  return migrated.sort((a, b) => {
    if (a.cfi !== b.cfi) {
      return compareCfi(a.cfi, b.cfi);
    }
    return b.createdAt - a.createdAt;
  });
}

export async function getAllBookmarks(): Promise<Bookmark[]> {
  const bookmarks = await dbGetAll<Bookmark>(STORES.BOOKMARKS);
  return bookmarks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateBookmark(bookmark: Partial<Bookmark> & { id: string }): Promise<void> {
  const existing = await getBookmark(bookmark.id);
  if (!existing) {
    throw createReaderError(`Bookmark ${bookmark.id} not found`, ErrorCode.BOOKMARK_NOT_FOUND);
  }

  await dbPut(STORES.BOOKMARKS, { ...existing, ...bookmark });
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await dbDelete(STORES.BOOKMARKS, bookmarkId);
}

export function createBookmark(
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
