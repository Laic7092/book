import type { Entry, FileEntry, ZipReader } from "@zip.js/zip.js";
import { generateId, readAsArrayBuffer, parseXML } from "../base";
import { cleanHtml } from "./html-cleaner";
import type { BookParser, ParserResult, ChapterData } from "../types";

let _zipModule: typeof import("@zip.js/zip.js") | null = null;
async function getZipModule() {
  if (!_zipModule) _zipModule = await import("@zip.js/zip.js");
  return _zipModule;
}

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

interface CachedZipData {
  entries: Entry[];
  pathMap: Map<string, FileEntry>;
}

export class EpubParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = ["application/epub+zip", "application/x-epub+zip"];

  readonly format = "epub" as const;

  private _entriesCache = new WeakMap<ArrayBuffer, CachedZipData>();

  supportsFormat(mimeType: string): boolean {
    return EpubParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  private async _getZipEntries(rawData: ArrayBuffer): Promise<CachedZipData> {
    const cached = this._entriesCache.get(rawData);
    if (cached) return cached;

    const { ZipReader: ZR, Uint8ArrayReader: UAR } = await getZipModule();
    const zipReader = new ZR(new UAR(new Uint8Array(rawData)));
    try {
      const entries = await zipReader.getEntries();
      const pathMap = EpubParser.buildEntryMap(entries);
      const result: CachedZipData = { entries, pathMap };
      this._entriesCache.set(rawData, result);
      return result;
    } finally {
      await zipReader.close();
    }
  }

  async extractChapterContent(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;

    try {
      const { pathMap } = await this._getZipEntries(rawData);
      const entry = EpubParser.findEntry(pathMap, chapter.href);
      if (!entry) return undefined;

      const { TextWriter: TW } = await getZipModule();
      const html = await entry.getData(new TW());
      return cleanHtml(html);
    } catch {
      return undefined;
    }
  }

  async extractResource(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined> {
    try {
      const { pathMap } = await this._getZipEntries(rawData);
      const entry = EpubParser.findEntry(pathMap, path);
      if (!entry) return undefined;
      return await entry.arrayBuffer();
    } catch {
      return undefined;
    }
  }

  private static buildEntryMap(entries: Entry[]): Map<string, FileEntry> {
    const map = new Map<string, FileEntry>();
    for (const entry of entries) {
      if (!entry.directory) {
        map.set(entry.filename.toLowerCase(), entry);
      }
    }
    return map;
  }

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

  async parse(file: File): Promise<ParserResult> {
    const arrayBuffer = await readAsArrayBuffer(file);
    const { ZipReader: ZR, Uint8ArrayReader: UAR } = await getZipModule();
    const zipReader = new ZR(new UAR(new Uint8Array(arrayBuffer)));

    try {
      const entries = await zipReader.getEntries();
      const pathMap = EpubParser.buildEntryMap(entries);
      const ctx: ZipContext = { reader: zipReader, entries, pathMap };

      const containerXml = await this.readZipEntry(ctx, "META-INF/container.xml");
      if (!containerXml) {
        throw new Error("Invalid EPUB: Missing container.xml");
      }

      const containerDoc = parseXML(containerXml);
      const rawOpfPath =
        containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "OEBPS/content.opf";

      const opfDir = rawOpfPath.substring(0, rawOpfPath.lastIndexOf("/") + 1);
      const opfXml = await this.readZipEntry(ctx, rawOpfPath);
      if (!opfXml) {
        throw new Error("Invalid EPUB: Missing content.opf");
      }

      const opfDoc = parseXML(opfXml);
      const metadata = this.extractMetadata(opfDoc);
      const spineItems = this.extractSpine(opfDoc);
      const navItems = await this.extractToc(ctx, opfDoc, opfDir);

      const bookId = generateId("book");
      const chapters: ChapterData[] = [];
      const tocMap = new Map(navItems.map((item) => [item.href, item]));

      let order = 0;
      for (const item of spineItems) {
        const fullPath = EpubParser.resolvePath(opfDir, item.href);
        const tocItem = tocMap.get(item.href) || tocMap.get(fullPath);

        if (tocItem) {
          chapters.push({
            id: tocItem.id,
            title: tocItem.title,
            href: fullPath,
            order,
          });
        } else {
          const chapterId = generateId("ch");
          chapters.push({
            id: chapterId,
            title: item.id || `Chapter ${order + 1}`,
            href: fullPath,
            order,
          });
        }
        order++;
      }

      const resources = new Map<string, ArrayBuffer>();
      if (metadata.coverHref) {
        const coverFullPath = EpubParser.resolvePath(opfDir, metadata.coverHref);
        const coverData = await this.readZipEntryBinary(ctx, coverFullPath);
        if (coverData) {
          resources.set(metadata.coverHref, coverData);
        }
      }

      return {
        id: bookId,
        title: metadata.title,
        author: metadata.creator,
        coverUrl: metadata.coverHref,
        chapters,
        content: new Map(),
        resources,
        rawData: arrayBuffer,
      };
    } finally {
      await zipReader.close();
    }
  }

  private static findEntry(pathMap: Map<string, FileEntry>, path: string): FileEntry | undefined {
    const decodedPath = decodeURIComponent(path);
    const direct = pathMap.get(decodedPath.toLowerCase());
    if (direct) return direct;

    const basename = decodedPath.split("/").pop()?.toLowerCase();
    if (!basename) return undefined;

    for (const [key, entry] of pathMap) {
      if (key.endsWith("/" + basename) || key === basename) {
        return entry;
      }
    }
    return undefined;
  }

  private async readZipEntry(ctx: ZipContext, path: string): Promise<string | null> {
    try {
      const entry = EpubParser.findEntry(ctx.pathMap, path);
      if (!entry) return null;
      const { TextWriter: TW } = await getZipModule();
      return await entry.getData(new TW());
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
      throw new Error("Invalid EPUB: Missing metadata");
    }

    const title = metadataEl.querySelector("dc\\:title, title")?.textContent?.trim() || "Untitled";
    const creator =
      metadataEl.querySelector("dc\\:creator, creator")?.textContent?.trim() || "Unknown Author";
    const language =
      metadataEl.querySelector("dc\\:language, language")?.textContent?.trim() || undefined;

    const coverMeta = metadataEl.querySelector('meta[name="cover"]');
    const coverId = coverMeta?.getAttribute("content");

    let coverHref: string | undefined;
    if (coverId) {
      const manifestItem = opfDoc.querySelector(`manifest item[id="${coverId}"]`);
      coverHref = manifestItem?.getAttribute("href") || undefined;
    }

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
      throw new Error("Invalid EPUB: Missing spine");
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
