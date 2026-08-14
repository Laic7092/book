import { getParserForFileAuto, getParseWorker, getParserForFormat } from "@book/parser";
import { mapParserResult } from "../core/types";
import { assertValidBookFile } from "../utils/validation";
import { getMimeType } from "@book/parser";
import * as booksStore from "./books";
import { saveZipFromFile } from "./raw-data";
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
  const books = await booksStore.getAllBooks();
  if (books.length <= MAX_STORED_BOOKS) return;
  const toEvict = books
    .slice(MAX_STORED_BOOKS)
    .filter((b) => getParserForFormat(b.format)?.lazyExtractable);
  if (toEvict.length === 0) return;
  await booksStore.clearChapterContents(toEvict.map((b) => b.id));
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

async function consumeStreamingEvents(
  generator: AsyncGenerator<import("@book/parser").StreamingParseEvent>,
  file: File,
  parser: import("@book/parser").BookParser,
  contentHash?: string,
): Promise<ParseAndSaveResult> {
  let book: Book | undefined;
  const chapters: Chapter[] = [];

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

        await booksStore.saveSingleChapter(book.id, {
          id: event.chapter.id,
          title: event.chapter.title,
          content: event.chapter.content,
          order: event.chapter.order,
          href: event.chapter.href,
          inToc: event.chapter.inToc,
        });
        break;
      }
      case "done": {
        if (!book) throw new Error("Received done event before metadata");

        await saveZipFromFile(book.id, file, book.fileSize);

        if (book.coverUrl && event.coverData) {
          const mimeType = getMimeType(book.coverUrl);
          await booksStore.saveCoverBlob(book.id, new Blob([event.coverData], { type: mimeType }));
        }
        // Note: streaming imports do not run eviction (kept as-is); the
        // non-streaming path handles it via evictIfNeeded after saveBook.
        break;
      }
    }
  }

  if (!book) throw new Error("Parser completed without emitting metadata");

  return { book, chapters };
}
