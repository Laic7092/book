// TXT file parser - robust chapter detection with fallback strategies

import { BaseBookParser, generateId } from "./base";
import type { BookParser, ParsedBook, Chapter } from "../core/types";

const ENCODINGS_TO_TRY = ["utf-8", "gbk", "gb2312", "big5", "iso-8859-1"];

// Paragraphs per chunk when no chapters detected
const DEFAULT_PARAGRAPHS_PER_CHUNK = 80;

// Minimum paragraphs to warrant splitting
const MIN_PARAGRAPHS_FOR_SPLIT = 50;

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
    const rawContent = await this.readText(file);
    const metadata = this.getFileMetadata(file);
    const title = metadata.name.replace(/\.[^.]+$/, "") || "Untitled";
    const bookId = generateId("book");

    // Normalize line endings
    const content = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Detect chapters
    const detected = this.detectChapterMarkers(content);
    const { chapters, content: chapterContents } = this.buildChapters(
      bookId,
      title,
      content,
      detected,
    );

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

    for (const enc of ENCODINGS_TO_TRY) {
      try {
        const decoder = new TextDecoder(enc, { fatal: true });
        const text = decoder.decode(bytes);
        if (this.isValidText(text)) return text;
      } catch {
        continue;
      }
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  private isValidText(text: string): boolean {
    if (text.includes("\uFFFD")) return false;
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    if (chineseChars.length > 100) {
      return /的|是|在|了|不|有|我|他|她|这/.test(text.slice(0, 5000));
    }
    return true;
  }

  // --- Chapter detection ---
  private detectChapterMarkers(content: string): { title: string; start: number }[] {
    const markers: Array<{ title: string; start: number; score: number }> = [];
    const seen = new Set<string>();

    const patterns: Array<{ re: RegExp; score: number }[]> = [
      // Chinese: 第X章, 第X节, 第X卷, 第X部, 第X篇, 第X回
      [
        {
          re: /^(?:楔子|序章|前言|引子|开篇|尾声|后记|番外|终章|大结局|完结|后日谈)[\s:：]*(.*)$/gim,
          score: 90,
        },
      ],
      [
        {
          re: /^(?:第\s*)?[零〇一二三四五六七八九十百千万亿0-9]+\s*(?:章|节|卷|部|篇|集|回|话)[\s:：]*(.*)$/gim,
          score: 100,
        },
      ],
      [{ re: /^(?:卷|篇)\s*[零〇一二三四五六七八九十百千万亿0-9]+[\s:：]*(.*)$/gim, score: 80 }],
      // Arabic/Roman: Chapter 1, Part I
      [{ re: /^(?:chapter|section|part|book|volume)\s+[\dIVXLC]+[\s:：]*(.*)$/gim, score: 85 }],
      // Markdown headers
      [{ re: /^#{1,3}\s+(.+)$/gm, score: 70 }],
      // Numbered: 1. Title, 一、标题
      [{ re: /^[0-9]+[.、．]\s{0,4}(.{2,50})$/gm, score: 60 }],
      [{ re: /^[零〇一二三四五六七八九十百]+[、.．]\s{0,4}(.{2,50})$/gm, score: 65 }],
      // Bracketed: 【第一章】
      [
        {
          re: /^【\s*(?:第\s*)?[零〇一二三四五六七八九十百千万亿0-9]+\s*(?:章|节|卷)?\s*】/gim,
          score: 75,
        },
      ],
    ];

    for (const group of patterns) {
      for (const { re, score } of group) {
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(content)) !== null) {
          const raw = match[0].trim();
          if (raw.length < 2 || raw.length > 100) continue;
          const key = `${match.index}:${raw}`;
          if (seen.has(key)) continue;
          seen.add(key);
          markers.push({ title: raw, start: match.index, score });
        }
      }
    }

    // Sort by position, then score
    markers.sort((a, b) => a.start - b.start || b.score - a.score);

    // Deduplicate nearby markers (keep highest score)
    const filtered: typeof markers = [];
    for (const m of markers) {
      const prev = filtered[filtered.length - 1];
      if (!prev || m.start - prev.start > 30) {
        filtered.push(m);
      } else if (m.score > prev.score) {
        filtered[filtered.length - 1] = m;
      }
    }

    return filtered.map(({ title, start }) => ({ title, start }));
  }

  // --- Build chapters ---
  private buildChapters(
    bookId: string,
    bookTitle: string,
    content: string,
    markers: { title: string; start: number }[],
  ): { chapters: Chapter[]; content: Map<string, string> } {
    const contentMap = new Map<string, string>();

    // No markers found - split by paragraphs
    if (markers.length === 0) {
      return this.splitByParagraphs(bookId, bookTitle, content);
    }

    // Sort markers
    markers.sort((a, b) => a.start - b.start);

    const chapters: Chapter[] = [];
    for (let i = 0; i < markers.length; i++) {
      const curr = markers[i];
      const next = markers[i + 1];
      let text = next ? content.slice(curr.start, next.start) : content.slice(curr.start);

      // Remove title line from content
      const titleLine = curr.title.split("\n")[0];
      if (text.startsWith(titleLine)) {
        text = text.slice(titleLine.length).replace(/^\n+/, "");
      }

      const id = generateId("ch");
      chapters.push({ id, bookId, title: curr.title, order: i });
      contentMap.set(id, this.toHtml(text));
    }

    // If first marker is not at start, add intro as chapter 0
    if (markers[0].start > 100) {
      const intro = content.slice(0, markers[0].start).trim();
      if (intro) {
        const id = generateId("ch");
        chapters.unshift({ id, bookId, title: "前言", order: -1 });
        contentMap.set(id, this.toHtml(intro));
        chapters.forEach((ch, i) => (ch.order = i));
      }
    }

    // Fallback if all chapters ended up empty
    if (chapters.length === 0) {
      return this.splitByParagraphs(bookId, bookTitle, content);
    }

    return { chapters, content: contentMap };
  }

  // --- Fallback: split by paragraphs ---
  private splitByParagraphs(
    bookId: string,
    bookTitle: string,
    content: string,
  ): { chapters: Chapter[]; content: Map<string, string> } {
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());

    // Too few paragraphs - single chapter
    if (paragraphs.length < MIN_PARAGRAPHS_FOR_SPLIT) {
      const id = generateId("ch");
      return {
        chapters: [{ id, bookId, title: bookTitle, order: 0 }],
        content: new Map([[id, this.toHtml(content)]]),
      };
    }

    // Split into chunks
    const chunks: string[] = [];
    let current: string[] = [];

    for (const p of paragraphs) {
      current.push(p);
      if (current.length >= DEFAULT_PARAGRAPHS_PER_CHUNK) {
        chunks.push(current.join("\n\n"));
        current = [];
      }
    }
    if (current.length > 0) {
      chunks.push(current.join("\n\n"));
    }

    const contentMap = new Map<string, string>();
    const chapters: Chapter[] = chunks.map((chunk, i) => {
      const id = generateId("ch");
      contentMap.set(id, this.toHtml(chunk));
      return { id, bookId, title: `第 ${i + 1} 章`, order: i };
    });

    return { chapters, content: contentMap };
  }

  // --- Text to HTML ---
  private toHtml(text: string): string {
    return text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${this.escapeHtml(line)}</p>`)
      .join("");
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
