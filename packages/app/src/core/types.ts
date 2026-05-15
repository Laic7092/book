// Core type definitions for the Reader application

// Chapter is now provided by @book/reader-core
import type { Chapter } from "@book/reader-core";
export type { Chapter };

// BookParser types now provided by @book/parser-core
import type { BookParser, ParserResult, ChapterData } from "@book/parser-core";
export type { BookParser, ParserResult, ChapterData };

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  format: string;
  fileSize: number;
  addedAt: number;
  lastReadAt?: number;
  folderId?: string;
  contentHash?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  order: number;
}

export interface BookContent {
  bookId: string;
  chapterId: string;
  content: string;
  htmlContent?: string;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  cfi: string;
  title: string;
  contentPreview: string;
  createdAt: number;
  color?: string;
  note?: string;
}

export interface Annotation {
  id: string;
  bookId: string;
  chapterId: string;
  type: "highlight" | "underline";
  startCfi: string;
  endCfi: string;
  color: string;
  note: string;
  textPreview: string;
  createdAt: number;
  updatedAt: number;
}

export interface SearchResult {
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  text: string;
  position: number;
  context: string;
}

export interface ParsedBook {
  book: Book;
  chapters: Chapter[];
  content: Map<string, string>; // chapterId -> content
  resources?: Map<string, ArrayBuffer>; // resourceId -> data (original path -> ArrayBuffer)
  /** Raw file data for lazy extraction (stored in IndexedDB for cross-session access) */
  rawData?: ArrayBuffer;
}

export interface Resource {
  bookId: string;
  resourceId: string; // Original relative path within EPUB
  data: ArrayBuffer;
  mimeType: string;
  type: "image" | "css" | "font" | "other";
}

export function mapParserResult(
  result: ParserResult,
  format: string,
  fileSize: number,
  contentHash?: string,
): ParsedBook {
  const book: Book = {
    id: result.id,
    title: result.title,
    author: result.author,
    coverUrl: result.coverUrl,
    format,
    fileSize,
    addedAt: Date.now(),
    contentHash,
  };
  const chapters: Chapter[] = result.chapters.map((ch: ChapterData) => ({
    id: ch.id,
    bookId: result.id,
    title: ch.title,
    href: ch.href,
    order: ch.order,
  }));
  return {
    book,
    chapters,
    content: result.content,
    resources: result.resources,
    rawData: result.rawData,
  };
}

/**
 * Reading session - tracks a single reading session
 */
export interface ReadingSession {
  bookId: string;
  startTime: number; // Session start timestamp
  endTime?: number; // Session end timestamp (recorded when closing book)
  chaptersRead: string[]; // Chapter IDs read in this session
  wordsRead?: number; // Approximate words read in this session
}

/**
 * Reading statistics for a book
 */
export interface BookReadingStats {
  bookId: string;
  totalSessions: number; // Total number of reading sessions
  totalReadingTime: number; // Cumulative reading time in milliseconds
  averageSessionTime: number; // Average session duration in milliseconds
  wordsRead: number; // Total words read
  readingSpeed: number; // Words per minute
  chaptersCompleted: number; // Number of chapters completed
  lastActiveDate: string; // Last active date (YYYY-MM-DD format)
  activeHours: number[]; // Array of hours (0-23) when user was active
  estimatedTimeRemaining?: number; // Estimated time remaining in milliseconds
  firstReadAt?: number; // Timestamp of first reading session
  lastReadAt?: number; // Timestamp of most recent session end
}
