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

export interface BookParser {
  format: string;
  supportsFormat(mimeType: string): boolean;
  parse(file: File): Promise<ParserResult>;
  extractChapterContent?(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined>;
  extractResource?(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined>;
}
