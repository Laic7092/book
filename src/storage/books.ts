// Books storage module

import type { Book, ParsedBook } from "../core/types";
import { STORES, dbPut, dbGet, dbGetAll, dbTransaction } from "./db";

/**
 * Save a parsed book to the database
 */
export async function saveBook(parsedBook: ParsedBook): Promise<void> {
  await dbTransaction([STORES.BOOKS, STORES.CHAPTERS], "readwrite", async (stores) => {
    const booksStore = stores.get(STORES.BOOKS)!;
    const chaptersStore = stores.get(STORES.CHAPTERS)!;

    // Save book metadata
    booksStore.put(parsedBook.book);

    // Save chapter contents and titles
    for (const chapter of parsedBook.chapters) {
      const content = parsedBook.content.get(chapter.id) || "";
      chaptersStore.put({
        bookId: parsedBook.book.id,
        chapterId: chapter.id,
        title: chapter.title,
        content,
      });
    }
  });
}

/**
 * Get a book by ID
 */
export async function getBook(bookId: string): Promise<Book | undefined> {
  return dbGet<Book>(STORES.BOOKS, bookId);
}

/**
 * Get all books, sorted by last read date
 */
export async function getAllBooks(): Promise<Book[]> {
  const books = await dbGetAll<Book>(STORES.BOOKS);
  return books.sort((a, b) => {
    const aTime = a.lastReadAt || a.addedAt;
    const bTime = b.lastReadAt || b.addedAt;
    return bTime - aTime;
  });
}

/**
 * Delete a book and all its associated data
 */
export async function deleteBook(bookId: string): Promise<void> {
  await dbTransaction(
    [STORES.BOOKS, STORES.CHAPTERS, STORES.PROGRESS, STORES.BOOKMARKS],
    "readwrite",
    async (stores) => {
      // Delete book metadata
      stores.get(STORES.BOOKS)!.delete(bookId);

      // Delete all chapters for this book
      const chaptersStore = stores.get(STORES.CHAPTERS)!;
      const chaptersIndex = chaptersStore.index("bookId");

      await new Promise<void>((resolve, reject) => {
        const request = chaptersIndex.getAllKeys(IDBKeyRange.only(bookId));
        request.onsuccess = () => {
          const keys = request.result as Array<[string, string]>;
          keys.forEach((key) => chaptersStore.delete(key));
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      // Delete progress
      stores.get(STORES.PROGRESS)!.delete(bookId);

      // Delete bookmarks for this book
      const bookmarksStore = stores.get(STORES.BOOKMARKS)!;
      const bookmarksIndex = bookmarksStore.index("bookId");

      await new Promise<void>((resolve, reject) => {
        const request = bookmarksIndex.getAllKeys(IDBKeyRange.only(bookId));
        request.onsuccess = () => {
          const keys = request.result as string[];
          keys.forEach((key) => bookmarksStore.delete(key));
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    },
  );
}

/**
 * Update book's last read timestamp
 */
export async function updateLastRead(bookId: string): Promise<void> {
  const book = await getBook(bookId);
  if (book) {
    book.lastReadAt = Date.now();
    await dbPut(STORES.BOOKS, book);
  }
}

/**
 * Get chapter content
 */
export async function getChapterContent(
  bookId: string,
  chapterId: string,
): Promise<string | undefined> {
  const chapter = await dbGet<{ content: string }>(STORES.CHAPTERS, [bookId, chapterId]);
  return chapter?.content;
}

/**
 * Get all chapter IDs for a book
 */
export async function getChapterIds(bookId: string): Promise<string[]> {
  const db = await import("./db");
  const chaptersStore = await db.openDB();
  const tx = chaptersStore.transaction(STORES.CHAPTERS, "readonly");
  const store = tx.objectStore(STORES.CHAPTERS);
  const index = store.index("bookId");

  return new Promise((resolve, reject) => {
    const request = index.getAllKeys(IDBKeyRange.only(bookId));
    request.onsuccess = () => {
      const keys = request.result as Array<[string, string]>;
      resolve(keys.map(([_, chapterId]) => chapterId));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all chapters for a book with their titles
 */
export async function getChapters(
  bookId: string,
): Promise<Array<{ id: string; title: string; order: number }>> {
  console.log("[getChapters] Fetching chapters for book:", bookId);
  const db = await import("./db");
  const chaptersStore = await db.openDB();
  const tx = chaptersStore.transaction(STORES.CHAPTERS, "readonly");
  const store = tx.objectStore(STORES.CHAPTERS);
  const index = store.index("bookId");

  return new Promise((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.only(bookId));
    request.onsuccess = () => {
      const results = request.result as Array<{ bookId: string; chapterId: string; title: string }>;
      console.log("[getChapters] Raw results from DB:", results);
      // Sort by key to maintain consistent order
      results.sort((a, b) => {
        const keyA = JSON.stringify([a.bookId, a.chapterId]);
        const keyB = JSON.stringify([b.bookId, b.chapterId]);
        return keyA.localeCompare(keyB);
      });
      const mapped = results.map((ch, index) => ({
        id: ch.chapterId,
        title: ch.title || `Chapter ${index + 1}`,
        order: index,
      }));
      console.log("[getChapters] Mapped chapters:", mapped);
      resolve(mapped);
    };
    request.onerror = () => reject(request.error);
  });
}
