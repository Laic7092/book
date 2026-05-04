// Base parser interface and utilities

import type { BookParser, ParsedBook, Chapter } from "./types";
import { ErrorCode, createReaderError } from "./errors";

/**
 * Generate a unique ID
 */
export function generateId(prefix = ""): string {
  const id = crypto.randomUUID().replace(/-/g, "");
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
    throw createReaderError(`XML parse error: ${parseError.textContent}`, ErrorCode.PARSE_FAILED);
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
 * Sanitize resource-loading attributes to prevent browser from fetching
 * external resources during HTML parsing. Prefixes attribute names with
 * an underscore (e.g. src → _src, href → _href).
 */
function sanitizeResourceAttrs(html: string): string {
  return html
    .replace(
      /(<(?:img|image|video|audio|source|embed|iframe|script)\s[^>]*?)\b(src|srcset|poster)\s*=/gi,
      "$1_$2=",
    )
    .replace(/(<link\s[^>]*?)\b(href)\s*=/gi, "$1_$2=")
    .replace(/(<object\s[^>]*?)\b(data)\s*=/gi, "$1_$2=")
    .replace(/(<svg:image\s[^>]*?)\b(xlink:href|href)\s*=/gi, "$1_$2=")
    .replace(/(<style[^>]*>[\s\S]*?)@import\b/gi, "$1/* @import */");
}

/**
 * Restore resource-loading attributes that were previously sanitized.
 */
function restoreResourceAttrs(html: string): string {
  return html
    .replace(
      /(<(?:img|image|video|audio|source|embed|iframe|script)\s[^>]*?)\b_(src|srcset|poster)\s*=/gi,
      "$1$2=",
    )
    .replace(/(<link\s[^>]*?)\b_(href)\s*=/gi, "$1$2=")
    .replace(/(<object\s[^>]*?)\b_(data)\s*=/gi, "$1$2=")
    .replace(/(<svg:image\s[^>]*?)\b_(xlink:href|href)\s*=/gi, "$1$2=")
    .replace(/(<style[^>]*>[\s\S]*?)\/\* @import \*\//gi, "$1@import");
}

/**
 * Apply shared DOM-based cleaning on a parsed document.
 * Works on both XML and HTML documents.
 */
function applyDomCleanup(doc: Document | HTMLElement): void {
  // Remove script, style, and noscript elements
  const removable = doc.querySelectorAll("script, style, noscript");
  removable.forEach((el) => el.remove());

  // Remove fixed width/height attributes from media elements
  const mediaElements = doc.querySelectorAll("img, svg, image, video, figure");
  mediaElements.forEach((el) => {
    if (el.tagName.toLowerCase() === "svg") {
      if (!el.getAttribute("viewBox")) {
        const width = el.getAttribute("width");
        const height = el.getAttribute("height");
        if (width && height) {
          const widthNum = parseFloat(width);
          const heightNum = parseFloat(height);
          if (!isNaN(widthNum) && !isNaN(heightNum)) {
            el.setAttribute("viewBox", `0 0 ${widthNum} ${heightNum}`);
          }
        }
      }
    }

    el.removeAttribute("width");
    el.removeAttribute("height");

    const style = el.getAttribute("style");
    if (style) {
      const cleanedStyle = style
        .split(";")
        .filter((prop) => {
          const trimmed = prop.trim().toLowerCase();
          return (
            !trimmed.startsWith("width:") &&
            !trimmed.startsWith("height:") &&
            !trimmed.startsWith("max-width:") &&
            !trimmed.startsWith("max-height:")
          );
        })
        .join(";")
        .trim();

      if (cleanedStyle) {
        el.setAttribute("style", cleanedStyle);
      } else {
        el.removeAttribute("style");
      }
    }
  });
}

/**
 * Split block elements that contain <br> children into separate elements
 * for CSS column performance. Browsers struggle to break a single monolithic
 * block across columns — each <br> becomes a natural column-break boundary.
 *
 * Processes deepest-first so nested structures are handled correctly.
 * Skips <pre> (whitespace-significant) and heading tags.
 */
function splitBrBlocks(root: Document | HTMLElement): void {
  const SKIP_TAGS = new Set(["pre", "code", "h1", "h2", "h3", "h4", "h5", "h6", "li"]);

  // Collect parent elements that have at least one direct <br> child
  const brs = root.querySelectorAll("br");
  const parents = new Set<Element>();
  for (const br of brs) {
    const p = br.parentElement;
    if (p && p !== root && !SKIP_TAGS.has(p.tagName.toLowerCase())) {
      parents.add(p);
    }
  }
  if (parents.size === 0) return;

  // Deepest first so inner splits complete before outer parents are processed
  const sorted = Array.from(parents).sort((a, b) => {
    let da = 0,
      db = 0;
    let na: Node | null = a,
      nb: Node | null = b;
    while (na) {
      da++;
      na = na.parentNode;
    }
    while (nb) {
      db++;
      nb = nb.parentNode;
    }
    return db - da;
  });

  for (const el of sorted) {
    const ownerDoc = el.ownerDocument!;
    const tag = el.tagName.toLowerCase();
    const fragment = ownerDoc.createDocumentFragment();
    let group: Node[] = [];
    let firstGroup = true;

    const flush = () => {
      const meaningful = group.filter((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          return n.textContent !== null && n.textContent.trim().length > 0;
        }
        return true;
      });
      if (meaningful.length > 0) {
        const clone = ownerDoc.createElement(tag);
        for (const attr of Array.from(el.attributes)) {
          if (attr.name === "id" && !firstGroup) continue;
          clone.setAttribute(attr.name, attr.value);
        }
        for (const n of meaningful) {
          clone.appendChild(n.cloneNode(true));
        }
        fragment.appendChild(clone);
        firstGroup = false;
      }
      group = [];
    };

    for (const child of Array.from(el.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).tagName.toLowerCase() === "br"
      ) {
        flush();
      } else {
        group.push(child);
      }
    }
    flush();

    el.replaceWith(fragment);
  }
}

/**
 * Clean HTML content for reading
 * - Removes scripts, styles
 * - Silently drops <html>, <head>, <body> wrapper elements
 * - Splits <br>-heavy blocks for CSS column performance
 * - Removes fixed width/height from media elements for responsive display
 *
 * Uses XML parsing first to avoid triggering external resource loading.
 * Falls back to HTML parsing with sanitized attributes if XML fails.
 */
export function cleanHtml(html: string): string {
  // Try XML parsing first — XML parser does NOT fetch external resources
  const xmlDoc = new DOMParser().parseFromString(html, "application/xhtml+xml");
  const hasXmlError = xmlDoc.querySelector("parsererror");

  if (!hasXmlError) {
    applyDomCleanup(xmlDoc);
    splitBrBlocks(xmlDoc);

    return xmlDoc.documentElement.innerHTML;
  }

  // XML parse failed — fallback to HTML mode with sanitized resource attributes
  const safeHtml = sanitizeResourceAttrs(html);

  const temp = document.createElement("div");
  temp.innerHTML = safeHtml;

  applyDomCleanup(temp);
  splitBrBlocks(temp);

  const result = temp.innerHTML;
  return restoreResourceAttrs(result);
}

/**
 * Base abstract parser class
 * Provides common functionality for format-specific parsers
 */
export abstract class BaseBookParser implements BookParser {
  abstract readonly format: BookParser["format"];
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
