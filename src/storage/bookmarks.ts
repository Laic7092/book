// Bookmarks storage module

import type { Bookmark } from "../core/types";
import { STORES, dbPut, dbGet, dbGetAll, dbDelete, dbGetAllFromIndex } from "./db";

/**
 * Add a new bookmark
 */
export async function addBookmark(bookmark: Bookmark): Promise<void> {
  await dbPut(STORES.BOOKMARKS, bookmark);
}

/**
 * Get a bookmark by ID
 */
export async function getBookmark(bookmarkId: string): Promise<Bookmark | undefined> {
  return dbGet<Bookmark>(STORES.BOOKMARKS, bookmarkId);
}

/**
 * Get all bookmarks for a book
 */
export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const bookmarks = await dbGetAllFromIndex<Bookmark>(STORES.BOOKMARKS, "bookId", bookId);
  return bookmarks.sort((a, b) => {
    // Sort by position within the book
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return b.createdAt - a.createdAt;
  });
}

/**
 * Get all bookmarks across all books
 */
export async function getAllBookmarks(): Promise<Bookmark[]> {
  const bookmarks = await dbGetAll<Bookmark>(STORES.BOOKMARKS);
  return bookmarks.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Update a bookmark
 */
export async function updateBookmark(bookmark: Partial<Bookmark> & { id: string }): Promise<void> {
  const existing = await getBookmark(bookmark.id);
  if (!existing) {
    throw new Error(`Bookmark ${bookmark.id} not found`);
  }

  await dbPut(STORES.BOOKMARKS, { ...existing, ...bookmark });
}

/**
 * Delete a bookmark
 */
export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await dbDelete(STORES.BOOKMARKS, bookmarkId);
}

/**
 * Create a bookmark object
 */
export function createBookmark(
  bookId: string,
  chapterId: string,
  title: string,
  contentPreview: string,
  position: number,
  color?: string,
  note?: string,
): Bookmark {
  return {
    id: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    bookId,
    chapterId,
    title,
    contentPreview,
    position,
    createdAt: Date.now(),
    color,
    note,
  };
}
