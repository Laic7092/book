// Books storage module — pure CRUD, no parser knowledge.
// Lazy re-extraction policy lives in chapter-content.ts; eviction policy in
// parse-save.ts.

import type { Book, Folder, ParsedBook } from "../core/types";
import { STORES, dbPut, dbGet, dbGetAll, dbTransaction, dbDelete, dbGetAllFromIndex } from "./db";
import { saveZip, deleteZip as deleteRawZip } from "./raw-data";
import { generateId } from "../utils/id";

// Lazy-extraction capability is declared by each parser itself
// (BookParser.lazyExtractable) — storage must not keep its own format list,
// it would silently drift from the parsers' real capability and evict
// content that can never be restored.

const BLOB_URL_PATTERN = /blob:[^\s"'<>)]+/g;

/**
 * Revoke object URLs embedded in stored chapter HTML. The pdf/cbz/cbr
 * parsers lazily render pages into blob: URLs; without an explicit revoke
 * every lazy extraction leaks one URL forever.
 */
function revokeBlobUrls(html: string): void {
  const matches = html.match(BLOB_URL_PATTERN);
  if (!matches) return;
  for (const url of matches) {
    // Revoking an already-revoked or unknown URL is a harmless no-op.
    URL.revokeObjectURL(url);
  }
}

interface CoverRecord {
  bookId: string;
  blob: Blob;
  createdAt: number;
}

/** Save a cover Blob for the given book. */
export async function saveCoverBlob(bookId: string, blob: Blob): Promise<void> {
  await dbPut(STORES.COVERS, {
    bookId,
    blob,
    createdAt: Date.now(),
  } satisfies CoverRecord);
}

/** Retrieve the cover Blob for a book, or null if not cached. */
export async function getCoverBlob(bookId: string): Promise<Blob | null> {
  const entry = await dbGet<CoverRecord>(STORES.COVERS, bookId);
  return entry?.blob ?? null;
}

/** Delete the cached cover Blob for a book. */
export async function deleteCoverBlob(bookId: string): Promise<void> {
  await dbDelete(STORES.COVERS, bookId);
}

/**
 * Clear chapter content for the given books (content becomes recoverable
 * only if the book's parser can re-extract it — the caller decides policy;
 * this function only executes the deletion).
 */
export async function clearChapterContents(bookIds: string[]): Promise<void> {
  if (bookIds.length === 0) return;
  await dbTransaction([STORES.CHAPTERS], "readwrite", async (stores) => {
    const chaptersStore = stores.get(STORES.CHAPTERS)!;
    for (const bookId of bookIds) {
      const index = chaptersStore.index("bookId");
      await new Promise<void>((resolve, reject) => {
        const req = index.openCursor(IDBKeyRange.only(bookId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const record = cursor.value as StoredChapter;
            if (record.content) {
              revokeBlobUrls(record.content);
              record.content = "";
              cursor.update(record);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    }
  });
}

/**
 * Save a parsed book to the database
 */
export async function saveBook(parsedBook: ParsedBook, coverBlob?: Blob): Promise<void> {
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

  // Cover blob is prepared by the caller (parse-save.ts) — storage only stores it.
  if (coverBlob) {
    await saveCoverBlob(parsedBook.book.id, coverBlob);
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
  await dbTransaction([STORES.BOOKS, STORES.CHAPTERS], "readwrite", async (stores) => {
    // Delete book metadata
    stores.get(STORES.BOOKS)!.delete(bookId);

    // Delete all chapters for this book
    const chaptersStore = stores.get(STORES.CHAPTERS)!;
    const chaptersIndex = chaptersStore.index("bookId");

    await new Promise<void>((resolve, reject) => {
      const request = chaptersIndex.getAll(IDBKeyRange.only(bookId));
      request.onsuccess = () => {
        const chapters = request.result as StoredChapter[];
        for (const ch of chapters) {
          if (ch.content) revokeBlobUrls(ch.content);
          chaptersStore.delete([bookId, ch.chapterId]);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });

  // Delete raw zip data (OPFS + IDB fallback)
  await deleteRawZip(bookId);

  // Remove the cached cover (exact key). Plugins clean up their own data by
  // listening to the "book:deleted" event — no plugin-store scan here.
  await deleteCoverBlob(bookId);
}

/**
 * Save book metadata only (used during streaming parse when chapters arrive separately)
 */
export async function saveBookMetadata(book: Book): Promise<void> {
  await dbPut(STORES.BOOKS, book);
}

/**
 * Save a single chapter to the database (used during streaming parse)
 */
export async function saveSingleChapter(
  bookId: string,
  chapter: {
    id: string;
    title: string;
    content?: string;
    order: number;
    href?: string;
    inToc?: boolean;
  },
): Promise<void> {
  await dbPut(STORES.CHAPTERS, {
    bookId,
    chapterId: chapter.id,
    title: chapter.title,
    content: chapter.content || "",
    order: chapter.order,
    href: chapter.href,
    inToc: chapter.inToc,
  });
}

/**
 * Save a batch of chapters in a single transaction (streaming parse flush).
 */
export async function saveChapters(
  bookId: string,
  chapters: Array<{
    id: string;
    title: string;
    content?: string;
    order: number;
    href?: string;
    inToc?: boolean;
  }>,
): Promise<void> {
  await dbTransaction([STORES.CHAPTERS], "readwrite", async (stores) => {
    const chaptersStore = stores.get(STORES.CHAPTERS)!;
    for (const chapter of chapters) {
      chaptersStore.put({
        bookId,
        chapterId: chapter.id,
        title: chapter.title,
        content: chapter.content || "",
        order: chapter.order,
        href: chapter.href,
        inToc: chapter.inToc,
      });
    }
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
 * Get a chapter's stored record (content may be empty after eviction;
 * href is the re-extraction handle). Pure read — no parser involvement;
 * lazy re-extraction is orchestrated in chapter-content.ts.
 */
export async function getChapter(
  bookId: string,
  chapterId: string,
): Promise<{ content?: string; href?: string } | undefined> {
  const chapter = await dbGet<StoredChapter>(STORES.CHAPTERS, [bookId, chapterId]);
  if (!chapter) return undefined;
  return { content: chapter.content || undefined, href: chapter.href };
}

/**
 * Store chapter content after lazy extraction (see chapter-content.ts).
 */
export async function updateChapterContent(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<void> {
  const chapter = await dbGet<StoredChapter>(STORES.CHAPTERS, [bookId, chapterId]);
  if (chapter) {
    if (chapter.content && chapter.content !== content) revokeBlobUrls(chapter.content);
    chapter.content = content;
    await dbPut(STORES.CHAPTERS, chapter);
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
// Folder helpers (dedicated folders store)
// ══════════════════════════════════════════════════════════════════════════════

async function readFolders(): Promise<Folder[]> {
  const all = await dbGetAll<Folder>(STORES.FOLDERS);
  return all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function writeFolders(folders: Folder[]): Promise<void> {
  await dbTransaction([STORES.FOLDERS], "readwrite", async (stores) => {
    const store = stores.get(STORES.FOLDERS)!;
    store.clear();
    for (const folder of folders) {
      store.put(folder);
    }
  });
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
