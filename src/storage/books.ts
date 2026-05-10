// Books storage module

import type { Book, ParsedBook } from "../core/types";
import { STORES, dbPut, dbGet, dbGetAll, dbTransaction } from "./db";
import type { BookParser } from "../core/types";
import { getParserForFormat } from "../plugins/registry";
import { saveCoverBlob } from "./covers";

/** In-flight dedup: prevents concurrent extraction of the same chapter */
const extractionInProgress = new Map<string, Promise<string>>();

/**
 * Save a parsed book to the database
 */
export async function saveBook(parsedBook: ParsedBook, parser: BookParser): Promise<void> {
  const storeNames = parsedBook.resources?.size
    ? [STORES.BOOKS, STORES.CHAPTERS, STORES.RESOURCES]
    : [STORES.BOOKS, STORES.CHAPTERS];

  await dbTransaction(storeNames, "readwrite", async (stores) => {
    const booksStore = stores.get(STORES.BOOKS)!;
    const chaptersStore = stores.get(STORES.CHAPTERS)!;

    booksStore.put(parsedBook.book);

    for (const chapter of parsedBook.chapters) {
      const content = parsedBook.content.get(chapter.id) || "";
      chaptersStore.put({
        bookId: parsedBook.book.id,
        chapterId: chapter.id,
        title: chapter.title,
        content,
        order: chapter.order,
        href: chapter.href,
        inToc: chapter.inToc,
      });
    }
  });

  // Format-specific resource storage
  if (parsedBook.resources && parsedBook.resources.size > 0) {
    await parser.saveResources?.(parsedBook.book.id, parsedBook.resources);
  }

  // Format-specific raw data storage (for lazy extraction)
  if (parsedBook.rawData) {
    await parser.saveRawData?.(parsedBook.book.id, parsedBook.rawData, parsedBook.book.fileSize);
  }

  // Cache cover image so bookshelf can display it without the parser
  if (parsedBook.book.coverUrl && parser.resolveResourceUrl) {
    try {
      const url = await parser.resolveResourceUrl(parsedBook.book.id, parsedBook.book.coverUrl);
      if (url) {
        const res = await fetch(url);
        const blob = await res.blob();
        await saveCoverBlob(parsedBook.book.id, blob);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Non-critical: bookshelf will fall back to gradient cover
    }
  }
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
    [STORES.BOOKS, STORES.CHAPTERS, STORES.RESOURCES, STORES.ZIPS],
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

      // Delete resources for this book
      const resourcesStore = stores.get(STORES.RESOURCES)!;
      const resourcesIndex = resourcesStore.index("bookId");

      await new Promise<void>((resolve, reject) => {
        const request = resourcesIndex.getAllKeys(IDBKeyRange.only(bookId));
        request.onsuccess = () => {
          const keys = request.result as Array<[string, string]>;
          keys.forEach((key) => resourcesStore.delete(key));
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    },
  );

  // Also clean up plugin_store entries for this book (any plugin)
  await dbTransaction([STORES.PLUGIN_STORE], "readwrite", async (stores) => {
    const ps = stores.get(STORES.PLUGIN_STORE)!;

    await new Promise<void>((resolve, reject) => {
      const req = ps.getAll();
      req.onsuccess = () => {
        for (const record of req.result as Array<{
          pluginId: string;
          key: string;
          value: { bookId?: string };
        }>) {
          if (record.value?.bookId === bookId || record.key.includes(bookId)) {
            ps.delete([record.pluginId, record.key]);
          }
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  });
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
 * Update partial fields on a book
 */
export async function updateBook(
  bookId: string,
  partial: Partial<Pick<Book, "title" | "author" | "folderId" | "coverUrl">>,
): Promise<Book | undefined> {
  const book = await getBook(bookId);
  if (!book) return undefined;
  Object.assign(book, partial);
  await dbPut(STORES.BOOKS, book);
  return book;
}

interface StoredChapter {
  bookId: string;
  chapterId: string;
  title: string;
  content: string;
  order: number;
  href?: string;
  inToc?: boolean;
}

/**
 * Get chapter content. If not yet extracted, extracts lazily from stored zip.
 */
export async function getChapterContent(
  bookId: string,
  chapterId: string,
): Promise<string | undefined> {
  const chapter = await dbGet<StoredChapter>(STORES.CHAPTERS, [bookId, chapterId]);

  if (!chapter) return undefined;

  if (chapter.content) return chapter.content;

  if (chapter.href) {
    const book = await getBook(bookId);
    const parser = book ? getParserForFormat(book.format) : null;
    if (parser?.loadChapterContent) {
      return lazyExtractChapterContent(bookId, chapterId, chapter.href, parser);
    }
  }

  return chapter.content;
}

/**
 * Update chapter content after lazy extraction
 */
async function updateChapterContent(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<void> {
  const chapter = await dbGet<StoredChapter>(STORES.CHAPTERS, [bookId, chapterId]);
  if (chapter) {
    chapter.content = content;
    await dbPut(STORES.CHAPTERS, chapter);
  }
}

/**
 * Lazily extract a single chapter's content from stored zip data
 */
async function lazyExtractChapterContent(
  bookId: string,
  chapterId: string,
  href: string,
  parser: BookParser,
): Promise<string> {
  const key = `${bookId}:${chapterId}`;

  const inflight = extractionInProgress.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const content = await parser.loadChapterContent!(bookId, {
      id: chapterId,
      href,
    });
    if (!content) {
      throw new Error(
        "Chapter content not available. The book data has been cleared from local storage. Please re-import the book.",
      );
    }
    await updateChapterContent(bookId, chapterId, content);
    return content;
  })();

  extractionInProgress.set(key, promise);
  try {
    return await promise;
  } finally {
    extractionInProgress.delete(key);
  }
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
): Promise<Array<{ id: string; title: string; order: number; href?: string; inToc?: boolean }>> {
  const db = await import("./db");
  const chaptersStore = await db.openDB();
  const tx = chaptersStore.transaction(STORES.CHAPTERS, "readonly");
  const store = tx.objectStore(STORES.CHAPTERS);
  const index = store.index("bookId");

  return new Promise((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.only(bookId));
    request.onsuccess = () => {
      const results = request.result as Array<{
        bookId: string;
        chapterId: string;
        title: string;
        order: number;
        href?: string;
        inToc?: boolean;
      }>;
      // Sort by the stored order field
      results.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const mapped = results.map((ch) => ({
        id: ch.chapterId,
        title: ch.title || `Chapter ${ch.order + 1}`,
        order: ch.order ?? 0,
        href: ch.href,
        inToc: ch.inToc,
      }));
      resolve(mapped);
    };
    request.onerror = () => reject(request.error);
  });
}
