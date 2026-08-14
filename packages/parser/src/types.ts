export interface ChapterData {
  id: string;
  title: string;
  href?: string;
  order: number;
}

export interface ParserResult {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  chapters: ChapterData[];
  content: Map<string, string>;
  resources?: Map<string, ArrayBuffer>;
  rawData?: ArrayBuffer;
}

export interface StreamingChapter {
  id: string;
  title: string;
  href?: string;
  order: number;
  inToc?: boolean;
  content?: string;
}

export type StreamingParseEvent =
  | { type: "metadata"; id: string; title: string; author: string; coverUrl?: string }
  | { type: "chapter"; chapter: StreamingChapter }
  | { type: "done"; coverData?: ArrayBuffer };

export interface BookParser {
  format: string;
  /** True when parsing needs browser APIs (DOMParser/document); such formats
   * must run on the main thread and the worker bails out before executing. */
  requiresBrowser?: boolean;
  /**
   * True when chapter content can be re-extracted from the stored raw data
   * via `extractChapterContent` after the chapter's content has been evicted.
   * Declared by the parser itself — storage must never maintain its own list
   * of "lazy-extractable formats" (it would drift from this capability).
   */
  lazyExtractable?: boolean;
  supportsFormat(mimeType: string): boolean;
  parse(file: File): Promise<ParserResult>;
  parseStreaming?(file: File): AsyncGenerator<StreamingParseEvent>;
  extractChapterContent?(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined>;
  extractResource?(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined>;
}
