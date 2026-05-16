// Books storage module

import type { Book, Folder, ParsedBook } from "../core/types";
import { STORES, dbPut, dbGet, dbGetAll, dbTransaction, dbDelete, dbGetAllFromIndex } from "./db";
import type { BookParser } from "@book/parser-core";
import { getParserForFormat, generateId } from "@book/parser-core";
import { saveZip, getZip } from "./raw-data";
import { getMimeTypeFromExtension } from "../utils/constants";

const PLUGIN_ID = "_covers";

interface CoverEntry {
  pluginId: string;
  key: string;
  value: Blob;
  createdAt: number;
}

function key(bookId: string): string {
  return bookId;
}

/** Save a cover Blob for the given book. */
export async function saveCoverBlob(bookId: string, blob: Blob): Promise<void> {
  await dbPut(STORES.PLUGIN_STORE, {
    pluginId: PLUGIN_ID,
    key: key(bookId),
    value: blob,
    createdAt: Date.now(),
  } as CoverEntry);
}

/** Retrieve the cover Blob for a book, or null if not cached. */
export async function getCoverBlob(bookId: string): Promise<Blob | null> {
  const entry = await dbGet<CoverEntry>(STORES.PLUGIN_STORE, [PLUGIN_ID, key(bookId)]);
  return entry?.value ?? null;
}

/** Delete the cached cover Blob for a book. */
export async function deleteCoverBlob(bookId: string): Promise<void> {
  await dbDelete(STORES.PLUGIN_STORE, [PLUGIN_ID, key(bookId)]);
}

/** In-flight dedup: prevents concurrent extraction of the same chapter */
const extractionInProgress = new Map<string, Promise<string>>();

/**
 * Save a parsed book to the database
 */
export async function saveBook(parsedBook: ParsedBook, parser: BookParser): Promise<void> {
  await dbTransaction([STORES.BOOKS, STORES.CHAPTERS], "readwrite", async (stores) => {
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

  // Format-specific raw data storage (for lazy extraction)
  if (parsedBook.rawData) {
    await saveZip(parsedBook.book.id, parsedBook.rawData, parsedBook.book.fileSize);
  }

  // Cache cover image so bookshelf can display it without the parser
  if (parsedBook.book.coverUrl && parsedBook.rawData && parser.extractResource) {
    try {
      const data = await parser.extractResource(parsedBook.rawData, parsedBook.book.coverUrl);
      if (data) {
        const mimeType = getMimeTypeFromExtension(parsedBook.book.coverUrl);
        const blob = new Blob([data], { type: mimeType });
        await saveCoverBlob(parsedBook.book.id, blob);
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
  await dbTransaction([STORES.BOOKS, STORES.CHAPTERS, STORES.ZIPS], "readwrite", async (stores) => {
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
  });

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
  partial: Partial<Pick<Book, "title" | "author" | "folderId" | "coverUrl" | "contentHash">>,
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
    if (parser?.extractChapterContent) {
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
    const rawData = await getZip(bookId);
    if (!rawData) {
      throw new Error(
        "Chapter content not available. The book data has been cleared from local storage. Please re-import the book.",
      );
    }
    const content = await parser.extractChapterContent!(rawData, {
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
  const chapters = await dbGetAllFromIndex<{ chapterId: string }>(
    STORES.CHAPTERS,
    "bookId",
    bookId,
  );
  return chapters.map((ch) => ch.chapterId);
}

// ══════════════════════════════════════════════════════════════════════════════
// Folder helpers (stored in plugin_store under _folders token)
// ══════════════════════════════════════════════════════════════════════════════

const FOLDERS_PLUGIN_ID = "_folders";
const FOLDERS_KEY = "index";

interface FolderEntry {
  pluginId: string;
  key: string;
  value: Folder[];
  createdAt: number;
}

async function readFolders(): Promise<Folder[]> {
  const entry = await dbGet<FolderEntry>(STORES.PLUGIN_STORE, [FOLDERS_PLUGIN_ID, FOLDERS_KEY]);
  return entry?.value ?? [];
}

async function writeFolders(folders: Folder[]): Promise<void> {
  await dbPut(STORES.PLUGIN_STORE, {
    pluginId: FOLDERS_PLUGIN_ID,
    key: FOLDERS_KEY,
    value: folders,
    createdAt: Date.now(),
  } as FolderEntry);
}

export async function getAllFolders(): Promise<Folder[]> {
  return readFolders();
}

export async function createFolder(name: string, order?: number): Promise<Folder> {
  const all = await readFolders();
  const folder: Folder = {
    id: generateId("folder"),
    name,
    createdAt: Date.now(),
    order: order ?? all.length,
  };
  all.push(folder);
  await writeFolders(all);
  return folder;
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const all = await readFolders();
  return all.find((f) => f.id === id);
}

export async function updateFolder(
  id: string,
  partial: Partial<Pick<Folder, "name" | "order">>,
): Promise<void> {
  const all = await readFolders();
  const folder = all.find((f) => f.id === id);
  if (!folder) return;
  Object.assign(folder, partial);
  await writeFolders(all);
}

export async function deleteFolder(id: string): Promise<void> {
  const all = await readFolders();
  await writeFolders(all.filter((f) => f.id !== id));
}

/**
 * Get all chapters for a book with their titles
 */
export async function getChapters(
  bookId: string,
): Promise<Array<{ id: string; title: string; order: number; href?: string; inToc?: boolean }>> {
  const results = await dbGetAllFromIndex<{
    bookId: string;
    chapterId: string;
    title: string;
    order: number;
    href?: string;
    inToc?: boolean;
  }>(STORES.CHAPTERS, "bookId", bookId);

  results.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return results.map((ch) => ({
    id: ch.chapterId,
    title: ch.title || `Chapter ${ch.order + 1}`,
    order: ch.order ?? 0,
    href: ch.href,
    inToc: ch.inToc,
  }));
}
