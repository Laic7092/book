// TXT file parser - robust chapter detection with fallback strategies

import chardet from "chardet";
import { BaseBookParser, generateId } from "./base";
import type { BookParser, ParsedBook, Chapter } from "../core/types";
import {
  PARAGRAPHS_PER_CHUNK,
  MAX_CHARS_PER_CHUNK,
  MAX_CHARS_PER_CHAPTER,
  MAX_FILE_SIZE_BYTES,
} from "../utils/constants";

// Chapter detection pattern configuration
const MARKER_DEDUPLICATION_THRESHOLD = 30; // Minimum distance between chapter markers
const MARKER_TITLE_MIN_LENGTH = 2; // Minimum chapter title length
const MARKER_TITLE_MAX_LENGTH = 100; // Maximum chapter title length
const MAX_CHAPTERS = 5000; // Maximum number of chapters to detect (performance safeguard)

// Valid text encodings for TextDecoder
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

// Chapter pattern configuration
interface ChapterPattern {
  pattern: string;
  name: string;
  score: number;
}

const CHAPTER_PATTERNS: ChapterPattern[] = [
  {
    name: "标准中文章节",
    // Limited repetition count to prevent ReDoS (max 5 levels like "1.1.1.1.1")
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

export class TxtParser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "text/plain",
    "text/markdown",
    "application/octet-stream",
  ];

  supportsFormat(mimeType: string): boolean {
    return TxtParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParsedBook> {
    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum allowed size of ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB`,
      );
    }

    const startTime = performance.now();
    const fileSize = file.size;

    const rawContent = await this.readText(file);
    const metadata = this.getFileMetadata(file);
    const title = metadata.name.replace(/\.[^.]+$/, "") || "Untitled";
    const bookId = generateId("book");

    const readTime = performance.now() - startTime;

    // Normalize line endings
    const content = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Detect chapters
    const detectStart = performance.now();
    const detected = this.detectChapterMarkers(content);
    const detectTime = performance.now() - detectStart;

    const buildStart = performance.now();
    const { chapters, content: chapterContents } = this.buildChapters(
      bookId,
      title,
      content,
      detected,
    );
    const buildTime = performance.now() - buildStart;

    const totalTime = performance.now() - startTime;

    // Performance logging (only in development)
    if (import.meta.env.DEV) {
      console.log(
        `[TXT Parser] Parsed "${title}" (${(fileSize / 1024).toFixed(1)}KB): ` +
          `total=${totalTime.toFixed(0)}ms, ` +
          `read=${readTime.toFixed(0)}ms, ` +
          `detect=${detectTime.toFixed(0)}ms (${chapters.length} chapters), ` +
          `build=${buildTime.toFixed(0)}ms`,
      );
    }

    return {
      book: {
        id: bookId,
        title,
        author: "Unknown",
        format: "txt",
        fileSize: metadata.size,
        addedAt: Date.now(),
      },
      chapters,
      content: chapterContents,
    };
  }

  // --- Reading with encoding detection ---
  private async readText(file: File): Promise<string> {
    const buffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);

    // Use chardet for encoding detection (increased sample size to 4KB for accuracy)
    const detected = chardet.detect(bytes.slice(0, 4096));
    const encoding = this.sanitizeEncoding(detected);

    // Decode with detected encoding (fatal: false allows fallback for invalid sequences)
    const decoder = new TextDecoder(encoding, { fatal: false });
    return decoder.decode(bytes);
  }

  /**
   * Validate and sanitize encoding name
   * Ensures TextDecoder receives a supported encoding
   */
  private sanitizeEncoding(detected: string | null): string {
    if (detected && VALID_ENCODINGS.has(detected.toUpperCase())) {
      return detected.toUpperCase();
    }
    return "UTF-8"; // Default fallback
  }

  // --- Chapter detection ---
  private detectChapterMarkers(content: string): { title: string; start: number }[] {
    const markers: Array<{ title: string; start: number; score: number }> = [];

    // Combined pattern for single-pass detection (order matters for priority)
    const combinedPattern = new RegExp(CHAPTER_PATTERNS.map((p) => p.pattern).join("|"), "gim");

    let match: RegExpExecArray | null;
    while ((match = combinedPattern.exec(content)) !== null) {
      // Performance safeguard: limit maximum chapters
      if (markers.length >= MAX_CHAPTERS) {
        if (import.meta.env.DEV) {
          console.warn(`[TXT Parser] Stopped chapter detection at ${MAX_CHAPTERS} chapters`);
        }
        break;
      }

      const raw = match[0].trim();
      if (raw.length < MARKER_TITLE_MIN_LENGTH || raw.length > MARKER_TITLE_MAX_LENGTH) continue;

      // Determine which sub-pattern matched (by checking which capture group is defined)
      const score = this.getMatchScore(match);

      markers.push({ title: raw, start: match.index, score });
    }

    // Sort by position, then score
    markers.sort((a, b) => a.start - b.start || b.score - a.score);

    // Deduplicate nearby markers (keep highest score)
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

  /**
   * Get score based on which capture group matched
   */
  private getMatchScore(match: RegExpExecArray): number {
    // Check capture groups in priority order (group 1 = pattern 1, group 2 = pattern 2, etc.)
    for (let i = 0; i < CHAPTER_PATTERNS.length; i++) {
      if (match[i + 1] !== undefined) {
        return CHAPTER_PATTERNS[i].score;
      }
    }
    return 50; // Fallback
  }

  // --- Build chapters ---
  private buildChapters(
    bookId: string,
    bookTitle: string,
    content: string,
    markers: { title: string; start: number }[],
  ): { chapters: Chapter[]; content: Map<string, string> } {
    const contentMap = new Map<string, string>();

    // Sort markers
    markers.sort((a, b) => a.start - b.start);

    // Build chapter index with start/end positions
    const chapterRanges: Array<{
      id: string;
      title: string;
      start: number;
      end: number;
      order: number;
    }> = [];

    // Capture content before the first marker as intro (front matter)
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
      // No markers at all — entire content is one chapter
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

    // Fallback if all chapters ended up empty
    if (chapterRanges.length === 0) {
      return this.splitByParagraphs(bookId, bookTitle, content);
    }

    // Convert to chapters + content, with automatic sub-splitting for oversized chapters
    const chapters: Chapter[] = [];
    for (const range of chapterRanges) {
      let text = content.slice(range.start, range.end).trim();

      // Remove title line from content (will be re-inserted as <h2>)
      const titleLine = range.title.split("\n")[0];
      if (text.startsWith(titleLine)) {
        text = text.slice(titleLine.length).replace(/^\n+/, "");
      }

      // Check if chapter needs to be split (enforce maximum size)
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
      const charCount = text.length;

      // Split if: too many paragraphs OR exceeds character limit
      if (paragraphs.length > PARAGRAPHS_PER_CHUNK * 2 || charCount > MAX_CHARS_PER_CHAPTER) {
        // Chapter too large - split into sub-chapters
        const subChapters = this.splitChapterIntoChunks(
          bookId,
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
        // Chapter size is acceptable
        chapters.push({ id: range.id, bookId, title: range.title, order: chapters.length });
        contentMap.set(range.id, this.toHtml(text, range.title));
      }
    }

    return { chapters, content: contentMap };
  }

  /**
   * Split an oversized chapter into smaller chunks based on character count
   */
  private splitChapterIntoChunks(
    bookId: string,
    chapterTitle: string,
    _text: string,
    paragraphs: string[],
    startOrder: number,
  ): { chapters: Chapter[]; content: Map<string, string> } {
    const contentMap = new Map<string, string>();
    const chapters: Chapter[] = [];

    // Reuse common splitting logic
    const chunks = this.splitParagraphsIntoChunks(paragraphs);

    // Build chapter objects
    const totalChunks = chunks.length;
    for (let i = 0; i < totalChunks; i++) {
      const chunkText = chunks[i].join("\n\n");
      const id = generateId("ch");
      const title = totalChunks === 1 ? chapterTitle : `${chapterTitle}（${i + 1}/${totalChunks}）`;

      chapters.push({ id, bookId, title, order: startOrder + i });
      contentMap.set(id, this.toHtml(chunkText, title));
    }

    return { chapters, content: contentMap };
  }

  /**
   * Split paragraph array into chunks respecting size limits
   * Reusable by both chapter splitting and fallback splitting
   */
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

  // --- Fallback: split by paragraphs with character-based limits ---
  private splitByParagraphs(
    bookId: string,
    bookTitle: string,
    content: string,
  ): { chapters: Chapter[]; content: Map<string, string> } {
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());

    // Handle empty content
    if (paragraphs.length === 0) {
      const id = generateId("ch");
      return {
        chapters: [{ id, bookId, title: bookTitle, order: 0 }],
        content: new Map([[id, this.toHtml(content, bookTitle)]]),
      };
    }

    // Reuse common splitting logic
    const chunkArrays = this.splitParagraphsIntoChunks(paragraphs);

    const contentMap = new Map<string, string>();
    const chapters: Chapter[] = chunkArrays.map((chunk, i) => {
      const id = generateId("ch");
      const title = `第 ${i + 1} 章`;
      const chunkText = chunk.join("\n\n");
      contentMap.set(id, this.toHtml(chunkText, title));
      return { id, bookId, title, order: i };
    });

    return { chapters, content: contentMap };
  }

  // --- Text to HTML ---
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
