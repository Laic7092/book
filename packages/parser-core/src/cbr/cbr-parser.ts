import { generateId, readAsArrayBuffer } from "../base";
import { getMimeType, pageToHtml } from "../shared";
import type { BookParser, ParserResult, ChapterData } from "../types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

async function unrarAsync(
  data: ArrayBuffer,
): Promise<Array<{ filename: string; fileData: Uint8Array }>> {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const { default: unrar } = await import("unrar-js/lib/Unrar.js");
        resolve(unrar(data));
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
}

export class CbrParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "application/vnd.comicbook+rar",
    "application/x-cbr",
    "application/rar",
    "application/x-rar-compressed",
  ];

  readonly format = "cbr";

  supportsFormat(mimeType: string): boolean {
    return CbrParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParserResult> {
    const arrayBuffer = await readAsArrayBuffer(file);
    const files = await unrarAsync(arrayBuffer);

    const imageEntries = files
      .filter((f) => {
        const ext = f.filename.split(".").pop()?.toLowerCase();
        return ext ? IMAGE_EXTENSIONS.has(ext) : false;
      })
      .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

    if (imageEntries.length === 0) {
      throw new Error("CBR has an unsupported format: no image files found");
    }

    const bookId = generateId("book");
    const title = file.name.replace(/\.cbr$/i, "") || "Untitled";

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
    if (firstEntry) {
      coverUrl = firstEntry.filename;
      const { buffer, byteOffset, byteLength } = firstEntry.fileData;
      resources.set(
        firstEntry.filename,
        buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer,
      );
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
  }

  async extractChapterContent(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;

    const ext = chapter.href.split(".").pop() || "jpg";
    const mimeType = getMimeType(ext, "image/jpeg");

    try {
      const files = await unrarAsync(rawData);
      const entry = files.find((f) => f.filename === chapter.href);
      if (!entry?.fileData) return undefined;

      const { buffer, byteOffset, byteLength } = entry.fileData;
      const blob = new Blob([buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer], {
        type: mimeType,
      });
      const url = URL.createObjectURL(blob);
      return pageToHtml(url);
    } catch {
      return undefined;
    }
  }

  async extractResource(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined> {
    try {
      const files = await unrarAsync(rawData);
      const entry = files.find((f) => f.filename === path);
      if (!entry?.fileData) return undefined;
      const { buffer, byteOffset, byteLength } = entry.fileData;
      return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
    } catch {
      return undefined;
    }
  }
}
