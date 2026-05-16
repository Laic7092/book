import { generateId, getFileMetadata, readAsArrayBuffer } from "../base";
import type { BookParser, ParserResult, ChapterData } from "../types";

const PARAGRAPHS_PER_CHUNK = 320;
const MAX_CHARS_PER_CHUNK = 50_000;
const MAX_CHARS_PER_CHAPTER = 100_000;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const MARKER_DEDUPLICATION_THRESHOLD = 30;
const MARKER_TITLE_MIN_LENGTH = 2;
const MARKER_TITLE_MAX_LENGTH = 100;
const MAX_CHAPTERS = 5000;

const VALID_ENCODINGS = new Set([
  "UTF-8",
  "GBK",
  "GB18030",
  "GB2312",
  "Big5",
  "ISO-8859-1",
  "Windows-1252",
  "UTF-16LE",
  "UTF-16BE",
]);

interface ChapterPattern {
  pattern: string;
  name: string;
  score: number;
}

const CHAPTER_PATTERNS: ChapterPattern[] = [
  {
    name: "标准中文章节",
    pattern: `(?:^\\s*(?:第\\s*)?(?:[零〇一二三四五六七八九十百千万亿0-9]+\\.){0,5}[零〇一二三四五六七八九十百千万亿0-9]+\\s*(?:章|节|卷|部|篇|集|回|话)[\\s:：]*(.*))`,
    score: 100,
  },
  {
    name: "特殊章节",
    pattern: `(?:^\\s*(?:楔子|序章|前言|引子|开篇|尾声|后记|番外|终章|大结局|完结|后日谈)[\\s:：]*(.*))`,
    score: 90,
  },
  {
    name: "Markdown 标题",
    pattern: `(?:^\\s*#{1,3}\\s+(.+))`,
    score: 85,
  },
  {
    name: "英文章节",
    pattern: `(?:^\\s*(?:chapter|section|part|book|volume)\\s+[\\dIVXLC]+[\\s:：]*(.*))`,
    score: 80,
  },
  {
    name: "括号标题",
    pattern: `(?:^\\s*【\\s*(?:第\\s*)?[零〇一二三四五六七八九十百千万亿0-9]+\\s*(?:章|节|卷|部|篇|集|回)?\\s*】[\\s:：]*(.*))`,
    score: 75,
  },
  {
    name: "中文数字列表",
    pattern: `(?:^\\s*[零〇一二三四五六七八九十百]+[、.．]\\s{0,4}(.+))`,
    score: 65,
  },
  {
    name: "数字列表",
    pattern: `(?:^\\s*[0-9]+[.、．]\\s{0,4}(.+))`,
    score: 60,
  },
];

