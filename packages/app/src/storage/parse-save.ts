import { getParserForFileAuto } from "@book/parser-core";
import { mapParserResult } from "../core/types";
import { assertValidBookFile } from "../utils/validation";
import * as booksStore from "./books";
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

  const result = await parser.parse(file);
  const parsedBook = mapParserResult(result, parser.format, file.size, contentHash);
  await booksStore.saveBook(parsedBook, parser);

  return { book: parsedBook.book, chapters: parsedBook.chapters };
}
