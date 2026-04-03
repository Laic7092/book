// Bookmarks storage module

import type { Bookmark } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
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
    cfi: `epubcfi(/6/1/2)`,
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
      return compareCfiStrings(a.cfi, b.cfi);
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

function compareCfiStrings(a: string, b: string): number {
  const parseCfi = (cfi: string) => {
    if (!cfi.startsWith("epubcfi(") || !cfi.endsWith(")")) return { spineIndex: 0, path: [] };
    const inner = cfi.slice(8, -1);
    const steps = inner.split("/").filter(Boolean);
    const spineIndex = parseInt(steps[1] || "0", 10) - 1;
    const path: number[] = [];
    for (let i = 2; i < steps.length; i++) {
      const match = steps[i].match(/^(\d+)/);
      if (match) path.push(parseInt(match[1], 10));
    }
    return { spineIndex, path };
  };

  const parsedA = parseCfi(a);
  const parsedB = parseCfi(b);

  if (parsedA.spineIndex !== parsedB.spineIndex) {
    return parsedA.spineIndex - parsedB.spineIndex;
  }

  const maxLen = Math.max(parsedA.path.length, parsedB.path.length);
  for (let i = 0; i < maxLen; i++) {
    const stepA = parsedA.path[i] ?? 0;
    const stepB = parsedB.path[i] ?? 0;
    if (stepA !== stepB) return stepA - stepB;
  }

  return 0;
}
