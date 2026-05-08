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
  folderId?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  order: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  href?: string;
  order: number;
  inToc?: boolean; // Whether this chapter appears in NCX/Nav table of contents
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

export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: "light" | "dark" | "sepia";
  margin: number;
  letterSpacing?: number;
  paragraphSpacing?: number;
  textAlign?: "left" | "center" | "justify";
  contrast?: "soft" | "normal" | "high";
  scrollMode?: "vertical" | "pagination";
  paginationAnimation?: "slide" | "flip" | "fade";
  /** Whether to apply custom typography settings (fontFamily, lineHeight, etc.). When false, EPUB original styling is preserved. */
  customTypography?: boolean;
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

export interface BookParser {
  parse(file: File): Promise<ParsedBook>;
  supportsFormat(mimeType: string): boolean;

  /**
   * Format identifier (matches Book.format).
   * Used to find the right parser for a stored book.
   */
  format: "txt" | "epub";

  /** Store format-specific resources. Called during book import. */
  saveResources?(bookId: string, resources: Map<string, ArrayBuffer>): Promise<void>;
  /** Store raw file data for lazy content extraction. */
  saveRawData?(bookId: string, rawData: ArrayBuffer, fileSize: number): Promise<void>;
  /** Load chapter content lazily from raw data. */
  loadChapterContent?(
    bookId: string,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined>;
  /** Resolve a resource path to a blob URL. */
  resolveResourceUrl?(bookId: string, path: string): Promise<string | null>;
  /** Revoke all blob URLs in the given map. */
  revokeResourceUrls?(urls: Map<string, string>): void;
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
