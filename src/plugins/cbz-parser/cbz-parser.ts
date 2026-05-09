import type { FileEntry } from "@zip.js/zip.js";
import type { BookParser, ParsedBook, Chapter, Resource } from "../../core/types";
import { ErrorCode, createReaderError } from "../../core/errors";
import { BaseBookParser, generateId } from "../../core/base";
import { STORES, dbPut, dbGet } from "../../storage/db";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return map[ext.toLowerCase()] || "image/jpeg";
}

async function getZipModule() {
  const mod = await import("@zip.js/zip.js");
  return {
    ZipReader: mod.ZipReader,
    Uint8ArrayReader: mod.Uint8ArrayReader,
    BlobWriter: mod.BlobWriter,
  };
}

export class CbzParser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "application/vnd.comicbook+zip",
    "application/x-cbz",
    "application/zip",
  ];

  readonly format = "cbz";

  supportsFormat(mimeType: string): boolean {
    return CbzParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  // ── Format-specific lifecycle ──

  async saveResources(bookId: string, resources: Map<string, ArrayBuffer>): Promise<void> {
    for (const [resourceId, data] of resources) {
      const ext = resourceId.split(".").pop() || "jpg";
      const resource: Resource = {
        bookId,
        resourceId,
        data,
        mimeType: getMimeType(ext),
        type: "image",
      };
      await dbPut(STORES.RESOURCES, resource);
    }
  }

  async saveRawData(bookId: string, rawData: ArrayBuffer, fileSize: number): Promise<void> {
    const { saveZip } = await import("../epub/zips");
    await saveZip(bookId, rawData, fileSize);
  }

  async loadChapterContent(
    bookId: string,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;

    // Check cache first
    const stored = await dbGet<Resource>(STORES.RESOURCES, [bookId, chapter.href]);
    if (stored) {
      const url = URL.createObjectURL(new Blob([stored.data], { type: stored.mimeType }));
      return CbzParser.pageToHtml(url);
    }

    const { getZip } = await import("../epub/zips");
    const zipData = await getZip(bookId);
    if (!zipData) return undefined;

    try {
      const data = await CbzParser.extractImage(zipData, chapter.href);
      if (!data) return undefined;

      const ext = chapter.href.split(".").pop() || "jpg";
      const mimeType = getMimeType(ext);
      const url = URL.createObjectURL(new Blob([data], { type: mimeType }));

      // Cache extracted image
      const resource: Resource = {
        bookId,
        resourceId: chapter.href,
        data,
        mimeType,
        type: "image",
      };
      await dbPut(STORES.RESOURCES, resource).catch(() => {});

      return CbzParser.pageToHtml(url);
    } catch (err) {
      console.error("[CBZ Parser] Failed to extract image:", err);
      return undefined;
    }
  }

  async resolveResourceUrl(bookId: string, path: string): Promise<string | null> {
    const stored = await dbGet<Resource>(STORES.RESOURCES, [bookId, path]);
    if (stored) {
      return URL.createObjectURL(new Blob([stored.data], { type: stored.mimeType }));
    }

    const { getZip } = await import("../epub/zips");
    const zipData = await getZip(bookId);
    if (!zipData) return null;

    try {
      const data = await CbzParser.extractImage(zipData, path);
      if (!data) return null;
      const ext = path.split(".").pop() || "jpg";
      return URL.createObjectURL(new Blob([data], { type: getMimeType(ext) }));
    } catch {
      return null;
    }
  }

  revokeResourceUrls(urls: Map<string, string>): void {
    for (const [, url] of urls) {
      URL.revokeObjectURL(url);
    }
  }

  // ── Phase 1: Parse ──

  async parse(file: File): Promise<ParsedBook> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const { ZipReader, Uint8ArrayReader, BlobWriter } = await getZipModule();
    const zipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(arrayBuffer)));

    try {
      const entries = await zipReader.getEntries();
      const imageEntries = entries
        .filter((entry): entry is FileEntry => {
          if (entry.directory) return false;
          const ext = entry.filename.split(".").pop()?.toLowerCase();
          return ext ? IMAGE_EXTENSIONS.has(ext) : false;
        })
        .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

      if (imageEntries.length === 0) {
        throw createReaderError(
          "CBZ has an unsupported format: no image files found",
          ErrorCode.PARSE_FAILED,
        );
      }

      const bookId = generateId("book");
      const title = file.name.replace(/\.cbz$/i, "") || "Untitled";

      const chapters: Chapter[] = imageEntries.map((entry, i) => ({
        id: generateId("ch"),
        bookId,
        title:
          entry.filename
            .split("/")
            .pop()
            ?.replace(/\.[^.]+$/, "") || `Page ${i + 1}`,
        href: entry.filename,
        order: i,
      }));

      // Extract first image as cover
      let coverUrl: string | undefined;
      const resources = new Map<string, ArrayBuffer>();
      const firstEntry = imageEntries[0];
      const coverData = await firstEntry.getData(new BlobWriter());
      if (coverData) {
        coverUrl = firstEntry.filename;
        resources.set(firstEntry.filename, await (coverData as Blob).arrayBuffer());
      }

      const book = {
        id: bookId,
        title,
        author: "Unknown Author",
        coverUrl,
        format: "cbz" as const,
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
   * Extract a single image from raw CBZ data.
   */
  private static async extractImage(
    rawData: ArrayBuffer,
    path: string,
  ): Promise<ArrayBuffer | undefined> {
    const { ZipReader, Uint8ArrayReader, BlobWriter } = await getZipModule();
    const zipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(rawData)));
    try {
      const entries = await zipReader.getEntries();
      const entry = entries.find((e) => !e.directory && e.filename === path);
      if (!entry) return undefined;
      const blob = await (entry as FileEntry).getData(new BlobWriter());
      return (blob as Blob).arrayBuffer();
    } finally {
      await zipReader.close();
    }
  }

  private static pageToHtml(imageUrl: string): string {
    return `<html style="height:100%;margin:0"><body style="height:100%;margin:0;display:flex;align-items:center;justify-content:center"><img src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain;display:block"></body></html>`;
  }
}