export class TxtParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "text/plain",
    "text/markdown",
    "application/octet-stream",
  ];

  readonly format = "txt" as const;

  supportsFormat(mimeType: string): boolean {
    return TxtParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParserResult> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum allowed size of ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB`,
      );
    }

    const rawContent = await this.readText(file);
    const metadata = getFileMetadata(file);
    const title = metadata.name.replace(/\.[^.]+$/, "") || "Untitled";
    const bookId = generateId("book");

    const content = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const detected = this.detectChapterMarkers(content);
    const { chapters, content: chapterContents } = this.buildChapters(title, content, detected);

    return {
      id: bookId,
      title,
      author: "Unknown",
      chapters,
      content: chapterContents,
    };
  }

  private async readText(file: File): Promise<string> {
    const buffer = await readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);

    const { default: chardet } = await import("chardet");
    const detected = chardet.detect(bytes.slice(0, 4096));
    const encoding = this.sanitizeEncoding(detected);

    const decoder = new TextDecoder(encoding, { fatal: false });
    return decoder.decode(bytes);
  }

  private sanitizeEncoding(detected: string | null): string {
    if (detected && VALID_ENCODINGS.has(detected.toUpperCase())) {
      return detected.toUpperCase();
    }
    return "UTF-8";
  }

  private detectChapterMarkers(content: string): { title: string; start: number }[] {
    const markers: Array<{ title: string; start: number; score: number }> = [];

    const combinedPattern = new RegExp(CHAPTER_PATTERNS.map((p) => p.pattern).join("|"), "gim");

    let match: RegExpExecArray | null;
    while ((match = combinedPattern.exec(content)) !== null) {
      if (markers.length >= MAX_CHAPTERS) {
        break;
      }

      const raw = match[0].trim();
      if (raw.length < MARKER_TITLE_MIN_LENGTH || raw.length > MARKER_TITLE_MAX_LENGTH) continue;

      const score = this.getMatchScore(match);
      markers.push({ title: raw, start: match.index, score });
    }

    markers.sort((a, b) => a.start - b.start || b.score - a.score);

    const filtered: typeof markers = [];
    for (const m of markers) {
      const prev = filtered[filtered.length - 1];
      if (!prev || m.start - prev.start > MARKER_DEDUPLICATION_THRESHOLD) {
        filtered.push(m);
      } else if (m.score > prev.score) {
        filtered[filtered.length - 1] = m;
      }
    }

    return filtered.map(({ title, start }) => ({ title, start }));
  }

  private getMatchScore(match: RegExpExecArray): number {
    for (let i = 0; i < CHAPTER_PATTERNS.length; i++) {
      if (match[i + 1] !== undefined) {
        return CHAPTER_PATTERNS[i].score;
      }
    }
    return 50;
  }

  private buildChapters(
    bookTitle: string,
    content: string,
    markers: { title: string; start: number }[],
  ): { chapters: ChapterData[]; content: Map<string, string> } {
    const contentMap = new Map<string, string>();
    markers.sort((a, b) => a.start - b.start);

    const chapterRanges: Array<{
      id: string;
      title: string;
      start: number;
      end: number;
      order: number;
    }> = [];

    if (markers.length > 0 && markers[0].start > 0) {
      const intro = content.slice(0, markers[0].start).trim();
      if (intro) {
        const id = generateId("ch");
        chapterRanges.push({
          id,
          title: bookTitle,
          start: 0,
          end: markers[0].start,
          order: chapterRanges.length,
        });
      }
    } else if (markers.length === 0) {
      const intro = content.trim();
      if (intro) {
        const id = generateId("ch");
        chapterRanges.push({
          id,
          title: bookTitle,
          start: 0,
          end: content.length,
          order: 0,
        });
      }
    }

    for (let i = 0; i < markers.length; i++) {
      const curr = markers[i];
      const next = markers[i + 1];
      const end = next ? next.start : content.length;

      const id = generateId("ch");
      chapterRanges.push({
        id,
        title: curr.title,
        start: curr.start,
        end,
        order: chapterRanges.length,
      });
    }

    if (chapterRanges.length === 0) {
      return this.splitByParagraphs(bookTitle, content);
    }

    const chapters: ChapterData[] = [];
    for (const range of chapterRanges) {
      let text = content.slice(range.start, range.end).trim();

      const titleLine = range.title.split("\n")[0];
      if (text.startsWith(titleLine)) {
        text = text.slice(titleLine.length).replace(/^\n+/, "");
      }

      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
      const charCount = text.length;

      if (paragraphs.length > PARAGRAPHS_PER_CHUNK * 2 || charCount > MAX_CHARS_PER_CHAPTER) {
        const subChapters = this.splitChapterIntoChunks(
          range.title,
          text,
          paragraphs,
          chapters.length,
        );
        chapters.push(...subChapters.chapters);
        for (const [id, html] of subChapters.content) {
          contentMap.set(id, html);
        }
      } else {
        chapters.push({ id: range.id, title: range.title, order: chapters.length });
        contentMap.set(range.id, this.toHtml(text, range.title));
      }
    }

    return { chapters, content: contentMap };
  }

  private splitChapterIntoChunks(
    chapterTitle: string,
    _text: string,
    paragraphs: string[],
    startOrder: number,
  ): { chapters: ChapterData[]; content: Map<string, string> } {
    const contentMap = new Map<string, string>();
    const chapters: ChapterData[] = [];

    const chunks = this.splitParagraphsIntoChunks(paragraphs);

    const totalChunks = chunks.length;
    for (let i = 0; i < totalChunks; i++) {
      const chunkText = chunks[i].join("\n\n");
      const id = generateId("ch");
      const title = totalChunks === 1 ? chapterTitle : `${chapterTitle}（${i + 1}/${totalChunks}）`;

      chapters.push({ id, title, order: startOrder + i });
      contentMap.set(id, this.toHtml(chunkText, title));
    }

    return { chapters, content: contentMap };
  }

  private splitParagraphsIntoChunks(paragraphs: string[]): string[][] {
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentChunkChars = 0;

    for (const p of paragraphs) {
      const paraChars = p.length;
      const wouldExceedParagraphs = currentChunk.length >= PARAGRAPHS_PER_CHUNK;
      const wouldExceedChars = currentChunkChars + paraChars > MAX_CHARS_PER_CHUNK;

      if (currentChunk.length > 0 && (wouldExceedParagraphs || wouldExceedChars)) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkChars = 0;
      }

      currentChunk.push(p);
      currentChunkChars += paraChars;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private splitByParagraphs(
    bookTitle: string,
    content: string,
  ): { chapters: ChapterData[]; content: Map<string, string> } {
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());

    if (paragraphs.length === 0) {
      const id = generateId("ch");
      return {
        chapters: [{ id, title: bookTitle, order: 0 }],
        content: new Map([[id, this.toHtml(content, bookTitle)]]),
      };
    }

    const chunkArrays = this.splitParagraphsIntoChunks(paragraphs);

    const contentMap = new Map<string, string>();
    const chapters: ChapterData[] = chunkArrays.map((chunk, i) => {
      const id = generateId("ch");
      const title = `第 ${i + 1} 章`;
      const chunkText = chunk.join("\n\n");
      contentMap.set(id, this.toHtml(chunkText, title));
      return { id, title, order: i };
    });

    return { chapters, content: contentMap };
  }

  private toHtml(text: string, title?: string): string {
    const lines = text.split(/\n+/);
    const paragraphs = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line}</p>`);

    const body = paragraphs.join("");
    return `<html><body><h2 class="chapter-heading">${title || "Chapter"}</h2>${body}</body></html>`;
  }
}
