/**
 * Chapter content orchestration: storage + parser assembly point.
 *
 * storage/books.ts is a pure CRUD layer and knows nothing about parsers;
 * the *policy* of lazily re-extracting an evicted chapter from the stored
 * raw zip lives here (and in parse-save.ts for the eviction side).
 *
 * Consumers: the reader's fetchChapter and the search plugin. Both call
 * fetchChapterContent; the reader additionally loads rawData for resource
 * injection (zip reads are LRU-cached in raw-data.ts, so the second read
 * is cheap).
 */
import * as booksStore from "./books";
import type { BookParser } from "@book/parser-core";
import { getParserForFormat } from "@book/parser-core";

/** Dedup concurrent extractions of the same chapter (reader + search can race). */
const extractionInProgress = new Map<string, Promise<string>>();

export interface ChapterContentResult {
  html: string | undefined;
}

/**
 * Fetch a chapter's HTML: from stored content when present, otherwise
 * re-extract it from the stored raw zip via the book's parser.
 *
 * Throws when the raw data is gone (book data cleared from storage) — same
 * semantics as the old storage-internal lazy extraction.
 */
export async function fetchChapterContent(
  bookId: string,
  chapterId: string,
): Promise<ChapterContentResult> {
  const chapter = await booksStore.getChapter(bookId, chapterId);
  if (!chapter) return { html: undefined };
  if (chapter.content) return { html: chapter.content };

  if (chapter.href) {
    const { getZip } = await import("./raw-data");
    const rawData = await getZip(bookId);
    if (!rawData) {
      throw new Error(
        "Chapter content not available. The book data has been cleared from local storage. Please re-import the book.",
      );
    }
    const book = await booksStore.getBook(bookId);
    const parser = book ? getParserForFormat(book.format) : null;
    if (parser?.extractChapterContent) {
      const html = await extractWithDedup(bookId, chapterId, chapter.href, rawData, parser);
      return { html };
    }
  }

  return { html: undefined };
}

async function extractWithDedup(
  bookId: string,
  chapterId: string,
  href: string,
  rawData: ArrayBuffer,
  parser: BookParser,
): Promise<string> {
  const key = `${bookId}:${chapterId}`;

  const inflight = extractionInProgress.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const content = await parser.extractChapterContent!(rawData, {
      id: chapterId,
      href,
    });
    if (!content) {
      throw new Error(
        "Chapter content not available. The book data has been cleared from local storage. Please re-import the book.",
      );
    }
    await booksStore.updateChapterContent(bookId, chapterId, content);
    return content;
  })();

  extractionInProgress.set(key, promise);
  try {
    return await promise;
  } finally {
    extractionInProgress.delete(key);
  }
}
