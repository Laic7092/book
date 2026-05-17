import { getParserForFileAuto } from "@book/parser-core";
import { mapParserResult } from "../core/types";
import { assertValidBookFile } from "../utils/validation";
import { getMimeTypeFromExtension } from "../utils/constants";
import * as booksStore from "./books";
import { saveZipFromFile } from "./raw-data";
import type { Book, Chapter } from "../core/types";

export interface ParseAndSaveResult {
  book: Book;
  chapters: Chapter[];
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
    return parseAndSaveBookStreaming(file, parser, contentHash);
  }

  const result = await parser.parse(file);
  const parsedBook = mapParserResult(result, parser.format, file.size, contentHash);
  await booksStore.saveBook(parsedBook, parser);

  return { book: parsedBook.book, chapters: parsedBook.chapters };
}

async function parseAndSaveBookStreaming(
  file: File,
  parser: import("@book/parser-core").BookParser,
  contentHash?: string,
): Promise<ParseAndSaveResult> {
  const generator = parser.parseStreaming!(file);
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
          const mimeType = getMimeTypeFromExtension(book.coverUrl);
          await booksStore.saveCoverBlob(book.id, new Blob([event.coverData], { type: mimeType }));
        }
        break;
      }
    }
  }

  if (!book) throw new Error("Parser completed without emitting metadata");

  return { book, chapters };
}
