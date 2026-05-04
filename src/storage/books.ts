// Books storage module

import type { Book, ParsedBook } from "../core/types";
import { STORES, dbPut, dbGet, dbGetAll, dbTransaction } from "./db";
import { getLazyExtractChapter, getResourceSaver, getZipStore } from "../plugins/registry";

/** In-flight dedup: prevents concurrent extraction of the same chapter */
const extractionInProgress = new Map<string, Promise<string>>();

/**
 * Save a parsed book to the database
 */
export async function saveBook(parsedBook: ParsedBook): Promise<void> {
  const storeNames = parsedBook.resources?.size
    ? [STORES.BOOKS, STORES.CHAPTERS, STORES.RESOURCES]
    : [STORES.BOOKS, STORES.CHAPTERS];

  await dbTransaction(storeNames, "readwrite", async (stores) => {
    const booksStore = stores.get(STORES.BOOKS)!;
    const chaptersStore = stores.get(STORES.CHAPTERS)!;

    // Save book metadata
    booksStore.put(parsedBook.book);

    // Save chapter contents, titles, and order
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

  // Save resources separately (after the transaction completes)
  if (parsedBook.resources) {
    const savePromises: Promise<void>[] = [];
    for (const [resourceId, data] of parsedBook.resources) {
      const mimeType = getMimeTypeFromExtension(resourceId);
      savePromises.push(
        getResourceSaver()!.saveResource(parsedBook.book.id, resourceId, data, mimeType),
      );
    }
    await Promise.all(savePromises);
  }

  // Store raw zip data for lazy extraction
  if (parsedBook.rawData) {
    await getZipStore()!.saveZip(parsedBook.book.id, parsedBook.rawData, parsedBook.book.fileSize);
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    css: "text/css",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
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
    [
      STORES.BOOKS,
      STORES.CHAPTERS,
      STORES.BOOKMARKS,
      STORES.RESOURCES,
      STORES.ANNOTATIONS,
      STORES.ZIPS,
    ],
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

      // Delete annotations for this book
      const annotationsStore = stores.get(STORES.ANNOTATIONS)!;
      const annotationsIndex = annotationsStore.index("bookId");

      await new Promise<void>((resolve, reject) => {
        const request = annotationsIndex.getAllKeys(IDBKeyRange.only(bookId));
        request.onsuccess = () => {
          const keys = request.result as string[];
          keys.forEach((key) => annotationsStore.delete(key));
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

  // Content already extracted — return immediately
  if (chapter.content) return chapter.content;

  // Content not yet extracted and we have a href — lazy extract from zip
  if (chapter.href) {
    return lazyExtractChapterContent(bookId, chapterId, chapter.href);
  }

  // No href, no content — return empty string
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
): Promise<string> {
  const key = `${bookId}:${chapterId}`;

  // Dedup: if extraction is already in progress, return the existing promise
  const inflight = extractionInProgress.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const zipData = await getZipStore()?.getZip(bookId);
    if (!zipData) {
      throw new Error(
        "Chapter content not available. The book data has been cleared from local storage. Please re-import the book.",
      );
    }

    const extractChapter = getLazyExtractChapter();
    if (!extractChapter) throw new Error("No lazy chapter extractor registered");
    const content = await extractChapter(zipData, href);
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
