// EPUB file parser implementation using @zip.js/zip.js for streaming extraction

import { ZipReader, TextWriter, Uint8ArrayReader } from "@zip.js/zip.js";
import type { Entry, FileEntry } from "@zip.js/zip.js";
import { BaseBookParser, generateId, parseXML, cleanHtml } from "./base";
import type { BookParser, ParsedBook, Chapter } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";

interface EpubMetadata {
  title: string;
  creator: string;
  language?: string;
  coverHref?: string;
}

interface EpubNavItem {
  id: string;
  href: string;
  title: string;
  order: number;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

interface ZipContext {
  reader: ZipReader<unknown>;
  entries: Entry[];
  pathMap: Map<string, FileEntry>;
}

export class EpubParser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = ["application/epub+zip", "application/x-epub+zip"];

  supportsFormat(mimeType: string): boolean {
    return EpubParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  /**
   * Build a case-insensitive path lookup map from zip entries
   */
  private static buildEntryMap(entries: Entry[]): Map<string, FileEntry> {
    const map = new Map<string, FileEntry>();
    for (const entry of entries) {
      if (!entry.directory) {
        map.set(entry.filename.toLowerCase(), entry);
      }
    }
    return map;
  }

  /**
   * Resolve a relative path against a base directory, handling ../ segments
   */
  private static resolvePath(base: string, relative: string): string {
    if (relative.startsWith("/")) return relative.slice(1);
    const parts = (base + relative).split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") {
        stack.pop();
      } else if (part && part !== ".") {
        stack.push(part);
      }
    }
    return stack.join("/");
  }

  /**
   * Phase 1: Parse metadata only. Returns ParsedBook with empty content/resources (except cover).
   * The raw zip ArrayBuffer is stored in rawData for lazy extraction.
   */
  async parse(file: File): Promise<ParsedBook> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const zipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(arrayBuffer)));

    try {
      const entries = await zipReader.getEntries();
      const pathMap = EpubParser.buildEntryMap(entries);
      const ctx: ZipContext = { reader: zipReader, entries, pathMap };

      // Read container.xml
      const containerXml = await this.readZipEntry(ctx, "META-INF/container.xml");
      if (!containerXml) {
        throw createReaderError("Invalid EPUB: Missing container.xml", ErrorCode.PARSE_FAILED);
      }

      const containerDoc = parseXML(containerXml);
      const rawOpfPath =
        containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "OEBPS/content.opf";

      // Read content.opf
      const opfDir = rawOpfPath.substring(0, rawOpfPath.lastIndexOf("/") + 1);
      const opfXml = await this.readZipEntry(ctx, rawOpfPath);
      if (!opfXml) {
        throw createReaderError("Invalid EPUB: Missing content.opf", ErrorCode.PARSE_FAILED);
      }

      const opfDoc = parseXML(opfXml);

      // Extract metadata
      const metadata = this.extractMetadata(opfDoc);

      // Extract spine
      const spineItems = this.extractSpine(opfDoc);

      // Extract TOC (nav/NCX)
      const navItems = await this.extractToc(ctx, opfDoc, opfDir);

      // Build chapters (metadata only, no content)
      const bookId = generateId("book");
      const chapters: Chapter[] = [];
      const tocMap = new Map(navItems.map((item) => [item.href, item]));

      let order = 0;
      for (const item of spineItems) {
        const fullPath = EpubParser.resolvePath(opfDir, item.href);
        const tocItem = tocMap.get(item.href) || tocMap.get(fullPath);

        if (tocItem) {
          chapters.push({
            id: tocItem.id,
            bookId,
            title: tocItem.title,
            href: fullPath,
            order,
            inToc: true,
          });
        } else {
          const chapterId = generateId("ch");
          chapters.push({
            id: chapterId,
            bookId,
            title: item.id || `Chapter ${order + 1}`,
            href: fullPath,
            order,
            inToc: false,
          });
        }
        order++;
      }

      // Extract cover image eagerly (for bookshelf display)
      const resources = new Map<string, ArrayBuffer>();
      if (metadata.coverHref) {
        const coverFullPath = EpubParser.resolvePath(opfDir, metadata.coverHref);
        const coverData = await this.readZipEntryBinary(ctx, coverFullPath);
        if (coverData) {
          resources.set(metadata.coverHref, coverData);
        }
      }

      const book = {
        id: bookId,
        title: metadata.title,
        author: metadata.creator,
        coverUrl: metadata.coverHref,
        format: "epub" as const,
        fileSize: file.size,
        addedAt: Date.now(),
      };

      return {
        book,
        chapters,
        content: new Map(),
        resources,
        rawData: arrayBuffer,
      };
    } finally {
      await zipReader.close();
    }
  }

  /**
   * Find an entry by path, trying exact match then basename fallback.
   */
  private static findEntry(pathMap: Map<string, FileEntry>, path: string): FileEntry | undefined {
    const decodedPath = decodeURIComponent(path);
    const direct = pathMap.get(decodedPath.toLowerCase());
    if (direct) return direct;

    // Basename fallback for paths that differ across OPF dirs
    const basename = decodedPath.split("/").pop()?.toLowerCase();
    if (!basename) return undefined;

    for (const [key, entry] of pathMap) {
      if (key.endsWith("/" + basename) || key === basename) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Phase 2: Extract a single chapter's HTML content from raw zip data.
   * Used by the storage layer for lazy extraction.
   */
  static async extractChapterContent(rawData: ArrayBuffer, chapterHref: string): Promise<string> {
    const zipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(rawData)));
    try {
      const entries = await zipReader.getEntries();
      const pathMap = EpubParser.buildEntryMap(entries);
      const entry = EpubParser.findEntry(pathMap, chapterHref);

      if (!entry) {
        throw createReaderError(
          `Chapter not found in EPUB: ${chapterHref}`,
          ErrorCode.CHAPTER_NOT_FOUND,
        );
      }

      const html = await entry.getData(new TextWriter());
      return cleanHtml(html);
    } finally {
      await zipReader.close();
    }
  }

  /**
   * Phase 2: Extract a single resource's binary data from raw zip data.
   * Used by the storage layer for lazy resource extraction.
   */
  static async extractResource(rawData: ArrayBuffer, resourceHref: string): Promise<ArrayBuffer> {
    const zipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(rawData)));
    try {
      const entries = await zipReader.getEntries();
      const pathMap = EpubParser.buildEntryMap(entries);
      const entry = EpubParser.findEntry(pathMap, resourceHref);

      if (!entry) {
        throw createReaderError(
          `Resource not found in EPUB: ${resourceHref}`,
          ErrorCode.PARSE_FAILED,
        );
      }

      return await entry.arrayBuffer();
    } finally {
      await zipReader.close();
    }
  }

  private async readZipEntry(ctx: ZipContext, path: string): Promise<string | null> {
    try {
      const entry = EpubParser.findEntry(ctx.pathMap, path);
      if (!entry) return null;
      return await entry.getData(new TextWriter());
    } catch {
      return null;
    }
  }

  private async readZipEntryBinary(ctx: ZipContext, path: string): Promise<ArrayBuffer | null> {
    try {
      const entry = EpubParser.findEntry(ctx.pathMap, path);
      if (!entry) return null;
      return await entry.arrayBuffer();
    } catch {
      return null;
    }
  }

  private extractMetadata(opfDoc: Document): EpubMetadata {
    const metadataEl = opfDoc.querySelector("metadata");
    if (!metadataEl) {
      throw createReaderError("Invalid EPUB: Missing metadata", ErrorCode.PARSE_FAILED);
    }

    const title = metadataEl.querySelector("dc\\:title, title")?.textContent?.trim() || "Untitled";

    const creator =
      metadataEl.querySelector("dc\\:creator, creator")?.textContent?.trim() || "Unknown Author";

    const language =
      metadataEl.querySelector("dc\\:language, language")?.textContent?.trim() || undefined;

    // Try to find cover image via meta[name="cover"] (EPUB 2 / 3)
    const coverMeta = metadataEl.querySelector('meta[name="cover"]');
    const coverId = coverMeta?.getAttribute("content");

    let coverHref: string | undefined;
    if (coverId) {
      const manifestItem = opfDoc.querySelector(`manifest item[id="${coverId}"]`);
      coverHref = manifestItem?.getAttribute("href") || undefined;
    }

    // Fallback: look for manifest item with properties="cover-image" (EPUB 3)
    if (!coverHref) {
      const coverImageItem = opfDoc.querySelector('manifest item[properties="cover-image"]');
      coverHref = coverImageItem?.getAttribute("href") || undefined;
    }

    return { title, creator, language, coverHref };
  }

  private extractManifest(opfDoc: Document): Map<string, ManifestItem> {
    const manifest = new Map<string, ManifestItem>();

    opfDoc.querySelectorAll("manifest item").forEach((item) => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      const mediaType = item.getAttribute("media-type") || "";
      const properties = item.getAttribute("properties") || undefined;

      if (id && href) {
        manifest.set(id, { id, href, mediaType, properties });
      }
    });

    return manifest;
  }

  private extractSpine(opfDoc: Document): Array<{ id: string; href: string }> {
    const spine = opfDoc.querySelector("spine");
    if (!spine) {
      throw createReaderError("Invalid EPUB: Missing spine", ErrorCode.PARSE_FAILED);
    }

    const items = spine.querySelectorAll("itemref");
    const manifest = this.extractManifest(opfDoc);

    const result: Array<{ id: string; href: string }> = [];
    items.forEach((itemref) => {
      const idref = itemref.getAttribute("idref");
      if (idref) {
        const href = manifest.get(idref)?.href;
        if (href) {
          result.push({ id: idref, href });
        }
      }
    });

    return result;
  }

  private async extractToc(
    ctx: ZipContext,
    opfDoc: Document,
    opfDir: string,
  ): Promise<EpubNavItem[]> {
    // Try EPUB 3 navigation document first
    const navItem = opfDoc.querySelector('manifest item[properties*="nav"]');
    if (navItem) {
      const navHref = navItem.getAttribute("href");
      if (navHref) {
        const fullPath = EpubParser.resolvePath(opfDir, navHref);
        const navContent = await this.readZipEntry(ctx, fullPath);
        if (navContent) {
          return this.parseNavDocument(navContent);
        }
      }
    }

    // Fall back to NCX (EPUB 2)
    const ncxItem = opfDoc.querySelector('manifest item[media-type="application/x-dtbncx+xml"]');
    if (ncxItem) {
      const ncxHref = ncxItem.getAttribute("href");
      if (ncxHref) {
        const fullPath = EpubParser.resolvePath(opfDir, ncxHref);
        const ncxContent = await this.readZipEntry(ctx, fullPath);
        if (ncxContent) {
          return this.parseNcx(ncxContent);
        }
      }
    }

    return [];
  }

  private parseNavDocument(navContent: string): EpubNavItem[] {
    const doc = parseXML(navContent, "text/html");
    const items: EpubNavItem[] = [];

    const navElements = doc.querySelectorAll('nav[epub\\:type="toc"] ol li, nav ol li');
    navElements.forEach((el, index) => {
      const a = el.querySelector("a");
      if (a) {
        const href = a.getAttribute("href") || "";
        const title = a.textContent?.trim() || `Chapter ${index + 1}`;
        const hrefWithoutFragment = href.split("#")[0];

        items.push({
          id: generateId("ch"),
          href: hrefWithoutFragment,
          title,
          order: index,
        });
      }
    });

    return items;
  }

  private parseNcx(ncxContent: string): EpubNavItem[] {
    const doc = parseXML(ncxContent);
    const items: EpubNavItem[] = [];

    const navPoints = doc.querySelectorAll("navPoint");
    navPoints.forEach((np, index) => {
      const label = np.querySelector("ncx\\:navLabel ncx\\:text, navLabel text");
      const content = np.querySelector("ncx\\:content, content");

      const title = label?.textContent?.trim() || `Chapter ${index + 1}`;
      const src = content?.getAttribute("src") || "";
      const href = src.split("#")[0];

      items.push({
        id: np.getAttribute("id") || generateId("ch"),
        href,
        title,
        order: index,
      });
    });

    return items;
  }
}
