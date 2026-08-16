import {
  getParserForFileAuto,
  getParseWorker,
  getParserForFormat,
  getMimeType,
  loadParserForFormat,
} from "@book/parser";
import { mapParserResult } from "../core/types";
import { assertValidBookFile } from "../utils/validation";
import * as booksStore from "../storage/books";
import { saveZipFromFile } from "../storage/raw-data";
import type { Book, Chapter } from "../core/types";

export interface ParseAndSaveResult {
  book: Book;
  chapters: Chapter[];
}

/** Eviction policy lives in the orchestration layer, not in storage. */
const MAX_STORED_BOOKS = 20;

/**
 * Prune chapter content for the least-recently-read books beyond the limit.
 * Only books whose parser declares lazyExtractable may be pruned (their
 * content can be re-extracted from the stored raw zip); clearing any other
 * format would lose content forever.
 */
async function evictIfNeeded(): Promise<void> {
  try {
    const books = await booksStore.getAllBooks();
    if (books.length <= MAX_STORED_BOOKS) return;

    const candidates = books.slice(MAX_STORED_BOOKS);

    // getParserForFormat only reads the parser cache; a format may not have
    // been loaded yet in this session. Load every candidate format first so
    // the lazyExtractable flag below is real instead of `undefined`.
    const formats = new Set(candidates.map((b) => b.format));
    await Promise.all([...formats].map((format) => loadParserForFormat(format)));

    const toEvict = candidates.filter((b) => getParserForFormat(b.format)?.lazyExtractable);
    if (toEvict.length === 0) return;
    await booksStore.clearChapterContents(toEvict.map((b) => b.id));
  } catch (err) {
    // Eviction is a storage-reclamation policy, not part of the import
    // contract — never fail an import because pruning could not run.
    console.warn("[import-book] Eviction skipped:", err);
  }
}

export async function parseAndSaveBook(
  file: File,
  contentHash?: string,
): Promise<ParseAndSaveResult> {
  assertValidBookFile(file);

  const parser = await getParserForFileAuto(file);
  if (!parser) {
    throw new Error(`Unsupported file format: ${file.type || file.name}`);
  }

  if (parser.parseStreaming) {
    // Worker first; DOM-dependent parsers (epub) throw needsMainThread and
    // fall back to the main thread below.
    try {
      return await consumeStreamingEvents(
        getParseWorker().parseStreaming(file),
        file,
        parser,
        contentHash,
      );
    } catch (err) {
      if (!(err as { needsMainThread?: boolean }).needsMainThread) throw err;
    }
    return consumeStreamingEvents(parser.parseStreaming!(file), file, parser, contentHash);
  }

  // Try worker first; DOMParser-dependent formats fall back to main thread
  const result = await getParseWorker().parse(file, parser);
  const parsedBook = mapParserResult(result, parser.format, file.size, contentHash);

  // Cover extraction is the orchestrator's job — storage only stores the blob.
  let coverBlob: Blob | undefined;
  if (parsedBook.book.coverUrl && parsedBook.rawData && parser.extractResource) {
    try {
      const data = await parser.extractResource(parsedBook.rawData, parsedBook.book.coverUrl);
      if (data) {
        coverBlob = new Blob([data], { type: getMimeType(parsedBook.book.coverUrl) });
      }
    } catch {
      // Non-critical: bookshelf will fall back to gradient cover
    }
  }

  await booksStore.saveBook(parsedBook, coverBlob);
  await evictIfNeeded();

  return { book: parsedBook.book, chapters: parsedBook.chapters };
}

interface StreamingChapterRecord {
  id: string;
  title: string;
  content?: string;
  order: number;
  href?: string;
  inToc?: boolean;
}

/** Batch size for streaming chapter persistence. */
const STREAMING_CHAPTER_BATCH_SIZE = 50;

async function consumeStreamingEvents(
  generator: AsyncGenerator<import("@book/parser").StreamingParseEvent>,
  file: File,
  parser: import("@book/parser").BookParser,
  contentHash?: string,
): Promise<ParseAndSaveResult> {
  let book: Book | undefined;
  const chapters: Chapter[] = [];
  const pendingChapters: StreamingChapterRecord[] = [];
  let completed = false;

  async function flushChapterBatch(): Promise<void> {
    if (!book || pendingChapters.length === 0) return;
    const batch = pendingChapters.splice(0);
    await booksStore.saveChapters(book.id, batch);
  }

  try {
    for await (const event of generator) {
      switch (event.type) {
        case "metadata": {
          book = {
            id: event.id,
            title: event.title,
            author: event.author,
            coverUrl: event.coverUrl,
            format: parser.format,
            fileSize: file.size,
            addedAt: Date.now(),
            contentHash,
          };
          await booksStore.saveBookMetadata(book);
          break;
        }
        case "chapter": {
          if (!book) throw new Error("Received chapter event before metadata");

          const ch: Chapter = {
            id: event.chapter.id,
            bookId: book.id,
            title: event.chapter.title,
            href: event.chapter.href,
            order: event.chapter.order,
            inToc: event.chapter.inToc,
          };
          chapters.push(ch);

          pendingChapters.push({
            id: event.chapter.id,
            title: event.chapter.title,
            content: event.chapter.content,
            order: event.chapter.order,
            href: event.chapter.href,
            inToc: event.chapter.inToc,
          });
          if (pendingChapters.length >= STREAMING_CHAPTER_BATCH_SIZE) {
            await flushChapterBatch();
          }
          break;
        }
        case "done": {
          if (!book) throw new Error("Received done event before metadata");

          await flushChapterBatch();
          await saveZipFromFile(book.id, file, book.fileSize);

          if (book.coverUrl && event.coverData) {
            const mimeType = getMimeType(book.coverUrl);
            await booksStore.saveCoverBlob(
              book.id,
              new Blob([event.coverData], { type: mimeType }),
            );
          }
          await evictIfNeeded();
          completed = true;
          break;
        }
      }
    }
  } catch (err) {
    // A streaming parser may fail mid-book (bad zip entry, worker error,
    // unsupported browser global on fallback, ...). In that case the
    // metadata plus any already-flushed chapters would remain as a
    // half-imported book that can never be opened — clean it up.
    if (book && !completed) {
      try {
        await booksStore.deleteBook(book.id);
      } catch (cleanupErr) {
        console.warn("[import-book] Failed to clean up partial streaming import:", cleanupErr);
      }
    }
    throw err;
  }

  if (!book) throw new Error("Parser completed without emitting metadata");

  return { book, chapters };
}
