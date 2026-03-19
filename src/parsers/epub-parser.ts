// EPUB file parser implementation using JSZip

import JSZip from "jszip";
import { BaseBookParser, generateId, parseXML, cleanHtml } from "./base";
import type { BookParser, ParsedBook, Chapter } from "../core/types";

interface EpubMetadata {
  title: string;
  creator: string;
  coverHref?: string;
}

interface EpubNavItem {
  id: string;
  href: string;
  title: string;
  order: number;
}

export class EpubParser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = ["application/epub+zip", "application/x-epub+zip"];

  supportsFormat(mimeType: string): boolean {
    return EpubParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParsedBook> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Read container.xml to find content.opf
    const containerXml = await this.readZipEntry(zip, "META-INF/container.xml");
    if (!containerXml) {
      throw new Error("Invalid EPUB: Missing container.xml");
    }

    const containerDoc = parseXML(containerXml);
    const opfPath =
      containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "OEBPS/content.opf";

    // Read content.opf for metadata and spine
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);
    const opfXml = await this.readZipEntry(zip, opfPath);
    if (!opfXml) {
      throw new Error("Invalid EPUB: Missing content.opf");
    }

    const opfDoc = parseXML(opfXml);

    // Extract metadata
    const metadata = this.extractMetadata(opfDoc);

    // Extract spine (reading order)
    const spineItems = this.extractSpine(opfDoc);

    // Extract NCX or Nav document for TOC
    const navItems = await this.extractToc(zip, opfDoc, opfDir);

    // Map spine items to chapters
    const bookId = generateId("book");
    const chapters: Chapter[] = [];
    const content = new Map<string, string>();

    // Use NCX/nav for titles if available, but always use spine order
    const tocMap = new Map(navItems.map((item) => [item.href, item]));

    let order = 0;
    for (const item of spineItems) {
      const fullPath = opfDir + item.href;
      const tocItem = tocMap.get(item.href) || tocMap.get(fullPath);

      if (tocItem) {
        // Use TOC title but spine order
        chapters.push({
          id: tocItem.id,
          bookId,
          title: tocItem.title,
          href: item.href,
          order: order, // Use spine order, not TOC order
        });
      } else {
        const chapterId = generateId("ch");
        chapters.push({
          id: chapterId,
          bookId,
          title: item.id || `Chapter ${order + 1}`,
          href: item.href,
          order,
        });
      }
      order++;
    }

    // Read chapter content
    for (const chapter of chapters) {
      if (chapter.href) {
        const fullPath = opfDir + chapter.href;
        const htmlContent = await this.readZipEntry(zip, fullPath);
        if (htmlContent) {
          const cleanedContent = cleanHtml(htmlContent);
          content.set(chapter.id, cleanedContent);
        }
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
      content,
    };
  }

  private async readZipEntry(zip: JSZip, path: string): Promise<string | null> {
    try {
      const entry = zip.file(path);
      if (!entry) {
        // Try case-insensitive search
        const files = Object.keys(zip.files);
        const found = files.find((f) => f.toLowerCase() === path.toLowerCase());
        if (found) {
          return await zip.file(found)!.async("text");
        }
        return null;
      }
      return await entry.async("text");
    } catch {
      return null;
    }
  }

  private extractMetadata(opfDoc: Document): EpubMetadata {
    const metadataEl = opfDoc.querySelector("metadata");
    if (!metadataEl) {
      throw new Error("Invalid EPUB: Missing metadata");
    }

    const title = metadataEl.querySelector("dc\\:title, title")?.textContent || "Untitled";

    const creator =
      metadataEl.querySelector("dc\\:creator, creator")?.textContent || "Unknown Author";

    // Try to find cover image
    const coverMeta = metadataEl.querySelector('meta[name="cover"]');
    const coverId = coverMeta?.getAttribute("content");

    let coverHref: string | undefined;
    if (coverId) {
      const manifestItem = opfDoc.querySelector(`manifest item[id="${coverId}"]`);
      coverHref = manifestItem?.getAttribute("href") || undefined;
    }

    return { title, creator, coverHref };
  }

  private extractSpine(opfDoc: Document): Array<{ id: string; href: string }> {
    const spine = opfDoc.querySelector("spine");
    if (!spine) {
      throw new Error("Invalid EPUB: Missing spine");
    }

    const items = spine.querySelectorAll("itemref");
    const manifest = new Map<string, string>();

    // Build manifest map
    opfDoc.querySelectorAll("manifest item").forEach((item) => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (id && href) {
        manifest.set(id, href);
      }
    });

    const result: Array<{ id: string; href: string }> = [];
    items.forEach((itemref) => {
      const idref = itemref.getAttribute("idref");
      if (idref) {
        const href = manifest.get(idref);
        if (href) {
          result.push({ id: idref, href });
        }
      }
    });

    return result;
  }

  private async extractToc(zip: JSZip, opfDoc: Document, opfDir: string): Promise<EpubNavItem[]> {
    // Try EPUB 3 navigation document first
    const navItem = opfDoc.querySelector('manifest item[properties*="nav"]');
    if (navItem) {
      const navHref = navItem.getAttribute("href");
      if (navHref) {
        const navContent = await this.readZipEntry(zip, opfDir + navHref);
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
        const ncxContent = await this.readZipEntry(zip, opfDir + ncxHref);
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
        // Remove fragment identifier for matching
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
      const label = np.querySelector("navLabel text");
      const content = np.querySelector("content");

      const title = label?.textContent?.trim() || `Chapter ${index + 1}`;
      const src = content?.getAttribute("src") || "";
      // Remove fragment identifier for matching
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
