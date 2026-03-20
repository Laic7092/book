// Core type definitions for the Reader application

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  format: "txt" | "epub";
  fileSize: number;
  addedAt: number;
  lastReadAt?: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  href?: string;
  order: number;
}

export interface BookContent {
  bookId: string;
  chapterId: string;
  content: string;
  htmlContent?: string;
}

export interface ReadingProgress {
  bookId: string;
  chapterId: string;
  scrollPosition: number;
  percentage: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  title: string;
  contentPreview: string;
  position: number;
  createdAt: number;
  color?: string;
  note?: string;
}

export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: "light" | "dark" | "sepia";
  margin: number;
  columnWidth: number;
  letterSpacing?: number;
  paragraphSpacing?: number;
  textAlign?: "left" | "center" | "justify";
  contrast?: "soft" | "normal" | "high";
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
}

export interface Resource {
  bookId: string;
  resourceId: string; // Original relative path within EPUB
  data: ArrayBuffer;
  mimeType: string;
  type: "image" | "css" | "font" | "other";
}

export interface BookParser {
  parse(file: File): Promise<ParsedBook>;
  supportsFormat(mimeType: string): boolean;
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

export type ReaderEventMap = {
  "book:loaded": { book: Book; chapters: Chapter[]; resourceUrls?: Map<string, string> };
  "chapter:changed": { chapterId: string; content: string; resourceUrls?: Map<string, string> };
  "progress:updated": { progress: ReadingProgress };
  "bookmark:added": { bookmark: Bookmark };
  "bookmark:updated": { bookmark: Bookmark };
  "bookmark:removed": { bookmarkId: string };
  "settings:changed": { settings: ReaderSettings };
  "search:results": { results: SearchResult[]; query: string };
  "stats:session-start": { bookId: string; startTime: number };
  "stats:session-end": { bookId: string; duration: number };
  "stats:updated": { bookId: string; stats: BookReadingStats };
  error: { message: string; error?: Error };
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: "Literata, Georgia, serif",
  lineHeight: 1.6,
  theme: "light",
  margin: 24,
  columnWidth: 720,
  letterSpacing: 0,
  paragraphSpacing: 1.2,
  textAlign: "left",
  contrast: "normal",
};

export const THEME_COLORS = {
  light: {
    background: "#ffffff",
    text: "#333333",
  },
  dark: {
    background: "#1a1a1a",
    text: "#e0e0e0",
  },
  sepia: {
    background: "#f4ecd8",
    text: "#5b4636",
  },
};
