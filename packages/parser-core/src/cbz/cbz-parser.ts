import type { FileEntry } from "@zip.js/zip.js";
import { generateId, readAsArrayBuffer } from "../base";
import { getMimeType, getZipModule, pageToHtml } from "../shared";
import type { BookParser, ParserResult, ChapterData, StreamingParseEvent } from "../types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

export class CbzParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "application/vnd.comicbook+zip",
    "application/x-cbz",
    "application/zip",
  ];

  readonly format = "cbz";

  supportsFormat(mimeType: string): boolean {
    return CbzParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async extractChapterContent(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;

    try {
      const data = await CbzParser.extractImage(rawData, chapter.href);
      if (!data) return undefined;

      const ext = chapter.href.split(".").pop() || "jpg";
      const mimeType = getMimeType(ext, "image/jpeg");
      const url = URL.createObjectURL(new Blob([data], { type: mimeType }));

      return pageToHtml(url);
    } catch {
      return undefined;
    }
  }

  async extractResource(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined> {
    try {
      return await CbzParser.extractImage(rawData, path);
    } catch {
      return undefined;
    }
  }

  async *parseStreaming(file: File): AsyncGenerator<StreamingParseEvent> {
    const { ZipReader, BlobReader } = await getZipModule();
    const zipReader = new ZipReader(new BlobReader(file));

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
        throw new Error("CBZ has an unsupported format: no image files found");
      }

      const bookId = generateId("book");
      const title = file.name.replace(/\.cbz$/i, "") || "Untitled";
      const coverUrl = imageEntries[0].filename;

      yield {
        type: "metadata",
        id: bookId,
        title,
        author: "Unknown Author",
        coverUrl,
      };

      for (let i = 0; i < imageEntries.length; i++) {
        const entry = imageEntries[i];
        yield {
          type: "chapter",
          chapter: {
            id: generateId("ch"),
            title:
              entry.filename
                .split("/")
                .pop()
                ?.replace(/\.[^.]+$/, "") || `Page ${i + 1}`,
            href: entry.filename,
            order: i,
          },
        };
      }

      let coverData: ArrayBuffer | undefined;
      const firstEntry = imageEntries[0];
      try {
        coverData = await firstEntry.arrayBuffer();
      } catch {
        /* cover non-critical */
      }

      yield { type: "done", coverData };
    } finally {
      await zipReader.close();
    }
  }

  async parse(file: File): Promise<ParserResult> {
    const arrayBuffer = await readAsArrayBuffer(file);
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
        throw new Error("CBZ has an unsupported format: no image files found");
      }

      const bookId = generateId("book");
      const title = file.name.replace(/\.cbz$/i, "") || "Untitled";

      const chapters: ChapterData[] = imageEntries.map((entry, i) => ({
        id: generateId("ch"),
        title:
          entry.filename
            .split("/")
            .pop()
            ?.replace(/\.[^.]+$/, "") || `Page ${i + 1}`,
        href: entry.filename,
        order: i,
      }));

      let coverUrl: string | undefined;
      const resources = new Map<string, ArrayBuffer>();
      const firstEntry = imageEntries[0];
      const coverData = await firstEntry.getData(new BlobWriter());
      if (coverData) {
        coverUrl = firstEntry.filename;
        resources.set(firstEntry.filename, await (coverData as Blob).arrayBuffer());
      }

      return {
        id: bookId,
        title,
        author: "Unknown Author",
        coverUrl,
        chapters,
        content: new Map(),
        resources,
        rawData: arrayBuffer,
      };
    } finally {
      await zipReader.close();
    }
  }

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
}
