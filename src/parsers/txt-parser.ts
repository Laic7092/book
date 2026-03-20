// TXT file parser implementation

import { BaseBookParser, generateId } from "./base";
import type { BookParser, ParsedBook, Chapter } from "../core/types";

// Common Chinese encodings to try
const ENCODINGS_TO_TRY = ["utf-8", "gbk", "gb2312", "big5", "iso-8859-1"];

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
    const content = await this.readAsTextWithEncodingDetection(file);
    const metadata = this.getFileMetadata(file);

    // Extract title from filename (without extension)
    const title = metadata.name.replace(/\.[^.]+$/, "") || "Untitled";

    const bookId = generateId("book");

    // Detect chapters in the content
    const detectedChapters = this.detectChapters(content);

    let chapters: Chapter[];
    let chapterContents: Map<string, string>;

    if (detectedChapters.length >= 1) {
      // Split content by detected chapters
      chapterContents = this.splitByChaptersAndConvertToHtml(content, detectedChapters);

      // Create chapters with titles from detected chapters
      const chapterIds = Array.from(chapterContents.keys());
      chapters = chapterIds.map((id, index) => ({
        id,
        bookId,
        title: detectedChapters[index]?.title || `Chapter ${index + 1}`,
        order: index,
      }));
    } else {
      // No chapters detected - split by reasonable chunks (~50KB each)
      const chunks = this.splitIntoChunks(content, 50000);
      chapters = chunks.map((_, index) => ({
        id: generateId("ch"),
        bookId,
        title: chunks.length === 1 ? title : `Part ${index + 1}`,
        order: index,
      }));

      chapterContents = new Map();
      chapters.forEach((ch, index) => {
        chapterContents.set(ch.id, chunks[index]);
      });
    }

    const book = {
      id: bookId,
      title,
      author: "Unknown",
      format: "txt" as const,
      fileSize: metadata.size,
      addedAt: Date.now(),
    };

    return {
      book,
      chapters,
      content: chapterContents,
    };
  }

  /**
   * Split content by detected chapters and convert each chapter to HTML
   * Overrides base class method to add HTML conversion for TXT files
   */
  private splitByChaptersAndConvertToHtml(
    content: string,
    chapters: { title: string; start: number }[],
  ): Map<string, string> {
    const result = new Map<string, string>();

    if (chapters.length === 0) {
      const id = generateId("ch");
      result.set(id, this.convertTextToHtml(content));
      return result;
    }

    chapters.sort((a, b) => a.start - b.start);

    for (let i = 0; i < chapters.length; i++) {
      const current = chapters[i];
      const next = chapters[i + 1];
      let chapterContent = next
        ? content.slice(current.start, next.start).trim()
        : content.slice(current.start).trim();

      const titleLine = current.title.split("\n")[0].trim();
      if (chapterContent.startsWith(titleLine)) {
        chapterContent = chapterContent.slice(titleLine.length).trim();
        chapterContent = chapterContent.replace(/^\n+/, "");
      }

      const id = generateId("ch");
      result.set(id, this.convertTextToHtml(chapterContent));
    }

    return result;
  }

  /**
   * Convert plain text to HTML by wrapping paragraphs in <p> tags
   * Also detects and wraps chapter titles in heading tags
   */
  private convertTextToHtml(text: string): string {
    const lines = text.split(/\n+/);
    const htmlParts: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect chapter titles (e.g., "第一章", "Chapter 1", "卷一")
      if (this.isChapterTitle(trimmed)) {
        htmlParts.push(`<h1>${trimmed}</h1>`);
      } else {
        // Wrap regular text in <p> tags
        htmlParts.push(`<p>${trimmed}</p>`);
      }
    }

    return htmlParts.join("");
  }

  /**
   * Check if a line looks like a chapter title
   */
  private isChapterTitle(line: string): boolean {
    const patterns = [
      /^第 [一二三四五六七八九十百千万\d]+[章卷部集篇]/, // Chinese chapter pattern
      /^Chapter\s+\d+/i,
      /^Part\s+\d+/i,
      /^卷 [一二三四五六七八九十百千万\d]+/,
      /^楔子 | 序章 | 前言 | 引子 | 尾声 | 后记/,
      /^Prologue|^Epilogue|^Preface|^Introduction/i,
    ];

    return patterns.some((pattern) => pattern.test(line));
  }

  /**
   * Split content into chunks at paragraph boundaries
   * Returns HTML-formatted chunks with <p> tags
   */
  private splitIntoChunks(content: string, maxChunkSize: number): string[] {
    if (content.length <= maxChunkSize) {
      return [this.convertTextToHtml(content)];
    }

    const chunks: string[] = [];

    // Split by paragraphs
    const paragraphs = content.split(/\n\s*\n/);

    let currentChunk = "";
    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(this.convertTextToHtml(currentChunk.trim()));
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(this.convertTextToHtml(currentChunk.trim()));
    }

    return chunks;
  }

  /**
   * Read file as text with encoding detection
   * Tries multiple encodings to find one that produces valid text
   */
  private async readAsTextWithEncodingDetection(file: File): Promise<string> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const bytes = new Uint8Array(arrayBuffer);

    // Try each encoding until we get valid text
    for (const encoding of ENCODINGS_TO_TRY) {
      try {
        const decoder = new TextDecoder(encoding);
        const text = decoder.decode(bytes);

        // Check if the decoded text looks valid (no replacement characters)
        if (!text.includes("\uFFFD")) {
          // Additional check: if it looks like Chinese text, verify common characters decode properly
          if (this.looksLikeChinese(text) && this.hasValidChineseChars(text)) {
            return text;
          }
          if (!this.looksLikeChinese(text)) {
            return text;
          }
        }
      } catch {
        // Try next encoding
        continue;
      }
    }

    // Fallback to UTF-8
    return new TextDecoder("utf-8").decode(bytes);
  }

  /**
   * Check if text appears to contain Chinese characters
   */
  private looksLikeChinese(text: string): boolean {
    // Check for common Chinese Unicode ranges
    const chinesePattern = /[\u4e00-\u9fff\u3400-\u4dbf]/;
    return chinesePattern.test(text);
  }

  /**
   * Verify that Chinese characters are properly decoded (not garbled)
   * Garbled GBK text decoded as UTF-8 often produces sequences of unrelated CJK characters
   */
  private hasValidChineseChars(text: string): boolean {
    // Extract Chinese characters
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];

    if (chineseChars.length === 0) {
      return true; // No Chinese chars, consider valid
    }

    // Check for common Chinese words/patterns
    const commonPatterns = [
      /的/,
      /是/,
      /在/,
      /了/,
      /和/,
      /与/,
      /或/, // Common particles
      /一/,
      /不/,
      /有/,
      /人/,
      /这/,
      /那/, // Common characters
      /chapter|第 | 章 | 卷 | 部/i, // Chapter markers
    ];

    return commonPatterns.some((pattern) => pattern.test(text));
  }
}
