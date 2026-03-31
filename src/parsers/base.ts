// Base parser interface and utilities

import type { BookParser, ParsedBook, Chapter } from "../core/types";

/**
 * Generate a unique ID
 */
export function generateId(prefix = ""): string {
  const id =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Sanitize filename from path
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/.*[/\\]/, "");
}

/**
 * Parse XML/HTML content safely
 */
export function parseXML(content: string, mimeType = "application/xml"): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, mimeType as DOMParserSupportedType);

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  return doc;
}

/**
 * Extract text content from HTML, removing tags
 */
export function extractTextFromHtml(html: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

/**
 * Clean HTML content for reading
 * - Removes scripts, styles
 * - Normalizes whitespace
 */
export function cleanHtml(html: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = html;

  // Remove script and style elements
  const scripts = temp.querySelectorAll("script, style, noscript, iframe, svg");
  scripts.forEach((el) => el.remove());

  // Normalize whitespace in text nodes
  const walker = document.createTreeWalker(temp, NodeFilter.SHOW_TEXT, null);

  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.trim()) {
      nodes.push(node as Text);
    }
  }

  return temp.innerHTML;
}

/**
 * Base abstract parser class
 * Provides common functionality for format-specific parsers
 */
export abstract class BaseBookParser implements BookParser {
  abstract parse(file: File): Promise<ParsedBook>;
  abstract supportsFormat(mimeType: string): boolean;

  /**
   * Get file metadata
   */
  protected getFileMetadata(file: File): { name: string; size: number; type: string } {
    return {
      name: sanitizeFilename(file.name),
      size: file.size,
      type: file.type,
    };
  }

  /**
   * Read file as text
   */
  protected readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /**
   * Read file as ArrayBuffer
   */
  protected readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Create chapter objects from titles
   */
  protected createChapters(bookId: string, titles: string[], hrefs?: string[]): Chapter[] {
    return titles.map((title, index) => ({
      id: generateId("ch"),
      bookId,
      title: title || `Chapter ${index + 1}`,
      href: hrefs?.[index],
      order: index,
    }));
  }

  /**
   * Detect chapters from content (fallback method)
   * Looks for common chapter patterns including Chinese novel formats
   */
  protected detectChapters(content: string): { title: string; start: number }[] {
    // Comprehensive patterns for Chinese and English novels
    const patterns: Array<{ pattern: RegExp; priority: number }> = [
      // Chinese patterns (highest priority for Chinese text)
      {
        // 第 X 章 / 第 X 节 / 第 X 卷 / 第 X 部 / 第 X 篇
        pattern:
          /^(?:第\s*)?[零〇一二三四五六七八九十百千万亿 0-9\d]+(?:章 | 节 | 卷 | 部 | 篇 | 集 | 回 | 话)[\s:：]*(.*)$/gm,
        priority: 1,
      },
      {
        // 楔子 / 序章 / 前言 / 引子 / 尾声 / 后记 / 番外
        pattern:
          /^(?:楔子 | 序章 | 前言 | 引子 | 楔子 | 开篇 | 尾声 | 后记 | 番外 | 终章 | 大结局 | 完结)[\s:：]*(.*)$/gm,
        priority: 2,
      },
      {
        // X、标题格式（如 "一、开始"）
        pattern: /^[零〇一二三四五六七八九十百千万亿 0-9\d]+[、.．]\s*(.+)$/gm,
        priority: 3,
      },
      {
        // Chapter/Section/Part with Roman or Arabic numerals
        pattern: /^#+\s*(?:Chapter|Section|Part|Book|Volume)\s+(\d+|[IVXLC]+)[:\s]*(.*)$/gim,
        priority: 4,
      },
      {
        // Standalone Chapter/Section/Part
        pattern: /^(?:Chapter|Section|Part)\s+(\d+|[IVXLC]+)[:\s]*(.*)$/gim,
        priority: 5,
      },
      {
        // Markdown headers (fallback)
        pattern: /^#{1,3}\s+(.+)$/gm,
        priority: 6,
      },
      {
        // All-caps chapter titles (English novels)
        pattern: /^(?:CHAPTER|BOOK|PART)\s+(?:[IVXLC\d]+[:\s]*)?(.+)$/gm,
        priority: 7,
      },
    ];

    const chapters: Array<{ title: string; start: number; priority: number }> = [];
    const seenTitles = new Set<string>();

    // Determine if content is primarily Chinese
    const isChineseContent = /[\u4e00-\u9fff]/.test(content.slice(0, 1000));

    // Try each pattern
    for (const { pattern, priority } of patterns) {
      // Skip English patterns for Chinese content if we already found chapters
      if (isChineseContent && priority >= 4 && chapters.length > 0) {
        continue;
      }

      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        let title = match[0].trim();

        // Skip very short titles (likely false positives)
        if (title.length < 2) {
          continue;
        }

        // Skip if we already have a very similar title
        const normalizedTitle = title.toLowerCase().replace(/\s+/g, " ");
        if (seenTitles.has(normalizedTitle)) {
          continue;
        }

        seenTitles.add(normalizedTitle);
        chapters.push({
          title,
          start: match.index,
          priority,
        });
      }
    }

    // Sort by position first, then by priority
    chapters.sort((a, b) => {
      if (Math.abs(a.start - b.start) > 100) {
        return a.start - b.start;
      }
      return a.priority - b.priority;
    });

    // Remove duplicates that are too close together
    const filtered: typeof chapters = [];
    for (let i = 0; i < chapters.length; i++) {
      const current = chapters[i];
      const prev = filtered[filtered.length - 1];

      // Skip if too close to previous chapter (within 50 chars)
      if (!prev || current.start - prev.start > 50) {
        filtered.push(current);
      }
    }

    return filtered.map(({ title, start }) => ({ title, start }));
  }

  /**
   * Split content by detected chapters
   */
  protected splitByChapters(
    content: string,
    chapters: { title: string; start: number }[],
  ): Map<string, string> {
    const result = new Map<string, string>();

    if (chapters.length === 0) {
      // No chapters detected, treat as single chapter
      const id = generateId("ch");
      result.set(id, content);
      return result;
    }

    // Sort chapters by position
    chapters.sort((a, b) => a.start - b.start);

    for (let i = 0; i < chapters.length; i++) {
      const current = chapters[i];
      const next = chapters[i + 1];
      let chapterContent = next
        ? content.slice(current.start, next.start).trim()
        : content.slice(current.start).trim();

      // Remove the chapter title line from the content (it will be displayed separately)
      const titleLine = current.title.split("\n")[0].trim();
      if (chapterContent.startsWith(titleLine)) {
        chapterContent = chapterContent.slice(titleLine.length).trim();
        // Also remove any following blank lines
        chapterContent = chapterContent.replace(/^\n+/, "");
      }

      const id = generateId("ch");
      result.set(id, chapterContent);
    }

    return result;
  }
}
