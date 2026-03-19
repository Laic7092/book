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

export type ReaderEventMap = {
  "book:loaded": { book: Book; chapters: Chapter[]; resourceUrls?: Map<string, string> };
  "chapter:changed": { chapterId: string; content: string; resourceUrls?: Map<string, string> };
  "progress:updated": { progress: ReadingProgress };
  "bookmark:added": { bookmark: Bookmark };
  "bookmark:removed": { bookmarkId: string };
  "settings:changed": { settings: ReaderSettings };
  "search:results": { results: SearchResult[]; query: string };
  error: { message: string; error?: Error };
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: "system-ui, -apple-system, sans-serif",
  lineHeight: 1.6,
  theme: "light",
  margin: 20,
  columnWidth: 700,
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
