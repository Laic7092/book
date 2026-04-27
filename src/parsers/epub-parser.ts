// EPUB file parser implementation using JSZip

import JSZip from "jszip";
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

export class EpubParser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = ["application/epub+zip", "application/x-epub+zip"];
  private static readonly RESOURCE_MIME_TYPES = new Set([
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/svg+xml",
    "image/webp",
    "image/bmp",
    // CSS
    "text/css",
    // Fonts
    "font/woff",
    "font/woff2",
    "font/ttf",
    "font/otf",
    "application/font-woff",
    "application/font-woff2",
    "application/vnd.ms-opentype",
    "application/x-font-ttf",
    "application/x-font-woff",
    "application/x-font-woff2",
  ]);

  supportsFormat(mimeType: string): boolean {
    return EpubParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  /**
   * Build a case-insensitive path lookup map from zip entries
   */
  private buildPathMap(zip: JSZip): Map<string, string> {
    const map = new Map<string, string>();
    for (const path of Object.keys(zip.files)) {
      map.set(path.toLowerCase(), path);
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

  async parse(file: File): Promise<ParsedBook> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Build case-insensitive path map once
    const pathMap = this.buildPathMap(zip);

    // Read container.xml to find content.opf
    const containerXml = await this.readZipEntry(zip, "META-INF/container.xml", pathMap);
    if (!containerXml) {
      throw createReaderError("Invalid EPUB: Missing container.xml", ErrorCode.PARSE_FAILED);
    }

    const containerDoc = parseXML(containerXml);
    const rawOpfPath =
      containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "OEBPS/content.opf";

    // Read content.opf for metadata and spine
    const opfDir = rawOpfPath.substring(0, rawOpfPath.lastIndexOf("/") + 1);
    const opfXml = await this.readZipEntry(zip, rawOpfPath, pathMap);
    if (!opfXml) {
      throw createReaderError("Invalid EPUB: Missing content.opf", ErrorCode.PARSE_FAILED);
    }

    const opfDoc = parseXML(opfXml);

    // Extract metadata
    const metadata = this.extractMetadata(opfDoc);

    // Extract spine (reading order)
    const spineItems = this.extractSpine(opfDoc);

    // Extract manifest for resource lookup
    const manifest = this.extractManifest(opfDoc);

    // Extract NCX or Nav document for TOC
    const navItems = await this.extractToc(zip, opfDoc, opfDir, pathMap);

    // Extract all resources (images, CSS, fonts) in parallel
    const resources = await this.extractResources(zip, opfDir, manifest, pathMap);

    // Map spine items to chapters
    const bookId = generateId("book");
    const chapters: Chapter[] = [];
    const content = new Map<string, string>();

    // Use NCX/nav for titles if available, but always use spine order
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
          href: item.href,
          order,
          inToc: true,
        });
      } else {
        const chapterId = generateId("ch");
        chapters.push({
          id: chapterId,
          bookId,
          title: item.id || `Chapter ${order + 1}`,
          href: item.href,
          order,
          inToc: false,
        });
      }
      order++;
    }

    // Read and process chapter content in parallel
    const chapterReadPromises: Promise<void>[] = [];
    for (const chapter of chapters) {
      if (chapter.href) {
        const fullPath = EpubParser.resolvePath(opfDir, chapter.href);
        const promise = this.readZipEntry(zip, fullPath, pathMap).then((htmlContent) => {
          if (htmlContent) {
            const cleanedContent = cleanHtml(htmlContent);
            content.set(chapter.id, cleanedContent);
          } else {
            console.warn(`EPUB parser: chapter content empty or unreadable: ${fullPath}`);
            content.set(chapter.id, "");
          }
        });
        chapterReadPromises.push(promise);
      }
    }
    await Promise.all(chapterReadPromises);

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
      content,
      resources,
    };
  }

  private async readZipEntry(
    zip: JSZip,
    path: string,
    pathMap?: Map<string, string>,
  ): Promise<string | null> {
    try {
      const decodedPath = decodeURIComponent(path);
      const resolvedPath = pathMap?.get(decodedPath.toLowerCase()) || decodedPath;
      const entry = zip.file(resolvedPath);
      if (!entry) return null;
      return await entry.async("text");
    } catch {
      return null;
    }
  }

  private async readZipEntryBinary(
    zip: JSZip,
    path: string,
    pathMap?: Map<string, string>,
  ): Promise<ArrayBuffer | null> {
    try {
      const decodedPath = decodeURIComponent(path);
      const resolvedPath = pathMap?.get(decodedPath.toLowerCase()) || decodedPath;
      const entry = zip.file(resolvedPath);
      if (!entry) return null;
      return await entry.async("arraybuffer");
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

  private async extractResources(
    zip: JSZip,
    opfDir: string,
    manifest: Map<string, ManifestItem>,
    pathMap: Map<string, string>,
  ): Promise<Map<string, ArrayBuffer>> {
    const resources = new Map<string, ArrayBuffer>();

    const readPromises: Promise<void>[] = [];
    for (const [, item] of manifest) {
      if (!this.isResourceMimeType(item.mediaType)) {
        continue;
      }

      const fullPath = EpubParser.resolvePath(opfDir, item.href);
      const promise = this.readZipEntryBinary(zip, fullPath, pathMap).then((data) => {
        if (data) {
          resources.set(item.href, data);
        }
      });
      readPromises.push(promise);
    }

    await Promise.all(readPromises);
    return resources;
  }

  private isResourceMimeType(mediaType: string): boolean {
    return EpubParser.RESOURCE_MIME_TYPES.has(mediaType.toLowerCase());
  }

  private async extractToc(
    zip: JSZip,
    opfDoc: Document,
    opfDir: string,
    pathMap: Map<string, string>,
  ): Promise<EpubNavItem[]> {
    // Try EPUB 3 navigation document first
    const navItem = opfDoc.querySelector('manifest item[properties*="nav"]');
    if (navItem) {
      const navHref = navItem.getAttribute("href");
      if (navHref) {
        const fullPath = EpubParser.resolvePath(opfDir, navHref);
        const navContent = await this.readZipEntry(zip, fullPath, pathMap);
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
        const ncxContent = await this.readZipEntry(zip, fullPath, pathMap);
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
