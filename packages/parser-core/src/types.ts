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
  supportsFormat(mimeType: string): boolean;
  parse(file: File): Promise<ParserResult>;
  parseStreaming?(file: File): AsyncGenerator<StreamingParseEvent>;
  extractChapterContent?(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined>;
  extractResource?(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined>;
}
